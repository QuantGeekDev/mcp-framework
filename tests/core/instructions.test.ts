/**
 * Server instructions (#183): `MCPServerConfig.instructions` is returned to
 * clients in the `initialize` result as `InitializeResult.instructions`.
 */

import { describe, it, expect } from '@jest/globals';
import { MCPServer } from '../../src/core/MCPServer.js';
import EchoTool from '../fixtures/serverless-tools/EchoTool.js';

function makeInitializeRequest(): Request {
  return new Request('https://instructions.local/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'instructions-test', version: '1.0.0' },
      },
      id: 1,
    }),
  });
}

/** Extracts the JSON-RPC message from a JSON or SSE response body. */
function parseRpcBody(body: string): any {
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  const dataLine = trimmed.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) {
    throw new Error(`No JSON-RPC message in response body: ${body}`);
  }
  return JSON.parse(dataLine.slice('data:'.length).trim());
}

async function initialize(server: MCPServer): Promise<any> {
  const response = await server.handleRequest(makeInitializeRequest());
  expect(response.status).toBe(200);
  return parseRpcBody(await response.text());
}

describe('Server instructions', () => {
  it('returns configured instructions in the initialize result', async () => {
    const instructions = 'Call `echo` to repeat a message.\nKeep messages short.';
    const server = new MCPServer({
      name: 'instructions-server',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-instructions-12345',
      instructions,
    });
    server.addTool(EchoTool);

    const message = await initialize(server);

    expect(message.result.serverInfo.name).toBe('instructions-server');
    expect(message.result.instructions).toBe(instructions);
  });

  it('omits instructions when none are configured', async () => {
    const server = new MCPServer({
      name: 'no-instructions-server',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-instructions-12345',
    });
    server.addTool(EchoTool);

    const message = await initialize(server);

    expect(message.result.serverInfo.name).toBe('no-instructions-server');
    expect(message.result).not.toHaveProperty('instructions');
  });
});
