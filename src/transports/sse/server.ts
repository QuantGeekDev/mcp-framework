import { randomUUID } from "node:crypto";
import { IncomingMessage, Server as HttpServer, ServerResponse, createServer } from "node:http";
import { JSONRPCMessage, ClientRequest } from "@modelcontextprotocol/sdk/types.js";
import contentType from "content-type";
import getRawBody from "raw-body";
import { APIKeyAuthProvider } from "../../auth/providers/apikey.js";
import { OAuthProvider } from "../../auth/providers/oauth.js";
import { DEFAULT_AUTH_ERROR } from "../../auth/types.js";
import { AbstractTransport } from "../base.js";
import { DEFAULT_SSE_CONFIG, SSETransportConfig, SSETransportConfigInternal, DEFAULT_CORS_CONFIG, CORSConfig } from "./types.js";
import { logger } from "../../core/Logger.js";
import { getRequestHeader, setResponseHeaders } from "../../utils/headers.js";
import { PING_SSE_MESSAGE } from "../utils/ping-message.js";

interface ExtendedIncomingMessage extends IncomingMessage {
  body?: ClientRequest;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive"
}

export class SSEServerTransport extends AbstractTransport {
  readonly type = "sse"

  private _server?: HttpServer
  private _connections: Map<string, { res: ServerResponse, intervalId: NodeJS.Timeout }> // Map<connectionId, { res: ServerResponse, intervalId: NodeJS.Timeout }>
  private _sessionId: string // Server instance ID
  private _config: SSETransportConfigInternal

  constructor(config: SSETransportConfig = {}) {
    super()
    this._connections = new Map()
    this._sessionId = randomUUID() // Used to validate POST messages belong to this server instance
    this._config = {
      ...DEFAULT_SSE_CONFIG,
      ...config
    }
    logger.debug(`SSE transport configured with: ${JSON.stringify({
      ...this._config,
      auth: this._config.auth ? {
        provider: this._config.auth.provider.constructor.name,
        endpoints: this._config.auth.endpoints
      } : undefined
    })}`)
  }

  private getCorsHeaders(includeMaxAge: boolean = false): Record<string, string> {
    const corsConfig = {
      allowOrigin: DEFAULT_CORS_CONFIG.allowOrigin,
      allowMethods: DEFAULT_CORS_CONFIG.allowMethods,
      allowHeaders: DEFAULT_CORS_CONFIG.allowHeaders,
      exposeHeaders: DEFAULT_CORS_CONFIG.exposeHeaders,
      maxAge: DEFAULT_CORS_CONFIG.maxAge,
      ...this._config.cors
    } as Required<CORSConfig>

    const headers: Record<string, string> = {
      "Access-Control-Allow-Origin": corsConfig.allowOrigin,
      "Access-Control-Allow-Methods": corsConfig.allowMethods,
      "Access-Control-Allow-Headers": corsConfig.allowHeaders,
      "Access-Control-Expose-Headers": corsConfig.exposeHeaders
    }

    if (includeMaxAge) {
      headers["Access-Control-Max-Age"] = corsConfig.maxAge
    }

    return headers
  }

  async start(): Promise<void> {
    if (this._server) {
      throw new Error("SSE transport already started")
    }

    return new Promise((resolve) => {
      this._server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
          await this.handleRequest(req, res)
        } catch (error: any) {
          logger.error(`Error handling request: ${error instanceof Error ? error.message : String(error)}`)
          res.writeHead(500).end("Internal Server Error")
        }
      })

      this._server.listen(this._config.port, () => {
        logger.info(`SSE transport listening on port ${this._config.port}`)
        resolve()
      })

      this._server.on("error", (error: Error) => {
        logger.error(`SSE server error: ${error.message}`)
        this._onerror?.(error)
      })

      this._server.on("close", () => {
        logger.info("SSE server closed")
        this._onclose?.()
      })
    })
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    logger.debug(`Incoming request: ${req.method} ${req.url}`)

    if (req.method === "OPTIONS") {
      setResponseHeaders(res, this.getCorsHeaders(true))
      res.writeHead(204).end()
      return
    }

    setResponseHeaders(res, this.getCorsHeaders())

    const url = new URL(req.url!, `http://${req.headers.host}`)
    const sessionId = url.searchParams.get("sessionId")

    // OAuth Protected Resource Metadata endpoint (RFC9728)
    // This MUST be publicly accessible per spec
    if (req.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      await this.handleProtectedResourceMetadata(req, res)
      return
    }

    // OAuth callback endpoint
    const oauthProvider = this._config.auth?.provider instanceof OAuthProvider ? 
      this._config.auth.provider as OAuthProvider : null
    
    if (oauthProvider && req.method === "GET" && url.pathname === oauthProvider.getCallbackPath()) {
      await this.handleOAuthCallback(req, res, url, oauthProvider)
      return
    }

    if (req.method === "GET" && url.pathname === this._config.endpoint) {
      if (this._config.auth?.endpoints?.sse) {
        const isAuthenticated = await this.handleAuthentication(req, res, "SSE connection")
        if (!isAuthenticated) return
      }

      // Check if a sessionId was provided in the request
      if (sessionId) {
        // If sessionId exists but is not in our connections map, it's invalid or inactive
        if (!this._connections.has(sessionId)) {
          logger.info(`Invalid or inactive session ID in GET request: ${sessionId}. Creating new connection.`);
          // Continue execution to create a new connection below
        } else {
          // If the connection exists and is still active, we could either:
          // 1. Return an error (409 Conflict) as a client shouldn't create duplicate connections
          // 2. Close the old connection and create a new one
          // 3. Keep the old connection and return its details
          
          // Option 2: Close old connection and create new one
          logger.info(`Replacing existing connection for session ID: ${sessionId}`);
          this.cleanupConnection(sessionId);
          // Continue execution to create a new connection below
        }
      }

      // Generate a unique ID for this specific connection
      const connectionId = randomUUID();
      this.setupSSEConnection(res, connectionId);
      return;
    }

    if (req.method === "POST" && url.pathname === this._config.messageEndpoint) {
      // **Connection Validation (User Requested):**
      // Check if the 'sessionId' from the POST request URL query parameter
      // (which should contain a connectionId provided by the server via the 'endpoint' event)
      // corresponds to an active connection in the `_connections` map.
      if (!sessionId || !this._connections.has(sessionId)) {
          logger.warn(`Invalid or inactive connection ID in POST request URL: ${sessionId}`);
          // Use 403 Forbidden as the client is attempting an operation for an invalid/unknown connection
          res.writeHead(403).end("Invalid or inactive connection ID");
          return;
      }

      if (this._config.auth?.endpoints?.messages !== false) {
        const isAuthenticated = await this.handleAuthentication(req, res, "message")
        if (!isAuthenticated) return
      }

      await this.handlePostMessage(req, res)
      return
    }

    res.writeHead(404).end("Not Found")
  }

  private async handleProtectedResourceMetadata(req: ExtendedIncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const oauthProvider = this._config.auth?.provider instanceof OAuthProvider ? 
        this._config.auth.provider as OAuthProvider : null

      if (!oauthProvider) {
        // If no OAuth provider is configured, return empty response or error
        logger.debug("Protected Resource Metadata requested but no OAuth provider configured")
        res.writeHead(404).end(JSON.stringify({
          error: "OAuth not configured"
        }))
        return
      }

      const metadata = oauthProvider.getProtectedResourceMetadata()
      
      res.writeHead(200, {
        'Content-Type': 'application/json'
      })
      res.end(JSON.stringify(metadata))
      
      logger.debug("Served Protected Resource Metadata")
    } catch (error) {
      logger.error(`Error serving Protected Resource Metadata: ${error}`)
      res.writeHead(500).end(JSON.stringify({
        error: "Internal server error"
      }))
    }
  }

  private async handleOAuthCallback(req: ExtendedIncomingMessage, res: ServerResponse, url: URL, oauthProvider: OAuthProvider): Promise<void> {
    try {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      if (error) {
        const errorObj = new Error(errorDescription || error)
        logger.error(`OAuth callback error: ${error} - ${errorDescription}`)
        
        if (this._config.oauth?.onError) {
          await this._config.oauth.onError(errorObj, state || undefined)
        }

        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body>
              <h1>Authorization Failed</h1>
              <p>Error: ${error}</p>
              <p>${errorDescription || ''}</p>
            </body>
          </html>
        `)
        return
      }

      if (!code || !state) {
        logger.error("OAuth callback missing code or state")
        res.writeHead(400).end("Missing code or state parameter")
        return
      }

      // Build the full redirect URI for token exchange
      const protocol = req.headers['x-forwarded-proto'] || 'http'
      const host = req.headers.host
      const redirectUri = `${protocol}://${host}${url.pathname}`

      logger.debug(`Exchanging authorization code for token with redirect_uri: ${redirectUri}`)

      const tokenResult = await oauthProvider.handleCallback(code, state, redirectUri)

      if (this._config.oauth?.onCallback) {
        await this._config.oauth.onCallback({
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          expiresIn: tokenResult.expiresIn,
          state
        })
      }

      logger.info("OAuth callback successful")

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <html>
          <body>
            <h1>Authorization Successful</h1>
            <p>You can now close this window and return to your application.</p>
            <script>
              // Try to close the window (may not work in all browsers)
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `)
    } catch (error) {
      logger.error(`Error handling OAuth callback: ${error}`)
      
      if (this._config.oauth?.onError) {
        await this._config.oauth.onError(error as Error, url.searchParams.get('state') || undefined)
      }

      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(`
        <html>
          <body>
            <h1>Authorization Error</h1>
            <p>${(error as Error).message}</p>
          </body>
        </html>
      `)
    }
  }

  private async handleAuthentication(req: ExtendedIncomingMessage, res: ServerResponse, context: string): Promise<boolean> {
    if (!this._config.auth?.provider) {
      return true
    }

    const isApiKey = this._config.auth.provider instanceof APIKeyAuthProvider
    const isOAuth = this._config.auth.provider instanceof OAuthProvider

    if (isApiKey) {
      const provider = this._config.auth.provider as APIKeyAuthProvider
      const headerValue = getRequestHeader(req.headers, provider.getHeaderName())
      
      if (!headerValue) {
        const error = provider.getAuthError?.() || DEFAULT_AUTH_ERROR
        res.setHeader("WWW-Authenticate", `ApiKey realm="MCP Server", header="${provider.getHeaderName()}"`)
        res.writeHead(error.status).end(JSON.stringify({
          error: error.message,
          status: error.status,
          type: "authentication_error"
        }))
        return false
      }
    }

    const authResult = await this._config.auth.provider.authenticate(req)
    if (!authResult) {
      const error = this._config.auth.provider.getAuthError?.() || DEFAULT_AUTH_ERROR
      logger.warn(`Authentication failed for ${context}:`)
      logger.warn(`- Client IP: ${req.socket.remoteAddress}`)
      logger.warn(`- Error: ${error.message}`)

      // Set appropriate WWW-Authenticate header based on provider type
      if (isApiKey) {
        const provider = this._config.auth.provider as APIKeyAuthProvider
        res.setHeader("WWW-Authenticate", `ApiKey realm="MCP Server", header="${provider.getHeaderName()}"`)
      } else if (isOAuth) {
        const errorWithHeaders = error as { status: number; message: string; headers?: Record<string, string> }
        if (errorWithHeaders.headers) {
          // Use custom headers from OAuth provider (includes WWW-Authenticate with resource metadata)
          Object.entries(errorWithHeaders.headers).forEach(([key, value]) => {
            res.setHeader(key, value)
          })
        }
      }
      
      res.writeHead(error.status).end(JSON.stringify({
        error: error.message,
        status: error.status,
        type: "authentication_error"
      }))
      return false
    }

    logger.info(`Authentication successful for ${context}:`)
    logger.info(`- Client IP: ${req.socket.remoteAddress}`)
    logger.info(`- Auth Type: ${this._config.auth.provider.constructor.name}`)
    return true
  }

  private setupSSEConnection(res: ServerResponse, connectionId: string): void {
    logger.debug(`Setting up SSE connection: ${connectionId} for server session: ${this._sessionId}`);
    const headers = {
      ...SSE_HEADERS,
      ...this.getCorsHeaders(),
      ...this._config.headers
    }
    setResponseHeaders(res, headers)
    logger.debug(`SSE headers set: ${JSON.stringify(headers)}`)

    if (res.socket) {
      res.socket.setNoDelay(true)
      res.socket.setTimeout(0)
      res.socket.setKeepAlive(true, 1000)
      logger.debug('Socket optimized for SSE connection');
    }
    // **Important Change:** The endpoint URL now includes the specific connectionId
    // in the 'sessionId' query parameter, as requested by user feedback.
    // The client should use this exact URL for subsequent POST messages.
    const endpointUrl = `${this._config.messageEndpoint}?sessionId=${connectionId}`;
    logger.debug(`Sending endpoint URL for connection ${connectionId}: ${endpointUrl}`);
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);
    // Send the unique connection ID separately as well for potential client-side use
    res.write(`event: connectionId\ndata: ${connectionId}\n\n`);
    logger.debug(`Sending initial keep-alive for connection: ${connectionId}`);
    const intervalId = setInterval(() => {
        const connection = this._connections.get(connectionId);
        if (connection && !connection.res.writableEnded) {
            try {
                connection.res.write(PING_SSE_MESSAGE);
            }
            catch (error: any) {
                logger.error(`Error sending keep-alive for connection ${connectionId}: ${error instanceof Error ? error.message : String(error)}`);
                this.cleanupConnection(connectionId);
            }
        }
        else {
            // Should not happen if cleanup is working, but clear interval just in case
            logger.warn(`Keep-alive interval running for missing/ended connection: ${connectionId}`);
            this.cleanupConnection(connectionId); // Will clear interval
        }
    }, 15000);
    this._connections.set(connectionId, { res, intervalId });
    const cleanup = () => this.cleanupConnection(connectionId);
    res.on("close", () => {
        logger.info(`SSE connection closed: ${connectionId}`);
        cleanup();
    });
    res.on("error", (error: Error) => {
        logger.error(`SSE connection error for ${connectionId}: ${error.message}`);
        this._onerror?.(error);
        cleanup();
    });
    res.on("end", () => {
        logger.info(`SSE connection ended: ${connectionId}`);
        cleanup();
    });
    logger.info(`SSE connection established successfully: ${connectionId}`);
  }

  private async handlePostMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Check if *any* connection is active, not just the old single _sseResponse
    if (this._connections.size === 0) {
        logger.warn(`Rejecting message: no active SSE connections for server session ${this._sessionId}`);
        // Use 409 Conflict as it indicates the server state prevents fulfilling the request
        res.writeHead(409).end("No active SSE connection established");
        return;
    }

    let currentMessage: { id?: string | number; method?: string } = {}

    try {
      const rawMessage = (req as any).body || await (async () => { // Cast req to any to access potential body property
        const ct = contentType.parse(req.headers["content-type"] ?? "")
        if (ct.type !== "application/json") {
          throw new Error(`Unsupported content-type: ${ct.type}`)
        }
        const rawBody = await getRawBody(req, {
          limit: this._config.maxMessageSize,
          encoding: ct.parameters.charset ?? "utf-8"
        })
        const parsed = JSON.parse(rawBody.toString())
        logger.debug(`Received message: ${JSON.stringify(parsed)}`)
        return parsed
      })()

      const { id, method, params } = rawMessage
      logger.debug(`Parsed message - ID: ${id}, Method: ${method}`)

      const rpcMessage: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: id,
        method: method,
        params: params
      }

      currentMessage = {
        id: id,
        method: method
      }

      logger.debug(`Processing RPC message: ${JSON.stringify({
        id: id,
        method: method,
        params: params
      })}`)

      if (!this._onmessage) {
        throw new Error("No message handler registered")
      }

      await this._onmessage(rpcMessage)
      
      res.writeHead(202).end("Accepted")
      
      logger.debug(`Successfully processed message ${rpcMessage.id}`)

    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Error handling message for session ${this._sessionId}:`)
      logger.error(`- Error: ${errorMessage}`)
      logger.error(`- Method: ${currentMessage.method || "unknown"}`)
      logger.error(`- Message ID: ${currentMessage.id || "unknown"}`)

      const errorResponse = {
        jsonrpc: "2.0",
        id: currentMessage.id || null,
        error: {
          code: -32000,
          message: errorMessage,
          data: {
            method: currentMessage.method || "unknown",
            sessionId: this._sessionId,
            connectionActive: Boolean(this._connections.size > 0),
            type: "message_handler_error"
          }
        }
      }

      res.writeHead(400).end(JSON.stringify(errorResponse))
      this._onerror?.(error as Error)
    }
  }

  // Broadcast message to all connected clients
  async send(message: JSONRPCMessage): Promise<void> {
      if (this._connections.size === 0) {
          logger.warn("Attempted to send message, but no clients are connected.");
          // Optionally throw an error or just log
          // throw new Error("No SSE connections established");
          return;
      }
      const messageString = `data: ${JSON.stringify(message)}\n\n`;
      logger.debug(`Broadcasting message to ${this._connections.size} clients: ${JSON.stringify(message)}`);
      let failedSends = 0;
      for (const [connectionId, connection] of this._connections.entries()) {
          if (connection.res && !connection.res.writableEnded) {
              try {
                  connection.res.write(messageString);
              }
              catch (error: any) {
                  failedSends++;
                  logger.error(`Error sending message to connection ${connectionId}: ${error instanceof Error ? error.message : String(error)}`);
                  // Clean up the problematic connection
                  this.cleanupConnection(connectionId);
              }
          }
          else {
              // Should not happen if cleanup is working, but handle defensively
              logger.warn(`Attempted to send to ended connection: ${connectionId}`);
              this.cleanupConnection(connectionId);
          }
      }
      if (failedSends > 0) {
          logger.warn(`Failed to send message to ${failedSends} connections.`);
      }
  }

  async close(): Promise<void> {
      logger.info(`Closing SSE transport and ${this._connections.size} connections.`);
      // Close all active client connections
      for (const connectionId of this._connections.keys()) {
          this.cleanupConnection(connectionId, true); // Pass true to end the response
      }
      this._connections.clear(); // Ensure map is empty
      // Close the main server
      return new Promise((resolve) => {
          if (!this._server) {
              logger.debug("Server already stopped.");
              resolve();
              return;
          }
          this._server.close(() => {
              logger.info("SSE server stopped");
              this._server = undefined;
              this._onclose?.();
              resolve();
          });
      });
  }

  // Clean up a specific connection by its ID
  private cleanupConnection(connectionId: string, endResponse = false): void {
      const connection = this._connections.get(connectionId);
      if (connection) {
          logger.debug(`Cleaning up connection: ${connectionId}`);
          if (connection.intervalId) {
              clearInterval(connection.intervalId);
          }
          if (endResponse && connection.res && !connection.res.writableEnded) {
              try {
                  connection.res.end();
              }
              catch (e: any) {
                  logger.warn(`Error ending response for connection ${connectionId}: ${e instanceof Error ? e.message : String(e)}`);
              }
          }
          this._connections.delete(connectionId);
          logger.debug(`Connection removed: ${connectionId}. Remaining connections: ${this._connections.size}`);
      }
      else {
          logger.debug(`Attempted to clean up non-existent connection: ${connectionId}`);
      }
  }

  isRunning(): boolean {
    return Boolean(this._server)
  }
}
