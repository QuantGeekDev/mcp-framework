import { AuthConfig } from "../../auth/types.js";
import type { Server as HTTPServer } from "http";
import type { CORSConfig } from "../sse/types.js";

/**
 * Configuration options for WebSocket server transport
 */
export interface WebSocketServerTransportConfig {
  /**
   * Port to listen on
   * @default 8080
   */
  port?: number;

  /**
   * WebSocket endpoint path
   * @default "/ws"
   */
  path?: string;

  /**
   * Custom headers to add to WebSocket upgrade responses
   */
  headers?: Record<string, string>;

  /**
   * Authentication configuration
   */
  auth?: AuthConfig;

  /**
   * CORS configuration
   */
  cors?: CORSConfig;

  /**
   * Existing HTTP server to attach to (optional)
   */
  server?: HTTPServer;
}

/**
 * Internal WebSocket server config with required fields except headers/auth/cors/server optional
 */
export type WebSocketServerTransportConfigInternal = Required<
  Omit<WebSocketServerTransportConfig, 'headers' | 'auth' | 'cors' | 'server'>
> & {
  headers?: Record<string, string>;
  auth?: AuthConfig;
  cors?: CORSConfig;
  server?: HTTPServer;
};

/**
 * Default WebSocket server transport configuration
 */
export const DEFAULT_WEBSOCKET_CONFIG: WebSocketServerTransportConfigInternal = {
  port: 8080,
  path: "/ws"
};

