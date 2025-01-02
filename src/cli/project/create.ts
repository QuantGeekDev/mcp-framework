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
  const toolsDir = join(srcDir, "tools");
  const promptsDir = join(srcDir, "prompts");
  const resourcesDir = join(srcDir, "resources");
  const exampleToolDir = join(toolsDir, "example-tool");
  const examplePromptDir = join(promptsDir, "example-prompt");
  const exampleResourceDir = join(resourcesDir, "example-resource");

  try {
    console.log("Creating project structure...");
    await mkdir(projectDir);
    await mkdir(srcDir);
    await mkdir(toolsDir);
    await mkdir(promptsDir);
    await mkdir(resourcesDir);
    await mkdir(exampleToolDir);
    await mkdir(examplePromptDir);
    await mkdir(exampleResourceDir);

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

// Import components
import ExampleTool from "./tools/example-tool/index.js";
import ExamplePrompt from "./prompts/example-prompt/index.js";
import ExampleResource from "./resources/example-resource/index.js";

// Utility to expand home directory
function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

class ${className}Server {
  private server: Server;
  private tools: Map<string, any> = new Map();
  private prompts: Map<string, any> = new Map();
  private resources: Map<string, any> = new Map();

  constructor(private basePath: string) {
    // Validate and set up base path
    const expandedPath = expandHome(basePath);
    this.basePath = path.resolve(expandedPath);

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

    // Register components
    this.registerTools();
    this.registerPrompts();
    this.registerResources();

    // Set up handlers
    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
    });

    process.on('uncaughtException', async (error) => {
      console.error("[Uncaught Exception]", error);
      await this.stop();
      process.exit(1);
    });
  }

  private registerTools(): void {
    // Initialize and register tools
    const exampleTool = new ExampleTool(this.basePath);
    this.tools.set(exampleTool.name, exampleTool);
  }

  private registerPrompts(): void {
    // Initialize and register prompts
    const examplePrompt = new ExamplePrompt(this.basePath);
    this.prompts.set(examplePrompt.name, examplePrompt);
  }

  private registerResources(): void {
    // Initialize and register resources
    const exampleResource = new ExampleResource(this.basePath);
    this.resources.set(exampleResource.name, exampleResource);
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
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("${projectName} MCP Server running on stdio");
  }

  async stop() {
    await this.server.close();
    console.error("${projectName} MCP Server stopped");
  }
}

// Start server
const basePath = process.argv[2];
if (!basePath) {
  console.error("Please provide the base path as an argument");
  process.exit(1);
}

const server = new ${className}Server(basePath);
server.start().catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});`;

    const exampleToolTs = `import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

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

  constructor(private basePath: string) {}

  async execute(input: ExampleInput) {
    const { message } = input;
    
    return {
      content: [
        {
          type: "text",
          text: \`Processed: \${message}\`
        }
      ]
    };
  }
}

export default ExampleTool;`;

    const examplePromptTs = `import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

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

  constructor(private basePath: string) {}

  async execute(input: ExamplePromptInput) {
    const { query } = input;
    
    return {
      content: [
        {
          type: "text",
          text: \`Response to: \${query}\`
        }
      ]
    };
  }
}

export default ExamplePrompt;`;

    const exampleResourceTs = `import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';

class ExampleResource {
  name = "example";
  description = "An example resource provider";
  uriTemplate = "example://{path}";

  constructor(private basePath: string) {}

  async list() {
    try {
      return [
        {
          uri: "example://test.txt",
          name: "Example Resource",
          mimeType: "text/plain"
        }
      ];
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        \`Failed to list resources: \${error.message}\`
      );
    }
  }

  async read(uri: string) {
    try {
      return {
        uri,
        mimeType: "text/plain",
        text: "This is an example resource."
      };
    } catch (error: any) {
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
    `);
  } catch (error) {
    console.error("Error creating project:", error);
    process.exit(1);
  }
}
