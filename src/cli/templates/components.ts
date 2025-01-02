export function generateExampleTool(): string {
  return `import { z } from "zod";
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
}

export function generateExamplePrompt(): string {
  return `import { z } from "zod";
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
}

export function generateExampleResource(): string {
  return `import { z } from "zod";
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
}