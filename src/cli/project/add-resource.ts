import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import prompts from "prompts";
import { validateMCPProject } from "../utils/validate-project.js";
import { toPascalCase } from "../utils/string-utils.js";

export async function addResource(name?: string) {
  await validateMCPProject();

  let resourceName: string;

  if (!name) {
    const response = await prompts([
      {
        type: "text",
        name: "name",
        message: "What is the name of your resource?",
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value)
            ? true
            : "Resource name can only contain lowercase letters, numbers, and hyphens",
      },
    ]);

    if (!response.name) {
      console.log("Resource creation cancelled");
      process.exit(1);
    }

    resourceName = response.name as string;
  } else {
    resourceName = name;
  }

  if (!resourceName) {
    throw new Error("Resource name is required");
  }

  const className = toPascalCase(resourceName);
  const resourceDir = join(process.cwd(), "src/resources", resourceName);

  try {
    console.log("Creating resource directory...");
    await mkdir(resourceDir, { recursive: true });

    const resourceContent = `import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from "../../utils/logger.js";
import { MCPResource } from "mcp-framework";

// Extend MCPResource for type safety and protocol compliance
class ${className}Resource extends MCPResource {
  name = "${resourceName}";
  description = "${className} resource description";
  uri = "${resourceName}://";  // Base URI for this resource
  private resourceDir: string;

  constructor(private basePath: string) {
    super();
    logger.debug(\`Initializing ${className}Resource with base path: \${basePath}\`);
    this.resourceDir = path.join(basePath, 'resources');
    this.initializeResourceDir();
  }

  private async initializeResourceDir() {
    try {
      await fs.mkdir(this.resourceDir, { recursive: true });
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

  async list() {
    try {
      logger.debug('Listing ${className} resources');
      const files = await fs.readdir(this.resourceDir);
      return files.map(file => ({
        uri: \`\${this.uri}\${file}\`,
        name: file,
        description: \`${className} resource file: \${file}\`,
        mimeType: this.getMimeType(file)
      }));
    } catch (error: any) {
      logger.error(\`Failed to list resources: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Failed to list resources: \${error.message}\`
      );
    }
  }

  async read() {
    try {
      logger.debug('Reading ${className} resources');
      const files = await fs.readdir(this.resourceDir);
      const contents = [];

      for (const file of files) {
        const filePath = path.join(this.resourceDir, file);
        const mimeType = this.getMimeType(file);
        const isText = this.isTextFile(mimeType);
        const uri = \`\${this.uri}\${file}\`;

        if (isText) {
          const content = await fs.readFile(filePath, 'utf-8');
          contents.push({
            uri,
            mimeType,
            text: content
          });
        } else {
          const content = await fs.readFile(filePath);
          contents.push({
            uri,
            mimeType,
            blob: content.toString('base64')
          });
        }
      }

      return contents;
    } catch (error: any) {
      logger.error(\`Failed to read resources: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Failed to read resources: \${error.message}\`
      );
    }
  }
}

export default ${className}Resource;`;

    await writeFile(join(resourceDir, "index.ts"), resourceContent);

    console.log(
      `Resource ${resourceName} created successfully at src/resources/${resourceName}/index.ts`
    );

    console.log(`
Resource will be automatically discovered and loaded by the server.
You can now:
1. Customize resource content handling
2. Add additional file types and MIME types
3. Update the URI pattern and description
4. Add any resource-specific functionality

The resource extends MCPResource which provides:
- Type-safe content handling
- Protocol compliance
- Automatic content type detection
- Error handling
    `);
  } catch (error) {
    console.error("Error creating resource:", error);
    process.exit(1);
  }
}
