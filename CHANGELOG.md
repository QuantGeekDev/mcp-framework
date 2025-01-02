# Changelog

## [Unreleased]

### Breaking Changes
- Removed dependency on custom MCP server implementation in favor of official SDK
- Changed project template to use @modelcontextprotocol/sdk instead of mcp-framework internals

### Added
- Added @modelcontextprotocol/sdk as a peer dependency
- Added improved error handling in project templates
- Added proper TypeScript type definitions (@types/node, @types/prompts)

### Changed
- Updated create project template to use official SDK patterns
- Updated example tool template to use simpler class structure
- Modified package.json template to include required SDK dependencies
- Changed build script to use standard tsc instead of custom mcp-build
- Updated TypeScript configuration for better ES module support

### Fixed
- Fixed issue where mcp create command fails without manual npm install
- Fixed missing peer dependencies in generated projects
- Fixed TypeScript compilation errors in generated code
- Improved project template stability by using official SDK patterns

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