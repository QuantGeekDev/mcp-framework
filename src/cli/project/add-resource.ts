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
import { McpError, ErrorCode, Resource, ResourceContents } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';

class ${className}Resource {
  name = "${resourceName}";
  description = "${className} resource description";
  uriTemplate = "${resourceName}://{path}";

  constructor(private basePath: string) {}

  async list(): Promise<Resource[]> {
    try {
      const resources: Resource[] = [];
      // Implement resource listing logic here
      // Example:
      resources.push({
        uri: "${resourceName}://example",
        name: "Example ${className} Resource",
        mimeType: "text/plain"
      });
      return resources;
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InternalError,
        \`Failed to list resources: \${error.message}\`
      );
    }
  }

  async read(uri: string): Promise<ResourceContents> {
    try {
      // Implement resource reading logic here
      // Example:
      // const content = await fs.readFile(path.join(this.basePath, uri), 'utf-8');
      return {
        uri,
        mimeType: "text/plain",
        text: "Resource content here"
      };
    } catch (error: any) {
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
Don't forget to:
1. Register your resource in src/index.ts:
   const ${resourceName} = new ${className}Resource(this.basePath);
   this.resources.set(${resourceName}.name, ${resourceName});

2. Import the resource in src/index.ts:
   import ${className}Resource from "./resources/${resourceName}/index.js";

3. Update the server capabilities to include resources:
   capabilities: {
     resources: {},
     ...
   }
    `);
  } catch (error) {
    console.error("Error creating resource:", error);
    process.exit(1);
  }
}
