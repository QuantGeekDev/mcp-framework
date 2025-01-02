import { readFile } from "fs/promises";
import { join } from "path";

export async function validateMCPProject() {
  try {
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    const package_json = JSON.parse(packageJsonContent);

    if (!package_json.dependencies?.["@modelcontextprotocol/sdk"]) {
      throw new Error(
        "This directory is not an MCP project (@modelcontextprotocol/sdk not found in dependencies)"
      );
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Error: Invalid package.json");
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("Error: Must be run from an MCP project directory");
    }
    process.exit(1);
  }
}
