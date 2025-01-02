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

interface ${className}Input {
  // Define your prompt's input parameters here
  param: string;
}

class ${className}Prompt {
  name = "${promptName}";
  description = "${className} prompt description";

  schema = {
    param: {
      type: z.string(),
      description: "Parameter description",
    }
  };

  constructor(private basePath: string) {}

  async execute(input: ${className}Input) {
    const { param } = input;
    
    try {
      // Implement your prompt logic here
      return {
        content: [
          {
            type: "text",
            text: \`${className} processed: \${param}\`
          }
        ]
      };
    } catch (error: any) {
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
Don't forget to:
1. Register your prompt in src/index.ts:
   const ${promptName} = new ${className}Prompt(this.basePath);
   this.prompts.set(${promptName}.name, ${promptName});

2. Import the prompt in src/index.ts:
   import ${className}Prompt from "./prompts/${promptName}/index.js";
    `);
  } catch (error) {
    console.error("Error creating prompt:", error);
    process.exit(1);
  }
}
