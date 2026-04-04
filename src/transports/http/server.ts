import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse, createServer, Server as HttpServer } from 'node:http';
import { AbstractTransport } from '../base.js';
import { JSONRPCMessage, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { HttpStreamTransportConfig } from './types.js';
import { DEFAULT_CORS_CONFIG } from '../sse/types.js';
import { logger } from '../../core/Logger.js';
import { ProtectedResourceMetadata } from '../../auth/metadata/protected-resource.js';
import { handleAuthentication } from '../utils/auth-handler.js';
import { initializeOAuthMetadata } from '../utils/oauth-metadata.js';
import { validateOrigin } from '../utils/origin-validator.js';
import { requestContext, RequestContextData } from '../../utils/requestContext.js';
import { AuthResult } from '../../auth/types.js';

export class HttpStreamTransport extends AbstractTransport {
  readonly type = 'http-stream';
  private _isRunning = false;
  private _port: number;
  private _server?: HttpServer;
  private _endpoint: string;
  private _enableJsonResponse: boolean = false;
  private _config: HttpStreamTransportConfig;
  private _oauthMetadata?: ProtectedResourceMetadata;
  private _healthPath: string | null;

  private _transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  constructor(config: HttpStreamTransportConfig = {}) {
    super();

    this._config = config;
    this._port = config.port || 8080;
    this._endpoint = config.endpoint || '/mcp';
    this._enableJsonResponse = config.responseMode === 'batch';

    // Health endpoint: enabled by default at /health
    const healthEnabled = config.health?.enabled !== false;
    this._healthPath = healthEnabled ? (config.health?.path || '/health') : null;

    // Initialize OAuth metadata if OAuth provider is configured
    this._oauthMetadata = initializeOAuthMetadata(this._config.auth, 'HTTP Stream');

    logger.debug(
      `HttpStreamTransport configured with: ${JSON.stringify({
        port: this._port,
        endpoint: this._endpoint,
        responseMode: config.responseMode,
        batchTimeout: config.batchTimeout,
        maxMessageSize: config.maxMessageSize,
        auth: config.auth ? {
          provider: config.auth.provider.constructor.name,
          endpoints: config.auth.endpoints
        } : undefined,
        cors: config.cors ? true : false,
      })}`
    );
  }

  async start(): Promise<void> {
    if (this._isRunning) {
      throw new Error('HttpStreamTransport already started');
    }

    return new Promise((resolve, reject) => {
      this._server = createServer(async (req, res) => {
        try {
          const url = new URL(req.url!, `http://${req.headers.host}`);

          // Validate Origin header for DNS rebinding protection (MCP spec 2025-11-25)
          if (!validateOrigin(req, res, { allowedOrigins: this._config.cors?.allowedOrigins })) {
            return;
          }

          if (req.method === 'OPTIONS') {
            this.setCorsHeaders(res, true);
            res.writeHead(204).end();
            return;
          }

          this.setCorsHeaders(res);

          if (req.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
            if (this._oauthMetadata) {
              this._oauthMetadata.serve(res);
            } else {
              res.writeHead(404).end('Not Found');
            }
            return;
          }

          if (req.method === 'GET' && this._healthPath && url.pathname === this._healthPath) {
            const body = JSON.stringify(this._config.health?.response ?? { ok: true });
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
            return;
          }

          if (url.pathname === this._endpoint) {
            await this.handleMcpRequest(req, res);
          } else {
            res.writeHead(404).end('Not Found');
          }
        } catch (error) {
          logger.error(`Error handling request: ${error}`);
          if (!res.headersSent) {
            res.writeHead(500).end('Internal Server Error');
          }
        }
      });

      this._server.on('error', (error) => {
        logger.error(`HTTP server error: ${error}`);
        this._onerror?.(error);
        if (!this._isRunning) {
          reject(error);
        }
      });

      this._server.on('close', () => {
        logger.info('HTTP server closed');
        this._isRunning = false;
        this._onclose?.();
      });

      const host = this._config.host ?? '127.0.0.1';
      this._server.listen(this._port, host, () => {
        logger.info(`HTTP server listening on ${host}:${this._port}, endpoint ${this._endpoint}`);
        this._isRunning = true;
        resolve();
      });
    });
  }

  private async handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    // Determine if this is an initialize request (needs body parsing)
    let body: any = null;
    if (req.method === 'POST') {
      try {
        body = await this.readRequestBody(req);
      } catch (error: any) {
        if (error.message === 'Request body too large') {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Request body too large' }, id: null }));
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
        return;
      }
    }
    const isInitialize = !sessionId && body && isInitializeRequest(body);

    // Perform authentication check once at the beginning
    const authEndpoint = isInitialize ? 'sse' : 'messages';
    let authData: RequestContextData = {};

    if (this._config.auth?.endpoints?.[authEndpoint] !== false) {
      const authResult = await handleAuthentication(
        req,
        res,
        this._config.auth,
        isInitialize ? 'initialize' : 'message'
      );
      if (!authResult) return;
      authData = (authResult as AuthResult).data as RequestContextData || {};
    }

    // Allow re-initialization even when a stale session ID is provided.
    // Clients like Cline may keep sending the old session ID header after
    // a session is lost (server restart, transport error, etc.).
    const isReInitialize = sessionId && !this._transports[sessionId] && body && isInitializeRequest(body);

    // Handle different request scenarios
    if (sessionId && this._transports[sessionId]) {
      // Existing session
      transport = this._transports[sessionId];
      logger.debug(`Reusing existing session: ${sessionId}`);
    } else if (isInitialize || isReInitialize) {
      if (isReInitialize) {
        logger.info(`Stale session ID ${sessionId} — creating new session for re-initialization`);
      } else {
        logger.info('Creating new session for initialization request');
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId: string) => {
          logger.info(`Session initialized: ${sessionId}`);
          this._transports[sessionId] = transport;
        },
        enableJsonResponse: this._enableJsonResponse,
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          logger.info(`Transport closed for session: ${transport.sessionId}`);
          delete this._transports[transport.sessionId];
        }
      };

      transport.onerror = (error) => {
        // Log the error but do NOT remove the session. The SDK fires onerror
        // for transient issues (parse errors, failed SSE writes) that don't
        // invalidate the session. Removing the session here causes "Session
        // not found" errors on subsequent requests from the same client.
        logger.error(`Transport error for session ${transport.sessionId}: ${error}`);
      };

      transport.onmessage = async (message: JSONRPCMessage) => {
        if (this._onmessage) {
          await this._onmessage(message);
        }
      };

      await requestContext.run(authData, async () => {
        await transport.handleRequest(req, res, body);
      });
      return;
    } else if (!sessionId) {
      // No session ID and not an initialize request
      this.sendError(res, 400, -32000, 'Bad Request: No valid session ID provided');
      return;
    } else {
      // Session ID provided but not found (and not an initialize request)
      this.sendError(res, 404, -32001, 'Session not found');
      return;
    }

    // Existing session - handle request
    await requestContext.run(authData, async () => {
      await transport.handleRequest(req, res, body);
    });
  }

  private static readonly MAX_BODY_SIZE = 4 * 1024 * 1024; // 4MB

  private async readRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > HttpServerTransport.MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  private setCorsHeaders(res: ServerResponse, includeMaxAge: boolean = false): void {
    if (!this._config.cors) return;

    const cors = this._config.cors;
    res.setHeader('Access-Control-Allow-Origin', cors.allowOrigin || DEFAULT_CORS_CONFIG.allowOrigin!);
    res.setHeader('Access-Control-Allow-Methods', cors.allowMethods || DEFAULT_CORS_CONFIG.allowMethods!);
    res.setHeader('Access-Control-Allow-Headers', cors.allowHeaders || DEFAULT_CORS_CONFIG.allowHeaders!);
    res.setHeader('Access-Control-Expose-Headers', cors.exposeHeaders || DEFAULT_CORS_CONFIG.exposeHeaders!);

    if (includeMaxAge) {
      res.setHeader('Access-Control-Max-Age', cors.maxAge || DEFAULT_CORS_CONFIG.maxAge!);
    }
  }

  private sendError(res: ServerResponse, status: number, code: number, message: string): void {
    if (res.headersSent) return;

    res.writeHead(status).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code,
          message,
        },
        id: null,
      })
    );
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._isRunning) {
      logger.warn('Attempted to send message, but HTTP transport is not running');
      return;
    }

    const activeSessions = Object.entries(this._transports);
    if (activeSessions.length === 0) {
      logger.warn('No active sessions to send message to');
      return;
    }

    logger.debug(
      `Broadcasting message to ${activeSessions.length} sessions: ${JSON.stringify(message)}`
    );

    const failedSessions: string[] = [];

    for (const [sessionId, transport] of activeSessions) {
      try {
        await transport.send(message);
      } catch (error) {
        logger.error(`Error sending message to session ${sessionId}: ${error}`);
        failedSessions.push(sessionId);
      }
    }

    if (failedSessions.length > 0) {
      // Log but don't remove sessions on transient send failures.
      // The SDK throws when no SSE stream is currently open for a request ID,
      // which is a normal condition (e.g. client momentarily between requests).
      // The session itself remains valid for future requests.
      logger.warn(`Failed to broadcast to ${failedSessions.length} session(s) — sessions preserved for future requests.`);
    }
  }

  async close(): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    for (const transport of Object.values(this._transports)) {
      try {
        await transport.close();
      } catch (error) {
        logger.error(`Error closing transport: ${error}`);
      }
    }
    this._transports = {};

    if (this._server) {
      this._server.close();
      this._server = undefined;
    }

    this._isRunning = false;
  }

  isRunning(): boolean {
    return this._isRunning;
  }
}
