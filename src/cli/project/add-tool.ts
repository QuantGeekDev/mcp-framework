import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import prompts from "prompts";
import { validateMCPProject } from "../utils/validate-project.js";
import { toPascalCase } from "../utils/string-utils.js";
import {
  generateReactHtmlShell,
  generateReactApp,
  generateReactStyles,
  generateViteConfig,
  generateTsconfigApp,
  getReactInstallInstructions,
} from "../templates/react-app.js";

export async function addTool(name?: string, options?: { react?: boolean }) {
  await validateMCPProject();

  let toolName = name;
  if (!toolName) {
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

    toolName = response.name;
  }

  if (!toolName) {
    throw new Error("Tool name is required");
  }

  const useReact = options?.react ?? false;
  const className = toPascalCase(toolName);
  const fileName = `${className}Tool.ts`;
  const toolsDir = join(process.cwd(), "src/tools");

  try {
    await mkdir(toolsDir, { recursive: true });

    if (useReact) {
      // Generate tool with app property (Mode B) + React view
      const viewsDir = join(process.cwd(), "src/app-views", toolName);
      await mkdir(viewsDir, { recursive: true });

      await writeFile(join(toolsDir, fileName), generateReactToolContent(toolName, className));
      await writeFile(join(viewsDir, "index.html"), generateReactHtmlShell(toolName));
      await writeFile(join(viewsDir, "App.tsx"), generateReactApp(toolName, className));
      await writeFile(join(viewsDir, "styles.css"), generateReactStyles());
      await writeFile(join(viewsDir, "vite.config.ts"), generateViteConfig());
      await writeFile(join(viewsDir, "tsconfig.json"), generateTsconfigApp());

      console.log(
        `React tool ${toolName} created successfully with interactive UI:`
      );
      console.log(`  - Tool class:   src/tools/${fileName}`);
      console.log(`  - React entry:  src/app-views/${toolName}/App.tsx`);
      console.log(`  - Styles:       src/app-views/${toolName}/styles.css`);
      console.log(`  - Vite config:  src/app-views/${toolName}/vite.config.ts`);
      console.log(getReactInstallInstructions().replace(/<name>/g, toolName));
    } else {
      await writeFile(join(toolsDir, fileName), generateToolContent(toolName, className));
      console.log(
        `Tool ${toolName} created successfully at src/tools/${fileName}`
      );
    }
  } catch (error) {
    console.error("Error creating tool:", error);
    process.exit(1);
  }
}

// ── React Tool (Mode B with app property) ─────────────────────────────────────

function generateReactToolContent(toolName: string, className: string): string {
  return `import { MCPTool, MCPInput } from "mcp-framework";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const schema = z.object({
  message: z.string().describe("Message to process"),
});

class ${className}Tool extends MCPTool {
  name = "${toolName}";
  description = "${className} tool with interactive UI";
  schema = schema;

  // Attach a React-based MCP App UI to this tool
  app = {
    resourceUri: "ui://${toolName}/view",
    resourceName: "${className} View",
    content: () =>
      readFileSync(
        join(__dirname, "../../app-views/${toolName}/dist/index.html"),
        "utf-8"
      ),
  };

  async execute(input: MCPInput<this>) {
    // This return value is the text fallback for non-UI hosts
    return \`Processed: \${input.message}\`;
  }
}

export default ${className}Tool;
`;
}

// ── Vanilla Tool (unchanged) ──────────────────────────────────────────────────

function generateToolContent(toolName: string, className: string): string {
  return `import { MCPTool, MCPInput } from "mcp-framework";
import { z } from "zod";

const schema = z.object({
  message: z.string().describe("Message to process"),
});

class ${className}Tool extends MCPTool {
  name = "${toolName}";
  description = "${className} tool description";
  schema = schema;

  async execute(input: MCPInput<this>) {
    return \`Processed: \${input.message}\`;
  }
}

export default ${className}Tool;`;
}
