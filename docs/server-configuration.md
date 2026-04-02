# Server Configuration

## Basic Setup

```typescript
import { MCPServer } from "mcp-framework";

const server = new MCPServer({
  name: "my-mcp-server",
  version: "1.0.0",
  basePath: "./dist",
  transport: {
    type: "http-stream",
    options: {
      // Transport-specific options
    }
  }
});
```

## Server Identity

The server name and version identify your MCP server to clients:

```typescript
const server = new MCPServer({
  name: "my-mcp-server",     // Default: package.json name or "unnamed-mcp-server"
  version: "1.0.0"           // Default: package.json version or "0.0.0"
});
```

## Base Path

Specifies the directory where tools, prompts, and resources are located:

```typescript
const server = new MCPServer({
  basePath: "./dist"  // Default: join(process.cwd(), 'dist')
});
```

The framework looks for:
- `<basePath>/tools/` - Tool implementations
- `<basePath>/prompts/` - Prompt implementations
- `<basePath>/resources/` - Resource implementations

## Transport Configuration

See [Transports](./transports.md) for detailed transport documentation.

```typescript
const server = new MCPServer({
  transport: {
    type: "http-stream",  // "stdio", "http-stream", or "sse"
    options: {
      port: 8080,
      endpoint: "/mcp",
      cors: {
        allowOrigin: "*",
        allowMethods: "GET, POST, OPTIONS",
        allowHeaders: "Content-Type, Authorization, x-api-key",
        exposeHeaders: "Content-Type, Authorization, x-api-key",
        maxAge: "86400"
      },
      auth: {
        // See Authentication docs
      },
      health: {
        path: "/health",     // Default path (customizable)
        // response: { ok: true }  // Default response (customizable)
      }
    }
  }
});
```

## Capabilities Detection

The server automatically detects enabled features based on your project structure:
- **Tools** - Always enabled
- **Prompts** - Enabled when prompt files are found
- **Resources** - Enabled when resource files are found

## Lifecycle Management

### Starting the Server

```typescript
await server.start();
```

On startup, the server:
1. Loads tools, prompts, and resources from their directories
2. Detects capabilities
3. Initializes the transport layer
4. Begins accepting connections

### Stopping the Server

```typescript
await server.stop();
```

On shutdown, the server:
1. Closes active connections
2. Runs cleanup handlers
3. Performs graceful exit

### Handling Signals

```typescript
process.on('SIGINT', async () => {
  await server.stop();
});
```

## Logging

Built-in logger supporting multiple levels:

```typescript
import { logger } from "mcp-framework";

logger.debug("Debug message");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message");
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_ENABLE_FILE_LOGGING` | Enable file logging | `false` |
| `MCP_LOG_DIRECTORY` | Log directory | `"logs"` |
| `MCP_DEBUG_CONSOLE` | Show debug messages in console | `false` |

## Comprehensive Example

```typescript
import { MCPServer, APIKeyAuthProvider } from "mcp-framework";

const server = new MCPServer({
  name: "my-mcp-server",
  version: "1.0.0",
  basePath: "./dist",
  transport: {
    type: "sse",
    options: {
      port: 8080,
      endpoint: "/sse",
      messageEndpoint: "/messages",
      maxMessageSize: "4mb",
      headers: {
        "X-Custom-Header": "value"
      },
      cors: {
        allowOrigin: "*",
        allowMethods: "GET, POST, OPTIONS",
        allowHeaders: "Content-Type, Authorization, x-api-key",
        exposeHeaders: "Content-Type, Authorization, x-api-key",
        maxAge: "86400"
      },
      auth: {
        provider: new APIKeyAuthProvider({
          keys: ["your-api-key"]
        }),
        endpoints: {
          sse: true,
          messages: true
        }
      }
    }
  }
});

await server.start();

process.on('SIGINT', async () => {
  await server.stop();
});
```

## Best Practices

- **Project Structure**: Keep tools, resources, and prompts in their designated directories
- **Environment Variables**: Use env vars for secrets and environment-specific configuration
- **Error Handling**: Implement proper error handling in tools and resources
- **Security**: Enable authentication for HTTP-based transports, use HTTPS in production, configure CORS appropriately
- **Performance**: Use caching in resources, keep tool execution fast

## Next Steps

- [Transports](./transports.md) - Detailed transport configuration
- [Authentication](./authentication.md) - Secure your endpoints
- [Tools](./tools.md) - Build tools
- [Resources](./resources.md) - Build resources
- [Prompts](./prompts.md) - Build prompts
