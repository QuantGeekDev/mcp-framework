import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { HttpStreamTransport } from '../../../src/transports/http/server.js';
import { MCPServer } from '../../../src/core/MCPServer.js';
import EchoTool from '../../fixtures/serverless-tools/EchoTool.js';

/**
 * Stateless mode (session.enabled: false) for the HTTP Stream transport.
 * See https://github.com/QuantGeekDev/mcp-framework/issues/187
 */

const initializeBody = (id: number = 1) => ({
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
  id,
});

const toolsListBody = (id: number = 2) => ({ jsonrpc: '2.0', method: 'tools/list', id });

const echoCallBody = (id: number, text: string, delay: number = 0) => ({
  jsonrpc: '2.0',
  method: 'tools/call',
  params: { name: 'echo', arguments: { text, delay } },
  id,
});

async function waitFor(condition: () => boolean, timeoutMs: number = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function randomPort(): number {
  return 20000 + Math.floor(Math.random() * 20000);
}

async function post(
  port: number,
  body: unknown,
  headers: Record<string, string> = {},
  signal?: AbortSignal
) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** Reads a JSON-RPC response from either a JSON body or an SSE stream. */
async function readMessage(res: Response): Promise<any> {
  const text = await res.text();
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)));
    return data[data.length - 1];
  }
  return JSON.parse(text);
}

/** A minimal SDK server with an `echo` tool that can delay its response. */
function createEchoServer(): Server {
  const server = new Server(
    { name: 'stateless-test', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: 'echo', inputSchema: { type: 'object' as const } }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { text, delay } = request.params.arguments as { text: string; delay?: number };
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    return { content: [{ type: 'text' as const, text }] };
  });
  return server;
}

describe.each(['batch', 'stream'] as const)(
  'HttpStreamTransport — stateless mode (%s)',
  (responseMode) => {
    let transport: HttpStreamTransport;
    let port: number;

    beforeEach(async () => {
      port = randomPort();
      transport = new HttpStreamTransport({ port, responseMode, session: { enabled: false } });
      transport.setServerFactory(createEchoServer);
      await transport.start();
    });

    afterEach(async () => {
      await transport.close();
    });

    it('does not return an Mcp-Session-Id header on initialize', async () => {
      const res = await post(port, initializeBody());
      expect(res.status).toBe(200);
      expect(res.headers.get('mcp-session-id')).toBeNull();
      const message = await readMessage(res);
      expect(message.result.serverInfo.name).toBe('stateless-test');
    });

    it('handles tools/list without a prior initialize', async () => {
      const res = await post(port, toolsListBody());
      expect(res.status).toBe(200);
      expect(res.headers.get('mcp-session-id')).toBeNull();
      const message = await readMessage(res);
      expect(message.result.tools.map((t: any) => t.name)).toEqual(['echo']);
    });

    it('ignores a client-supplied session ID instead of returning 404', async () => {
      const res = await post(port, toolsListBody(), { 'mcp-session-id': 'unknown-session' });
      expect(res.status).toBe(200);
      const message = await readMessage(res);
      expect(message.result.tools).toHaveLength(1);
    });

    it('routes concurrent requests with the same JSON-RPC id to the right clients', async () => {
      const [slow, fast] = await Promise.all([
        post(port, echoCallBody(1, 'slow', 100)),
        post(port, echoCallBody(1, 'fast', 0)),
      ]);
      const slowMessage = await readMessage(slow);
      const fastMessage = await readMessage(fast);
      expect(slowMessage.id).toBe(1);
      expect(slowMessage.result.content[0].text).toBe('slow');
      expect(fastMessage.id).toBe(1);
      expect(fastMessage.result.content[0].text).toBe('fast');
    });

    it('cleans up per-request transports and servers after the response', async () => {
      await readMessage(await post(port, toolsListBody()));
      await readMessage(await post(port, echoCallBody(3, 'hi')));
      // 'close' fires asynchronously after the response ends
      await waitFor(() => (transport as any)._statelessRequests.size === 0);
      expect((transport as any)._statelessRequests.size).toBe(0);
      expect(Object.keys((transport as any)._transports)).toHaveLength(0);
    });

    it('returns 202 for a notification-only POST', async () => {
      const res = await post(port, { jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(res.status).toBe(202);
    });

    it('returns 405 for GET and DELETE', async () => {
      for (const method of ['GET', 'DELETE']) {
        const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method,
          headers: { Accept: 'text/event-stream' },
        });
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('POST');
        await res.text();
      }
    });

    it('does not throw when the shared server sends a message with no request to answer', async () => {
      await expect(
        transport.send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })
      ).resolves.toBeUndefined();
    });

    it('rejects server-to-client requests from the shared server instead of hanging', async () => {
      await expect(transport.send({ jsonrpc: '2.0', id: 1, method: 'roots/list' })).rejects.toThrow(
        'stateless mode'
      );
    });
  }
);

describe('HttpStreamTransport — stateless mode without a server factory', () => {
  it('returns 500 instead of handling the request', async () => {
    const port = randomPort();
    const transport = new HttpStreamTransport({ port, session: { enabled: false } });
    await transport.start();
    try {
      const res = await post(port, toolsListBody());
      expect(res.status).toBe(500);
      await res.text();
    } finally {
      await transport.close();
    }
  });
});

describe('HttpStreamTransport — stateless mode with auth', () => {
  let transport: HttpStreamTransport;

  afterEach(async () => {
    await transport.close();
  });

  it('returns 405 for GET before authenticating', async () => {
    const port = randomPort();
    transport = new HttpStreamTransport({
      port,
      session: { enabled: false },
      auth: { provider: { authenticate: async () => false } },
    });
    transport.setServerFactory(createEchoServer);
    await transport.start();

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      headers: { Accept: 'text/event-stream' },
    });
    expect(res.status).toBe(405);
    await res.text();
  });

  it('treats initialize with a stale session ID as initialize for auth', async () => {
    const port = randomPort();
    transport = new HttpStreamTransport({
      port,
      responseMode: 'batch',
      session: { enabled: false },
      // initialize is public ('sse' endpoint), everything else needs auth
      auth: { provider: { authenticate: async () => false }, endpoints: { sse: false } },
    });
    transport.setServerFactory(createEchoServer);
    await transport.start();

    const res = await post(port, initializeBody(), { 'mcp-session-id': 'stale-session' });
    expect(res.status).toBe(200);
    expect((await readMessage(res)).result.serverInfo.name).toBe('stateless-test');
  });

  it('does not leak a server when the client disconnects during auth', async () => {
    const port = randomPort();
    let authStarted!: () => void;
    const authStartedPromise = new Promise<void>((resolve) => (authStarted = resolve));
    let releaseAuth!: () => void;
    const authReleased = new Promise<void>((resolve) => (releaseAuth = resolve));
    const factory = jest.fn(createEchoServer);

    transport = new HttpStreamTransport({
      port,
      session: { enabled: false },
      auth: {
        provider: {
          authenticate: async () => {
            authStarted();
            await authReleased;
            return true;
          },
        },
      },
    });
    transport.setServerFactory(factory);
    await transport.start();

    const controller = new AbortController();
    const request = post(port, toolsListBody(), {}, controller.signal).catch(() => undefined);
    await authStartedPromise;
    controller.abort();
    await request;
    // give the server a moment to see the socket close, then let auth finish
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseAuth();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(factory).not.toHaveBeenCalled();
    expect((transport as any)._statelessRequests.size).toBe(0);
  });
});

describe('HttpStreamTransport — sessions enabled (default)', () => {
  it('still issues a session ID and requires it on later requests', async () => {
    const port = randomPort();
    const transport = new HttpStreamTransport({ port, responseMode: 'batch' });
    transport.onmessage = async (message: any) => {
      if (message.method === 'initialize') {
        await transport.send({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            serverInfo: { name: 'stateful', version: '1.0.0' },
          },
        });
      }
    };
    await transport.start();
    try {
      const init = await post(port, initializeBody());
      expect(init.status).toBe(200);
      expect(init.headers.get('mcp-session-id')).toBeTruthy();
      await init.text();

      const missing = await post(port, toolsListBody());
      expect(missing.status).toBe(400);
      await missing.text();

      const unknown = await post(port, toolsListBody(), { 'mcp-session-id': 'unknown-session' });
      expect(unknown.status).toBe(404);
      await unknown.text();
    } finally {
      await transport.close();
    }
  });
});

describe('MCPServer — stateless http-stream across replicas', () => {
  let stderrSpy: ReturnType<typeof jest.spyOn>;
  const replicas: { server: MCPServer; port: number; started: Promise<void> }[] = [];

  async function startReplica(): Promise<number> {
    const port = randomPort();
    const server = new MCPServer({
      name: 'stateless-replica',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-stateless-12345',
      transport: {
        type: 'http-stream',
        options: { port, responseMode: 'batch', session: { enabled: false } },
      },
    });
    server.addTool(EchoTool);
    const started = server.start();
    replicas.push({ server, port, started });

    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) return port;
      } catch {
        // not listening yet
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`replica on port ${port} did not start`);
  }

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    for (const { server, started } of replicas.splice(0)) {
      await server.stop();
      await started;
    }
    stderrSpy.mockRestore();
  });

  it('serves requests on any replica after initializing on another', async () => {
    const portA = await startReplica();
    const portB = await startReplica();

    const init = await post(portA, initializeBody());
    expect(init.headers.get('mcp-session-id')).toBeNull();
    expect((await readMessage(init)).result.serverInfo.name).toBe('stateless-replica');

    const list = await readMessage(await post(portB, toolsListBody()));
    expect(list.result.tools.map((t: any) => t.name)).toContain('echo');

    const callA = await readMessage(
      await post(portA, {
        ...echoCallBody(3, ''),
        params: { name: 'echo', arguments: { message: 'from A' } },
      })
    );
    const callB = await readMessage(
      await post(portB, {
        ...echoCallBody(4, ''),
        params: { name: 'echo', arguments: { message: 'from B' } },
      })
    );
    expect(callA.result.content[0].text).toContain('from A');
    expect(callB.result.content[0].text).toContain('from B');
  });

  it('works with the SDK client', async () => {
    const port = await startReplica();
    const client = new Client({ name: 'sdk-client', version: '1.0.0' });
    const clientTransport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`)
    );
    await client.connect(clientTransport);
    try {
      expect(clientTransport.sessionId).toBeUndefined();
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('echo');
      const result = await client.callTool({ name: 'echo', arguments: { message: 'hello' } });
      expect((result.content as any[])[0].text).toContain('hello');
    } finally {
      await client.close();
    }
  });
});
