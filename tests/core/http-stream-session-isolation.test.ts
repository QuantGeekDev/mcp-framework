import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import http from 'node:http';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPServer } from '../../src/core/MCPServer.js';
import { MCPTool } from '../../src/tools/BaseTool.js';

const schema = z.object({
  tag: z.string().describe('Text to return'),
  delay: z.number().describe('Milliseconds to wait before returning'),
});

class SlowEchoTool extends MCPTool<typeof schema> {
  name = 'slow_echo';
  description = 'Returns the tag after a delay';
  schema = schema;

  async execute(input: z.infer<typeof schema>) {
    await new Promise((resolve) => setTimeout(resolve, input.delay));
    return input.tag;
  }
}

function waitForHealth(port: number, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/health' }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error('server did not start'));
      else setTimeout(attempt, 20);
    };
    attempt();
  });
}

/**
 * The same isolation check as tests/transports/http/server-session-isolation,
 * but through MCPServer so the framework's own wiring and tool handlers run.
 */
describe.each(['stream', 'batch'] as const)(
  'MCPServer http-stream — session isolation (%s)',
  (responseMode) => {
    let server: MCPServer;
    let started: Promise<void>;
    let port: number;
    let clients: Client[];
    let stderrSpy: ReturnType<typeof jest.spyOn>;

    async function connectClient(): Promise<Client> {
      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
      );
      clients.push(client);
      return client;
    }

    async function callSlowEcho(client: Client, tag: string, delay: number) {
      const result = await client.callTool({ name: 'slow_echo', arguments: { tag, delay } });
      // MCPTool JSON-encodes what execute() returns.
      return JSON.parse((result.content as Array<{ text: string }>)[0].text);
    }

    beforeEach(async () => {
      stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      port = 6000 + Math.floor(Math.random() * 1000);
      clients = [];
      server = new MCPServer({
        name: 'isolation-test',
        version: '1.0.0',
        basePath: '/tmp/nonexistent-isolation-test',
        transport: { type: 'http-stream', options: { port, responseMode } },
      });
      server.addTool(SlowEchoTool);
      started = server.start();
      await waitForHealth(port);
    });

    afterEach(async () => {
      for (const client of clients) {
        await client.close().catch(() => {});
      }
      await server.stop();
      await started;
      stderrSpy.mockRestore();
    });

    it('delivers each tool result to the client that called the tool', async () => {
      const a = await connectClient();
      const b = await connectClient();

      // Both clients' first tools/call has the same JSON-RPC id.
      const [resultA, resultB] = await Promise.all([
        callSlowEcho(a, 'from-a', 20),
        callSlowEcho(b, 'from-b', 150),
      ]);

      expect(resultA).toBe('from-a');
      expect(resultB).toBe('from-b');
    });

    it('listRoots() returns right away instead of waiting on a reply that never comes', async () => {
      await connectClient();

      const startedAt = Date.now();
      expect(await server.listRoots()).toEqual([]);
      expect(Date.now() - startedAt).toBeLessThan(1000);
    });
  }
);
