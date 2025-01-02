import { spawnSync } from "child_process";
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

    const resourceContent = `import { z } from "zod";
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

class ${className}Resource {
  name = "${resourceName}";
  description = "${className} resource description";
  uriTemplate = "${resourceName}://{path}";

  constructor(private basePath: string) {
    logger.debug(\`Initializing ${className}Resource with base path: \${basePath}\`);
  }

  async list(): Promise<Resource[]> {
    try {
      logger.debug('Listing ${className} resources');
      
      // Implement your resource listing logic here
      // Example:
      return [
        {
          uri: "${resourceName}://example",
          name: "Example ${className} Resource",
          mimeType: "text/plain",
          description: "An example resource"
        }
      ];
    } catch (error: any) {
      logger.error(\`Failed to list ${className} resources: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Failed to list resources: \${error.message}\`
      );
    }
  }

  async read(uri: string): Promise<ResourceContent> {
    try {
      logger.debug(\`Reading ${className} resource: \${uri}\`);
      
      // Implement your resource reading logic here
      // Example:
      // const filePath = path.join(this.basePath, uri.replace('${resourceName}://', ''));
      // const content = await fs.readFile(filePath, 'utf-8');
      
      return {
        uri,
        mimeType: "text/plain",
        text: "Resource content here"
      };
    } catch (error: any) {
      logger.error(\`Failed to read ${className} resource: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Failed to read resource: \${error.message}\`
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
1. Implement your resource listing logic in the list method
2. Implement your resource reading logic in the read method
3. Update the uriTemplate and description as needed
4. Add any additional resource-specific functionality
    `);
  } catch (error) {
    console.error("Error creating resource:", error);
    process.exit(1);
  }
}
