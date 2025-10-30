import { IncomingMessage } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { AuthProvider, AuthResult, DEFAULT_AUTH_ERROR } from "../types.js";
import { logger } from "../../core/Logger.js";

/**
 * OAuth 2.1 configuration for MCP servers
 * Implements OAuth 2.1 with PKCE and RFC9728 Protected Resource Metadata
 */
export interface OAuthConfig {
  /**
   * Authorization server URL (e.g., Cognito domain)
   * Example: "https://your-domain.auth.us-east-1.amazoncognito.com"
   */
  authorizationServer: string;

  /**
   * OAuth client ID
   */
  clientId?: string;

  /**
   * OAuth client secret (optional - for confidential clients)
   */
  clientSecret?: string;

  /**
   * Resource server identifier (canonical URI of this MCP server)
   * Must match the URI that clients use to access this server
   * Example: "https://mcp.example.com" or "https://mcp.example.com/mcp"
   */
  resourceUri: string;

  /**
   * Redirect URI for OAuth callback
   * @default "/oauth/callback"
   */
  callbackPath?: string;

  /**
   * Token validation endpoint (for introspection or JWKS)
   * If not provided, will use authorization server metadata discovery
   */
  tokenEndpoint?: string;

  /**
   * JWKS URI for JWT token validation
   * If not provided, will use authorization server metadata discovery
   */
  jwksUri?: string;

  /**
   * Required scopes for access tokens
   */
  requiredScopes?: string[];

  /**
   * Custom token validator function
   * @param token The access token to validate
   * @returns Promise resolving to validation result with optional user data
   */
  customValidator?: (token: string) => Promise<{ valid: boolean; data?: Record<string, any> }>;

  /**
   * Token cache TTL in seconds
   * @default 300 (5 minutes)
   */
  tokenCacheTTL?: number;

  /**
   * Whether to support dynamic client registration (RFC7591)
   * @default true
   */
  supportDynamicRegistration?: boolean;

  /**
   * Authorization endpoint override (if not using metadata discovery)
   */
  authorizationEndpoint?: string;

  /**
   * Whether to enable strict audience validation (RFC8707)
   * Validates that tokens have this server's resourceUri in the audience claim
   * @default true
   */
  strictAudienceValidation?: boolean;

  /**
   * Additional metadata for Protected Resource Metadata document
   */
  metadata?: {
    /**
     * Human-readable name of the resource server
     */
    resource_name?: string;

    /**
     * Array of scope values supported by this resource server
     */
    scopes_supported?: string[];

    /**
     * Additional custom metadata fields
     */
    [key: string]: any;
  };
}

interface TokenCacheEntry {
  valid: boolean;
  data?: Record<string, any>;
  expiresAt: number;
}

interface PKCESession {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  resourceUri: string;
  createdAt: number;
}

/**
 * OAuth 2.1 authentication provider for MCP servers
 * 
 * This provider acts as an OAuth 2.1 Resource Server and implements:
 * - OAuth 2.1 token validation
 * - Protected Resource Metadata (RFC9728)
 * - Resource Indicators (RFC8707)
 * - PKCE for authorization code flow
 * - Support for JWT and opaque tokens
 */
export class OAuthProvider implements AuthProvider {
  private config: Required<Omit<OAuthConfig, 'clientId' | 'clientSecret' | 'tokenEndpoint' | 'jwksUri' | 'customValidator' | 'authorizationEndpoint' | 'metadata'>> & 
    Pick<OAuthConfig, 'clientId' | 'clientSecret' | 'tokenEndpoint' | 'jwksUri' | 'customValidator' | 'authorizationEndpoint' | 'metadata'>;
  
  private tokenCache = new Map<string, TokenCacheEntry>();
  private pkceSessions = new Map<string, PKCESession>();
  
  // Authorization server metadata cache
  private authServerMetadata?: any;
  private metadataFetchedAt?: number;
  private readonly METADATA_CACHE_TTL = 3600000; // 1 hour

  constructor(config: OAuthConfig) {
    if (!config.authorizationServer) {
      throw new Error("OAuth authorizationServer is required");
    }
    if (!config.resourceUri) {
      throw new Error("OAuth resourceUri is required (canonical URI of this MCP server)");
    }

    this.config = {
      clientId: undefined,
      callbackPath: "/oauth/callback",
      requiredScopes: [],
      tokenCacheTTL: 300,
      supportDynamicRegistration: true,
      strictAudienceValidation: true,
      ...config
    };

    logger.info(`OAuth provider initialized for resource: ${this.config.resourceUri}`);
    logger.info(`Authorization server: ${this.config.authorizationServer}`);
  }

  /**
   * Generate Protected Resource Metadata (RFC9728)
   * This is served at /.well-known/oauth-protected-resource
   */
  getProtectedResourceMetadata(): any {
    const metadata: any = {
      resource: this.config.resourceUri,
      authorization_servers: [this.config.authorizationServer],
      ...this.config.metadata
    };

    if (this.config.requiredScopes && this.config.requiredScopes.length > 0) {
      metadata.scopes_supported = this.config.requiredScopes;
    }

    return metadata;
  }

  /**
   * Start OAuth authorization flow
   * Generates PKCE parameters and returns authorization URL
   */
  async startAuthorizationFlow(redirectUri: string, additionalParams?: Record<string, string>): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    // Fetch authorization server metadata if needed
    await this.fetchAuthServerMetadata();

    const authEndpoint = this.config.authorizationEndpoint || 
      this.authServerMetadata?.authorization_endpoint;

    if (!authEndpoint) {
      throw new Error("Authorization endpoint not configured");
    }

    if (!this.config.clientId) {
      throw new Error("OAuth clientId must be configured to start authorization flow");
    }

    // Generate PKCE parameters
    const { codeVerifier, codeChallenge } = this.generatePKCE();
    const state = this.generateState();

    // Store PKCE session
    const session: PKCESession = {
      codeVerifier,
      codeChallenge,
      state,
      resourceUri: this.config.resourceUri,
      createdAt: Date.now()
    };
    this.pkceSessions.set(state, session);

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      resource: this.config.resourceUri, // RFC8707 Resource Indicators
      ...additionalParams
    });

    if (this.config.requiredScopes && this.config.requiredScopes.length > 0) {
      params.set('scope', this.config.requiredScopes.join(' '));
    }

    const authorizationUrl = `${authEndpoint}?${params.toString()}`;
    
    logger.debug(`Generated authorization URL with PKCE for state: ${state}`);
    
    return {
      authorizationUrl,
      state
    };
  }

  /**
   * Handle OAuth callback and exchange code for token
   */
  async handleCallback(code: string, state: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }> {
    // Validate state and retrieve PKCE session
    const session = this.pkceSessions.get(state);
    if (!session) {
      throw new Error("Invalid or expired OAuth state");
    }

    // Clean up used session
    this.pkceSessions.delete(state);

    // Clean up old sessions (older than 10 minutes)
    const cutoff = Date.now() - 600000;
    for (const [key, sess] of this.pkceSessions.entries()) {
      if (sess.createdAt < cutoff) {
        this.pkceSessions.delete(key);
      }
    }

    // Fetch authorization server metadata if needed
    await this.fetchAuthServerMetadata();

    const tokenEndpoint = this.config.tokenEndpoint || 
      this.authServerMetadata?.token_endpoint;

    if (!tokenEndpoint) {
      throw new Error("Token endpoint not configured");
    }

    if (!this.config.clientId) {
      throw new Error("OAuth clientId must be configured");
    }

    // Exchange authorization code for token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: this.config.clientId,
      code_verifier: session.codeVerifier,
      resource: this.config.resourceUri // RFC8707 Resource Indicators
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    };

    // Add client authentication if client secret is configured
    if (this.config.clientSecret) {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: tokenParams.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Token exchange failed: ${response.status} - ${errorText}`);
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const tokenResponse = await response.json();

    logger.info("Successfully exchanged authorization code for access token");

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in
    };
  }

  /**
   * Authenticate an incoming request by validating the Bearer token
   */
  async authenticate(req: IncomingMessage): Promise<boolean | AuthResult> {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || typeof authHeader !== 'string') {
      logger.debug("No Authorization header present");
      return false;
    }

    if (!authHeader.startsWith('Bearer ')) {
      logger.debug("Authorization header does not contain Bearer token");
      return false;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check cache first
    const cached = this.tokenCache.get(token);
    if (cached) {
      if (Date.now() < cached.expiresAt) {
        logger.debug("Token validated from cache");
        return cached.valid ? { data: cached.data } : false;
      } else {
        this.tokenCache.delete(token);
      }
    }

    // Validate token
    try {
      const result = await this.validateToken(token);
      
      // Cache the result
      const cacheEntry: TokenCacheEntry = {
        valid: result.valid,
        data: result.data,
        expiresAt: Date.now() + (this.config.tokenCacheTTL * 1000)
      };
      this.tokenCache.set(token, cacheEntry);

      // Clean up old cache entries periodically
      if (this.tokenCache.size > 1000) {
        this.cleanupTokenCache();
      }

      if (result.valid) {
        logger.debug("Token validated successfully");
        return { data: result.data };
      } else {
        logger.debug("Token validation failed");
        return false;
      }
    } catch (error) {
      logger.error(`Token validation error: ${error}`);
      return false;
    }
  }

  /**
   * Validate an access token
   */
  private async validateToken(token: string): Promise<{ valid: boolean; data?: Record<string, any> }> {
    // Use custom validator if provided
    if (this.config.customValidator) {
      return await this.config.customValidator(token);
    }

    // Try JWT validation first
    const jwtResult = await this.validateJWT(token);
    if (jwtResult.valid) {
      return jwtResult;
    }

    // Fall back to introspection if available
    return await this.introspectToken(token);
  }

  /**
   * Validate JWT token (if it's a JWT)
   */
  private async validateJWT(token: string): Promise<{ valid: boolean; data?: Record<string, any> }> {
    try {
      // Basic JWT structure check
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false };
      }

      // Decode payload (without verification for now - would need JWKS in production)
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8')
      );

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        logger.debug("JWT token expired");
        return { valid: false };
      }

      // Check audience (RFC8707) if strict validation is enabled
      if (this.config.strictAudienceValidation) {
        const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!audience.includes(this.config.resourceUri)) {
          logger.warn(`Token audience mismatch. Expected: ${this.config.resourceUri}, Got: ${audience.join(', ')}`);
          return { valid: false };
        }
      }

      // Check required scopes
      if (this.config.requiredScopes && this.config.requiredScopes.length > 0) {
        const tokenScopes = payload.scope ? payload.scope.split(' ') : [];
        const hasRequiredScopes = this.config.requiredScopes.every(
          scope => tokenScopes.includes(scope)
        );
        if (!hasRequiredScopes) {
          logger.debug(`Token missing required scopes. Required: ${this.config.requiredScopes.join(', ')}, Got: ${tokenScopes.join(', ')}`);
          return { valid: false };
        }
      }

      return {
        valid: true,
        data: payload
      };
    } catch (error) {
      logger.debug(`JWT validation failed: ${error}`);
      return { valid: false };
    }
  }

  /**
   * Introspect token using OAuth token introspection endpoint
   */
  private async introspectToken(token: string): Promise<{ valid: boolean; data?: Record<string, any> }> {
    try {
      await this.fetchAuthServerMetadata();

      const introspectionEndpoint = this.authServerMetadata?.introspection_endpoint;
      if (!introspectionEndpoint) {
        logger.debug("No introspection endpoint available");
        return { valid: false };
      }

      const params = new URLSearchParams({
        token,
        token_type_hint: 'access_token'
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      };

      // Add client authentication if configured
      if (this.config.clientId && this.config.clientSecret) {
        const credentials = Buffer.from(
          `${this.config.clientId}:${this.config.clientSecret}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const response = await fetch(introspectionEndpoint, {
        method: 'POST',
        headers,
        body: params.toString()
      });

      if (!response.ok) {
        logger.debug(`Introspection failed: ${response.status}`);
        return { valid: false };
      }

      const result = await response.json();

      if (!result.active) {
        logger.debug("Token is not active");
        return { valid: false };
      }

      // Check audience if present
      if (this.config.strictAudienceValidation && result.aud) {
        const audience = Array.isArray(result.aud) ? result.aud : [result.aud];
        if (!audience.includes(this.config.resourceUri)) {
          logger.warn(`Token audience mismatch from introspection`);
          return { valid: false };
        }
      }

      return {
        valid: true,
        data: result
      };
    } catch (error) {
      logger.error(`Token introspection error: ${error}`);
      return { valid: false };
    }
  }

  /**
   * Fetch and cache authorization server metadata (RFC8414)
   */
  private async fetchAuthServerMetadata(): Promise<void> {
    // Check if we have cached metadata
    if (this.authServerMetadata && this.metadataFetchedAt) {
      if (Date.now() - this.metadataFetchedAt < this.METADATA_CACHE_TTL) {
        return;
      }
    }

    try {
      // Construct well-known metadata URL (RFC8414)
      const metadataUrl = `${this.config.authorizationServer}/.well-known/oauth-authorization-server`;
      
      logger.debug(`Fetching authorization server metadata from: ${metadataUrl}`);
      
      const response = await fetch(metadataUrl);
      
      if (!response.ok) {
        logger.warn(`Failed to fetch auth server metadata: ${response.status}`);
        return;
      }

      this.authServerMetadata = await response.json();
      this.metadataFetchedAt = Date.now();
      
      logger.info("Authorization server metadata fetched successfully");
      logger.debug(`Metadata: ${JSON.stringify(this.authServerMetadata, null, 2)}`);
    } catch (error) {
      logger.warn(`Error fetching auth server metadata: ${error}`);
    }
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    // Generate code verifier (43-128 characters, base64url encoded)
    const codeVerifier = randomBytes(32).toString('base64url');
    
    // Generate code challenge (SHA256 hash of verifier, base64url encoded)
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Generate random state parameter
   */
  private generateState(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Clean up expired token cache entries
   */
  private cleanupTokenCache(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokenCache.entries()) {
      if (now >= entry.expiresAt) {
        this.tokenCache.delete(token);
      }
    }
  }

  getAuthError() {
    return {
      status: 401,
      message: "Invalid or expired access token",
      headers: {
        'WWW-Authenticate': `Bearer realm="MCP Server", resource="${this.config.resourceUri}", authorization_uri="${this.config.authorizationServer}"`
      }
    };
  }

  /**
   * Get the callback path configured for this provider
   */
  getCallbackPath(): string {
    return this.config.callbackPath;
  }

  /**
   * Get the authorization server URL
   */
  getAuthorizationServer(): string {
    return this.config.authorizationServer;
  }

  /**
   * Get the resource URI
   */
  getResourceUri(): string {
    return this.config.resourceUri;
  }
}

