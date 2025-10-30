import { IncomingMessage } from "node:http";

/**
 * Result of successful authentication
 */
export interface AuthResult {
  /**
   * User or token data from authentication
   */
  data?: Record<string, any>;
}

/**
 * Base interface for authentication providers
 */
export interface AuthProvider {
  /**
   * Authenticate an incoming request
   * @param req The incoming HTTP request
   * @returns Promise resolving to boolean or AuthResult
   */
  authenticate(req: IncomingMessage): Promise<boolean | AuthResult>;

  /**
   * Get error details for failed authentication
   */
  getAuthError?(): { status: number; message: string; headers?: Record<string, string> };
}

/**
 * Authentication configuration for transport
 */
export interface AuthConfig {
  /**
   * Authentication provider implementation
   */
  provider: AuthProvider;

  /**
   * Per-endpoint authentication configuration
   */
  endpoints?: {
    /**
     * Whether to authenticate SSE connection endpoint
     * @default false
     */
    sse?: boolean;

    /**
     * Whether to authenticate message endpoint
     * @default true
     */
    messages?: boolean;

    /**
     * Whether to authenticate OAuth endpoints
     * Note: Protected Resource Metadata endpoint is public by spec (RFC9728)
     * @default false
     */
    oauth?: boolean;
  };
}

/**
 * Default authentication error
 */
export const DEFAULT_AUTH_ERROR = {
  status: 401,
  message: "Unauthorized"
};
