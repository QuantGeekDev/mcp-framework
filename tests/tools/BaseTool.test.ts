import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';
import Ajv from 'ajv';
import { MCPTool } from '../../src/tools/BaseTool.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CreateMessageRequest, CreateMessageResult } from '@modelcontextprotocol/sdk/types.js';
import {RequestOptions} from '@modelcontextprotocol/sdk/shared/protocol.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
  })),
}));

describe('BaseTool', () => {
  describe('Legacy Pattern (Separate Schema Definition)', () => {
    interface TestToolInput {
      message: string;
      count?: number;
    }

    class TestTool extends MCPTool<TestToolInput> {
      name = 'test_tool';
      description = 'A tool for testing BaseTool functionality';

      protected schema = {
        message: {
          type: z.string(),
          description: 'Test message parameter',
        },
        count: {
          type: z.number().optional(),
          description: 'Optional count parameter',
        },
      };

      protected async execute(input: TestToolInput): Promise<unknown> {
        return {
          received: input.message,
          count: input.count ?? 0,
        };
      }
    }

    let testTool: TestTool;

    beforeEach(() => {
      testTool = new TestTool();
    });

    describe('toolDefinition', () => {
      it('should generate correct tool definition', () => {
        const definition = testTool.toolDefinition;

        expect(definition).toEqual({
          name: 'test_tool',
          description: 'A tool for testing BaseTool functionality',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Test message parameter',
              },
              count: {
                type: 'number',
                description: 'Optional count parameter',
              },
            },
            required: ['message'],
          },
        });
      });
    });

    describe('toolCall', () => {
      it('should execute successfully with valid input', async () => {
        const response = await testTool.toolCall({
          params: {
            name: 'test_tool',
            arguments: {
              message: 'Hello, World!',
              count: 42,
            },
          },
        });

        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toEqual({
          type: 'text',
          text: '{"received":"Hello, World!","count":42}',
        });
      });

      it('should handle optional parameters', async () => {
        const response = await testTool.toolCall({
          params: {
            name: 'test_tool',
            arguments: {
              message: 'Test without count',
            },
          },
        });

        expect(response.content).toHaveLength(1);
        expect(response.content[0]).toEqual({
          type: 'text',
          text: '{"received":"Test without count","count":0}',
        });
      });

      it('should return error response for invalid input', async () => {
        const response = await testTool.toolCall({
          params: {
            name: 'test_tool',
            arguments: {
              count: 10,
            },
          },
        });

        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');
        expect(response.isError).toBe(true);
        expect((response.content[0] as any).text).toContain('Required');
      });

      it('should handle empty arguments', async () => {
        const response = await testTool.toolCall({
          params: {
            name: 'test_tool',
          },
        });

        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');
        expect(response.isError).toBe(true);
      });
    });

    describe('inputSchema', () => {
      it('should correctly identify required fields', () => {
        const { required } = testTool.inputSchema;
        expect(required).toEqual(['message']);
      });

      it('should include all defined properties', () => {
        const { properties } = testTool.inputSchema;
        expect(Object.keys(properties!)).toEqual(['message', 'count']);
      });
    });
  });

  describe('Zod Object Pattern (Direct Schema Definition)', () => {
    const FindProductsInput = z.object({
      query: z.string().optional().describe('The search query string.'),
      first: z
        .number()
        .int()
        .positive()
        .optional()
        .default(10)
        .describe('Number of products per page.'),
      after: z
        .string()
        .optional()
        .describe('Cursor for pagination (from previous pageInfo.endCursor).'),
      sortKey: z
        .enum([
          'RELEVANCE',
          'TITLE',
          'PRICE',
          'CREATED_AT',
          'UPDATED_AT',
          'BEST_SELLING',
          'PRODUCT_TYPE',
          'VENDOR',
        ])
        .optional()
        .default('RELEVANCE')
        .describe(
          'Sort by relevance, title, price, created at, updated at, best selling, product type, or vendor.'
        ),
      reverse: z.boolean().optional().default(false).describe('Reverse the sort order.'),
    });

    type FindProductsInput = z.infer<typeof FindProductsInput>;

    class FindProductsTool extends MCPTool<FindProductsInput, typeof FindProductsInput> {
      name = 'find_products';
      description = 'Search for products in the catalog';
      schema = FindProductsInput;

      protected async execute(input: FindProductsInput): Promise<unknown> {
        return {
          query: input.query,
          first: input.first,
          after: input.after,
          sortKey: input.sortKey,
          reverse: input.reverse,
        };
      }
    }

    let findProductsTool: FindProductsTool;

    beforeEach(() => {
      findProductsTool = new FindProductsTool();
    });

    it('should generate correct tool definition from complex Zod schema', () => {
      const definition = findProductsTool.toolDefinition;

      expect(definition.name).toBe('find_products');
      expect(definition.description).toBe('Search for products in the catalog');
      expect(definition.inputSchema.type).toBe('object');
      expect(definition.inputSchema.properties).toBeDefined();
      expect(definition.inputSchema.required).toEqual([]);
    });

    it('should extract descriptions from Zod schema', () => {
      const { properties } = findProductsTool.inputSchema;

      expect((properties!.query as any).description).toBe('The search query string.');
      expect((properties!.first as any).description).toBe('Number of products per page.');
      expect((properties!.after as any).description).toBe(
        'Cursor for pagination (from previous pageInfo.endCursor).'
      );
      expect((properties!.sortKey as any).description).toContain('Sort by relevance');
      expect((properties!.reverse as any).description).toBe('Reverse the sort order.');
    });

    it('should handle default values correctly', () => {
      const { properties } = findProductsTool.inputSchema;

      expect((properties!.first as any).default).toBe(10);
      expect((properties!.sortKey as any).default).toBe('RELEVANCE');
      expect((properties!.reverse as any).default).toBe(false);
    });

    it('should handle enum types correctly', () => {
      const { properties } = findProductsTool.inputSchema;

      expect((properties!.sortKey as any).type).toBe('string');
      expect((properties!.sortKey as any).enum).toEqual([
        'RELEVANCE',
        'TITLE',
        'PRICE',
        'CREATED_AT',
        'UPDATED_AT',
        'BEST_SELLING',
        'PRODUCT_TYPE',
        'VENDOR',
      ]);
    });

    it('should handle number constraints', () => {
      const { properties } = findProductsTool.inputSchema;

      expect((properties!.first as any).type).toBe('integer');
      expect((properties!.first as any).minimum).toBe(1);
    });

    it('should validate input using the Zod schema', async () => {
      const validInput = {
        query: 'laptop',
        first: 20,
        sortKey: 'PRICE' as const,
        reverse: true,
      };

      const response = await findProductsTool.toolCall({
        params: {
          name: 'find_products',
          arguments: validInput,
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      const result = JSON.parse((response.content[0] as any).text);
      expect(result.query).toBe('laptop');
      expect(result.first).toBe(20);
      expect(result.sortKey).toBe('PRICE');
      expect(result.reverse).toBe(true);
    });

    it('should use default values when fields are not provided', async () => {
      const response = await findProductsTool.toolCall({
        params: {
          name: 'find_products',
          arguments: {},
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      const result = JSON.parse((response.content[0] as any).text);
      expect(result.first).toBe(10);
      expect(result.sortKey).toBe('RELEVANCE');
      expect(result.reverse).toBe(false);
    });

    it('should reject invalid enum values', async () => {
      const response = await findProductsTool.toolCall({
        params: {
          name: 'find_products',
          arguments: {
            sortKey: 'INVALID_SORT_KEY',
          },
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(response.isError).toBe(true);
    });

    it('should reject negative numbers for positive constraints', async () => {
      const response = await findProductsTool.toolCall({
        params: {
          name: 'find_products',
          arguments: {
            first: -5,
          },
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(response.isError).toBe(true);
    });
  });

  describe('JSON Schema Type Generation', () => {
    let comprehensiveTool: ComprehensiveTool;

    interface ComprehensiveToolInput {
      stringField: string;
      numberField: number;
      booleanField: boolean;
      arrayField: string[];
      objectField: { key: string };
      optionalString?: string;
      optionalNumber?: number;
    }

    class ComprehensiveTool extends MCPTool<ComprehensiveToolInput> {
      name = 'comprehensive_tool';
      description = 'A tool for testing all schema types';

      protected schema = {
        stringField: {
          type: z.string(),
          description: 'String field',
        },
        numberField: {
          type: z.number(),
          description: 'Number field',
        },
        booleanField: {
          type: z.boolean(),
          description: 'Boolean field',
        },
        arrayField: {
          type: z.array(z.string()),
          description: 'Array field',
        },
        objectField: {
          type: z.object({ key: z.string() }),
          description: 'Object field',
        },
        optionalString: {
          type: z.string().optional(),
          description: 'Optional string field',
        },
        optionalNumber: {
          type: z.number().optional(),
          description: 'Optional number field',
        },
      };

      protected async execute(input: ComprehensiveToolInput): Promise<unknown> {
        return { processed: true, input };
      }
    }

    beforeEach(() => {
      comprehensiveTool = new ComprehensiveTool();
    });

    it('should correctly map Zod types to JSON schema types', () => {
      const { properties } = comprehensiveTool.inputSchema;

      expect(properties).toBeDefined();
      expect(properties!.stringField).toEqual({
        type: 'string',
        description: 'String field',
      });
      expect(properties!.numberField).toEqual({
        type: 'number',
        description: 'Number field',
      });
      expect(properties!.booleanField).toEqual({
        type: 'boolean',
        description: 'Boolean field',
      });
      expect(properties!.arrayField).toEqual({
        type: 'array',
        description: 'Array field',
      });
      expect(properties!.objectField).toEqual({
        type: 'object',
        description: 'Object field',
      });
    });

    it('should correctly handle optional types', () => {
      const { properties, required } = comprehensiveTool.inputSchema;

      expect(properties!.optionalString).toEqual({
        type: 'string',
        description: 'Optional string field',
      });
      expect(properties!.optionalNumber).toEqual({
        type: 'number',
        description: 'Optional number field',
      });

      expect(required).toEqual([
        'stringField',
        'numberField',
        'booleanField',
        'arrayField',
        'objectField',
      ]);
      expect(required).not.toContain('optionalString');
      expect(required).not.toContain('optionalNumber');
    });

    it('should specifically verify number types are not strings', () => {
      const { properties } = comprehensiveTool.inputSchema;

      expect((properties!.numberField as any).type).toBe('number');
      expect((properties!.numberField as any).type).not.toBe('string');
      expect((properties!.optionalNumber as any).type).toBe('number');
      expect((properties!.optionalNumber as any).type).not.toBe('string');
    });

    it('should generate MCP-compliant tool definition with correct number types', () => {
      interface NumberTestInput {
        age: number;
        price: number;
        weight?: number;
      }

      class NumberTestTool extends MCPTool<NumberTestInput> {
        name = 'number_test_tool';
        description = 'Tool for testing number parameter types in MCP clients';

        protected schema = {
          age: {
            type: z.number().int().positive(),
            description: 'Age in years (positive integer)',
          },
          price: {
            type: z.number().positive(),
            description: 'Price in dollars (positive number)',
          },
          weight: {
            type: z.number().optional(),
            description: 'Weight in kg (optional)',
          },
        };

        protected async execute(input: NumberTestInput): Promise<unknown> {
          return { received: input };
        }
      }

      const tool = new NumberTestTool();
      const definition = tool.toolDefinition;

      expect(definition).toHaveProperty('name', 'number_test_tool');
      expect(definition).toHaveProperty('description');
      expect(definition).toHaveProperty('inputSchema');
      expect(definition.inputSchema).toHaveProperty('type', 'object');
      expect(definition.inputSchema).toHaveProperty('properties');
      expect(definition.inputSchema).toHaveProperty('required');

      const { properties, required } = definition.inputSchema;

      expect((properties!.age as any).type).toBe('number');
      expect((properties!.price as any).type).toBe('number');
      expect((properties!.weight as any).type).toBe('number');

      expect(required).toContain('age');
      expect(required).toContain('price');
      expect(required).not.toContain('weight');

      console.log('MCP Tool Definition for client debugging:');
      console.log(JSON.stringify(definition, null, 2));
    });
  });

  describe('Schema regression: no raw Zod internals in output (issue #112)', () => {
    // Regression test for https://github.com/QuantGeekDev/mcp-framework/issues/112
    // In v0.2.14, tool schemas emitted raw Zod internals (_def, typeName, ~standard)
    // instead of proper JSON Schema (type, properties, required, description).

    function assertNoZodInternals(obj: unknown, path = 'root'): void {
      if (obj === null || obj === undefined || typeof obj !== 'object') return;
      const record = obj as Record<string, unknown>;
      expect(record).not.toHaveProperty('_def');
      expect(record).not.toHaveProperty('typeName');
      expect(record).not.toHaveProperty('~standard');
      expect(record).not.toHaveProperty('coerce');
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'object' && value !== null) {
          assertNoZodInternals(value, `${path}.${key}`);
        }
      }
    }

    it('should produce valid JSON Schema from a simple Zod object schema', () => {
      const schema = z.object({
        location: z
          .string()
          .describe("Location to get weather for (e.g., 'Paris', 'New York')"),
      });

      class WeatherTool extends MCPTool<z.infer<typeof schema>, typeof schema> {
        name = 'weather';
        description = 'Get weather information for a specific location';
        schema = schema;
        protected async execute(input: z.infer<typeof schema>) {
          return { location: input.location };
        }
      }

      const tool = new WeatherTool();
      const definition = tool.toolDefinition;

      // Exact structure from the issue's "expected" (v0.2.13) output
      expect(definition).toEqual({
        name: 'weather',
        description: 'Get weather information for a specific location',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: "Location to get weather for (e.g., 'Paris', 'New York')",
            },
          },
          required: ['location'],
        },
      });
    });

    it('should never contain raw Zod internals in Zod object schema output', () => {
      const schema = z.object({
        query: z.string().describe('Search query'),
        limit: z.number().int().positive().optional().default(10).describe('Max results'),
        tags: z.array(z.string().describe('Tag value')).optional().describe('Filter tags'),
        sortBy: z
          .enum(['relevance', 'date', 'price'])
          .optional()
          .default('relevance')
          .describe('Sort order'),
        filters: z
          .object({
            minPrice: z.number().optional().describe('Minimum price'),
            maxPrice: z.number().optional().describe('Maximum price'),
          })
          .optional()
          .describe('Price filters'),
      });

      class SearchTool extends MCPTool<z.infer<typeof schema>, typeof schema> {
        name = 'search';
        description = 'Search items';
        schema = schema;
        protected async execute(input: z.infer<typeof schema>) {
          return input;
        }
      }

      const tool = new SearchTool();
      const definition = tool.toolDefinition;

      // Recursively verify no Zod internals leaked
      assertNoZodInternals(definition);

      // Verify it's valid JSON Schema structure
      expect(definition.inputSchema.type).toBe('object');
      expect(definition.inputSchema.properties).toBeDefined();
      expect(typeof definition.inputSchema.properties).toBe('object');

      const props = definition.inputSchema.properties!;

      // Every property must have a string 'type' field
      for (const [key, value] of Object.entries(props)) {
        expect((value as any).type).toEqual(expect.any(String));
        expect((value as any).description).toEqual(expect.any(String));
      }

      // Verify specific types
      expect((props.query as any).type).toBe('string');
      expect((props.limit as any).type).toBe('integer');
      expect((props.tags as any).type).toBe('array');
      expect((props.sortBy as any).type).toBe('string');
      expect((props.sortBy as any).enum).toEqual(['relevance', 'date', 'price']);
      expect((props.filters as any).type).toBe('object');
      expect((props.filters as any).properties).toBeDefined();
    });

    it('should never contain raw Zod internals in legacy schema output', () => {
      interface LegacyInput {
        name: string;
        age: number;
        active?: boolean;
      }

      class LegacyTool extends MCPTool<LegacyInput> {
        name = 'legacy_tool';
        description = 'Tool with legacy schema format';
        schema = {
          name: { type: z.string(), description: 'User name' },
          age: { type: z.number(), description: 'User age' },
          active: { type: z.boolean().optional(), description: 'Is active' },
        };
        protected async execute(input: LegacyInput) {
          return input;
        }
      }

      const tool = new LegacyTool();
      const definition = tool.toolDefinition;

      assertNoZodInternals(definition);

      const props = definition.inputSchema.properties!;
      expect((props.name as any).type).toBe('string');
      expect((props.age as any).type).toBe('number');
      expect((props.active as any).type).toBe('boolean');
    });

    it('should produce JSON-serializable output with no circular references', () => {
      const schema = z.object({
        nested: z
          .object({
            items: z
              .array(
                z.object({
                  id: z.number().describe('Item ID'),
                  label: z.string().describe('Item label'),
                })
              )
              .describe('List of items'),
          })
          .describe('Nested object'),
      });

      class NestedTool extends MCPTool<z.infer<typeof schema>, typeof schema> {
        name = 'nested_tool';
        description = 'Tool with deeply nested schema';
        schema = schema;
        protected async execute(input: z.infer<typeof schema>) {
          return input;
        }
      }

      const tool = new NestedTool();
      const definition = tool.toolDefinition;

      // Must survive JSON round-trip without loss
      const serialized = JSON.stringify(definition);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(definition);

      assertNoZodInternals(deserialized);

      // Verify nested structure
      const nested = (deserialized.inputSchema.properties.nested as any);
      expect(nested.type).toBe('object');
      expect(nested.properties.items.type).toBe('array');
      expect(nested.properties.items.items.type).toBe('object');
      expect(nested.properties.items.items.properties.id.type).toBe('number');
      expect(nested.properties.items.items.properties.label.type).toBe('string');
    });

    it('should preserve string constraints as JSON Schema properties, not Zod checks', () => {
      const schema = z.object({
        email: z.string().email().describe('Email address'),
        url: z.string().url().describe('Website URL'),
        code: z.string().min(3).max(10).describe('Short code'),
        pattern: z.string().regex(/^[A-Z]+$/).describe('Uppercase only'),
      });

      class ConstraintTool extends MCPTool<z.infer<typeof schema>, typeof schema> {
        name = 'constraint_tool';
        description = 'Tool with string constraints';
        schema = schema;
        protected async execute(input: z.infer<typeof schema>) {
          return input;
        }
      }

      const tool = new ConstraintTool();
      const props = tool.inputSchema.properties!;

      assertNoZodInternals(props);

      expect((props.email as any).format).toBe('email');
      expect((props.url as any).format).toBe('uri');
      expect((props.code as any).minLength).toBe(3);
      expect((props.code as any).maxLength).toBe(10);
      expect((props.pattern as any).pattern).toBe('^[A-Z]+$');
    });

    it('should preserve number constraints as JSON Schema properties, not Zod checks', () => {
      const schema = z.object({
        age: z.number().int().positive().describe('Age'),
        score: z.number().min(0).max(100).describe('Score'),
      });

      class NumConstraintTool extends MCPTool<z.infer<typeof schema>, typeof schema> {
        name = 'num_constraint_tool';
        description = 'Tool with number constraints';
        schema = schema;
        protected async execute(input: z.infer<typeof schema>) {
          return input;
        }
      }

      const tool = new NumConstraintTool();
      const props = tool.inputSchema.properties!;

      assertNoZodInternals(props);

      expect((props.age as any).type).toBe('integer');
      expect((props.age as any).minimum).toBe(1);
      expect((props.score as any).type).toBe('number');
      expect((props.score as any).minimum).toBe(0);
      expect((props.score as any).maximum).toBe(100);
    });

    describe('exclusive number bounds (#200)', () => {
      const schemaFor = (field: z.ZodNumber) => {
        const schema = z.object({ value: field.describe('Value') });
        class BoundTool extends MCPTool<z.infer<typeof schema>, typeof schema> {
          name = 'bound_tool';
          description = 'Tool with a number bound';
          schema = schema;
          protected async execute(input: z.infer<typeof schema>) {
            return input;
          }
        }
        return new BoundTool().inputSchema.properties!.value as any;
      };
      // Draft-07 / 2020-12 validation of the generated property
      const accepts = (property: any, value: number) =>
        new Ajv({ strictKeywords: true } as any).validate(property, value) as boolean;

      it('uses a numeric exclusiveMinimum for positive() and gt() on numbers', () => {
        const positive = schemaFor(z.number().positive());
        expect(positive.exclusiveMinimum).toBe(0);
        expect(positive.minimum).toBeUndefined();
        expect(accepts(positive, 0.5)).toBe(true);
        expect(accepts(positive, 0)).toBe(false);

        const gt = schemaFor(z.number().gt(5));
        expect(gt.exclusiveMinimum).toBe(5);
        expect(gt.minimum).toBeUndefined();
        expect(accepts(gt, 5.1)).toBe(true);
        expect(accepts(gt, 5)).toBe(false);
      });

      it('uses a numeric exclusiveMaximum for negative() and lt() on numbers', () => {
        const negative = schemaFor(z.number().negative());
        expect(negative.exclusiveMaximum).toBe(0);
        expect(negative.maximum).toBeUndefined();
        expect(accepts(negative, -0.5)).toBe(true);
        expect(accepts(negative, 0)).toBe(false);

        const lt = schemaFor(z.number().lt(10));
        expect(lt.exclusiveMaximum).toBe(10);
        expect(accepts(lt, 9.9)).toBe(true);
        expect(accepts(lt, 10)).toBe(false);
      });

      it('turns exclusive bounds on integers into the nearest inclusive bound', () => {
        const positiveInt = schemaFor(z.number().int().positive());
        expect(positiveInt).toMatchObject({ type: 'integer', minimum: 1 });
        expect(positiveInt.exclusiveMinimum).toBeUndefined();

        const ltInt = schemaFor(z.number().lt(10).int());
        expect(ltInt).toMatchObject({ type: 'integer', maximum: 9 });
        expect(ltInt.exclusiveMaximum).toBeUndefined();

        const gtFractionInt = schemaFor(z.number().int().gt(2.5));
        expect(gtFractionInt.minimum).toBe(3);
        expect(accepts(gtFractionInt, 3)).toBe(true);
        expect(accepts(gtFractionInt, 2)).toBe(false);
      });

      it('keeps inclusive bounds as minimum and maximum', () => {
        const range = schemaFor(z.number().nonnegative().max(1));
        expect(range).toMatchObject({ minimum: 0, maximum: 1 });
        expect(range.exclusiveMinimum).toBeUndefined();
        expect(range.exclusiveMaximum).toBeUndefined();
      });
    });
  });

  describe('Sampling', () => {
    // Expose the protected samplingRequest for direct testing
    class SamplingTestTool extends MCPTool {
      name = 'sampling_tool';
      description = 'A tool that uses sampling';
      schema = z.object({
        prompt: z.string().describe('The prompt to sample'),
      });

      protected async execute(input: { prompt: string }): Promise<unknown> {
        const result = await this.samplingRequest({
          messages: [
            {
              role: 'user',
              content: { type: 'text', text: input.prompt },
            },
          ],
          maxTokens: 100,
        });
        const content = result.content;
        return { sampledText: content.type === 'text' ? content.text : '' };
      }

      // Expose protected method for testing
      public testSamplingRequest(
        request: CreateMessageRequest['params'],
        options?: RequestOptions,
      ) {
        return this.samplingRequest(request, options);
      }
    }

    let tool: SamplingTestTool;
    let mockServer: jest.Mocked<Server>;

    beforeEach(() => {
      tool = new SamplingTestTool();
      mockServer = new Server(
        { name: 'test-server', version: '1.0.0' },
        { capabilities: {} },
      ) as jest.Mocked<Server>;
      (mockServer as any).createMessage = jest.fn();
    });

    it('should inject server without throwing', () => {
      expect(() => tool.injectServer(mockServer)).not.toThrow();
    });

    it('should silently handle double injection', () => {
      tool.injectServer(mockServer);
      expect(() => tool.injectServer(mockServer)).not.toThrow();
    });

    it('should throw when samplingRequest called without server', async () => {
      await expect(
        tool.testSamplingRequest({
          messages: [{ role: 'user', content: { type: 'text', text: 'test' } }],
          maxTokens: 100,
        }),
      ).rejects.toThrow(
        "Cannot make sampling request: server not available in tool 'sampling_tool'.",
      );
    });

    it('should call server.createMessage with correct params', async () => {
      const mockResult: CreateMessageResult = {
        model: 'test-model',
        role: 'assistant',
        content: { type: 'text', text: 'Sampled response' },
      };
      mockServer.createMessage.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const request: CreateMessageRequest['params'] = {
        messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
        maxTokens: 100,
        temperature: 0.7,
        systemPrompt: 'Be helpful',
      };

      const result = await tool.testSamplingRequest(request);

      expect(mockServer.createMessage).toHaveBeenCalledWith(request, undefined);
      expect(result).toEqual(mockResult);
    });

    it('should propagate createMessage errors', async () => {
      tool.injectServer(mockServer);
      mockServer.createMessage.mockRejectedValue(new Error('Sampling failed'));

      await expect(
        tool.testSamplingRequest({
          messages: [{ role: 'user', content: { type: 'text', text: 'test' } }],
          maxTokens: 100,
        }),
      ).rejects.toThrow('Sampling failed');
    });

    it('should pass request options to createMessage', async () => {
      const mockResult: CreateMessageResult = {
        model: 'claude-3-sonnet',
        role: 'assistant',
        content: { type: 'text', text: 'Complex response' },
        stopReason: 'endTurn',
      };
      mockServer.createMessage.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const request: CreateMessageRequest['params'] = {
        messages: [
          { role: 'user', content: { type: 'text', text: 'First message' } },
          { role: 'assistant', content: { type: 'text', text: 'Assistant response' } },
          { role: 'user', content: { type: 'text', text: 'Follow up' } },
        ],
        maxTokens: 500,
        temperature: 0.8,
        systemPrompt: 'You are a helpful assistant',
        modelPreferences: {
          hints: [{ name: 'claude-3' }],
          costPriority: 0.3,
          speedPriority: 0.7,
          intelligencePriority: 0.9,
        },
        stopSequences: ['END', 'STOP'],
        metadata: { taskType: 'analysis' },
      };

      const options: RequestOptions = {
        timeout: 5000,
        maxTotalTimeout: 10000,
        signal: new AbortController().signal,
        resetTimeoutOnProgress: true,
        onprogress: (progress) => {
          console.log('Progress:', progress);
        },
      };

      const result = await tool.testSamplingRequest(request, options);

      expect(mockServer.createMessage).toHaveBeenCalledWith(request, options);
      expect(result).toEqual(mockResult);
    });
  });
});
