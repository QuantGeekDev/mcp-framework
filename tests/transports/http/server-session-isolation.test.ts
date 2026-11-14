import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { HttpStreamTransport } from '../../../src/transports/http/server.js';

/**
 * Sessions on the http-stream transport must not see each other's traffic.
 *
 * MCP clients number their requests per connection, so two clients routinely
 * use the same JSON-RPC ids (the SDK client starts at 0). If every session
 * shares one SDK Server, those ids collide and responses can be delivered to
 * the wrong client.
 */
describe.each(['stream', 'batch'] as const)(
  'HttpStreamTransport — session isolation (%s)',
  (responseMode) => {
    let transport: HttpStreamTransport;
    let port: number;
    let clients: Client[];

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Tool `echo` waits `delay` ms, sends a progress notification if asked,
    // then returns `tag`.
    function createServer(): Server {
      const server = new Server(
        { name: 'isolation-test', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [{ name: 'echo', inputSchema: { type: 'object' } }],
      }));
      server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        const { tag, delay } = request.params.arguments as { tag: string; delay: number };
        const progressToken = request.params._meta?.progressToken;
        if (progressToken !== undefined) {
          await extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken, progress: 1, message: tag },
          });
        }
        await wait(delay);
        return { content: [{ type: 'text', text: tag }] };
      });
      return server;
    }

    async function connectClient(): Promise<Client> {
      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
      );
      clients.push(client);
      return client;
    }

    function callEcho(client: Client, tag: string, delay: number, onprogress?: () => void) {
      return client.request(
        { method: 'tools/call', params: { name: 'echo', arguments: { tag, delay } } },
        CallToolResultSchema,
        { onprogress, timeout: 3000 }
      );
    }

    function textOf(result: {
      content: Array<{ type: string; text?: string }>;
    }): string | undefined {
      return result.content[0]?.text;
    }

    beforeEach(async () => {
      port = 5000 + Math.floor(Math.random() * 1000);
      clients = [];
      transport = new HttpStreamTransport({ port, endpoint: '/mcp', responseMode });
      transport.setServerFactory(createServer);
      // MCPServer connects one SDK Server to the transport itself (used for
      // server-wide notifications); mirror that here.
      await createServer().connect(transport);
    });

    afterEach(async () => {
      for (const client of clients) {
        await client.close().catch(() => {});
      }
      await transport.close();
    });

    it('delivers each response to the session that sent the request', async () => {
      const a = await connectClient();
      const b = await connectClient();

      // Both clients send their first tools/call with the same JSON-RPC id.
      // A's finishes first.
      const [resultA, resultB] = await Promise.all([
        callEcho(a, 'from-a', 20),
        callEcho(b, 'from-b', 150),
      ]);

      expect(textOf(resultA)).toBe('from-a');
      expect(textOf(resultB)).toBe('from-b');
    });

    it('keeps sessions working after many overlapping calls', async () => {
      const a = await connectClient();
      const b = await connectClient();

      const calls = [];
      for (let i = 0; i < 5; i++) {
        calls.push(callEcho(a, `a-${i}`, 10 + ((i * 37) % 50)));
        calls.push(callEcho(b, `b-${i}`, 10 + ((i * 53) % 50)));
      }
      const results = await Promise.all(calls);

      for (let i = 0; i < 5; i++) {
        expect(textOf(results[i * 2])).toBe(`a-${i}`);
        expect(textOf(results[i * 2 + 1])).toBe(`b-${i}`);
      }
    });

    it('sends progress notifications only to the session that asked for them', async () => {
      const a = await connectClient();
      const b = await connectClient();

      let progressA = 0;
      let progressB = 0;
      const [resultA, resultB] = await Promise.all([
        callEcho(a, 'from-a', 20, () => progressA++),
        callEcho(b, 'from-b', 150, () => progressB++),
      ]);

      expect(textOf(resultA)).toBe('from-a');
      expect(textOf(resultB)).toBe('from-b');
      // In batch mode there is no stream to carry notifications.
      if (responseMode === 'stream') {
        expect(progressA).toBe(1);
        expect(progressB).toBe(1);
      }
    });

    it('creates one SDK Server per session', async () => {
      let created = 0;
      transport.setServerFactory(() => {
        created++;
        return createServer();
      });

      await connectClient();
      await connectClient();
      expect(created).toBe(2);
    });

    it('cleans up the session when the client terminates it', async () => {
      const a = await connectClient();
      expect(Object.keys((transport as any)._transports)).toHaveLength(1);

      await (a.transport as StreamableHTTPClientTransport).terminateSession();
      await wait(50);
      expect(Object.keys((transport as any)._transports)).toHaveLength(0);
    });
  }
);
