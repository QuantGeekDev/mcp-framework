import { z } from "zod";
import { Tool as SDKTool } from "@modelcontextprotocol/sdk/types.js";

export type ToolInputSchema<T> = {
  [K in keyof T]: {
    type: any;  // Use any to bypass Zod type checking
    description: string;
  };
};

export type ToolInput<T extends ToolInputSchema<any>> = {
  [K in keyof T]: z.infer<T[K]["type"]>;
};

export interface ToolProtocol extends SDKTool {
  name: string;
  description: string;
  toolDefinition: {
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties?: Record<string, unknown>;
    };
  };
  toolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

export abstract class MCPTool<TInput extends Record<string, any> = {}>
  implements ToolProtocol
{
  abstract name: string;
  abstract description: string;
  protected abstract schema: ToolInputSchema<TInput>;
  [key: string]: unknown;

  get inputSchema(): { type: "object"; properties?: Record<string, unknown> } {
    return {
      type: "object" as const,
      properties: Object.fromEntries(
        Object.entries(this.schema).map(([key, schema]) => [
          key,
          {
            type: this.getJsonSchemaType(schema.type),
            description: schema.description,
          },
        ])
      ),
    };
  }

  get toolDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }

  protected abstract execute(input: TInput): Promise<unknown>;

  async toolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }) {
    try {
      const args = request.params.arguments || {};
      const validatedInput = await this.validateInput(args);
      const result = await this.execute(validatedInput);
      return this.createSuccessResponse(result);
    } catch (error) {
      return this.createErrorResponse(error as Error);
    }
  }

  private async validateInput(args: Record<string, unknown>): Promise<TInput> {
    const zodSchema = z.object(
      Object.fromEntries(
        Object.entries(this.schema).map(([key, schema]) => [key, schema.type])
      )
    );

    return zodSchema.parse(args) as TInput;
  }

  private getJsonSchemaType(zodType: z.ZodType<any>): string {
    if (zodType instanceof z.ZodString) return "string";
    if (zodType instanceof z.ZodNumber) return "number";
    if (zodType instanceof z.ZodBoolean) return "boolean";
    if (zodType instanceof z.ZodArray) return "array";
    if (zodType instanceof z.ZodObject) return "object";
    return "string";
  }

  protected createSuccessResponse(data: unknown) {
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
    };
  }

  protected createErrorResponse(error: Error) {
    return {
      content: [{ type: "error", text: error.message }],
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
