# Changelog

## [Unreleased]

### Breaking Changes
- Removed dependency on custom MCP server implementation in favor of official SDK
- Changed project template to use @modelcontextprotocol/sdk instead of mcp-framework internals
- Moved component loaders to optional utilities
- Moved base classes to optional helpers

### Added
- Added @modelcontextprotocol/sdk as a peer dependency
- Added improved error handling in project templates
- Added proper TypeScript type definitions (@types/node, @types/prompts)
- Added comprehensive prompt support in project templates with proper schema and execution
- Added resource type safety with Resource and ResourceContents interfaces
- Added detailed post-creation instructions for tools, prompts, and resources
- Added proper validation for MCP project structure
- Added proper capabilities declaration for tools, prompts, and resources
- Added optional utilities:
  - Logger system for detailed server logging
  - Component auto-discovery and validation
  - Base classes and type definitions for easier implementation

### Changed
- Updated create project template to use official SDK patterns
- Updated example tool template to use simpler class structure
- Modified package.json template to include required SDK dependencies
- Changed build script to use standard tsc instead of custom mcp-build
- Updated TypeScript configuration for better ES module support
- Improved project validation with specific error messages
- Enhanced component creation with proper TypeScript interfaces
- Improved error handling in tool, prompt, and resource implementations
- Reorganized framework structure:
  - Moved MCPServer to official SDK implementation
  - Relocated component loaders to optional utilities
  - Moved base classes to helper utilities

### Fixed
- Fixed issue where mcp create command fails without manual npm install
- Fixed missing peer dependencies in generated projects
- Fixed TypeScript compilation errors in generated code
- Improved project template stability by using official SDK patterns
- Fixed resource handling to properly use Resource and ResourceContents types
- Fixed prompt template to follow MCP protocol specifications

### Removed
- Removed git initialization from project creation (non-essential)
- Removed custom MCPServer class usage from templates
- Removed mcp-build script dependency

### Migration Guide
For existing projects created with older versions:

1. Update dependencies:
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.6.1"
  }
}
```

2. Update your server implementation:
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
```

3. Update your tool implementations to use the simpler class structure:
```typescript
class ExampleTool {
  name = "example_tool";
  schema = {
    // ... your schema
  };
  async execute(input) {
    // ... your implementation
  }
}
```

4. Update your prompt implementations to follow the MCP protocol:
```typescript
class ExamplePrompt {
  name = "example_prompt";
  schema = {
    // ... your schema
  };
  async execute(input) {
    return {
      description: "Prompt description",
      messages: [
        {
          role: "system",
          content: { type: "text", text: "..." }
        }
      ]
    };
  }
}
```

5. Update your resource implementations to use proper types:
```typescript
class ExampleResource {
  name = "example";
  uriTemplate = "example://{path}";
  async list(): Promise<Resource[]> {
    // ... your implementation
  }
  async read(uri: string): Promise<ResourceContents> {
    // ... your implementation
  }
}
```

6. Optional: Use framework utilities
```typescript
// Logger
import { logger } from "@mcp-framework/utils/logger";
logger.info("Server starting...");

// Component auto-discovery
import { ToolLoader } from "@mcp-framework/utils/loaders";
const toolLoader = new ToolLoader(basePath);
const tools = await toolLoader.loadTools();

// Base classes
import { MCPTool, MCPResource } from "@mcp-framework/utils/base";
class MyTool extends MCPTool { ... }