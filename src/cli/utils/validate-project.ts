import { access, readFile } from "fs/promises";
import { join } from "path";

export async function validateMCPProject() {
  try {
    const packageJsonPath = join(process.cwd(), "package.json");
    await access(packageJsonPath);

    const package_json = JSON.parse(await readFile(packageJsonPath, "utf-8"));

    if (!package_json.dependencies?.["mcp-framework"]) {
      throw new Error(
        "This directory is not an MCP project (mcp-framework not found in dependencies)"
      );
    }
  } catch (error) {
    console.error("Error: Must be run from an MCP project directory");
    process.exit(1);
  }
}
