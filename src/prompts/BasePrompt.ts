import { z } from "zod";

export type PromptArgumentSchema<T> = {
  [K in keyof T]: {
    type: z.ZodType<T[K]>;
    description: string;
    required?: boolean;
  };
};

export type PromptArguments<T extends PromptArgumentSchema<any>> = {
  [K in keyof T]: z.infer<T[K]["type"]>;
};

export type PromptCompletion = {
  values: string[];
  total?: number;
  hasMore?: boolean;
};

export interface PromptProtocol<TArgs extends Record<string, any> = {}> {
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
  getMessages(args?: Partial<TArgs>): Promise<
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
  complete?<K extends keyof TArgs & string>(
    argumentName: K,
    value: string,
  ): Promise<PromptCompletion>;
}

export abstract class MCPPrompt<TArgs extends Record<string, any> = {}>
  implements PromptProtocol<TArgs>
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
        required: schema.required ?? false,
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
    const zodSchema = z.object(
      Object.fromEntries(
        Object.entries(this.schema).map(([key, schema]) => [key, schema.type]),
      ),
    );

    const validatedArgs = (await zodSchema.parse(args)) as TArgs;
    return this.generateMessages(validatedArgs);
  }

  async complete<K extends keyof TArgs & string>(
    argumentName: K,
    value: string,
  ): Promise<PromptCompletion> {
    if (!this.schema[argumentName].type) {
      throw new Error(`No schema found for argument: ${argumentName}`);
    }

    return {
      values: [],
      total: 0,
      hasMore: false,
    };
  }

  protected async fetch<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}
