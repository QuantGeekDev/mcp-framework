import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  CompleteRequestSchema,
  ListResourceTemplatesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ToolProtocol } from "../tools/BaseTool.js";
import { PromptProtocol } from "../prompts/BasePrompt.js";
import { ResourceProtocol } from "../resources/BaseResource.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { logger } from "./Logger.js";
import { ToolLoader } from "../loaders/toolLoader.js";
import { PromptLoader } from "../loaders/promptLoader.js";
import { ResourceLoader } from "../loaders/resourceLoader.js";

export interface MCPServerConfig {
  name?: string;
  version?: string;
  basePath?: string;
}

export type ServerCapabilities = {
  tools?: {
    enabled: true;
  };
  schemas?: {
    enabled: true;
  };
  prompts?: {
    enabled: true;
  };
  resources?: {
    enabled: true;
  };
};

export class MCPServer {
  private server: Server;
  private toolsMap: Map<string, ToolProtocol> = new Map();
  private promptsMap: Map<string, PromptProtocol> = new Map();
  private resourcesMap: Map<string, ResourceProtocol> = new Map();
  private toolLoader: ToolLoader;
  private promptLoader: PromptLoader;
  private resourceLoader: ResourceLoader;
  private serverName: string;
  private serverVersion: string;
  private basePath: string;

  constructor(config: MCPServerConfig = {}) {
    this.basePath = this.resolveBasePath(config.basePath);
    this.serverName = config.name ?? this.getDefaultName();
    this.serverVersion = config.version ?? this.getDefaultVersion();

    logger.info(
      `Initializing MCP Server: ${this.serverName}@${this.serverVersion}`,
    );

    this.toolLoader = new ToolLoader(this.basePath);
    this.promptLoader = new PromptLoader(this.basePath);
    this.resourceLoader = new ResourceLoader(this.basePath);

    this.server = new Server(
      {
        name: this.serverName,
        version: this.serverVersion,
      },
      {
        capabilities: {
          tools: { enabled: true },
          prompts: { enabled: false },
          resources: { enabled: false },
        },
      },
    );

    this.setupHandlers();
  }

  private resolveBasePath(configPath?: string): string {
    if (configPath) {
      return configPath;
    }
    if (process.argv[1]) {
      return process.argv[1];
    }
    return process.cwd();
  }

  private readPackageJson(): any {
    try {
      const packagePath = join(dirname(this.basePath), "package.json");
      const packageContent = readFileSync(packagePath, "utf-8");
      const packageJson = JSON.parse(packageContent);
      logger.debug(`Successfully read package.json from: ${packagePath}`);
      return packageJson;
    } catch (error) {
      logger.warn(`Could not read package.json: ${error}`);
      return null;
    }
  }

  private getDefaultName(): string {
    const packageJson = this.readPackageJson();
    if (packageJson?.name) {
      logger.info(`Using name from package.json: ${packageJson.name}`);
      return packageJson.name;
    }
    return "unnamed-mcp-server";
  }

  private getDefaultVersion(): string {
    const packageJson = this.readPackageJson();
    if (packageJson?.version) {
      logger.info(`Using version from package.json: ${packageJson.version}`);
      return packageJson.version;
    }
    return "0.0.0";
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.toolsMap.values()).map(
          (tool) => tool.toolDefinition,
        ),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.toolsMap.get(request.params.name);
      if (!tool) {
        throw new Error(
          `Unknown tool: ${request.params.name}. Available tools: ${Array.from(
            this.toolsMap.keys(),
          ).join(", ")}`,
        );
      }

      const toolRequest = {
        params: request.params,
        method: "tools/call" as const,
      };

      return tool.toolCall(toolRequest);
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: Array.from(this.promptsMap.values()).map(
          (prompt) => prompt.promptDefinition,
        ),
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const prompt = this.promptsMap.get(request.params.name);
      if (!prompt) {
        throw new Error(
          `Unknown prompt: ${
            request.params.name
          }. Available prompts: ${Array.from(this.promptsMap.keys()).join(
            ", ",
          )}`,
        );
      }

      return {
        messages: await prompt.getMessages(request.params.arguments),
      };
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: Array.from(this.resourcesMap.values()).map(
          (resource) => resource.resourceDefinition,
        ),
      };
    });

    this.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async () => {
        const templates = Array.from(this.resourcesMap.values())
          .map((resource) => resource.templateDefinition)
          .filter((template): template is NonNullable<typeof template> =>
            Boolean(template),
          );

        return { resourceTemplates: templates };
      },
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const resource = this.resourcesMap.get(request.params.uri);
        if (!resource) {
          throw new Error(
            `Unknown resource: ${
              request.params.uri
            }. Available resources: ${Array.from(this.resourcesMap.keys()).join(
              ", ",
            )}`,
          );
        }

        return {
          contents: await resource.read(),
        };
      },
    );

    this.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      const resource = this.resourcesMap.get(request.params.uri);
      if (!resource) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      if (!resource.subscribe) {
        throw new Error(
          `Resource ${request.params.uri} does not support subscriptions`,
        );
      }

      await resource.subscribe();
      return {};
    });

    this.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      const resource = this.resourcesMap.get(request.params.uri);
      if (!resource) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      if (!resource.unsubscribe) {
        throw new Error(
          `Resource ${request.params.uri} does not support subscriptions`,
        );
      }

      await resource.unsubscribe();
      return {};
    });

    this.server.setRequestHandler(CompleteRequestSchema, async (request) => {
      const { ref, argument } = request.params;

      if (ref.type === "ref/prompt") {
        const prompt = this.promptsMap.get(ref.name) as
          | PromptProtocol<any>
          | undefined;
        if (!prompt?.complete) {
          return { completion: { values: [] } };
        }
        return {
          completion: await prompt.complete(argument.name, argument.value),
        };
      }

      if (ref.type === "ref/resource") {
        const resource = this.resourcesMap.get(ref.uri) as
          | ResourceProtocol<any>
          | undefined;
        if (!resource?.complete) {
          return { completion: { values: [] } };
        }
        return {
          completion: await resource.complete(argument.name, argument.value),
        };
      }

      throw new Error(`Unknown reference type: ${ref}`);
    });
  }

  private async detectCapabilities(): Promise<ServerCapabilities> {
    const capabilities: ServerCapabilities = {};

    if (await this.toolLoader.hasTools()) {
      capabilities.tools = { enabled: true };
      logger.debug("Tools capability enabled");
    }

    if (await this.promptLoader.hasPrompts()) {
      capabilities.prompts = { enabled: true };
      logger.debug("Prompts capability enabled");
    }

    if (await this.resourceLoader.hasResources()) {
      capabilities.resources = { enabled: true };
      logger.debug("Resources capability enabled");
    }

    return capabilities;
  }

  async start() {
    try {
      const tools = await this.toolLoader.loadTools();
      this.toolsMap = new Map(
        tools.map((tool: ToolProtocol) => [tool.name, tool]),
      );

      const prompts = await this.promptLoader.loadPrompts();
      this.promptsMap = new Map(
        prompts.map((prompt: PromptProtocol) => [prompt.name, prompt]),
      );

      const resources = await this.resourceLoader.loadResources();
      this.resourcesMap = new Map(
        resources.map((resource: ResourceProtocol) => [resource.uri, resource]),
      );

      await this.detectCapabilities();

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      logger.info(`Started ${this.serverName}@${this.serverVersion}`);

      if (tools.length > 0) {
        logger.info(
          `Tools (${tools.length}): ${Array.from(this.toolsMap.keys()).join(
            ", ",
          )}`,
        );
      }
      if (prompts.length > 0) {
        logger.info(
          `Prompts (${prompts.length}): ${Array.from(
            this.promptsMap.keys(),
          ).join(", ")}`,
        );
      }
      if (resources.length > 0) {
        logger.info(
          `Resources (${resources.length}): ${Array.from(
            this.resourcesMap.keys(),
          ).join(", ")}`,
        );
      }
    } catch (error) {
      logger.error(`Server initialization error: ${error}`);
      throw error;
    }
  }
}
