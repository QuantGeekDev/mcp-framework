import { createServer, IncomingMessage, Server as HttpServer } from "node:http";
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore: no declaration for 'ws'
import WebSocket, { WebSocketServer } from "ws";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { AbstractTransport } from "../base.js";
import { logger } from "../../core/Logger.js";

interface WebSocketServerTransportConfig {
  port?: number;
  server?: HttpServer;
  authProvider?: any; // Placeholder for future auth integration
  headers?: Record<string, string>;
}

export class WebSocketServerTransport extends AbstractTransport {
  readonly type = "websocket";

  private _server?: HttpServer;
  private _wss?: WebSocketServer;
  private _clients: Set<WebSocket> = new Set();
  private _config: WebSocketServerTransportConfig;
  private _running = false;

  constructor(config: WebSocketServerTransportConfig = {}) {
    super();
    this._config = config;
  }

  async start(): Promise<void> {
    if (this._running) {
      throw new Error("WebSocket transport already started");
    }

    return new Promise((resolve, reject) => {
      try {
        if (this._config.server) {
          this._server = this._config.server;
        } else {
          this._server = createServer();
        }

        this._wss = new WebSocketServer({ noServer: true });

        this._server.on("upgrade", (request: IncomingMessage, socket, head) => {
          const protocols = request.headers["sec-websocket-protocol"];
          const protocolsArr = typeof protocols === "string" ? protocols.split(",").map(p => p.trim()) : [];
          if (!protocolsArr.includes("mcp")) {
            socket.write("HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Protocol: mcp\r\n\r\n");
            socket.destroy();
            return;
          }

          this._wss!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
            this._wss!.emit("connection", ws, request);
          });
        });

        this._wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
          logger.info("WebSocket client connected");
          this._clients.add(ws);

          ws.on("message", (data: WebSocket.RawData) => {
            try {
              const message = JSON.parse(data.toString());
              if (typeof message !== "object" || message === null) {
                throw new Error("Invalid JSON-RPC message");
              }
              this._onmessage?.(message as JSONRPCMessage);
            } catch (err) {
              logger.error(`WebSocket message parse error: ${err}`);
              this._onerror?.(err as Error);
            }
          });

          ws.on("close", () => {
            logger.info("WebSocket client disconnected");
            this._clients.delete(ws);
          });

          ws.on("error", (err: Error) => {
            logger.error(`WebSocket error: ${err}`);
            this._onerror?.(err);
          });
        });

        this._server.listen(this._config.port ?? 0, () => {
          const address = this._server!.address();
          logger.info(`WebSocket server listening on ${typeof address === "string" ? address : `port ${address?.port}`}`);
          this._running = true;
          resolve();
        });

        this._server.on("error", (err) => {
          logger.error(`WebSocket server error: ${err}`);
          this._onerror?.(err);
        });

        this._server.on("close", () => {
          logger.info("WebSocket server closed");
          this._running = false;
          this._onclose?.();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const data = JSON.stringify(message);
    for (const ws of this._clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  async close(): Promise<void> {
    for (const ws of this._clients) {
      try {
        ws.close();
      } catch {
        // ignore errors during close
      }
    }
    this._clients.clear();

    if (this._wss) {
      this._wss.removeAllListeners();
    }

    return new Promise((resolve) => {
      if (this._server) {
        this._server.close(() => {
          this._running = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this._running;
  }
}
