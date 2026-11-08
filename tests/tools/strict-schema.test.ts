/**
 * `.strict()` Zod objects (#176): generated JSON Schemas include
 * `additionalProperties: false`, so clients know extra arguments are rejected.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';
import { MCPServer } from '../../src/core/MCPServer.js';

class StrictTool extends MCPTool {
  name = 'strict_tool';
  description = 'A tool with a strict schema';
  schema = z
    .object({
      city: z.string().describe('City name'),
      units: z.enum(['metric', 'imperial']).optional().describe('Units'),
    })
    .strict();

  async execute(input: { city: string }) {
    return input.city;
  }
}

class DefaultTool extends MCPTool {
  name = 'default_tool';
  description = 'A tool with a default (strip) schema';
  schema = z.object({
    city: z.string().describe('City name'),
  });

  async execute(input: { city: string }) {
    return input.city;
  }
}

class NestedStrictTool extends MCPTool {
  name = 'nested_strict_tool';
  description = 'A tool with a strict nested object';
  schema = z.object({
    location: z
      .object({
        lat: z.number().describe('Latitude'),
        lon: z.number().describe('Longitude'),
      })
      .strict()
      .describe('Coordinates'),
    filters: z
      .object({
        tag: z.string().describe('Tag'),
      })
      .passthrough()
      .optional()
      .describe('Filters'),
  });

  async execute(input: unknown) {
    return input;
  }
}

describe('Strict Zod object schemas', () => {
  it('adds additionalProperties: false for a strict top-level schema', () => {
    const schema = new StrictTool().inputSchema;

    expect(schema).toEqual({
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        units: { type: 'string', description: 'Units', enum: ['metric', 'imperial'] },
      },
      required: ['city'],
      additionalProperties: false,
    });
  });

  it('leaves additionalProperties unset for default (non-strict) schemas', () => {
    const schema = new DefaultTool().inputSchema;

    expect(schema).not.toHaveProperty('additionalProperties');
  });

  it('handles strict and passthrough nested objects', () => {
    const properties = new NestedStrictTool().inputSchema.properties as Record<string, any>;

    expect(properties.location.additionalProperties).toBe(false);
    expect(properties.filters).not.toHaveProperty('additionalProperties');
  });

  it('matches runtime validation: strict tools reject unknown arguments', async () => {
    const tool = new StrictTool();

    const response = await tool.toolCall({
      params: { name: 'strict_tool', arguments: { city: 'Hanoi', extra: true } },
    });

    expect(response.isError).toBe(true);
  });

  it('keeps additionalProperties: false in tools/list responses', async () => {
    const server = new MCPServer({
      name: 'strict-schema-server',
      version: '1.0.0',
      basePath: '/tmp/nonexistent-strict-schema-12345',
    });
    server.addTool(StrictTool);

    const response = await server.handleRequest(
      new Request('https://strict.local/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      }),
    );
    expect(response.status).toBe(200);

    const body = (await response.text()).trim();
    const json = body.startsWith('{')
      ? body
      : body.split('\n').find((line) => line.startsWith('data:'))!.slice('data:'.length);
    const message = JSON.parse(json);
    const tool = message.result.tools.find((t: any) => t.name === 'strict_tool');

    expect(tool.inputSchema.additionalProperties).toBe(false);
  });
});
