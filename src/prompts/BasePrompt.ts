import { z } from "zod";

export type PromptArgumentSchema<T> = {
  [K in keyof T]: {
    type: any;  // Use any to bypass Zod type conflicts
    description: string;
    required?: boolean;
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
        Object.entries(this.schema).map(([key, schema]) => [key, schema.type])
      )
    );

    const validatedArgs = (await zodSchema.parse(args)) as TArgs;
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
