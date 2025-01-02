import { spawnSync } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import prompts from "prompts";
import { validateMCPProject } from "../utils/validate-project.js";
import { toPascalCase } from "../utils/string-utils.js";

export async function addTool(name?: string) {
  await validateMCPProject();

  let toolName: string;

  if (!name) {
    const response = await prompts([
      {
        type: "text",
        name: "name",
        message: "What is the name of your tool?",
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value)
            ? true
            : "Tool name can only contain lowercase letters, numbers, and hyphens",
      },
    ]);

    if (!response.name) {
      console.log("Tool creation cancelled");
      process.exit(1);
    }

    toolName = response.name as string;
  } else {
    toolName = name;
  }

  if (!toolName) {
    throw new Error("Tool name is required");
  }

  const className = toPascalCase(toolName);
  const toolDir = join(process.cwd(), "src/tools", toolName);

  try {
    console.log("Creating tool directory...");
    await mkdir(toolDir, { recursive: true });

    const toolContent = `import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../../utils/logger.js";

interface ${className}Input {
  // Define your tool's input parameters here
  param: string;
}

class ${className}Tool {
  name = "${toolName}";
  description = "${className} tool description";

  schema = {
    param: {
      type: z.string(),
      description: "Parameter description",
    }
  };

  constructor(private basePath: string) {
    logger.debug(\`Initializing ${className}Tool with base path: \${basePath}\`);
  }

  async execute(input: ${className}Input) {
    const { param } = input;
    
    try {
      logger.debug(\`Executing ${className}Tool with param: \${param}\`);
      
      // Implement your tool logic here
      return {
        content: [
          {
            type: "text",
            text: \`${className} processed: \${param}\`
          }
        ]
      };
    } catch (error: any) {
      logger.error(\`${className}Tool execution failed: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Tool execution failed: \${error.message}\`
      );
    }
  }
}

export default ${className}Tool;`;

    await writeFile(join(toolDir, "index.ts"), toolContent);

    console.log(
      `Tool ${toolName} created successfully at src/tools/${toolName}/index.ts`
    );

    console.log(`
Tool will be automatically discovered and loaded by the server.
You can now:
1. Implement your tool logic in the execute method
2. Add any necessary input parameters to ${className}Input
3. Update the schema and description as needed
    `);
  } catch (error) {
    console.error("Error creating tool:", error);
    process.exit(1);
  }
}
