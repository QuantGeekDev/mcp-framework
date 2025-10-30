import { AuthConfig } from "../../auth/types.js";

/**
 * CORS configuration options for SSE transport
 */
export interface CORSConfig {
  /**
   * Access-Control-Allow-Origin header
   * @default "*"
   */
  allowOrigin?: string;

  /**
   * Access-Control-Allow-Methods header
   * @default "GET, POST, OPTIONS"
   */
  allowMethods?: string;

  /**
   * Access-Control-Allow-Headers header
   * @default "Content-Type, Authorization, x-api-key"
   */
  allowHeaders?: string;

  /**
   * Access-Control-Expose-Headers header
   * @default "Content-Type, Authorization, x-api-key"
   */
  exposeHeaders?: string;

  /**
   * Access-Control-Max-Age header for preflight requests
   * @default "86400"
   */
  maxAge?: string;
}

/**
 * Configuration options for SSE transport
 */
export interface SSETransportConfig {
  /**
   * Port to listen on
   */
  port?: number;

  /**
   * Endpoint for SSE events stream
   * @default "/sse"
   */
  endpoint?: string;

  /**
   * Endpoint for receiving messages via POST
   * @default "/messages"
   */
  messageEndpoint?: string;

  /**
   * Maximum allowed message size in bytes
   * @default "4mb"
   */
  maxMessageSize?: string;

  /**
   * Custom headers to add to SSE responses
   */
  headers?: Record<string, string>;

  /**
   * CORS configuration
   */
  cors?: CORSConfig;

  /**
   * Authentication configuration
   */
  auth?: AuthConfig;

  /**
   * OAuth configuration for authorization callbacks
   * This enables OAuth endpoints like /.well-known/oauth-protected-resource
   */
  oauth?: {
    /**
     * Callback handler for successful OAuth authorization
     * @param accessToken The access token received
     * @param refreshToken The refresh token if available
     * @param expiresIn Token expiration time in seconds
     */
    onCallback?: (params: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      state?: string;
    }) => Promise<void> | void;

    /**
     * Error handler for OAuth failures
     */
    onError?: (error: Error, state?: string) => Promise<void> | void;
  };
}

/**
 * Internal configuration type with required fields except headers
 */
export type SSETransportConfigInternal = Required<Omit<SSETransportConfig, 'headers' | 'auth' | 'cors' | 'oauth'>> & {
  headers?: Record<string, string>;
  auth?: AuthConfig;
  cors?: CORSConfig;
  oauth?: SSETransportConfig['oauth'];
};

/**
 * Default CORS configuration
 */
export const DEFAULT_CORS_CONFIG: CORSConfig = {
  allowOrigin: "*",
  allowMethods: "GET, POST, DELETE, OPTIONS",
  allowHeaders: "Content-Type, Accept, Authorization, x-api-key, Mcp-Session-Id, Last-Event-ID",
  exposeHeaders: "Content-Type, Authorization, x-api-key, Mcp-Session-Id",
  maxAge: "86400"
};

/**
 * Default configuration values
 */
export const DEFAULT_SSE_CONFIG: SSETransportConfigInternal = {
  port: 8080,
  endpoint: "/sse",
  messageEndpoint: "/messages",
  maxMessageSize: "4mb"
};
