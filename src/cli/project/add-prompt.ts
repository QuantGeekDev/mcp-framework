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
import { MCPPrompt, PromptArgumentSchema } from "mcp-framework";

// Define input type
interface ${className}Input {
  // Define your prompt's input parameters here
  query: string;
}

// Extend MCPPrompt with input type for type safety
class ${className}Prompt extends MCPPrompt<${className}Input> {
  name = "${promptName}";
  description = "${className} prompt description";

  // Schema is validated by base class
  protected schema: PromptArgumentSchema<${className}Input> = {
    query: {
      type: z.string(),  // Use z.string() directly
      description: "Query to process",
      required: true
    }
  };

  constructor(private basePath: string) {
    super();
    logger.debug(\`Initializing ${className}Prompt with base path: \${basePath}\`);
  }

  // Implementation with type-safe input
  protected async generateMessages(input: ${className}Input) {
    const { query } = input;
    
    try {
      logger.debug(\`Generating messages for ${className}Prompt with query: \${query}\`);

      // Return array of messages
      return [
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
      ];
    } catch (error: any) {
      logger.error(\`${className}Prompt message generation failed: \${error.message}\`);
      throw new McpError(
        ErrorCode.InternalError,
        \`Prompt failed: \${error.message}\`
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
1. Implement your message generation logic
2. Add any necessary input parameters to ${className}Input
3. Update the schema and description as needed
4. Customize the system message and response format

The prompt extends MCPPrompt which provides:
- Type-safe input handling
- Automatic schema validation
- Protocol compliance
- Error handling
    `);
  } catch (error) {
    console.error("Error creating prompt:", error);
    process.exit(1);
  }
}
