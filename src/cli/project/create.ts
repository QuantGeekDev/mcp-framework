import { spawnSync } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import prompts from "prompts";
import { generateReadme } from "../templates/readme.js";
import { toPascalCase } from "../utils/string-utils.js";

export async function createProject(name?: string) {
  let projectName: string;

  if (!name) {
    const response = await prompts([
      {
        type: "text",
        name: "projectName",
        message: "What is the name of your MCP server project?",
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value)
            ? true
            : "Project name can only contain lowercase letters, numbers, and hyphens",
      },
    ]);

    if (!response.projectName) {
      console.log("Project creation cancelled");
      process.exit(1);
    }

    projectName = response.projectName as string;
  } else {
    projectName = name;
  }

  if (!projectName) {
    throw new Error("Project name is required");
  }

  const className = toPascalCase(projectName);
  const projectDir = join(process.cwd(), projectName);
  const srcDir = join(projectDir, "src");
  const utilsDir = join(srcDir, "utils");
  const toolsDir = join(srcDir, "tools");
  const promptsDir = join(srcDir, "prompts");
  const resourcesDir = join(srcDir, "resources");
  const exampleToolDir = join(toolsDir, "example-tool");
  const examplePromptDir = join(promptsDir, "example-prompt");
  const exampleResourceDir = join(resourcesDir, "example-resource");
  const logsDir = join(projectDir, "logs"); // Add logs directory

  try {
    console.log("Creating project structure...");
    await mkdir(projectDir);
    await mkdir(srcDir);
    await mkdir(utilsDir);
    await mkdir(toolsDir);
    await mkdir(promptsDir);
    await mkdir(resourcesDir);
    await mkdir(exampleToolDir);
    await mkdir(examplePromptDir);
    await mkdir(exampleResourceDir);
    await mkdir(logsDir); // Create logs directory

    // Add .gitignore to handle logs
    const gitignore = `node_modules/
dist/
logs/*.log
`;
    await writeFile(join(projectDir, ".gitignore"), gitignore);

    const packageJson = {
      name: projectName,
      version: "0.0.1",
      description: `${projectName} MCP server`,
      type: "module",
      bin: {
        [projectName]: "./dist/index.js",
      },
      files: ["dist"],
      scripts: {
        build: "tsc",
        start: "node dist/index.js",
        dev: "tsc --watch"
      },
      dependencies: {
        "@modelcontextprotocol/sdk": "^0.6.1",
        "zod": "^3.22.4"
      },
      devDependencies: {
        "@types/node": "^20.11.24",
        "typescript": "^5.3.3"
      }
    };

    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ES2022",
        moduleResolution: "node",
        outDir: "./dist",
        rootDir: "./src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        declaration: true
      },
      include: ["src/**/*"],
      exclude: ["node_modules", "dist"]
    };

    const loggerTs = `import { createWriteStream, WriteStream } from "fs";
import { join } from "path";
import { mkdir } from "fs/promises";

export class Logger {
  private static instance: Logger;
  private logStream: WriteStream | null = null;
  private logFilePath: string;
  private logDir: string;

  private constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.logDir = join(process.cwd(), "logs");
    this.logFilePath = join(this.logDir, \`mcp-server-\${timestamp}.log\`);
    this.initializeLogDir();
  }

  private async initializeLogDir() {
    try {
      await mkdir(this.logDir, { recursive: true });
      this.logStream = createWriteStream(this.logFilePath, { flags: "a" });
      
      // Handle stream errors gracefully
      this.logStream.on('error', (err) => {
        console.error(\`Error writing to log file: \${err.message}\`);
        this.logStream = null; // Stop trying to write to file on error
      });
    } catch (err) {
      console.error(\`Failed to create logs directory: \${err}\`);
      // Continue without file logging
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: string, message: string): string {
    return \`[\${this.getTimestamp()}] [\${level}] \${message}\n\`;
  }

  private writeToStream(formattedMessage: string) {
    // Always write to stderr for CLI visibility
    process.stderr.write(formattedMessage);

    // Try to write to file if stream is available
    if (this.logStream) {
      try {
        this.logStream.write(formattedMessage);
      } catch (err) {
        console.error(\`Error writing to log file: \${err}\`);
        this.logStream = null; // Stop trying to write to file on error
      }
    }
  }

  public info(message: string): void {
    const formattedMessage = this.formatMessage("INFO", message);
    this.writeToStream(formattedMessage);
  }

  public error(message: string): void {
    const formattedMessage = this.formatMessage("ERROR", message);
    this.writeToStream(formattedMessage);
  }

  public warn(message: string): void {
    const formattedMessage = this.formatMessage("WARN", message);
    this.writeToStream(formattedMessage);
  }

  public debug(message: string): void {
    const formattedMessage = this.formatMessage("DEBUG", message);
    this.writeToStream(formattedMessage);
  }

  public close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  public getLogPath(): string | null {
    return this.logStream ? this.logFilePath : null;
  }
}

export const logger = Logger.getInstance();`;

    const componentLoaderTs = `import { join, dirname } from "path";
import { promises as fs } from "fs";
import { logger } from "./logger.js";

// Base interface for all components
interface BaseComponent {
  name: string;
}

export class ComponentLoader<T extends BaseComponent> {
  private readonly EXCLUDED_FILES = ["*.test.js", "*.spec.js"];
  private readonly componentDir: string;
  private readonly componentType: string;

  constructor(
    private basePath: string,
    componentType: string,
    private validateComponent: (component: any) => component is T
  ) {
    this.componentType = componentType;
    // Get the absolute path to the dist directory
    const distDir = join(dirname(process.argv[1]));
    this.componentDir = join(distDir, componentType);
    
    logger.debug(
      \`Initialized \${componentType} loader with directory: \${this.componentDir}\`
    );
  }

  async hasComponents(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.componentDir);
      if (!stats.isDirectory()) {
        logger.debug("Component path exists but is not a directory");
        return false;
      }

      const files = await fs.readdir(this.componentDir);
      const hasValidFiles = files.some((dir) => this.isComponentDirectory(dir));
      logger.debug(\`Component directory has valid directories: \${hasValidFiles}\`);
      return hasValidFiles;
    } catch (error) {
      logger.debug("No component directory found");
      return false;
    }
  }

  private isComponentDirectory(dir: string): boolean {
    return !dir.startsWith('.') && !this.EXCLUDED_FILES.includes(dir);
  }

  async loadComponents(): Promise<T[]> {
    try {
      logger.debug(\`Attempting to load components from: \${this.componentDir}\`);

      let stats;
      try {
        stats = await fs.stat(this.componentDir);
      } catch (error) {
        logger.debug("No component directory found");
        return [];
      }

      if (!stats.isDirectory()) {
        logger.error(\`Path is not a directory: \${this.componentDir}\`);
        return [];
      }

      // Get component directories (example-tool, my-tool, etc.)
      const componentDirs = await fs.readdir(this.componentDir);
      logger.debug(\`Found component directories: \${componentDirs.join(", ")}\`);

      const components: T[] = [];

      for (const dir of componentDirs) {
        if (!this.isComponentDirectory(dir)) {
          continue;
        }

        try {
          // Import the index.js file from each component directory
          const indexPath = join(this.componentDir, dir, 'index.js');
          logger.debug(\`Attempting to load component from: \${indexPath}\`);

          // Go up one level from utils/ then to the component
          const relativeImportPath = \`../\${this.componentType}/\${dir}/index.js\`;
          logger.debug(\`Using import path: \${relativeImportPath}\`);
          
          const { default: ComponentClass } = await import(relativeImportPath);

          if (!ComponentClass) {
            logger.warn(\`No default export found in \${indexPath}\`);
            continue;
          }

          // Pass the basePath to the component constructor
          const component = new ComponentClass(this.basePath);
          if (this.validateComponent(component)) {
            logger.debug(\`Successfully loaded component: \${component.name}\`);
            components.push(component);
          } else {
            logger.warn(\`Component validation failed for: \${dir}\`);
          }
        } catch (error) {
          logger.error(\`Error loading component \${dir}: \${error}\`);
        }
      }

      logger.debug(
        \`Successfully loaded \${components.length} components: \${components.map(c => c.name).join(', ')}\`
      );
      return components;
    } catch (error) {
      logger.error(\`Failed to load components: \${error}\`);
      return [];
    }
  }
}`;

    const indexTs = `#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import { logger } from "./utils/logger.js";
import { ComponentLoader } from "./utils/componentLoader.js";

// Utility to expand home directory
function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Component validation types
interface Tool {
  name: string;
  description: string;
  schema: any;
  execute(input: any): Promise<any>;
}

interface Prompt {
  name: string;
  description: string;
  schema: any;
  execute(input: any): Promise<any>;
}

interface Resource {
  name: string;
  description: string;
  list(): Promise<any[]>;
  read(uri: string): Promise<any>;
}

class ${className}Server {
  private server: Server;
  private tools: Map<string, Tool> = new Map();
  private prompts: Map<string, Prompt> = new Map();
  private resources: Map<string, Resource> = new Map();

  constructor(private basePath: string) {
    // Validate and set up base path
    const expandedPath = expandHome(basePath);
    this.basePath = path.resolve(expandedPath);

    logger.info(\`Initializing server with base path: \${this.basePath}\`);

    // Initialize server
    this.server = new Server(
      {
        name: "${projectName}",
        version: "0.0.1",
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {}
        }
      }
    );

    // Set up handlers
    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => {
      logger.error(\`[MCP Error] \${error}\`);
    };

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
    });

    process.on('uncaughtException', async (error) => {
      logger.error(\`[Uncaught Exception] \${error}\`);
      await this.stop();
      process.exit(1);
    });
  }

  private async loadComponents() {
    // Initialize loaders
    const toolLoader = new ComponentLoader<Tool>(
      this.basePath,
      "tools",
      (component): component is Tool =>
        Boolean(
          component &&
          typeof component.name === "string" &&
          typeof component.description === "string" &&
          component.schema &&
          typeof component.execute === "function"
        )
    );

    const promptLoader = new ComponentLoader<Prompt>(
      this.basePath,
      "prompts",
      (component): component is Prompt =>
        Boolean(
          component &&
          typeof component.name === "string" &&
          typeof component.description === "string" &&
          component.schema &&
          typeof component.execute === "function"
        )
    );

    const resourceLoader = new ComponentLoader<Resource>(
      this.basePath,
      "resources",
      (component): component is Resource =>
        Boolean(
          component &&
          typeof component.name === "string" &&
          typeof component.description === "string" &&
          typeof component.list === "function" &&
          typeof component.read === "function"
        )
    );

    // Load components
    const tools = await toolLoader.loadComponents();
    this.tools = new Map(tools.map(tool => [tool.name, tool]));
    logger.info(\`Loaded tools: \${Array.from(this.tools.keys()).join(", ")}\`);

    const prompts = await promptLoader.loadComponents();
    this.prompts = new Map(prompts.map(prompt => [prompt.name, prompt]));
    logger.info(\`Loaded prompts: \${Array.from(this.prompts.keys()).join(", ")}\`);

    const resources = await resourceLoader.loadComponents();
    this.resources = new Map(resources.map(resource => [resource.name, resource]));
    logger.info(\`Loaded resources: \${Array.from(this.resources.keys()).join(", ")}\`);
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(this.tools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.schema
      }))
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = this.tools.get(name);
      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, \`Unknown tool: \${name}\`);
      }

      try {
        return await tool.execute(args);
      } catch (error: any) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          \`Tool execution failed: \${error.message}\`
        );
      }
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: Array.from(this.prompts.values()).map(prompt => ({
        name: prompt.name,
        description: prompt.description,
        inputSchema: prompt.schema
      }))
    }));

    // Handle prompt requests
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const prompt = this.prompts.get(name);
      if (!prompt) {
        throw new McpError(ErrorCode.MethodNotFound, \`Unknown prompt: \${name}\`);
      }

      try {
        return await prompt.execute(args);
      } catch (error: any) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          \`Prompt execution failed: \${error.message}\`
        );
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const allResources = [];
      for (const resource of this.resources.values()) {
        const resources = await resource.list();
        allResources.push(...resources);
      }
      return { resources: allResources };
    });

    // Handle resource requests
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params?.uri;
      if (!uri || typeof uri !== 'string') {
        throw new McpError(ErrorCode.InvalidParams, "Missing or invalid URI parameter");
      }

      // Find the resource handler based on URI scheme
      const scheme = uri.split('://')[0];
      const resource = this.resources.get(scheme);
      if (!resource) {
        throw new McpError(ErrorCode.InvalidParams, \`Unsupported resource type: \${scheme}\`);
      }

      try {
        const content = await resource.read(uri);
        return { contents: [content] };
      } catch (error: any) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          \`Resource read failed: \${error.message}\`
        );
      }
    });
  }

  async start() {
    try {
      // Load all components
      await this.loadComponents();

      // Connect transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info("${projectName} MCP Server running on stdio");
    } catch (error) {
      logger.error(\`Failed to start server: \${error}\`);
      throw error;
    }
  }

  async stop() {
    await this.server.close();
    logger.info("${projectName} MCP Server stopped");
  }
}

// Start server
const basePath = process.argv[2];
if (!basePath) {
  logger.error("Please provide the base path as an argument");
  process.exit(1);
}

const server = new ${className}Server(basePath);
server.start().catch(error => {
  logger.error(\`Failed to start server: \${error}\`);
  process.exit(1);
});`;

    const exampleToolTs = `import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../../utils/logger.js";

interface ExampleInput {
  message: string;
}

class ExampleTool {
  name = "example_tool";
  description = "An example tool that processes messages";

  schema = {
    message: {
      type: z.string(),
      description: "Message to process",
    }
  };

  constructor(private basePath: string) {
    logger.debug(\`Initializing ExampleTool with base path: \${basePath}\`);
  }

  async execute(input: ExampleInput) {
    const { message } = input;
    
    try {
      logger.debug(\`Processing message: \${message}\`);
      return {
        content: [
          {
            type: "text",
            text: \`Processed: \${message}\`
          }
        ]
      };
    } catch (error: any) {
      logger.error(\`ExampleTool execution failed: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Tool execution failed: \${error.message}\`
      );
    }
  }
}

export default ExampleTool;`;

    const examplePromptTs = `import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../../utils/logger.js";

interface ExamplePromptInput {
  query: string;
}

class ExamplePrompt {
  name = "example_prompt";
  description = "An example prompt that generates responses";

  schema = {
    query: {
      type: z.string(),
      description: "Query to process",
    }
  };

  constructor(private basePath: string) {
    logger.debug(\`Initializing ExamplePrompt with base path: \${basePath}\`);
  }

  async execute(input: ExamplePromptInput) {
    const { query } = input;
    
    try {
      logger.debug(\`Processing query: \${query}\`);
      return {
        description: "Example prompt response",
        messages: [
          {
            role: "system",
            content: {
              type: "text",
              text: "You are a helpful assistant."
            }
          },
          {
            role: "user",
            content: {
              type: "text",
              text: query
            }
          }
        ]
      };
    } catch (error: any) {
      logger.error(\`ExamplePrompt execution failed: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Prompt execution failed: \${error.message}\`
      );
    }
  }
}

export default ExamplePrompt;`;

    const exampleResourceTs = `import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from "../../utils/logger.js";

// Resource types from MCP SDK
interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

class ExampleResource {
  name = "example";
  description = "An example resource provider";
  uriTemplate = "example://{path}";
  private resourceDir: string;

  constructor(private basePath: string) {
    logger.debug(\`Initializing ExampleResource with base path: \${basePath}\`);
    // Create a resources directory inside the base path
    this.resourceDir = path.join(basePath, 'resources');
    this.initializeResourceDir();
  }

  private async initializeResourceDir() {
    try {
      // Create resources directory if it doesn't exist
      await fs.mkdir(this.resourceDir, { recursive: true });
      
      // Create a sample file if no files exist
      const files = await fs.readdir(this.resourceDir);
      if (files.length === 0) {
        const sampleContent = "This is a sample resource file.\\nYou can add more files to the resources directory.";
        await fs.writeFile(path.join(this.resourceDir, 'sample.txt'), sampleContent);
      }
    } catch (error) {
      logger.error(\`Failed to initialize resource directory: \${error}\`);
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.md': 'text/markdown',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private isTextFile(mimeType: string): boolean {
    return mimeType.startsWith('text/') || 
           mimeType === 'application/json' ||
           mimeType === 'application/javascript' ||
           mimeType === 'application/typescript';
  }

  async list(): Promise<Resource[]> {
    try {
      logger.debug('Listing example resources');
      
      const files = await fs.readdir(this.resourceDir);
      const resources: Resource[] = [];

      for (const file of files) {
        const stats = await fs.stat(path.join(this.resourceDir, file));
        if (stats.isFile()) {
          const mimeType = this.getMimeType(file);
          resources.push({
            uri: \`example://\${file}\`,
            name: file,
            description: \`\${stats.size} bytes, modified \${stats.mtime.toISOString()}\`,
            mimeType
          });
        }
      }

      logger.debug(\`Found \${resources.length} resources\`);
      return resources;
    } catch (error: any) {
      logger.error(\`Failed to list example resources: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Failed to list resources: \${error.message}\`
      );
    }
  }

  async read(uri: string): Promise<ResourceContent> {
    try {
      logger.debug(\`Reading example resource: \${uri}\`);
      
      // Extract filename from URI
      const filename = uri.replace('example://', '');
      const filePath = path.join(this.resourceDir, filename);
      
      // Check if file exists
      await fs.access(filePath);
      
      const mimeType = this.getMimeType(filename);
      const isText = this.isTextFile(mimeType);

      if (isText) {
        // Read as text
        const content = await fs.readFile(filePath, 'utf-8');
        return {
          uri,
          mimeType,
          text: content
        };
      } else {
        // Read as binary
        const content = await fs.readFile(filePath);
        return {
          uri,
          mimeType,
          blob: content.toString('base64')
        };
      }
    } catch (error: any) {
      logger.error(\`Failed to read example resource: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Failed to read resource: \${error.message}\`
      );
    }
  }
}

export default ExampleResource;`;

    console.log("Creating project files...");
    await Promise.all([
      writeFile(
        join(projectDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      ),
      writeFile(
        join(projectDir, "tsconfig.json"),
        JSON.stringify(tsconfig, null, 2)
      ),
      writeFile(join(projectDir, "README.md"), generateReadme(projectName)),
      writeFile(join(srcDir, "index.ts"), indexTs),
      writeFile(join(utilsDir, "logger.ts"), loggerTs),
      writeFile(join(utilsDir, "componentLoader.ts"), componentLoaderTs),
      writeFile(join(exampleToolDir, "index.ts"), exampleToolTs),
      writeFile(join(examplePromptDir, "index.ts"), examplePromptTs),
      writeFile(join(exampleResourceDir, "index.ts"), exampleResourceTs),
    ]);

    console.log("Installing dependencies...");
    const npmInstall = spawnSync("npm", ["install"], {
      cwd: projectDir,
      stdio: "inherit",
      shell: true,
    });

    if (npmInstall.status !== 0) {
      throw new Error("Failed to install dependencies");
    }

    console.log("Building project...");
    const npmBuild = spawnSync("npm", ["run", "build"], {
      cwd: projectDir,
      stdio: "inherit",
      shell: true,
    });

    if (npmBuild.status !== 0) {
      throw new Error("Failed to build project");
    }

    console.log(`
Project ${projectName} created and built successfully!

You can now:
1. cd ${projectName}
2. Add more tools using:
   mcp add tool <name>
3. Add more prompts using:
   mcp add prompt <name>
4. Add more resources using:
   mcp add resource <name>

Components will be automatically discovered and loaded!
    `);
  } catch (error) {
    console.error("Error creating project:", error);
    process.exit(1);
  }
}
