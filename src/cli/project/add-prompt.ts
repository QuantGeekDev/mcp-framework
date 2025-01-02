import { spawnSync } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import prompts from "prompts";
import { validateMCPProject } from "../utils/validate-project.js";
import { toPascalCase } from "../utils/string-utils.js";

export async function addPrompt(name?: string) {
  await validateMCPProject();

  let promptName: string;

  if (!name) {
    const response = await prompts([
      {
        type: "text",
        name: "name",
        message: "What is the name of your prompt?",
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value)
            ? true
            : "Prompt name can only contain lowercase letters, numbers, and hyphens",
      },
    ]);

    if (!response.name) {
      console.log("Prompt creation cancelled");
      process.exit(1);
    }

    promptName = response.name as string;
  } else {
    promptName = name;
  }

  if (!promptName) {
    throw new Error("Prompt name is required");
  }

  const className = toPascalCase(promptName);
  const promptDir = join(process.cwd(), "src/prompts", promptName);

  try {
    console.log("Creating prompt directory...");
    await mkdir(promptDir, { recursive: true });

    const promptContent = `import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../../utils/logger.js";

interface ${className}Input {
  // Define your prompt's input parameters here
  query: string;
}

class ${className}Prompt {
  name = "${promptName}";
  description = "${className} prompt description";

  schema = {
    query: {
      type: z.string(),
      description: "Query to process",
    }
  };

  constructor(private basePath: string) {
    logger.debug(\`Initializing ${className}Prompt with base path: \${basePath}\`);
  }

  async execute(input: ${className}Input) {
    const { query } = input;
    
    try {
      logger.debug(\`Executing ${className}Prompt with query: \${query}\`);

      // Implement your prompt logic here
      return {
        description: "${className} prompt response",
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
      logger.error(\`${className}Prompt execution failed: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Prompt execution failed: \${error.message}\`
      );
    }
  }
}

export default ${className}Prompt;`;

    await writeFile(join(promptDir, "index.ts"), promptContent);

    console.log(
      `Prompt ${promptName} created successfully at src/prompts/${promptName}/index.ts`
    );

    console.log(`
Prompt will be automatically discovered and loaded by the server.
You can now:
1. Implement your prompt logic in the execute method
2. Add any necessary input parameters to ${className}Input
3. Update the schema and description as needed
4. Customize the system message and response format
    `);
  } catch (error) {
    console.error("Error creating prompt:", error);
    process.exit(1);
  }
}
