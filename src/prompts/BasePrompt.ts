import { z } from "zod";

export type PromptArgumentSchema<T> = {
  [K in keyof T]: {
    type: z.ZodType<T[K]>;
    description: string;
    required?: boolean;
    default?: T[K];
  };
};

export type PromptArguments<T extends PromptArgumentSchema<any>> = {
  [K in keyof T]: z.infer<T[K]["type"]>;
};

export interface PromptProtocol {
  name: string;
  description: string;
  promptDefinition: {
    name: string;
    description: string;
    arguments?: Array<{
      name: string;
      description: string;
      required?: boolean;
    }>;
  };
  getMessages(args?: Record<string, unknown>): Promise<
    Array<{
      role: string;
      content: {
        type: string;
        text: string;
        resource?: {
          uri: string;
          text: string;
          mimeType: string;
        };
      };
    }>
  >;
}

export abstract class MCPPrompt<TArgs extends Record<string, any> = {}>
  implements PromptProtocol
{
  abstract name: string;
  abstract description: string;
  protected abstract schema: PromptArgumentSchema<TArgs>;

  get promptDefinition() {
    return {
      name: this.name,
      description: this.description,
      arguments: Object.entries(this.schema).map(([name, schema]) => ({
        name,
        description: schema.description,
        required: (schema.required !== false && schema.default === undefined) ? true : false,
      })),
    };
  }

  protected abstract generateMessages(args: TArgs): Promise<
    Array<{
      role: string;
      content: {
        type: string;
        text: string;
        resource?: {
          uri: string;
          text: string;
          mimeType: string;
        };
      };
    }>
  >;

  async getMessages(args: Record<string, unknown> = {}) {
    // Apply defaults for missing fields
    const argsWithDefaults = { ...args };
    for (const [key, schema] of Object.entries(this.schema)) {
      if (!(key in argsWithDefaults)) {
        // Check if schema has explicit default
        if (schema.default !== undefined) {
          argsWithDefaults[key] = schema.default;
        } else if (schema.required !== false) {
          // Apply sensible defaults for required fields without explicit defaults
          const zodType = schema.type;
          if (zodType._def?.typeName === 'ZodString') {
            argsWithDefaults[key] = '';
          } else if (zodType._def?.typeName === 'ZodBoolean') {
            argsWithDefaults[key] = false;
          } else if (zodType._def?.typeName === 'ZodNumber') {
            argsWithDefaults[key] = 0;
          } else if (zodType._def?.typeName === 'ZodArray') {
            argsWithDefaults[key] = [];
          } else if (zodType._def?.typeName === 'ZodObject') {
            argsWithDefaults[key] = {};
          }
        }
      }
    }

    // Create validation schema with optional handling
    const schemaEntries = Object.entries(this.schema).map(([key, schema]) => {
      const isOptional = schema.required === false || schema.type.isOptional?.() || schema.default !== undefined;
      return [key, isOptional ? schema.type.optional() : schema.type];
    });
    
    const zodSchema = z.object(Object.fromEntries(schemaEntries));
    const validatedArgs = zodSchema.parse(argsWithDefaults) as TArgs;
    return this.generateMessages(validatedArgs);
  }

  protected async fetch<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}
