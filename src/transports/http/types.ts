import { AuthConfig } from "../../auth/types.js";
import { CORSConfig } from "../sse/types.js";
import { ServerResponse } from "node:http";

// --- Core JSON-RPC Types (Framework Specific) ---

export type JsonRpcId = string | number | null;

export interface BaseJsonRpcMessage {
  jsonrpc: "2.0";
}

export interface JsonRpcRequest extends BaseJsonRpcMessage {
  id: string | number;
  method: string;
  params?: unknown[] | object;
}

export interface JsonRpcNotification extends BaseJsonRpcMessage {
  method: string;
  params?: unknown[] | object;
}

export interface JsonRpcSuccessResponse extends BaseJsonRpcMessage {
  id: JsonRpcId;
  result: unknown;
  error?: never;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse extends BaseJsonRpcMessage {
  id: JsonRpcId;
  result?: never;
  error: JsonRpcError;
}

/**
 * Union type representing any valid JSON-RPC 2.0 message.
 */
export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;

// --- End Core JSON-RPC Types ---

/**
 * Defines how the server responds to POST requests containing JSON-RPC requests.
 * - 'stream': Always opens a text/event-stream (SSE) for each request, allowing streaming responses.
 * - 'batch': Collects all responses for the batch and sends a single application/json response.
 */
export type HttpResponseMode = 'stream' | 'batch';

/**
 * Configuration options for Streamable HTTP transport that implements the MCP 2025-03-26 spec.
 * 
 * This defines the options for a transport that receives messages via HTTP POST and can respond
 * with either a single JSON response or open an SSE stream for streaming responses.
 */
export interface HttpStreamTransportConfig {
  /**
   * Port to listen on. Default: 8080
   */
  port?: number;
  
  /**
   * HTTP endpoint path. Default: "/mcp"
   */
  endpoint?: string;
  
  /**
   * Maximum message size for incoming requests. Default: "4mb"
   */
  maxMessageSize?: string;
  
  /**
   * Response mode for handling request messages. Default: "batch"
   * - 'batch': Returns a single JSON response containing all responses (more efficient)
   * - 'stream': Opens an SSE stream for each request (better for long operations)
   */
  responseMode?: HttpResponseMode;
  
  /**
   * Timeout in ms for batch mode responses. Default: 30000
   */
  batchTimeout?: number;
  
  /**
   * Additional HTTP headers to include in responses
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
   * Session management configuration
   */
  session?: {
    /**
     * Whether to enable session management. Default: true
     */
    enabled?: boolean;
    
    /**
     * HTTP header name for session ID. Default: "Mcp-Session-Id"
     */
    headerName?: string;
    
    /**
     * Whether clients can terminate sessions via DELETE. Default: true
     */
    allowClientTermination?: boolean;
  };
  
  /**
   * Stream resumability configuration
   */
  resumability?: {
    /**
     * Whether to enable stream resumability. Default: false
     */
    enabled?: boolean;
    
    /**
     * How long to keep message history in ms. Default: 300000 (5 min)
     */
    historyDuration?: number;
    messageStoreType?: 'connection' | 'global';
  };
  
  /**
   * Whether to enable GET SSE. Default: true
   */
  enableGetSse?: boolean;
}

/**
 * Internal configuration type with required fields
 */
export type HttpStreamTransportConfigInternal = Required<Omit<HttpStreamTransportConfig, 'headers' | 'auth' | 'cors' | 'session' | 'resumability'>> & {
  cors: Required<NonNullable<CORSConfig>>;
  session: Required<NonNullable<HttpStreamTransportConfig['session']>>;
  resumability: Required<NonNullable<HttpStreamTransportConfig['resumability']>>;
  headers?: Record<string, string>;
  auth?: AuthConfig;
  enableGetSse: boolean;
};

/**
 * Default configuration values for HTTP Stream transport
 */
export const DEFAULT_HTTP_STREAM_CONFIG: HttpStreamTransportConfigInternal = {
  port: 8080,
  endpoint: "/mcp",
  maxMessageSize: "4mb",
  responseMode: "batch",
  batchTimeout: 30000,
  session: {
    enabled: true,
    headerName: "Mcp-Session-Id",
    allowClientTermination: true,
  },
  resumability: {
    enabled: false,
    historyDuration: 300000,
    messageStoreType: 'global',
  },
  enableGetSse: true,
  cors: {
    allowOrigin: "*",
    allowMethods: "GET, POST, DELETE, OPTIONS",
    allowHeaders: "Content-Type, Accept, Authorization, x-api-key, Mcp-Session-Id, Last-Event-ID",
    exposeHeaders: "Content-Type, Authorization, x-api-key, Mcp-Session-Id",
    maxAge: "86400",
  },
};

/**
 * Represents an active session
 */
export interface SessionData {
  id: string;
  createdAt: number;
  lastActivity: number;
}

/**
 * Represents an active SSE connection for streaming responses
 */
export interface ActiveSseConnection {
  res: ServerResponse;
  sessionId?: string;
  streamId: string;
  lastEventIdSent: string | null;
  messageHistory?: Array<MessageEntry>;
  pingInterval?: NodeJS.Timeout;
  isPostConnection: boolean;
  pendingResponseIds?: Set<string | number>;
}

/**
 * State for tracking batch responses
 */
export interface BatchResponseState {
    res: ServerResponse;
    requestIds: Set<string | number>;
    responses: Map<string | number, JsonRpcSuccessResponse | JsonRpcErrorResponse>;
    timeoutId: NodeJS.Timeout;
    isCompleted: boolean;
}

export interface MessageEntry {
  eventId: string;
  message: JsonRpcMessage;
  timestamp: number;
}
