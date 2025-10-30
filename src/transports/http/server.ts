import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse, createServer, Server as HttpServer } from 'node:http';
import { AbstractTransport } from '../base.js';
import { JSONRPCMessage, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { HttpStreamTransportConfig } from './types.js';
import { logger } from '../../core/Logger.js';

export class HttpStreamTransport extends AbstractTransport {
  readonly type = 'http-stream';
  private _isRunning = false;
  private _port: number;
  private _server?: HttpServer;
  private _endpoint: string;
  private _enableJsonResponse: boolean = false;

  private _transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  constructor(config: HttpStreamTransportConfig = {}) {
    super();

    this._port = config.port || 8080;
    this._endpoint = config.endpoint || '/mcp';
    this._enableJsonResponse = config.responseMode === 'batch';

    logger.debug(
      `HttpStreamTransport configured with: ${JSON.stringify({
        port: this._port,
        endpoint: this._endpoint,
        responseMode: config.responseMode,
        batchTimeout: config.batchTimeout,
        maxMessageSize: config.maxMessageSize,
        auth: config.auth ? true : false,
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

      this._server.listen(this._port, () => {
        logger.info(`HTTP server listening on port ${this._port}, endpoint ${this._endpoint}`);
        this._isRunning = true;
        resolve();
      });
    });
  }

  private async handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && this._transports[sessionId]) {
      transport = this._transports[sessionId];
      logger.debug(`Reusing existing session: ${sessionId}`);
    } else if (!sessionId && req.method === 'POST') {
      const body = await this.readRequestBody(req);

      if (isInitializeRequest(body)) {
        logger.info('Creating new session for initialization request');

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
          logger.error(`Transport error for session: ${error}`);
          if (transport.sessionId) {
            delete this._transports[transport.sessionId];
          }
        };

        transport.onmessage = async (message: JSONRPCMessage) => {
          if (this._onmessage) {
            await this._onmessage(message);
          }
        };

        await transport.handleRequest(req, res, body);
        return;
      } else {
        this.sendError(res, 400, -32000, 'Bad Request: No valid session ID provided');
        return;
      }
    } else if (!sessionId) {
      this.sendError(res, 400, -32000, 'Bad Request: No valid session ID provided');
      return;
    } else {
      this.sendError(res, 404, -32001, 'Session not found');
      return;
    }

    const body = await this.readRequestBody(req);
    await transport.handleRequest(req, res, body);
  }

  private async readRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
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
      failedSessions.forEach((sessionId) => delete this._transports[sessionId]);
      logger.warn(`Failed to send message to ${failedSessions.length} sessions.`);
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
