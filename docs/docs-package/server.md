# DocsServer Configuration

`DocsServer` is a convenience wrapper that ties together a `DocSource`, the pre-built documentation tools, and the MCP protocol. It handles server creation, tool registration, and transport setup.

## Basic Usage

```typescript
import { DocsServer, FumadocsRemoteSource } from "@mcpframework/docs";

const source = new FumadocsRemoteSource({
  baseUrl: "https://docs.myapi.com",
});

const server = new DocsServer({
  source,
  name: "my-api-docs",
  version: "1.0.0",
});

await server.start();
```

## Configuration

```typescript
interface DocsServerConfig {
  /** Documentation source to serve */
  source: DocSource;

  /** Server name shown to MCP clients */
  name: string;

  /** Server version */
  version: string;

  /** Transport configuration (default: stdio) */
  transport?: TransportConfig;

  /** Override default tools */
  tools?: {
    search_docs?: boolean;     // Default: true
    get_page?: boolean;        // Default: true
    list_sections?: boolean;   // Default: true
    custom?: MCPTool[];        // Additional custom tools
  };
}
```

## Disabling Default Tools

You can disable specific tools if they're not needed:

```typescript
const server = new DocsServer({
  source,
  name: "my-api-docs",
  version: "1.0.0",
  tools: {
    search_docs: true,
    get_page: true,
    list_sections: false,  // Disabled
  },
});
```

## Adding Custom Tools

You can add custom tools alongside the default documentation tools:

```typescript
import { MCPTool } from "mcp-framework";
import { z } from "zod";

const schema = z.object({
  endpoint: z.string().describe("API endpoint path"),
});

class GetSchemasTool extends MCPTool {
  name = "get_schemas";
  description = "Get request/response schemas for an API endpoint";
  schema = schema;

  async execute(input: z.infer<typeof schema>) {
    // Your implementation
    return "Schema details...";
  }
}

const server = new DocsServer({
  source,
  name: "my-api-docs",
  version: "1.0.0",
  tools: {
    custom: [new GetSchemasTool()],
  },
});
```

## Accessing the Source

The source is available via a public property for direct access:

```typescript
const server = new DocsServer({ source, name: "my-docs", version: "1.0.0" });

// Direct source access
const health = await server.source.healthCheck();
console.log("Source healthy:", health.ok);
```

## Lifecycle

```typescript
// Start the server (blocks until shutdown signal)
await server.start();

// Stop programmatically
await server.stop();
```

The server listens for `SIGINT` and `SIGTERM` signals and shuts down gracefully.

## Environment Variables

For environment-driven configuration (recommended for production):

```typescript
const source = new FumadocsRemoteSource({
  baseUrl: process.env.DOCS_BASE_URL || "https://docs.example.com",
  headers: process.env.DOCS_API_KEY
    ? { Authorization: `Bearer ${process.env.DOCS_API_KEY}` }
    : undefined,
});

const server = new DocsServer({
  source,
  name: process.env.DOCS_SERVER_NAME || "my-docs",
  version: process.env.npm_package_version || "1.0.0",
});
```
