import { z } from 'zod';
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
  CompleteRequestSchema,
  SetLevelRequestSchema,
  CancelledNotificationSchema,
  RootsListChangedNotificationSchema,
  GetTaskRequestSchema,
  GetTaskPayloadRequestSchema,
  ListTasksRequestSchema,
  CancelTaskRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TaskManager } from './TaskManager.js';
import { ToolProtocol } from '../tools/BaseTool.js';
import { PromptProtocol } from '../prompts/BasePrompt.js';
import { ResourceProtocol } from '../resources/BaseResource.js';
import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { logger } from './Logger.js';
import { ToolLoader } from '../loaders/toolLoader.js';
import { PromptLoader } from '../loaders/promptLoader.js';
import { ResourceLoader } from '../loaders/resourceLoader.js';
import { AppLoader } from '../loaders/appLoader.js';
import { AppProtocol, AppToolDefinition, MCP_APP_MIME_TYPE, MCP_APP_EXTENSION_ID } from '../apps/types.js';
import { isAppOnlyTool, warnContentSize } from '../apps/validation.js';
import { BaseTransport } from '../transports/base.js';
import { StdioServerTransport } from '../transports/stdio/server.js';
import { SSEServerTransport } from '../transports/sse/server.js';
import { SSETransportConfig, DEFAULT_SSE_CONFIG } from '../transports/sse/types.js';
import { HttpStreamTransport } from '../transports/http/server.js';
import { HttpStreamTransportConfig, DEFAULT_HTTP_STREAM_CONFIG } from '../transports/http/types.js';
import { DEFAULT_CORS_CONFIG } from '../transports/sse/types.js';
import { AuthConfig } from '../auth/types.js';
import { createRequire } from 'module';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticateWebRequest } from '../serverless/web-auth-handler.js';
import { initializeOAuthMetadata } from '../transports/utils/oauth-metadata.js';
import { requestContext } from '../utils/requestContext.js';
import type {
  LambdaEvent,
  LambdaResult,
  LambdaContext,
  LambdaHandlerConfig,
} from '../serverless/types.js';
import {
  lambdaEventToRequest,
  responseToLambdaResult,
  getSourceIp,
} from '../serverless/lambda-adapter.js';

const require = createRequire(import.meta.url);

export type MCPLogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

export const LOG_LEVEL_SEVERITY: Record<MCPLogLevel, number> = {
  debug: 0, info: 1, notice: 2, warning: 3,
  error: 4, critical: 5, alert: 6, emergency: 7,
};

export type TransportType = 'stdio' | 'sse' | 'http-stream';

export interface TransportConfig {
  type: TransportType;
  options?: SSETransportConfig | HttpStreamTransportConfig;
  auth?: AuthConfig;
}

export interface TasksConfig {
  enabled: boolean;
  defaultTtl?: number;
  defaultPollInterval?: number;
  maxTasks?: number;
}

export interface MCPServerConfig {
  name?: string;
  version?: string;
  basePath?: string;
  transport?: TransportConfig;
  /** Array of transport configs for running multiple transports concurrently.
   *  Cannot be used together with `transport`. */
  transports?: TransportConfig[];
  /** Top-level auth config. Used by handleRequest() and createLambdaHandler().
   *  Also used by start() if transport.auth is not set. */
  auth?: AuthConfig;
  logging?: boolean;
  tasks?: TasksConfig;
  /** When true, app HTML content is re-read from disk on every resources/read.
   *  Defaults to true when MCP_DEV_MODE env var is set. */
  devMode?: boolean;
}

export interface TransportBinding {
  config: TransportConfig;
  transport: BaseTransport;
  sdkServer: Server;
  label: string;
}

export interface HandleRequestOptions {
  /** Source IP address of the client (e.g., from Lambda event). */
  sourceIp?: string;
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
  completions?: {};
  logging?: {};
  tasks?: {
    list?: {};
    cancel?: {};
    requests?: {
      tools?: {
        call?: {};
      };
    };
  };
};

export class MCPServer {
  private toolsMap: Map<string, ToolProtocol> = new Map();
  private promptsMap: Map<string, PromptProtocol> = new Map();
  private resourcesMap: Map<string, ResourceProtocol> = new Map();
  private toolLoader: ToolLoader;
  private promptLoader: PromptLoader;
  private resourceLoader: ResourceLoader;
  private appLoader: AppLoader;
  private appsMap: Map<string, AppProtocol> = new Map();
  private _hasApps: boolean = false;
  private appContentCache: Map<string, string> = new Map();
  private serverName: string;
  private serverVersion: string;
  private basePath: string;
  private transportConfigs: TransportConfig[];
  private capabilities: ServerCapabilities = {};
  private isRunning: boolean = false;
  private bindings: TransportBinding[] = [];
  private shutdownPromise?: Promise<void>;
  private shutdownResolve?: () => void;
  private _logLevel: MCPLogLevel = 'warning';
  private _loggingEnabled: boolean = false;
  private _inFlightAbortControllers = new Map<string | number, AbortController>();
  private _roots: Array<{ uri: string; name?: string }> = [];
  private _tasksConfig?: TasksConfig;
  private _taskManager?: TaskManager;
  private _devMode: boolean;
  private _initialized = false;
  private _initPromise?: Promise<void>;
  private _authConfig?: AuthConfig;

  /** Returns the first binding's SDK Server, or undefined if no bindings exist. */
  private get server(): Server | undefined {
    return this.bindings[0]?.sdkServer;
  }

  constructor(config: MCPServerConfig = {}) {
    this.basePath = this.resolveBasePath(config.basePath);
    this.serverName = config.name ?? this.getDefaultName();
    this.serverVersion = config.version ?? this.getDefaultVersion();
    this._loggingEnabled = config.logging ?? false;
    this._tasksConfig = config.tasks;
    this._devMode = config.devMode ?? !!process.env.MCP_DEV_MODE;
    this._authConfig = config.auth;

    // Normalize transport config: support both singular and plural forms
    if (config.transport && config.transports) {
      throw new Error(
        'Cannot specify both `transport` and `transports` in MCPServerConfig. ' +
        'Use `transport` for a single transport or `transports` for multiple.',
      );
    }
    this.transportConfigs = config.transports
      ?? (config.transport ? [config.transport] : [{ type: 'stdio' as TransportType }]);

    this.validateTransportConfigs();

    // Apply auth injection per transport config
    for (const tc of this.transportConfigs) {
      if (tc.auth && tc.options) {
        (tc.options as any).auth = tc.auth;
      } else if (tc.auth && !tc.options) {
        tc.options = { auth: tc.auth } as any;
      }
    }

    logger.info(`Initializing MCP Server: ${this.serverName}@${this.serverVersion}`);
    logger.debug(`Base path: ${this.basePath}`);
    logger.debug(`Transport configs: ${JSON.stringify(this.transportConfigs)}`);

    this.toolLoader = new ToolLoader(this.basePath);
    this.promptLoader = new PromptLoader(this.basePath);
    this.resourceLoader = new ResourceLoader(this.basePath);
    this.appLoader = new AppLoader(this.basePath);
  }

  private validateTransportConfigs(): void {
    // Enforce at most one stdio transport
    const stdioCount = this.transportConfigs.filter(c => c.type === 'stdio').length;
    if (stdioCount > 1) {
      throw new Error(
        'Only one stdio transport is allowed (stdin/stdout is a process-level singleton).',
      );
    }

    // Detect port conflicts among HTTP-based transports
    const portMap = new Map<number, string>();
    for (const tc of this.transportConfigs) {
      if (tc.type === 'stdio') continue;

      const port = (tc.options as any)?.port
        ?? (tc.type === 'sse' ? DEFAULT_SSE_CONFIG.port : DEFAULT_HTTP_STREAM_CONFIG.port);

      const existing = portMap.get(port);
      if (existing) {
        throw new Error(
          `Port conflict: both ${existing} and ${tc.type} are configured on port ${port}. ` +
          'Use different ports for each HTTP-based transport.',
        );
      }
      portMap.set(port, tc.type);
    }
  }

  private resolveBasePath(configPath?: string): string {
    if (configPath) {
      return configPath;
    }

    // 1. Check project root dist/ directory (most common case)
    const projectRoot = process.cwd();
    const distPath = join(projectRoot, 'dist');
    if (existsSync(distPath)) {
      logger.debug(`Using project's dist directory: ${distPath}`);
      return distPath;
    }

    // 2. Walk up from the main module (process.argv[1]) to find dist/.
    //    Handles npx where argv[1] is deep inside a temp/cache directory.
    const mainModulePath = process.argv[1];
    if (mainModulePath) {
      let searchDir = dirname(mainModulePath);
      for (let i = 0; i < 5; i++) {
        const candidate = join(searchDir, 'dist');
        if (existsSync(candidate)) {
          logger.debug(`Found dist/ by walking up from argv[1]: ${candidate}`);
          return candidate;
        }
        const parent = dirname(searchDir);
        if (parent === searchDir) break;
        searchDir = parent;
      }

      // 3. Fallback: use argv[1] dirname directly
      const moduleDir = dirname(mainModulePath);
      const basePath = moduleDir.endsWith('dist') ? moduleDir : join(moduleDir, 'dist');
      logger.debug(`Using module path-based resolution: ${basePath}`);
      return basePath;
    }

    return process.cwd();
  }

  /**
   * Creates a new SDK Server instance configured with all registered handlers.
   * Used by handleRequest() to create isolated per-request servers, and by
   * SSE transport for per-session servers.
   */
  private createSDKServerForSession(): Server {
    const serverOptions: Record<string, unknown> = { capabilities: this.capabilities };
    if (this._hasApps) {
      serverOptions.extensions = { [MCP_APP_EXTENSION_ID]: {} };
    }
    const sessionServer = new Server(
      { name: this.serverName, version: this.serverVersion },
      serverOptions as any,
    );
    this.setupHandlers(sessionServer);
    return sessionServer;
  }

  private createTransportFromConfig(config: TransportConfig): BaseTransport {
    logger.debug(`Creating transport: ${config.type}`);

    let transport: BaseTransport;
    const options = config.options || {};
    const authConfig = config.auth ?? (options as any).auth;

    switch (config.type) {
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
        if (config.type !== 'stdio') {
          logger.warn(`Unsupported type '${config.type}', defaulting to stdio.`);
        }
        transport = new StdioServerTransport();
        break;
    }

    transport.onerror = (error: Error) => {
      logger.error(`Transport (${transport.type}) error: ${error.message}\n${error.stack}`);
    };
    return transport;
  }

  private makeBindingLabel(config: TransportConfig): string {
    if (config.type === 'stdio') return 'stdio';
    const port = (config.options as any)?.port
      ?? (config.type === 'sse' ? DEFAULT_SSE_CONFIG.port : DEFAULT_HTTP_STREAM_CONFIG.port);
    return `${config.type}:${port}`;
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

  private setupHandlers(server: Server) {
    const targetServer = server;

    targetServer.setRequestHandler(ListToolsRequestSchema, async (request: any) => {
      logger.debug(`Received ListTools request: ${JSON.stringify(request)}`);

      const tools = Array.from(this.toolsMap.values())
        .filter((tool) => {
          // Filter out app-only tools (visibility: ["app"]) from the agent's tool list
          const visibility = (tool as any)._visibility;
          return !isAppOnlyTool(visibility);
        })
        .map((tool) => tool.toolDefinition);

      logger.debug(`Found ${tools.length} tools to return`);
      logger.debug(`Tool definitions: ${JSON.stringify(tools)}`);

      const response = {
        tools: tools,
        nextCursor: undefined,
      };

      logger.debug(`Sending ListTools response: ${JSON.stringify(response)}`);
      return response;
    });

    targetServer.setRequestHandler(CallToolRequestSchema, async (request: any, extra: any) => {
      logger.debug(`Tool call request received for: ${request.params.name}`);
      logger.debug(`Tool call arguments: ${JSON.stringify(request.params.arguments)}`);

      const tool = this.toolsMap.get(request.params.name);
      if (!tool) {
        const availableTools = Array.from(this.toolsMap.keys());
        const errorMsg = `Unknown tool: ${request.params.name}. Available tools: ${availableTools.join(', ')}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Inject the target server so progress/sampling routes through the
      // correct transport in multi-transport mode.
      tool.injectServer(targetServer);

      // Check for task-augmented request
      const taskParams = request.params?.task;
      if (taskParams && this._taskManager && this.capabilities.tasks) {
        const toolDef = tool.toolDefinition;
        const taskSupport = toolDef.execution?.taskSupport ?? 'forbidden';
        if (taskSupport === 'forbidden') {
          throw new Error(
            `Tool '${tool.name}' does not support task-augmented execution`
          );
        }

        const taskState = this._taskManager.createTask(taskParams.ttl);
        logger.debug(`Created task ${taskState.taskId} for tool ${tool.name}`);

        // Execute the tool asynchronously in the background
        const taskManager = this._taskManager;
        const executeAsync = async () => {
          try {
            const toolRequest = {
              params: request.params,
              method: 'tools/call' as const,
            };

            const progressToken = request.params?._meta?.progressToken;
            const abortSignal = extra?.signal as AbortSignal | undefined;
            tool.setProgressToken(progressToken);
            tool.setAbortSignal(abortSignal);

            try {
              const result = await tool.toolCall(toolRequest);
              taskManager.completeTask(taskState.taskId, result);
              logger.debug(`Task ${taskState.taskId} completed successfully`);
            } finally {
              tool.setProgressToken(undefined);
              tool.setAbortSignal(undefined);
            }
          } catch (error) {
            try {
              taskManager.failTask(taskState.taskId, error);
            } catch {
              // Task may have been cancelled or expired
            }
            logger.error(`Task ${taskState.taskId} failed: ${error}`);
          }
        };

        // Fire and forget
        executeAsync();

        // Return CreateTaskResult immediately
        return {
          task: {
            taskId: taskState.taskId,
            status: taskState.status,
            createdAt: taskState.createdAt,
            lastUpdatedAt: taskState.lastUpdatedAt,
            ttl: taskState.ttl,
            ...(taskState.pollInterval != null && { pollInterval: taskState.pollInterval }),
          },
        };
      }

      // Synchronous execution path (no task params)
      try {
        logger.debug(`Executing tool: ${tool.name}`);
        const toolRequest = {
          params: request.params,
          method: 'tools/call' as const,
        };

        // Set progress token and abort signal from the SDK extra context
        const progressToken = request.params?._meta?.progressToken;
        const abortSignal = extra?.signal as AbortSignal | undefined;
        tool.setProgressToken(progressToken);
        tool.setAbortSignal(abortSignal);

        try {
          const result = await tool.toolCall(toolRequest);
          logger.debug(`Tool execution successful: ${JSON.stringify(result)}`);
          return result;
        } finally {
          tool.setProgressToken(undefined);
          tool.setAbortSignal(undefined);
        }
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
        const templates = Array.from(this.resourcesMap.values())
          .map((resource) => resource.templateDefinition)
          .filter((t): t is NonNullable<typeof t> => Boolean(t));
        const response = {
          resourceTemplates: templates,
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

    if (this.capabilities.completions) {
      targetServer.setRequestHandler(CompleteRequestSchema, async (request: any) => {
        const { ref, argument } = request.params;

        if (ref.type === 'ref/prompt') {
          const prompt = this.promptsMap.get(ref.name);
          if (prompt && typeof prompt.complete === 'function') {
            const result = await prompt.complete(argument.name, argument.value);
            return { completion: result };
          }
          return { completion: { values: [] } };
        }

        if (ref.type === 'ref/resource') {
          for (const resource of this.resourcesMap.values()) {
            if (resource.templateDefinition?.uriTemplate === ref.uri || resource.uri === ref.uri) {
              if (typeof resource.complete === 'function') {
                const result = await resource.complete(argument.name, argument.value);
                return { completion: result };
              }
            }
          }
          return { completion: { values: [] } };
        }

        return { completion: { values: [] } };
      });
    }

    if (this.capabilities.logging) {
      targetServer.setRequestHandler(SetLevelRequestSchema, async (request: any) => {
        const level = request.params.level as MCPLogLevel;
        if (!LOG_LEVEL_SEVERITY.hasOwnProperty(level)) {
          throw new Error(`Invalid log level: ${level}`);
        }
        this._logLevel = level;
        logger.info(`MCP log level set to: ${level}`);
        return {};
      });
    }

    targetServer.setNotificationHandler(CancelledNotificationSchema, async (notification: any) => {
      const requestId = notification.params.requestId;
      if (requestId != null) {
        const controller = this._inFlightAbortControllers.get(requestId);
        if (controller) {
          controller.abort(notification.params.reason ?? 'Request cancelled');
          this._inFlightAbortControllers.delete(requestId);
          logger.info(`Request ${requestId} cancelled: ${notification.params.reason ?? 'no reason'}`);
        }
      }
    });

    // Listen for roots/list_changed notifications from the client and refresh
    // the cached roots list when the client signals a change.
    targetServer.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
      try {
        this._roots = await this.listRoots();
        logger.info(`Roots updated: ${this._roots.length} roots available`);
      } catch (error) {
        logger.warn(`Failed to refresh roots: ${error}`);
      }
    });

    // Task handlers
    if (this.capabilities.tasks && this._taskManager) {
      const taskManager = this._taskManager;

      targetServer.setRequestHandler(GetTaskRequestSchema, async (request: any) => {
        const { taskId } = request.params;
        const task = taskManager.getTask(taskId);
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }
        return {
          taskId: task.taskId,
          status: task.status,
          createdAt: task.createdAt,
          lastUpdatedAt: task.lastUpdatedAt,
          ttl: task.ttl,
          ...(task.pollInterval != null && { pollInterval: task.pollInterval }),
          ...(task.statusMessage != null && { statusMessage: task.statusMessage }),
        };
      });

      targetServer.setRequestHandler(GetTaskPayloadRequestSchema, async (request: any) => {
        const { taskId } = request.params;
        const task = taskManager.getTask(taskId);
        if (!task) {
          throw new Error(`Task not found: ${taskId}`);
        }
        if (task.status !== 'completed') {
          throw new Error(
            `Task ${taskId} is not completed (status: ${task.status}). ` +
            `Poll tasks/get until status is 'completed' before requesting the result.`
          );
        }
        return task.result ?? {};
      });

      targetServer.setRequestHandler(ListTasksRequestSchema, async (request: any) => {
        const cursor = request.params?.cursor;
        const { tasks, nextCursor } = taskManager.listTasks(cursor);
        return {
          tasks: tasks.map((t) => ({
            taskId: t.taskId,
            status: t.status,
            createdAt: t.createdAt,
            lastUpdatedAt: t.lastUpdatedAt,
            ttl: t.ttl,
            ...(t.pollInterval != null && { pollInterval: t.pollInterval }),
            ...(t.statusMessage != null && { statusMessage: t.statusMessage }),
          })),
          ...(nextCursor && { nextCursor }),
        };
      });

      targetServer.setRequestHandler(CancelTaskRequestSchema, async (request: any) => {
        const { taskId } = request.params;
        const task = taskManager.cancelTask(taskId);
        return {
          taskId: task.taskId,
          status: task.status,
          createdAt: task.createdAt,
          lastUpdatedAt: task.lastUpdatedAt,
          ttl: task.ttl,
          ...(task.pollInterval != null && { pollInterval: task.pollInterval }),
          ...(task.statusMessage != null && { statusMessage: task.statusMessage }),
        };
      });
    }
  }

  private async detectCapabilities(): Promise<ServerCapabilities> {
    if (this.toolsMap.size > 0 || await this.toolLoader.hasTools()) {
      this.capabilities.tools = {};
      logger.debug('Tools capability enabled');
    }

    if (this.promptsMap.size > 0 || await this.promptLoader.hasPrompts()) {
      this.capabilities.prompts = {};
      logger.debug('Prompts capability enabled');
    }

    if (this.resourcesMap.size > 0 || await this.resourceLoader.hasResources()) {
      this.capabilities.resources = {};
      logger.debug('Resources capability enabled');
    }

    if (this._hasApps && !this.capabilities.resources) {
      this.capabilities.resources = {};
      logger.debug('Resources capability enabled (via MCP Apps)');
    }

    if (this._loggingEnabled) {
      this.capabilities.logging = {};
      logger.debug('Logging capability enabled');
    }

    if (this.capabilities.prompts || this.capabilities.resources) {
      this.capabilities.completions = {};
      logger.debug('Completions capability enabled');
    }

    if (this._tasksConfig?.enabled && this.capabilities.tools) {
      this._taskManager = new TaskManager({
        defaultTtl: this._tasksConfig.defaultTtl,
        defaultPollInterval: this._tasksConfig.defaultPollInterval,
        maxTasks: this._tasksConfig.maxTasks,
      });
      this.capabilities.tasks = {
        list: {},
        cancel: {},
        requests: {
          tools: {
            call: {},
          },
        },
      };
      logger.debug('Tasks capability enabled');
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

  // ── MCP Apps helpers ─────────────────────────────────────────────────────

  private createAppTool(app: AppProtocol, toolDef: AppToolDefinition): ToolProtocol {
    const meta = app.getToolMeta(toolDef.name);
    const inputSchema = this.generateAppToolInputSchema(toolDef);
    const tool = {
      name: toolDef.name,
      description: toolDef.description,
      get toolDefinition() {
        return {
          name: toolDef.name,
          description: toolDef.description,
          inputSchema,
          _meta: meta,
        };
      },
      async toolCall(request: { params: { name: string; arguments?: Record<string, unknown> } }) {
        const args = request.params.arguments || {};
        const validated = toolDef.schema ? toolDef.schema.parse(args) : args;
        const result = await toolDef.execute(validated);
        return {
          content: [
            {
              type: 'text' as const,
              text: typeof result === 'string' ? result : JSON.stringify(result),
            },
          ],
        };
      },
      injectServer() {
        /* no-op for app tools */
      },
      setProgressToken() {
        /* no-op */
      },
      setAbortSignal() {
        /* no-op */
      },
      _visibility: toolDef.visibility,
    } as unknown as ToolProtocol;
    return tool;
  }

  private generateAppToolInputSchema(
    toolDef: AppToolDefinition,
  ): { type: 'object'; properties?: Record<string, object>; required?: string[] } {
    if (!toolDef.schema) return { type: 'object' };
    try {
      const shape = toolDef.schema.shape;
      const properties: Record<string, object> = {};
      const required: string[] = [];
      for (const [key, fieldSchema] of Object.entries(shape)) {
        const fs = fieldSchema as z.ZodTypeAny;
        const isOptional = fs instanceof z.ZodOptional;
        const desc = (fs as any)?._def?.description ?? '';
        properties[key] = { type: 'string', description: desc };
        if (!isOptional) required.push(key);
      }
      return { type: 'object', properties, ...(required.length > 0 && { required }) };
    } catch {
      return { type: 'object' };
    }
  }

  private createAppResource(app: AppProtocol): ResourceProtocol {
    const server = this;
    return {
      uri: app.ui.resourceUri,
      name: app.ui.resourceName,
      description: app.ui.resourceDescription,
      mimeType: MCP_APP_MIME_TYPE,
      get resourceDefinition() {
        return app.resourceDefinition;
      },
      async read() {
        // Use cached content in production mode
        if (!server._devMode && server.appContentCache.has(app.ui.resourceUri)) {
          const cached = server.appContentCache.get(app.ui.resourceUri)!;
          const meta = app.resourceMeta;
          return [
            {
              uri: app.ui.resourceUri,
              mimeType: MCP_APP_MIME_TYPE,
              text: cached,
              ...(meta && { _meta: { ui: meta } }),
            },
          ];
        }
        // In dev mode or uncached, read fresh
        try {
          return await app.readResource();
        } catch (error: any) {
          logger.error(`Failed to read app content for "${app.name}": ${error.message}`);
          return [
            {
              uri: app.ui.resourceUri,
              mimeType: MCP_APP_MIME_TYPE,
              text: `<!-- Error loading app "${app.name}": ${error.message} -->`,
            },
          ];
        }
      },
    } as ResourceProtocol;
  }

  private createToolAppResource(tool: ToolProtocol): ResourceProtocol {
    const def = (tool as any).appResourceDefinition!;
    return {
      uri: def.uri,
      name: def.name,
      description: def.description,
      mimeType: MCP_APP_MIME_TYPE,
      get resourceDefinition() {
        return def;
      },
      async read() {
        const html = await (tool as any).readAppContent();
        return [
          {
            uri: def.uri,
            mimeType: MCP_APP_MIME_TYPE,
            text: html,
          },
        ];
      },
    } as ResourceProtocol;
  }

  // ── Lazy initialization ───────────────────────────────────────────────

  /**
   * Idempotent initialization: loads tools, prompts, resources, apps from
   * disk, validates them, detects capabilities, and caches app content.
   * Safe to call multiple times — only runs once.
   */
  private async ensureInitialized(): Promise<void> {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInitialize();
    await this._initPromise;
  }

  private async _doInitialize(): Promise<void> {
    // Preserve any tools/prompts/resources registered programmatically
    const preRegisteredTools = new Map(this.toolsMap);
    const preRegisteredPrompts = new Map(this.promptsMap);
    const preRegisteredResources = new Map(this.resourcesMap);

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

    // Load standalone apps (Mode A)
    const apps = await this.appLoader.loadApps();
    for (const app of apps) {
      try {
        app.validate();
        this.appsMap.set(app.name, app);

        for (const toolDef of app.tools) {
          const syntheticTool = this.createAppTool(app, toolDef);
          this.toolsMap.set(toolDef.name, syntheticTool);
        }

        const syntheticResource = this.createAppResource(app);
        this.resourcesMap.set(app.ui.resourceUri, syntheticResource);

        logger.debug(`Registered app: ${app.name} with ${app.tools.length} tool(s)`);
      } catch (error: any) {
        logger.error(`App validation failed for "${app.name}": ${error.message}`);
        throw new Error(`App validation failed for "${app.name}": ${error.message}`);
      }
    }

    // Register tool-attached app resources (Mode B)
    for (const tool of tools) {
      if ((tool as any).hasApp) {
        const appDef = (tool as any).appResourceDefinition;
        if (appDef && !this.resourcesMap.has(appDef.uri)) {
          const resource = this.createToolAppResource(tool as any);
          this.resourcesMap.set(appDef.uri, resource);
        }
      }
    }

    this._hasApps = this.appsMap.size > 0 || tools.some((t: any) => t.hasApp);

    // Cache app HTML content in production mode
    if (this._hasApps && !this._devMode) {
      for (const app of this.appsMap.values()) {
        try {
          const html = await app.getContent();
          warnContentSize(html, app.name);
          this.appContentCache.set(app.ui.resourceUri, html);
          logger.debug(
            `Cached app content: ${app.name} (${Buffer.byteLength(html)} bytes)`,
          );
        } catch (error: any) {
          logger.error(`Failed to load content for app "${app.name}": ${error.message}`);
          throw new Error(
            `Failed to load content for app "${app.name}": ${error.message}`,
          );
        }
      }
      for (const tool of tools) {
        if ((tool as any).hasApp) {
          const uri = (tool as any).appResourceDefinition?.uri;
          if (uri && !this.appContentCache.has(uri)) {
            try {
              const html = await (tool as any).readAppContent();
              this.appContentCache.set(uri, html);
            } catch (error: any) {
              logger.error(
                `Failed to load app content for tool "${tool.name}": ${error.message}`,
              );
              throw new Error(
                `Failed to load app content for tool "${tool.name}": ${error.message}`,
              );
            }
          }
        }
      }
    }

    // Merge back programmatically registered items (they take precedence)
    for (const [name, tool] of preRegisteredTools) {
      this.toolsMap.set(name, tool);
    }
    for (const [name, prompt] of preRegisteredPrompts) {
      this.promptsMap.set(name, prompt);
    }
    for (const [uri, resource] of preRegisteredResources) {
      this.resourcesMap.set(uri, resource);
    }

    await this.detectCapabilities();
    logger.info(`Capabilities detected: ${JSON.stringify(this.capabilities)}`);

    this._initialized = true;
  }

  // ── Programmatic registration ────────────────────────────────────────

  /**
   * Register a tool class programmatically. Must be called before
   * start() or the first handleRequest() call.
   */
  addTool(ToolClass: new () => ToolProtocol): void {
    if (this._initialized) {
      throw new Error('Cannot add tools after initialization. Call addTool() before start() or handleRequest().');
    }
    const tool = new ToolClass();
    if ('validate' in tool && typeof tool.validate === 'function') {
      (tool as any).validate();
    }
    this.toolsMap.set(tool.name, tool);
  }

  /**
   * Register a prompt class programmatically. Must be called before
   * start() or the first handleRequest() call.
   */
  addPrompt(PromptClass: new () => PromptProtocol): void {
    if (this._initialized) {
      throw new Error('Cannot add prompts after initialization. Call addPrompt() before start() or handleRequest().');
    }
    const prompt = new PromptClass();
    this.promptsMap.set(prompt.name, prompt);
  }

  /**
   * Register a resource class programmatically. Must be called before
   * start() or the first handleRequest() call.
   */
  addResource(ResourceClass: new () => ResourceProtocol): void {
    if (this._initialized) {
      throw new Error('Cannot add resources after initialization. Call addResource() before start() or handleRequest().');
    }
    const resource = new ResourceClass();
    this.resourcesMap.set(resource.uri, resource);
  }

  // ── Serverless request handling ──────────────────────────────────────

  /**
   * Handle a single Web Standard Request and return a Response.
   * Designed for serverless environments (Lambda, Cloudflare Workers, etc.)
   * where each request is independent and stateless.
   *
   * Creates a fresh transport and SDK server per request.
   * Tools, prompts, and resources are loaded once and cached.
   */
  async handleRequest(
    request: Request,
    options?: HandleRequestOptions,
  ): Promise<Response> {
    await this.ensureInitialized();

    const url = new URL(request.url);
    const authConfig = this._authConfig ?? this.transportConfigs[0]?.auth;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return this._createCorsPreflightResponse();
    }

    // OAuth metadata endpoint
    if (request.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
      return this._addCorsHeaders(this._handleOAuthMetadataRequest(authConfig));
    }

    // Authenticate
    const authOutcome = await authenticateWebRequest(
      request,
      authConfig,
      request.method === 'POST' ? 'message' : 'request',
      options?.sourceIp,
    );
    if ('response' in authOutcome) {
      return this._addCorsHeaders(authOutcome.response);
    }
    const authData = (authOutcome.result.data as Record<string, unknown>) ?? {};

    // Per-request stateless transport
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,      // JSON batch mode (no SSE)
    });

    // Per-request SDK Server with all handlers
    const sdkServer = this.createSDKServerForSession();

    // Inject server into tools for this request
    for (const tool of this.toolsMap.values()) {
      tool.injectServer(sdkServer);
    }

    // Connect (wires onmessage/onclose/onerror, calls transport.start() which is no-op)
    await sdkServer.connect(transport);

    let response: Response;
    try {
      response = await requestContext.run(authData, async () => {
        return transport.handleRequest(request);
      });
    } finally {
      try { await transport.close(); } catch { /* ignore */ }
      try { await sdkServer.close(); } catch { /* ignore */ }
    }

    return this._addCorsHeaders(response);
  }

  /**
   * Create an AWS Lambda handler function. The returned function can be
   * exported directly as a Lambda handler.
   *
   * @example
   * ```typescript
   * const server = new MCPServer({ name: 'my-mcp', version: '1.0.0' });
   * export const handler = server.createLambdaHandler();
   * ```
   */
  createLambdaHandler(
    config?: LambdaHandlerConfig,
  ): (event: LambdaEvent, context: LambdaContext) => Promise<LambdaResult> {
    return async (event: LambdaEvent, _context: LambdaContext): Promise<LambdaResult> => {
      try {
        const request = lambdaEventToRequest(event, config?.basePath);
        const sourceIp = getSourceIp(event);

        const response = await this.handleRequest(request, { sourceIp });

        const result = await responseToLambdaResult(response, event);

        // Apply CORS overrides if configured
        if (config?.cors !== false) {
          const cors = config?.cors ?? {};
          result.headers['access-control-allow-origin'] =
            cors.allowOrigin ?? result.headers['access-control-allow-origin'] ?? '*';
          result.headers['access-control-allow-methods'] =
            cors.allowMethods ?? result.headers['access-control-allow-methods'] ?? 'GET, POST, DELETE, OPTIONS';
          result.headers['access-control-allow-headers'] =
            cors.allowHeaders ?? result.headers['access-control-allow-headers'] ?? 'Content-Type, mcp-session-id, Accept, Authorization, X-API-Key';
        }

        return result;
      } catch (error: any) {
        logger.error(`Lambda handler error: ${error.message}\n${error.stack}`);

        return {
          statusCode: 500,
          headers: {
            'content-type': 'application/json',
            'access-control-allow-origin': '*',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          }),
          isBase64Encoded: false,
        };
      }
    };
  }

  private _createCorsPreflightResponse(): Response {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id, Accept, Authorization, X-API-Key',
        'Access-Control-Expose-Headers': 'mcp-session-id',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  private _addCorsHeaders(response: Response): Response {
    const newHeaders = new Headers(response.headers);
    if (!newHeaders.has('Access-Control-Allow-Origin')) {
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept, Authorization, X-API-Key');
      newHeaders.set('Access-Control-Expose-Headers', 'mcp-session-id');
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  private _handleOAuthMetadataRequest(authConfig?: AuthConfig): Response {
    const metadata = initializeOAuthMetadata(authConfig, 'serverless');
    if (metadata) {
      return new Response(metadata.toJSON(), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }
    return new Response('Not Found', { status: 404 });
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

      await this.ensureInitialized();

      const serverOptions: Record<string, unknown> = { capabilities: this.capabilities };
      if (this._hasApps) {
        serverOptions.extensions = { [MCP_APP_EXTENSION_ID]: {} };
      }

      // Create one binding per transport config
      for (const tc of this.transportConfigs) {
        const sdkServer = new Server(
          { name: this.serverName, version: this.serverVersion },
          serverOptions as any,
        );
        this.setupHandlers(sdkServer);
        const transport = this.createTransportFromConfig(tc);
        const label = this.makeBindingLabel(tc);

        // When a transport closes at runtime, remove its binding.
        // If all bindings are gone, shut down the server.
        transport.onclose = () => {
          logger.info(`Transport [${label}] closed.`);
          this.bindings = this.bindings.filter(b => b.transport !== transport);
          if (this.bindings.length === 0 && this.isRunning) {
            this.stop().catch((error) => {
              logger.error(`Shutdown error after last transport close: ${error}`);
              process.exit(1);
            });
          }
        };

        this.bindings.push({ config: tc, transport, sdkServer, label });
      }

      // Inject first binding's server into tools for progress/sampling
      if (this.bindings.length > 0) {
        for (const tool of this.toolsMap.values()) {
          tool.injectServer(this.bindings[0].sdkServer);
        }
      }

      logger.debug(
        `Created ${this.bindings.length} transport binding(s): ${this.bindings.map(b => b.label).join(', ')}`
      );

      // For SSE transports, set up per-session SDK Server instances for proper
      // session isolation. Each SSE connection gets its own SDK Server with all
      // handlers registered, connected to its own SDK SSEServerTransport.
      for (const b of this.bindings) {
        if (b.transport.type === 'sse') {
          const sseTransport = b.transport as SSEServerTransport;
          sseTransport.setServerFactory(() => this.createSDKServerForSession());
        }
        if (b.transport.type === 'http-stream') {
          // Only used in stateless mode (session.enabled: false), where each
          // request gets its own SDK Server.
          const httpTransport = b.transport as HttpStreamTransport;
          httpTransport.setServerFactory(() => this.createSDKServerForSession());
        }
      }

      // Connect all transports concurrently
      await Promise.all(
        this.bindings.map(async (b) => {
          logger.info(`Connecting transport [${b.label}] to SDK Server...`);
          await b.sdkServer.connect(b.transport);
        }),
      );

      const transportLabels = this.bindings.map(b => b.label).join(', ');
      logger.info(
        `Started ${this.serverName}@${this.serverVersion} on transport(s): ${transportLabels}`
      );

      const toolNames = Array.from(this.toolsMap.keys());
      logger.info(`Tools (${toolNames.length}): ${toolNames.join(', ') || 'None'}`);
      if (this.capabilities.prompts) {
        const promptNames = Array.from(this.promptsMap.keys());
        logger.info(
          `Prompts (${promptNames.length}): ${promptNames.join(', ') || 'None'}`
        );
      }
      if (this.capabilities.resources) {
        const resourceUris = Array.from(this.resourcesMap.keys());
        logger.info(
          `Resources (${resourceUris.length}): ${resourceUris.join(', ') || 'None'}`
        );
      }
      if (this._hasApps) {
        logger.info(
          `Apps (${this.appsMap.size}): ${Array.from(this.appsMap.keys()).join(', ') || 'None'}`
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

      const errors: Error[] = [];

      // Close all bindings concurrently
      await Promise.allSettled(
        this.bindings.map(async (b) => {
          try {
            logger.debug(`Closing transport [${b.label}]...`);
            await b.transport.close();
            logger.info(`Transport [${b.label}] closed.`);
          } catch (e: any) {
            errors.push(new Error(`Transport [${b.label}]: ${e.message}`));
            logger.error(`Error closing transport [${b.label}]: ${e.message}`);
          }
          try {
            logger.debug(`Closing SDK Server [${b.label}]...`);
            await b.sdkServer.close();
            logger.info(`SDK Server [${b.label}] closed.`);
          } catch (e: any) {
            errors.push(new Error(`SDK Server [${b.label}]: ${e.message}`));
            logger.error(`Error closing SDK Server [${b.label}]: ${e.message}`);
          }
        }),
      );
      this.bindings = [];

      this.isRunning = false;

      if (this.shutdownResolve) {
        this.shutdownResolve();
        logger.debug('Shutdown promise resolved.');
      } else {
        logger.warn('Shutdown resolve function not found.');
      }

      if (errors.length > 0) {
        logger.error('Errors occurred during server stop.');
        throw new Error(
          `Server stop failed: ${errors.map(e => e.message).join('; ')}`
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

  /**
   * Query the client for its filesystem root boundaries.
   * Returns an empty array if the client doesn't support roots.
   */
  public async listRoots(): Promise<Array<{ uri: string; name?: string }>> {
    if (!this.server) return [];
    try {
      const result = await this.server.listRoots();
      return result.roots ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Returns the cached roots list (updated automatically when the client
   * sends a roots/list_changed notification).
   */
  public get roots(): ReadonlyArray<{ uri: string; name?: string }> {
    return this._roots;
  }

  /**
   * Send a logging message to all connected clients via the MCP logging protocol.
   * Messages below the current log level threshold will be silently dropped.
   * In multi-transport mode, the message is broadcast to all bindings.
   */
  public async sendLog(level: MCPLogLevel, loggerName: string, data: unknown): Promise<void> {
    if (!this._loggingEnabled || this.bindings.length === 0) return;
    if (LOG_LEVEL_SEVERITY[level] < LOG_LEVEL_SEVERITY[this._logLevel]) return;

    await Promise.allSettled(
      this.bindings.map(async (b) => {
        try {
          await b.sdkServer.sendLoggingMessage({
            level,
            logger: loggerName,
            data,
          });
        } catch (error) {
          logger.debug(`Failed to send log message via [${b.label}]: ${error}`);
        }
      }),
    );
  }
}
