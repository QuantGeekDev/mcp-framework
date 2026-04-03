import { z } from 'zod';
import { CreateMessageRequest, CreateMessageResult, CreateMessageResultWithTools, CreateMessageRequestParamsWithTools, Tool as SDKTool, ToolChoice, ElicitResult, ElicitRequestFormParams, ElicitRequestURLParams } from '@modelcontextprotocol/sdk/types.js';
import { ImageContent } from '../transports/utils/image-handler.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ToolAppConfig } from '../apps/types.js';
import { MCP_APP_MIME_TYPE } from '../apps/types.js';
import { validateAppUri, validateAppToolVisibility, warnContentSize } from '../apps/validation.js';
import type { ResourceDefinition } from '../resources/BaseResource.js';

/**
 * Schema definition for a single field in an elicitation form.
 * Only flat objects with primitive properties are supported per the MCP spec.
 */
export type ElicitationFieldSchema = {
  /** Mark this field as not required. Defaults to required if omitted. */
  optional?: boolean;
} & (
  | { type: 'string'; title?: string; description?: string;
      minLength?: number; maxLength?: number;
      format?: 'email' | 'uri' | 'date' | 'date-time';
      default?: string }
  | { type: 'string'; title?: string; description?: string;
      enum: string[]; default?: string }
  | { type: 'string'; title?: string; description?: string;
      oneOf: { const: string; title: string }[]; default?: string }
  | { type: 'number' | 'integer'; title?: string; description?: string;
      minimum?: number; maximum?: number; default?: number }
  | { type: 'boolean'; title?: string; description?: string;
      default?: boolean }
  | { type: 'array'; title?: string; description?: string;
      minItems?: number; maxItems?: number;
      items: { type: 'string'; enum: string[] } | { anyOf: { const: string; title: string }[] };
      default?: string[] }
);

export { ElicitResult, ElicitRequestFormParams, ElicitRequestURLParams };
export { CreateMessageResultWithTools, CreateMessageRequestParamsWithTools, ToolChoice };

/**
 * Convenience alias for ElicitResult from the SDK.
 * Contains action ('accept' | 'decline' | 'cancel') and optional content.
 */
export type ElicitationResult = ElicitResult;

/**
 * A tool definition for use in sampling requests.
 * Describes a tool that the LLM can invoke during sampling.
 */
export interface SamplingTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

/**
 * Controls tool usage behavior in sampling requests.
 */
export interface SamplingToolChoice {
  mode?: 'auto' | 'required' | 'none';
}

/**
 * Represents a root directory or URI returned by the client.
 */
export interface Root {
  uri: string;
  name?: string;
}

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

export interface MCPIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolExecution {
  taskSupport?: 'forbidden' | 'optional' | 'required';
}

export interface ToolPricing {
  perCall?: number;
  freeTier?: number;
}

export interface ContentAnnotations {
  audience?: ('user' | 'assistant')[];
  priority?: number;
  lastModified?: string;
}

export type TextContent = {
  type: 'text';
  text: string;
  annotations?: ContentAnnotations;
};

export interface AudioContent {
  type: 'audio';
  data: string;
  mimeType: string;
  annotations?: ContentAnnotations;
}

export interface ResourceLinkContent {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  annotations?: ContentAnnotations;
}

export interface EmbeddedResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    annotations?: ContentAnnotations;
  };
}

export type ToolContent = TextContent | ImageContent | AudioContent | ResourceLinkContent | EmbeddedResourceContent;

export type ToolResponse = {
  content: ToolContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export interface ToolProtocol extends SDKTool {
  name: string;
  description: string;
  toolDefinition: {
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties?: Record<string, object>;
      required?: string[];
    };
    title?: string;
    icons?: MCPIcon[];
    annotations?: ToolAnnotations;
    execution?: ToolExecution;
    pricing?: ToolPricing;
    outputSchema?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
  };
  toolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<ToolResponse>;
  injectServer(server: Server): void;
  setProgressToken(token?: string | number): void;
  setAbortSignal(signal?: AbortSignal): void;
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
  /** Optional MCP App configuration. When set, the tool's definition
   *  includes _meta.ui linking it to an auto-registered UI resource. */
  protected app?: ToolAppConfig;
  title?: string;
  icons?: MCPIcon[];
  annotations?: ToolAnnotations;
  execution?: ToolExecution;
  pricing?: ToolPricing;
  protected outputSchemaShape?: z.ZodObject<any>;
  [key: string]: unknown;

  private server: Server | undefined;
  private _progressToken?: string | number;
  private _abortSignal?: AbortSignal;

  /**
   * Sets the progress token for this tool call.
   * Called by MCPServer before executing the tool.
   */
  public setProgressToken(token?: string | number): void {
    this._progressToken = token;
  }

  /**
   * Sets the abort signal for this tool call.
   * Called by MCPServer before executing the tool.
   */
  public setAbortSignal(signal?: AbortSignal): void {
    this._abortSignal = signal;
  }

  /**
   * Returns the abort signal for the current tool invocation, if available.
   * Tools can check this signal to detect cancellation and abort long-running work.
   *
   * @example
   * ```typescript
   * async execute(input: MCPInput<this>) {
   *   for (const item of items) {
   *     if (this.abortSignal?.aborted) {
   *       return "Operation cancelled";
   *     }
   *     await processItem(item);
   *   }
   * }
   * ```
   */
  protected get abortSignal(): AbortSignal | undefined {
    return this._abortSignal;
  }

  /**
   * Report progress for the current tool invocation.
   * Only sends a notification if a progress token was provided by the client.
   *
   * @param progress - Current progress value (MUST increase with each call)
   * @param total - Optional total value for progress calculation
   * @param message - Optional human-readable progress message
   *
   * @example
   * ```typescript
   * async execute(input: MCPInput<this>) {
   *   for (let i = 0; i < items.length; i++) {
   *     await this.reportProgress(i + 1, items.length, `Processing item ${i + 1}`);
   *     await processItem(items[i]);
   *   }
   * }
   * ```
   */
  protected async reportProgress(progress: number, total?: number, message?: string): Promise<void> {
    if (this._progressToken == null || !this.server) return;

    try {
      await this.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken: this._progressToken,
          progress,
          ...(total != null && { total }),
          ...(message != null && { message }),
        },
      });
    } catch {
      // Don't fail tool execution because of progress notification errors
    }
  }

  /**
   * Send a logging message to the client via the MCP logging protocol.
   * Uses the SDK server's sendLoggingMessage method if available.
   *
   * @param level - The log level (debug, info, notice, warning, error, critical, alert, emergency)
   * @param data - The data to log (string, object, etc.)
   * @param loggerName - Optional logger name; defaults to this tool's name
   */
  protected async log(
    level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency',
    data: unknown,
    loggerName?: string,
  ): Promise<void> {
    if (!this.server) return;
    try {
      await (this.server as any).sendLoggingMessage?.({
        level,
        logger: loggerName ?? this.name,
        data,
      });
    } catch {
      // Silently ignore logging failures during tool execution
    }
  }

  /**
   * Injects the server into this tool to allow sampling requests.
   * Automatically called by the MCP server when registering the tool.
   * In multi-transport mode, the server reference is updated per-invocation
   * so that progress/sampling/roots route through the correct transport.
   */
  public injectServer(server: Server): void {
    this.server = server;
  }

  /**
   * Submit a sampling request to the client via the MCP sampling protocol.
   * Can only be called from within a tool's execute() method after the server
   * has been injected.
   *
   * @example
   * ```typescript
   * const result = await this.samplingRequest({
   *   messages: [{ role: "user", content: { type: "text", text: "Hello!" } }],
   *   maxTokens: 100
   * });
   * ```
   */
  protected async samplingRequest(
    request: CreateMessageRequest['params'],
    options?: RequestOptions,
  ): Promise<CreateMessageResult> {
    if (!this.server) {
      throw new Error(
        `Cannot make sampling request: server not available in tool '${this.name}'. ` +
        `Sampling is only available during tool execution within an MCPServer.`,
      );
    }
    return this.server.createMessage(request, options);
  }

  /**
   * Submit a sampling request with tool support to the client via the MCP sampling protocol.
   * The client's LLM may invoke the provided tools during sampling, returning tool_use
   * content blocks in the response.
   *
   * Can only be called from within a tool's execute() method after the server
   * has been injected.
   *
   * @param request  Sampling parameters including messages, maxTokens, and tools.
   * @param options  Optional request options (timeout, signal, etc.).
   * @returns The sampling result, which may contain tool_use content blocks.
   *
   * @example
   * ```typescript
   * const result = await this.samplingRequestWithTools({
   *   messages: [{ role: "user", content: { type: "text", text: "What is the weather?" } }],
   *   maxTokens: 500,
   *   tools: [{
   *     name: "get_weather",
   *     description: "Get weather for a location",
   *     inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] }
   *   }],
   *   toolChoice: { mode: "auto" }
   * });
   * ```
   */
  protected async samplingRequestWithTools(
    request: CreateMessageRequestParamsWithTools,
    options?: RequestOptions,
  ): Promise<CreateMessageResultWithTools> {
    if (!this.server) {
      throw new Error(
        `Cannot make sampling request: server not available in tool '${this.name}'. ` +
        `Sampling is only available during tool execution within an MCPServer.`,
      );
    }
    return this.server.createMessage(request, options);
  }

  /**
   * Request structured input from the user via form-based elicitation.
   * Can only be called from within a tool's execute() method after the server
   * has been injected. The client must support elicitation capabilities.
   *
   * Only flat objects with primitive properties are supported per the MCP spec.
   * Do NOT request sensitive data (passwords, API keys) via form mode -- use
   * elicitUrl() for sensitive data instead.
   *
   * @param message A human-readable message explaining why the input is needed.
   * @param schema  A record of field names to their schema definitions.
   * @param options Optional request options (timeout, signal, etc.).
   * @returns The elicitation result with action ('accept', 'decline', 'cancel') and optional content.
   *
   * @example
   * ```typescript
   * const result = await this.elicit("Please provide your details", {
   *   name: { type: "string", description: "Your full name" },
   *   age: { type: "number", description: "Your age", minimum: 18 }
   * });
   *
   * if (result.action === 'accept') {
   *   console.log(result.content?.name);
   * }
   * ```
   */
  protected async elicit(
    message: string,
    schema: Record<string, ElicitationFieldSchema>,
    options?: RequestOptions,
  ): Promise<ElicitResult> {
    if (!this.server) {
      throw new Error(
        `Cannot elicit input: server not available in tool '${this.name}'. ` +
        `Elicitation is only available during tool execution within an MCPServer.`,
      );
    }

    const required: string[] = [];
    const properties: Record<string, object> = {};

    for (const [key, field] of Object.entries(schema)) {
      const { optional: isOptional, ...jsonSchema } = field;
      properties[key] = jsonSchema;
      if (!isOptional) {
        required.push(key);
      }
    }

    return this.server.elicitInput({
      mode: 'form',
      message,
      requestedSchema: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    } as ElicitRequestFormParams, options);
  }

  /**
   * Request the user to visit a URL for sensitive out-of-band interaction.
   * Use this for passwords, OAuth flows, payments, or anything that should NOT
   * pass through the MCP client.
   *
   * The client will ask the user for consent before opening the URL.
   * An 'accept' response means the user agreed to open the URL, NOT that
   * the interaction is complete.
   *
   * @param message        A human-readable message explaining why the URL visit is needed.
   * @param url            The URL the user should navigate to.
   * @param elicitationId  A unique identifier for this elicitation (used for completion notifications).
   * @param options        Optional request options (timeout, signal, etc.).
   * @returns The elicitation result with action ('accept', 'decline', 'cancel').
   *
   * @example
   * ```typescript
   * const result = await this.elicitUrl(
   *   "Please authorize access to your account",
   *   "https://auth.example.com/authorize?state=abc123",
   *   "auth-flow-abc123"
   * );
   *
   * if (result.action === 'accept') {
   *   // User agreed to open the URL -- wait for completion
   * }
   * ```
   */
  protected async elicitUrl(
    message: string,
    url: string,
    elicitationId: string,
    options?: RequestOptions,
  ): Promise<ElicitResult> {
    if (!this.server) {
      throw new Error(
        `Cannot elicit input: server not available in tool '${this.name}'. ` +
        `Elicitation is only available during tool execution within an MCPServer.`,
      );
    }
    return this.server.elicitInput({
      mode: 'url',
      message,
      url,
      elicitationId,
    } as ElicitRequestURLParams, options);
  }

  /**
   * Request the list of root URIs from the connected client.
   * Roots represent the top-level directories or URIs that the client
   * has made available to the server.
   *
   * Can only be called from within a tool's execute() method after the server
   * has been injected. The client must support roots capability.
   *
   * @param options Optional request options (timeout, signal, etc.).
   * @returns An array of root objects with uri and optional name.
   *
   * @example
   * ```typescript
   * const roots = await this.getRoots();
   * for (const root of roots) {
   *   console.log(`Root: ${root.name ?? root.uri}`);
   * }
   * ```
   */
  protected async getRoots(options?: RequestOptions): Promise<Root[]> {
    if (!this.server) {
      throw new Error(
        `Cannot get roots: server not available in tool '${this.name}'. ` +
        `Roots are only available during tool execution within an MCPServer.`,
      );
    }
    try {
      const result = await this.server.listRoots(undefined, options);
      return (result.roots ?? []).map((r) => ({ uri: r.uri, name: r.name }));
    } catch {
      return [];
    }
  }

  /**
   * Validates the tool schema. This is called automatically when the tool is registered
   * with an MCP server, but can also be called manually for testing.
   */
  public validate(): void {
    if (this.isZodObjectSchema(this.schema)) {
      // Access inputSchema to trigger validation
      const _ = this.inputSchema;
    }
    if (this.app) {
      validateAppUri(this.app.resourceUri, `tool "${this.name}"`);
      if (!this.app.resourceName) {
        throw new Error(`Tool "${this.name}" app config must have a resourceName.`);
      }
      validateAppToolVisibility(this.app.visibility, this.name);
    }
  }

  private isZodObjectSchema(schema: unknown): schema is z.ZodObject<any> {
    return schema instanceof z.ZodObject;
  }

  get inputSchema(): { type: 'object'; properties?: Record<string, object>; required?: string[] } {
    if (this.isZodObjectSchema(this.schema)) {
      return this.generateSchemaFromZodObject(this.schema);
    }

    // Check for common mistake: plain object with Zod types instead of z.object()
    if (typeof this.schema === 'object' && this.schema !== null && !this.isZodObjectSchema(this.schema)) {
      const entries = Object.entries(this.schema as Record<string, any>);
      const hasRawZodValues = entries.some(([_, value]) => {
        return value instanceof z.ZodType && !('type' in value && 'description' in value);
      });

      if (hasRawZodValues) {
        throw new Error(
          `Invalid schema format in tool "${this.name}". ` +
          `It looks like you passed a plain object with Zod types. ` +
          `Use z.object() instead:\n\n` +
          `  // Wrong:\n` +
          `  schema = { field: z.string() }\n\n` +
          `  // Correct:\n` +
          `  schema = z.object({\n` +
          `    field: z.string().describe("Field description")\n` +
          `  })`
        );
      }
    }

    return this.generateSchemaFromLegacyFormat(this.schema as ToolInputSchema<TInput>);
  }

  private generateSchemaFromZodObject(zodSchema: z.ZodObject<any>): {
    type: 'object';
    properties: Record<string, object>;
    required: string[];
  } {
    const shape = zodSchema.shape;
    const properties: Record<string, object> = {};
    const required: string[] = [];
    const missingDescriptions: string[] = [];

    Object.entries(shape).forEach(([key, fieldSchema]) => {
      const fieldInfo = this.extractFieldInfo(fieldSchema as z.ZodType, key, missingDescriptions);

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

  private extractFieldInfo(
    schema: z.ZodType,
    fieldPath?: string,
    missingDescriptions?: string[]
  ): {
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
        const nestedPath = fieldPath ? `${fieldPath}.${key}` : key;
        const nestedFieldInfo = this.extractFieldInfo(
          fieldSchema as z.ZodType,
          nestedPath,
          missingDescriptions
        );

        if (missingDescriptions && !nestedFieldInfo.jsonSchema.description) {
          missingDescriptions.push(nestedPath);
        }

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
    properties: Record<string, object>;
    required?: string[];
  } {
    const properties: Record<string, object> = {};
    const required: string[] = [];

    Object.entries(schema).forEach(([key, fieldSchema]) => {
      // Determine the correct JSON schema type (unwrapping optional if necessary)
      const jsonType = this.getJsonSchemaType(fieldSchema.type);
      properties[key] = {
        type: jsonType,
        description: fieldSchema.description,
      };

      // If the field is not optional/nullable/defaulted, add it to the required array.
      if (!this.isFieldOptional(fieldSchema.type)) {
        required.push(key);
      }
    });

    const inputSchema: {
      type: 'object';
      properties: Record<string, object>;
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
      ...(this.title && { title: this.title }),
      ...(this.icons && this.icons.length > 0 && { icons: this.icons }),
      ...(this.annotations && Object.keys(this.annotations).length > 0 && { annotations: this.annotations }),
      ...(this.execution && Object.keys(this.execution).length > 0 && { execution: this.execution }),
      ...(this.pricing && Object.keys(this.pricing).length > 0 && { pricing: this.pricing }),
      ...(this.outputSchemaShape && { outputSchema: this.generateOutputSchema() }),
      ...(this.app && {
        _meta: {
          ui: {
            resourceUri: this.app.resourceUri,
            ...(this.app.visibility && { visibility: this.app.visibility }),
          },
        },
      }),
    };
  }

  private generateOutputSchema(): Record<string, unknown> {
    if (!this.outputSchemaShape) return {};
    const shape = this.outputSchemaShape.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldInfo = this.extractFieldInfo(value as z.ZodTypeAny);
      properties[key] = fieldInfo.jsonSchema;
      if (!fieldInfo.isOptional) {
        required.push(key);
      }
    }

    return {
      type: 'object' as const,
      properties,
      ...(required.length > 0 && { required }),
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
      const response = this.createSuccessResponse(result);

      // If tool has outputSchema and result is a plain object, add structuredContent
      if (this.outputSchemaShape && result !== null && typeof result === 'object' && !Array.isArray(result) && !this.isValidContent(result)) {
        try {
          const validated = this.outputSchemaShape.parse(result);
          return {
            ...response,
            structuredContent: validated as Record<string, unknown>,
          };
        } catch {
          // Output validation failed - return as regular content
        }
      }

      return response;
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
    // Unwrap optional/nullable/default types to correctly determine the JSON schema type.
    let currentType = zodType;
    while (true) {
      if (currentType instanceof z.ZodOptional) {
        currentType = currentType.unwrap();
      } else if (currentType instanceof z.ZodNullable) {
        currentType = currentType.unwrap();
      } else if (currentType instanceof z.ZodDefault) {
        currentType = (currentType as any)._def.innerType;
      } else {
        break;
      }
    }

    if (currentType instanceof z.ZodString) return 'string';
    if (currentType instanceof z.ZodNumber) return 'number';
    if (currentType instanceof z.ZodBoolean) return 'boolean';
    if (currentType instanceof z.ZodArray) return 'array';
    if (currentType instanceof z.ZodObject) return 'object';
    return 'string';
  }

  private isFieldOptional(zodType: z.ZodType<any>): boolean {
    let current = zodType;
    while (true) {
      if (current instanceof z.ZodOptional) return true;
      if (current instanceof z.ZodNullable) return true;
      if (current instanceof z.ZodDefault) return true;
      break;
    }
    return false;
  }

  protected createSuccessResponse(data: unknown): ToolResponse {
    if (this.isImageContent(data) || this.isAudioContent(data) ||
        this.isResourceLinkContent(data) || this.isEmbeddedResourceContent(data)) {
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
      content: [{ type: 'text', text: error.message }],
      isError: true,
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

  private isAudioContent(value: unknown): value is AudioContent {
    return (
      typeof value === 'object' && value !== null &&
      'type' in value && (value as any).type === 'audio' &&
      'data' in value && typeof (value as any).data === 'string' &&
      'mimeType' in value && typeof (value as any).mimeType === 'string'
    );
  }

  private isResourceLinkContent(value: unknown): value is ResourceLinkContent {
    return (
      typeof value === 'object' && value !== null &&
      'type' in value && (value as any).type === 'resource_link' &&
      'uri' in value && typeof (value as any).uri === 'string'
    );
  }

  private isEmbeddedResourceContent(value: unknown): value is EmbeddedResourceContent {
    return (
      typeof value === 'object' && value !== null &&
      'type' in value && (value as any).type === 'resource' &&
      'resource' in value && typeof (value as any).resource === 'object'
    );
  }

  private isValidContent(data: unknown): data is ToolContent {
    return this.isImageContent(data) || this.isTextContent(data) ||
           this.isAudioContent(data) || this.isResourceLinkContent(data) ||
           this.isEmbeddedResourceContent(data);
  }

  /** Returns true if this tool has an attached MCP App. */
  get hasApp(): boolean {
    return !!this.app;
  }

  /** Returns the ResourceDefinition for the attached app, or undefined. */
  get appResourceDefinition(): ResourceDefinition | undefined {
    if (!this.app) return undefined;
    return {
      uri: this.app.resourceUri,
      name: this.app.resourceName,
      description: this.app.resourceDescription,
      mimeType: MCP_APP_MIME_TYPE,
    };
  }

  /** Reads the attached app's HTML content. Throws if no app is configured. */
  async readAppContent(): Promise<string> {
    if (!this.app) {
      throw new Error(`Tool "${this.name}" has no app configuration.`);
    }
    const content =
      typeof this.app.content === 'function' ? await this.app.content() : this.app.content;
    warnContentSize(content, this.name);
    return content;
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
