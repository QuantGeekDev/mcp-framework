import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolProtocol } from '../tools/BaseTool.js';
import { PromptProtocol } from '../prompts/BasePrompt.js';
import { ResourceProtocol } from '../resources/BaseResource.js';
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { logger } from './Logger.js';
import { ToolLoader } from '../loaders/toolLoader.js';
import { PromptLoader } from '../loaders/promptLoader.js';
import { ResourceLoader } from '../loaders/resourceLoader.js';
import { BaseTransport } from '../transports/base.js';
import { StdioServerTransport } from '../transports/stdio/server.js';
import { SSEServerTransport } from '../transports/sse/server.js';
import { SSETransportConfig, DEFAULT_SSE_CONFIG } from '../transports/sse/types.js';
import { HttpStreamTransport } from '../transports/http/server.js';
import { HttpStreamTransportConfig, DEFAULT_HTTP_STREAM_CONFIG } from '../transports/http/types.js';
import { DEFAULT_CORS_CONFIG } from '../transports/sse/types.js';
import { AuthConfig } from '../auth/types.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
export type TransportType = 'stdio' | 'sse' | 'http-stream';

export interface TransportConfig {
  type: TransportType;
  options?: SSETransportConfig | HttpStreamTransportConfig;
  auth?: AuthConfig;
}

export interface MCPServerConfig {
  name?: string;
  version?: string;
  basePath?: string;
  transport?: TransportConfig;
}

export type ServerCapabilities = {
  tools?: {
    listChanged?: true;
  };
  prompts?: {
    listChanged?: true;
  };
  resources?: {
    listChanged?: true;
    subscribe?: true;
  };
};

export class MCPServer {
  private server!: Server;
  private toolsMap: Map<string, ToolProtocol> = new Map();
  private promptsMap: Map<string, PromptProtocol> = new Map();
  private resourcesMap: Map<string, ResourceProtocol> = new Map();
  private toolLoader: ToolLoader;
  private promptLoader: PromptLoader;
  private resourceLoader: ResourceLoader;
  private serverName: string;
  private serverVersion: string;
  private basePath: string;
  private transportConfig: TransportConfig;
  private capabilities: ServerCapabilities = {};
  private isRunning: boolean = false;
  private transport?: BaseTransport;
  private shutdownPromise?: Promise<void>;
  private shutdownResolve?: () => void;

  constructor(config: MCPServerConfig = {}) {
    this.basePath = this.resolveBasePath(config.basePath);
    this.serverName = config.name ?? this.getDefaultName();
    this.serverVersion = config.version ?? this.getDefaultVersion();
    this.transportConfig = config.transport ?? { type: 'stdio' };

    if (this.transportConfig.auth && this.transportConfig.options) {
      (this.transportConfig.options as any).auth = this.transportConfig.auth;
    } else if (this.transportConfig.auth && !this.transportConfig.options) {
      this.transportConfig.options = { auth: this.transportConfig.auth } as any;
    }

    logger.info(`Initializing MCP Server: ${this.serverName}@${this.serverVersion}`);
    logger.debug(`Base path: ${this.basePath}`);
    logger.debug(`Transport config: ${JSON.stringify(this.transportConfig)}`);

    this.toolLoader = new ToolLoader(this.basePath);
    this.promptLoader = new PromptLoader(this.basePath);
    this.resourceLoader = new ResourceLoader(this.basePath);
  }

  private resolveBasePath(configPath?: string): string {
    if (configPath) {
      return configPath;
    }
    if (process.argv[1]) {
      return dirname(process.argv[1]);
    }
    return process.cwd();
  }

  private createTransport(): BaseTransport {
    logger.debug(`Creating transport: ${this.transportConfig.type}`);

    let transport: BaseTransport;
    const options = this.transportConfig.options || {};
    const authConfig = this.transportConfig.auth ?? (options as any).auth;

    switch (this.transportConfig.type) {
      case 'sse': {
        const sseConfig: SSETransportConfig = {
          ...DEFAULT_SSE_CONFIG,
          ...(options as SSETransportConfig),
          cors: { ...DEFAULT_CORS_CONFIG, ...(options as SSETransportConfig).cors },
          auth: authConfig,
        };
        transport = new SSEServerTransport(sseConfig);
        break;
      }
      case 'http-stream': {
        const httpConfig: HttpStreamTransportConfig = {
          ...DEFAULT_HTTP_STREAM_CONFIG,
          ...(options as HttpStreamTransportConfig),
          cors: {
            ...DEFAULT_CORS_CONFIG,
            ...((options as HttpStreamTransportConfig).cors || {}),
          },
          auth: authConfig,
        };
        logger.debug(`Creating HttpStreamTransport. response mode: ${httpConfig.responseMode}`);
        transport = new HttpStreamTransport(httpConfig);

        break;
      }
      case 'stdio':
      default:
        if (this.transportConfig.type !== 'stdio') {
          logger.warn(`Unsupported type '${this.transportConfig.type}', defaulting to stdio.`);
        }
        transport = new StdioServerTransport();
        break;
    }

    transport.onclose = () => {
      logger.info(`Transport (${transport.type}) closed.`);
      if (this.isRunning) {
        this.stop().catch((error) => {
          logger.error(`Shutdown error after transport close: ${error}`);
          process.exit(1);
        });
      }
    };

    transport.onerror = (error: Error) => {
      logger.error(`Transport (${transport.type}) error: ${error.message}\n${error.stack}`);
    };
    return transport;
  }

  private readPackageJson(): any {
    try {
      const projectRoot = process.cwd();
      const packagePath = join(projectRoot, 'package.json');

      try {
        const packageContent = readFileSync(packagePath, 'utf-8');
        const packageJson = JSON.parse(packageContent);
        logger.debug(`Successfully read package.json from project root: ${packagePath}`);
        return packageJson;
      } catch (error) {
        logger.warn(`Could not read package.json from project root: ${error}`);
        return null;
      }
    } catch (error) {
      logger.warn(`Could not read package.json: ${error}`);
      return null;
    }
  }

  private getDefaultName(): string {
    const packageJson = this.readPackageJson();
    if (packageJson?.name) {
      return packageJson.name;
    }
    logger.error("Couldn't find project name in package json");
    return 'unnamed-mcp-server';
  }

  private getDefaultVersion(): string {
    const packageJson = this.readPackageJson();
    if (packageJson?.version) {
      return packageJson.version;
    }
    return '0.0.0';
  }

  private setupHandlers(server?: Server) {
    const targetServer = server || this.server;

    targetServer.setRequestHandler(ListToolsRequestSchema, async (request: any) => {
      logger.debug(`Received ListTools request: ${JSON.stringify(request)}`);

      const tools = Array.from(this.toolsMap.values()).map((tool) => tool.toolDefinition);

      logger.debug(`Found ${tools.length} tools to return`);
      logger.debug(`Tool definitions: ${JSON.stringify(tools)}`);

      const response = {
        tools: tools,
        nextCursor: undefined,
      };

      logger.debug(`Sending ListTools response: ${JSON.stringify(response)}`);
      return response;
    });

    targetServer.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      logger.debug(`Tool call request received for: ${request.params.name}`);
      logger.debug(`Tool call arguments: ${JSON.stringify(request.params.arguments)}`);

      const tool = this.toolsMap.get(request.params.name);
      if (!tool) {
        const availableTools = Array.from(this.toolsMap.keys());
        const errorMsg = `Unknown tool: ${request.params.name}. Available tools: ${availableTools.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      try {
        logger.debug(`Executing tool: ${tool.name}`);
        const toolRequest = {
          params: request.params,
          method: 'tools/call' as const,
        };

        const result = await tool.toolCall(toolRequest);
        logger.debug(`Tool execution successful: ${JSON.stringify(result)}`);
        return result;
      } catch (error) {
        const errorMsg = `Tool execution failed: ${error}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
    });

    if (this.capabilities.prompts) {
      targetServer.setRequestHandler(ListPromptsRequestSchema, async () => {
        return {
          prompts: Array.from(this.promptsMap.values()).map((prompt) => prompt.promptDefinition),
        };
      });

      targetServer.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
        const prompt = this.promptsMap.get(request.params.name);
        if (!prompt) {
          throw new Error(
            `Unknown prompt: ${request.params.name}. Available prompts: ${Array.from(
              this.promptsMap.keys()
            ).join(', ')}`
          );
        }

        return {
          messages: await prompt.getMessages(request.params.arguments),
        };
      });
    }

    if (this.capabilities.resources) {
      targetServer.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
          resources: Array.from(this.resourcesMap.values()).map(
            (resource) => resource.resourceDefinition
          ),
        };
      });

      targetServer.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
        const resource = this.resourcesMap.get(request.params.uri);
        if (!resource) {
          throw new Error(
            `Unknown resource: ${request.params.uri}. Available resources: ${Array.from(
              this.resourcesMap.keys()
            ).join(', ')}`
          );
        }

        return {
          contents: await resource.read(),
        };
      });

      targetServer.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
        logger.debug(`Received ListResourceTemplates request`);
        const response = {
          resourceTemplates: [],
          nextCursor: undefined,
        };
        logger.debug(`Sending ListResourceTemplates response: ${JSON.stringify(response)}`);
        return response;
      });

      targetServer.setRequestHandler(SubscribeRequestSchema, async (request: any) => {
        const resource = this.resourcesMap.get(request.params.uri);
        if (!resource) {
          throw new Error(`Unknown resource: ${request.params.uri}`);
        }

        if (!resource.subscribe) {
          throw new Error(`Resource ${request.params.uri} does not support subscriptions`);
        }

        await resource.subscribe();
        return {};
      });

      targetServer.setRequestHandler(UnsubscribeRequestSchema, async (request: any) => {
        const resource = this.resourcesMap.get(request.params.uri);
        if (!resource) {
          throw new Error(`Unknown resource: ${request.params.uri}`);
        }

        if (!resource.unsubscribe) {
          throw new Error(`Resource ${request.params.uri} does not support subscriptions`);
        }

        await resource.unsubscribe();
        return {};
      });
    }
  }

  private async detectCapabilities(): Promise<ServerCapabilities> {
    if (await this.toolLoader.hasTools()) {
      this.capabilities.tools = {};
      logger.debug('Tools capability enabled');
    }

    if (await this.promptLoader.hasPrompts()) {
      this.capabilities.prompts = {};
      logger.debug('Prompts capability enabled');
    }

    if (await this.resourceLoader.hasResources()) {
      this.capabilities.resources = {};
      logger.debug('Resources capability enabled');
    }

    logger.debug(`Capabilities detected: ${JSON.stringify(this.capabilities)}`);
    return this.capabilities;
  }

  private getSdkVersion(): string {
    try {
      const sdkSpecificFile = require.resolve('@modelcontextprotocol/sdk/server/index.js');

      const sdkRootDir = resolve(dirname(sdkSpecificFile), '..', '..', '..');

      const correctPackageJsonPath = join(sdkRootDir, 'package.json');

      const packageContent = readFileSync(correctPackageJsonPath, 'utf-8');

      const packageJson = JSON.parse(packageContent);

      if (packageJson?.version) {
        logger.debug(`Found SDK version: ${packageJson.version}`);
        return packageJson.version;
      } else {
        logger.warn('Could not determine SDK version from its package.json.');
        return 'unknown';
      }
    } catch (error: any) {
      logger.warn(`Failed to read SDK package.json: ${error.message}`);
      return 'unknown';
    }
  }

  async start() {
    try {
      if (this.isRunning) {
        throw new Error('Server is already running');
      }
      this.isRunning = true;

      const frameworkPackageJson = require('../../package.json');
      const frameworkVersion = frameworkPackageJson.version || 'unknown';
      const sdkVersion = this.getSdkVersion();
      logger.info(`Starting MCP server: (Framework: ${frameworkVersion}, SDK: ${sdkVersion})...`);

      const tools = await this.toolLoader.loadTools();
      this.toolsMap = new Map(tools.map((tool: ToolProtocol) => [tool.name, tool]));

      for (const tool of tools) {
        if ('validate' in tool && typeof tool.validate === 'function') {
          try {
            (tool as any).validate();
          } catch (error: any) {
            logger.error(`Tool validation failed for '${tool.name}': ${error.message}`);
            throw new Error(`Tool validation failed for '${tool.name}': ${error.message}`);
          }
        }
      }

      const prompts = await this.promptLoader.loadPrompts();
      this.promptsMap = new Map(prompts.map((prompt: PromptProtocol) => [prompt.name, prompt]));

      const resources = await this.resourceLoader.loadResources();
      this.resourcesMap = new Map(
        resources.map((resource: ResourceProtocol) => [resource.uri, resource])
      );

      await this.detectCapabilities();
      logger.info(`Capabilities detected: ${JSON.stringify(this.capabilities)}`);

      this.server = new Server(
        { name: this.serverName, version: this.serverVersion },
        { capabilities: this.capabilities }
      );
      tools.forEach((tool) => tool.injectServer(this.server));
      logger.debug(
        `SDK Server instance created with capabilities: ${JSON.stringify(this.capabilities)}`
      );

      this.setupHandlers();

      this.transport = this.createTransport();

      logger.info(`Connecting transport (${this.transport.type}) to SDK Server...`);
      await this.server.connect(this.transport);

      logger.info(
        `Started ${this.serverName}@${this.serverVersion} successfully on transport ${this.transport.type}`
      );

      logger.info(`Tools (${tools.length}): ${tools.map((t) => t.name).join(', ') || 'None'}`);
      if (this.capabilities.prompts) {
        logger.info(
          `Prompts (${prompts.length}): ${prompts.map((p) => p.name).join(', ') || 'None'}`
        );
      }
      if (this.capabilities.resources) {
        logger.info(
          `Resources (${resources.length}): ${resources.map((r) => r.uri).join(', ') || 'None'}`
        );
      }

      const shutdownHandler = async (signal: string) => {
        if (!this.isRunning) return;
        logger.info(`Received ${signal}. Shutting down...`);
        try {
          await this.stop();
        } catch (e: any) {
          logger.error(`Shutdown error via ${signal}: ${e.message}`);
          process.exit(1);
        }
      };

      process.on('SIGINT', () => shutdownHandler('SIGINT'));
      process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

      this.shutdownPromise = new Promise((resolve) => {
        this.shutdownResolve = resolve;
      });

      logger.info('Server running and ready.');
      await this.shutdownPromise;
    } catch (error: any) {
      logger.error(`Server failed to start: ${error.message}\n${error.stack}`);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      logger.debug('Stop called, but server not running.');
      return;
    }

    try {
      logger.info('Stopping server...');

      let transportError: Error | null = null;
      let sdkServerError: Error | null = null;

      if (this.transport) {
        try {
          logger.debug(`Closing transport (${this.transport.type})...`);
          await this.transport.close();
          logger.info(`Transport closed.`);
        } catch (e: any) {
          transportError = e;
          logger.error(`Error closing transport: ${e.message}`);
        }
        this.transport = undefined;
      }

      if (this.server) {
        try {
          logger.debug('Closing SDK Server...');
          await this.server.close();
          logger.info('SDK Server closed.');
        } catch (e: any) {
          sdkServerError = e;
          logger.error(`Error closing SDK Server: ${e.message}`);
        }
      }

      this.isRunning = false;

      if (this.shutdownResolve) {
        this.shutdownResolve();
        logger.debug('Shutdown promise resolved.');
      } else {
        logger.warn('Shutdown resolve function not found.');
      }

      if (transportError || sdkServerError) {
        logger.error('Errors occurred during server stop.');
        throw new Error(
          `Server stop failed. TransportError: ${transportError?.message}, SDKServerError: ${sdkServerError?.message}`
        );
      }

      logger.info('MCP server stopped successfully.');
    } catch (error) {
      logger.error(`Error stopping server: ${error}`);
      throw error;
    }
  }

  get IsRunning(): boolean {
    return this.isRunning;
  }
}
