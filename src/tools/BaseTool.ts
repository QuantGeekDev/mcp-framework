import { z } from 'zod';
import { CreateMessageRequest, CreateMessageResult, Tool as SDKTool } from '@modelcontextprotocol/sdk/types.js';
import { ImageContent } from '../transports/utils/image-handler.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';

export type ToolInputSchema<T> = {
  [K in keyof T]: {
    type: z.ZodType<T[K]>;
    description: string;
  };
};

export type ToolInput<T extends ToolInputSchema<any>> = {
  [K in keyof T]: z.infer<T[K]['type']>;
};

// Type helper to infer input type from schema
export type InferSchemaType<TSchema> =
  TSchema extends z.ZodObject<any>
    ? z.infer<TSchema>
    : TSchema extends ToolInputSchema<infer T>
      ? T
      : never;

// Magic type that infers from the schema property of the current class
export type MCPInput<T extends MCPTool<any, any> = MCPTool<any, any>> = InferSchemaType<
  T['schema']
>;

export type TextContent = {
  type: 'text';
  text: string;
};

export type ErrorContent = {
  type: 'error';
  text: string;
};

export type ToolContent = TextContent | ErrorContent | ImageContent;

export type ToolResponse = {
  content: ToolContent[];
};

export interface ToolProtocol extends SDKTool {
  name: string;
  description: string;
  toolDefinition: {
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties?: Record<string, unknown>;
      required?: string[];
    };
  };
  toolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<ToolResponse>;
  injectServer(server: Server): void;
}

/**
 * Base class for MCP tools using Zod schemas for input validation and type inference.
 *
 * Define your tool schema using Zod with descriptions:
 * ```typescript
 * const schema = z.object({
 *   message: z.string().describe("The message to process")
 * });
 *
 * class MyTool extends MCPTool {
 *   name = "my_tool";
 *   description = "My tool description";
 *   schema = schema;
 *
 *   async execute(input: McpInput<this>) {
 *     // input is fully typed from your schema
 *     return input.message;
 *   }
 * }
 * ```
 */
export abstract class MCPTool<TInput extends Record<string, any> = any, TSchema = any>
  implements ToolProtocol
{
  abstract name: string;
  abstract description: string;
  protected abstract schema: TSchema extends z.ZodObject<any>
    ? TSchema
    : TSchema extends ToolInputSchema<any>
      ? TSchema
      : z.ZodObject<any> | ToolInputSchema<TInput>;
  protected useStringify: boolean = true;
  [key: string]: unknown;

  private server: Server | undefined;

  /**
   * Injects the server into this tool to allow sampling requests.
   * Automatically called by the MCP server when registering the tool.
   * Calling this method manually will result in an error.
   */
  public injectServer(server: Server): void {
    if (this.server) {
      throw new Error(`Server reference has already been injected into '${this.name}' tool.`);
    }
    this.server = server;
  }

  /**
   * Submit a sampling request to the client
   * @example
   * ```typescript
   * const result = await this.samplingRequest({
   *   messages: [{ role: "user", content: { type: "text", text: "Hello!" } }],
   *   maxTokens: 100
   * });
   * ```
   */
  public readonly samplingRequest = async (request: CreateMessageRequest['params'], options?: RequestOptions): Promise<CreateMessageResult> => {
    if (!this.server) {
      throw new Error(`Server reference has not been injected into '${this.name}' tool.`);
    }
    return await this.server.createMessage(request, options);
  };

  /**
   * Validates the tool schema. This is called automatically when the tool is registered
   * with an MCP server, but can also be called manually for testing.
   */
  public validate(): void {
    if (this.isZodObjectSchema(this.schema)) {
      // Access inputSchema to trigger validation
      const _ = this.inputSchema;
    }
  }

  private isZodObjectSchema(schema: unknown): schema is z.ZodObject<any> {
    return schema instanceof z.ZodObject;
  }

  get inputSchema(): { type: 'object'; properties?: Record<string, unknown>; required?: string[] } {
    if (this.isZodObjectSchema(this.schema)) {
      return this.generateSchemaFromZodObject(this.schema);
    } else {
      return this.generateSchemaFromLegacyFormat(this.schema as ToolInputSchema<TInput>);
    }
  }

  private generateSchemaFromZodObject(zodSchema: z.ZodObject<any>): {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  } {
    const shape = zodSchema.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];
    const missingDescriptions: string[] = [];

    Object.entries(shape).forEach(([key, fieldSchema]) => {
      const fieldInfo = this.extractFieldInfo(fieldSchema as z.ZodType);

      if (!fieldInfo.jsonSchema.description) {
        missingDescriptions.push(key);
      }

      properties[key] = fieldInfo.jsonSchema;

      if (!fieldInfo.isOptional) {
        required.push(key);
      }
    });

    if (missingDescriptions.length > 0) {
      throw new Error(
        `Missing descriptions for fields in ${this.name}: ${missingDescriptions.join(', ')}. ` +
          `All fields must have descriptions when using Zod object schemas. ` +
          `Use .describe() on each field, e.g., z.string().describe("Field description")`
      );
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  private extractFieldInfo(schema: z.ZodType): {
    jsonSchema: any;
    isOptional: boolean;
  } {
    let currentSchema = schema;
    let isOptional = false;
    let defaultValue: any;
    let description: string | undefined;

    // Extract description before unwrapping
    const getDescription = (s: any) => s._def?.description;
    description = getDescription(currentSchema);

    // Unwrap modifiers to get to the base type
    while (true) {
      if (currentSchema instanceof z.ZodOptional) {
        isOptional = true;
        currentSchema = currentSchema.unwrap();
        if (!description) description = getDescription(currentSchema);
      } else if (currentSchema instanceof z.ZodDefault) {
        defaultValue = currentSchema._def.defaultValue();
        currentSchema = currentSchema._def.innerType;
        if (!description) description = getDescription(currentSchema);
      } else if (currentSchema instanceof z.ZodNullable) {
        isOptional = true;
        currentSchema = currentSchema.unwrap();
        if (!description) description = getDescription(currentSchema);
      } else {
        break;
      }
    }

    // Build JSON Schema
    const jsonSchema: any = {
      type: this.getJsonSchemaTypeFromZod(currentSchema),
    };

    if (description) {
      jsonSchema.description = description;
    }

    if (defaultValue !== undefined) {
      jsonSchema.default = defaultValue;
    }

    // Handle enums
    if (currentSchema instanceof z.ZodEnum) {
      jsonSchema.enum = currentSchema._def.values;
    }

    // Handle arrays
    if (currentSchema instanceof z.ZodArray) {
      const itemInfo = this.extractFieldInfo(currentSchema._def.type);
      jsonSchema.items = itemInfo.jsonSchema;
    }

    // Handle nested objects
    if (currentSchema instanceof z.ZodObject) {
      const shape = currentSchema.shape;
      const nestedProperties: Record<string, any> = {};
      const nestedRequired: string[] = [];

      Object.entries(shape).forEach(([key, fieldSchema]) => {
        const nestedFieldInfo = this.extractFieldInfo(fieldSchema as z.ZodType);
        nestedProperties[key] = nestedFieldInfo.jsonSchema;

        if (!nestedFieldInfo.isOptional) {
          nestedRequired.push(key);
        }
      });

      jsonSchema.properties = nestedProperties;
      if (nestedRequired.length > 0) {
        jsonSchema.required = nestedRequired;
      }
    }

    // Handle numeric constraints
    if (currentSchema instanceof z.ZodNumber) {
      const checks = (currentSchema as any)._def.checks || [];
      checks.forEach((check: any) => {
        switch (check.kind) {
          case 'min':
            jsonSchema.minimum = check.value;
            if (check.inclusive === false) {
              jsonSchema.exclusiveMinimum = true;
            }
            break;
          case 'max':
            jsonSchema.maximum = check.value;
            if (check.inclusive === false) {
              jsonSchema.exclusiveMaximum = true;
            }
            break;
          case 'int':
            jsonSchema.type = 'integer';
            break;
        }
      });

      // Handle positive() which adds a min check of 0 (exclusive)
      const hasPositive = checks.some(
        (check: any) => check.kind === 'min' && check.value === 0 && check.inclusive === false
      );
      if (hasPositive) {
        jsonSchema.minimum = 1;
      }
    }

    // Handle string constraints
    if (currentSchema instanceof z.ZodString) {
      const checks = (currentSchema as any)._def.checks || [];
      checks.forEach((check: any) => {
        switch (check.kind) {
          case 'min':
            jsonSchema.minLength = check.value;
            break;
          case 'max':
            jsonSchema.maxLength = check.value;
            break;
          case 'regex':
            jsonSchema.pattern = check.regex.source;
            break;
          case 'email':
            jsonSchema.format = 'email';
            break;
          case 'url':
            jsonSchema.format = 'uri';
            break;
          case 'uuid':
            jsonSchema.format = 'uuid';
            break;
        }
      });
    }

    return { jsonSchema, isOptional };
  }

  private getJsonSchemaTypeFromZod(zodType: z.ZodType<any>): string {
    if (zodType instanceof z.ZodString) return 'string';
    if (zodType instanceof z.ZodNumber) return 'number';
    if (zodType instanceof z.ZodBoolean) return 'boolean';
    if (zodType instanceof z.ZodArray) return 'array';
    if (zodType instanceof z.ZodObject) return 'object';
    if (zodType instanceof z.ZodEnum) return 'string';
    if (zodType instanceof z.ZodNull) return 'null';
    if (zodType instanceof z.ZodUndefined) return 'undefined';
    if (zodType instanceof z.ZodLiteral) {
      const value = zodType._def.value;
      return typeof value === 'string'
        ? 'string'
        : typeof value === 'number'
          ? 'number'
          : typeof value === 'boolean'
            ? 'boolean'
            : 'string';
    }
    return 'string';
  }

  private generateSchemaFromLegacyFormat(schema: ToolInputSchema<TInput>): {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  } {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    Object.entries(schema).forEach(([key, fieldSchema]) => {
      // Determine the correct JSON schema type (unwrapping optional if necessary)
      const jsonType = this.getJsonSchemaType(fieldSchema.type);
      properties[key] = {
        type: jsonType,
        description: fieldSchema.description,
      };

      // If the field is not an optional, add it to the required array.
      if (!(fieldSchema.type instanceof z.ZodOptional)) {
        required.push(key);
      }
    });

    const inputSchema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    } = {
      type: 'object',
      properties,
    };

    if (required.length > 0) {
      inputSchema.required = required;
    }

    return inputSchema;
  }

  get toolDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }

  protected abstract execute(
    input: TSchema extends z.ZodObject<any> ? z.infer<TSchema> : TInput
  ): Promise<unknown>;

  async toolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<ToolResponse> {
    try {
      const args = request.params.arguments || {};
      const validatedInput = await this.validateInput(args);
      const result = await this.execute(
        validatedInput as TSchema extends z.ZodObject<any> ? z.infer<TSchema> : TInput
      );
      return this.createSuccessResponse(result);
    } catch (error) {
      return this.createErrorResponse(error as Error);
    }
  }

  private async validateInput(args: Record<string, unknown>): Promise<TInput> {
    if (this.isZodObjectSchema(this.schema)) {
      return this.schema.parse(args) as TInput;
    } else {
      const zodSchema = z.object(
        Object.fromEntries(
          Object.entries(this.schema as ToolInputSchema<TInput>).map(([key, schema]) => [
            key,
            schema.type,
          ])
        )
      );
      return zodSchema.parse(args) as TInput;
    }
  }

  private getJsonSchemaType(zodType: z.ZodType<any>): string {
    // Unwrap optional types to correctly determine the JSON schema type.
    let currentType = zodType;
    if (currentType instanceof z.ZodOptional) {
      currentType = currentType.unwrap();
    }

    if (currentType instanceof z.ZodString) return 'string';
    if (currentType instanceof z.ZodNumber) return 'number';
    if (currentType instanceof z.ZodBoolean) return 'boolean';
    if (currentType instanceof z.ZodArray) return 'array';
    if (currentType instanceof z.ZodObject) return 'object';
    return 'string';
  }

  protected createSuccessResponse(data: unknown): ToolResponse {
    if (this.isImageContent(data)) {
      return {
        content: [data],
      };
    }

    if (Array.isArray(data)) {
      const validContent = data.filter((item) => this.isValidContent(item)) as ToolContent[];
      if (validContent.length > 0) {
        return {
          content: validContent,
        };
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: this.useStringify ? JSON.stringify(data) : String(data),
        },
      ],
    };
  }

  protected createErrorResponse(error: Error): ToolResponse {
    return {
      content: [{ type: 'error', text: error.message }],
    };
  }

  private isImageContent(data: unknown): data is ImageContent {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === 'image' &&
      'data' in data &&
      'mimeType' in data &&
      typeof (data as ImageContent).data === 'string' &&
      typeof (data as ImageContent).mimeType === 'string'
    );
  }

  private isTextContent(data: unknown): data is TextContent {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === 'text' &&
      'text' in data &&
      typeof (data as TextContent).text === 'string'
    );
  }

  private isErrorContent(data: unknown): data is ErrorContent {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === 'error' &&
      'text' in data &&
      typeof (data as ErrorContent).text === 'string'
    );
  }

  private isValidContent(data: unknown): data is ToolContent {
    return this.isImageContent(data) || this.isTextContent(data) || this.isErrorContent(data);
  }

  protected async fetch<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}

/**
 * Helper function to define tool schemas with required descriptions.
 * This ensures all fields have descriptions at build time.
 *
 * @example
 * const schema = defineSchema({
 *   name: z.string().describe("User's name"),
 *   age: z.number().describe("User's age")
 * });
 */
export function defineSchema<T extends z.ZodRawShape>(shape: T): z.ZodObject<T> {
  // Check descriptions at runtime during development
  if (process.env.NODE_ENV !== 'production') {
    for (const [key, value] of Object.entries(shape)) {
      let schema = value;
      let hasDescription = false;

      // Check the schema and its wrapped versions for description
      while (schema && typeof schema === 'object') {
        if ('_def' in schema && schema._def?.description) {
          hasDescription = true;
          break;
        }
        // Check wrapped types
        if (
          schema instanceof z.ZodOptional ||
          schema instanceof z.ZodDefault ||
          schema instanceof z.ZodNullable
        ) {
          schema = schema._def.innerType || (schema as any).unwrap();
        } else {
          break;
        }
      }

      if (!hasDescription) {
        throw new Error(
          `Field '${key}' is missing a description. Use .describe() to add one.\n` +
            `Example: ${key}: z.string().describe("Description for ${key}")`
        );
      }
    }
  }

  return z.object(shape);
}
