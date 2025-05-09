# MCP Framework

MCP-Framework is a framework for building Model Context Protocol (MCP) servers elegantly in TypeScript.

MCP-Framework gives you architecture out of the box, with automatic directory-based discovery for tools, resources, and prompts. Use our powerful MCP abstractions to define tools, resources, or prompts in an elegant way. Our cli makes getting started with your own MCP server a breeze

## Features

- 🛠️ Automatic discovery and loading of tools, resources, and prompts
- Multiple transport support (stdio, SSE, HTTP Stream)
- TypeScript-first development with full type safety
- Built on the official MCP SDK
- Easy-to-use base classes for tools, prompts, and resources
- Out of the box authentication for SSE endpoints

### Purpose

- Facilitate communication with an MCP server from your application.
- Support multiple transports seamlessly.
- Simplify sending commands, receiving responses, and handling streaming data.

### Typical Usage

```typescript
import { MCPClient } from "mcp-framework";

const client = new MCPClient({
  transport: {
    type: "websocket",
    options: {
      url: "ws://localhost:8080/ws" // Your WebSocket endpoint
    }
  }
});

// Connect to the server
await client.connect();

// Send a request
const response = await client.send({
  tool: "example_tool",
  input: { message: "Hello MCP" }
});

console.log("Response:", response);

// Disconnect when done
await client.disconnect();
```

`MCPClient` can be configured to use other transports like SSE, HTTP, or stdio by changing the `transport` type and options.

# [Read the full docs here](https://mcp-framework.com)





## Creating a repository with mcp-framework

### Using the CLI (Recommended)

```bash
# Install the framework globally
npm install -g mcp-framework

# Create a new MCP server project
mcp create my-mcp-server

# Navigate to your project
cd my-mcp-server

# Your server is ready to use!
```

## CLI Usage

The framework provides a powerful CLI for managing your MCP server projects:

### Project Creation

```bash
# Create a new project
mcp create <your project name here>

# Create a new project with the new EXPERIMENTAL HTTP transport
Heads up: This will set cors allowed origin to "*", modify it in the index if you wish
mcp create <your project name here> --http --port 1337 --cors
```

# Options:
# --http: Use HTTP transport instead of default stdio
# --port <number>: Specify HTTP port (default: 8080)
# --cors: Enable CORS with wildcard (*) access

### Adding a Tool

```bash
# Add a new tool
mcp add tool price-fetcher
```

### Adding a Prompt

```bash
# Add a new prompt
mcp add prompt price-analysis
```

### Adding a Resource

```bash
# Add a new prompt
mcp add resource market-data
```

## Development Workflow

1. Create your project:

```bash
  mcp create my-mcp-server
  cd my-mcp-server
```

2. Add tools as needed:

   ```bash
   mcp add tool data-fetcher
   mcp add tool data-processor
   mcp add tool report-generator
   ```

3. Build:

   ```bash
   npm run build

   ```

4. Add to MCP Client (Read below for Claude Desktop example)

## Using with Claude Desktop

### Local Development

Add this configuration to your Claude Desktop config file:

**MacOS**: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
**Windows**: \`%APPDATA%/Claude/claude_desktop_config.json\`

```json
{
"mcpServers": {
"${projectName}": {
      "command": "node",
      "args":["/absolute/path/to/${projectName}/dist/index.js"]
}
}
}
```

### After Publishing

Add this configuration to your Claude Desktop config file:

**MacOS**: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
**Windows**: \`%APPDATA%/Claude/claude_desktop_config.json\`

```json
{
"mcpServers": {
"${projectName}": {
      "command": "npx",
      "args": ["${projectName}"]
}
}
}
```

## Building and Testing

1. Make changes to your tools
2. Run \`npm run build\` to compile
3. The server will automatically load your tools on startup

## Environment Variables

The framework supports the following environment variables for configuration:

| Variable              | Description                                           | Default     |
|-----------------------|-------------------------------------------------------|-------------|
| MCP_ENABLE_FILE_LOGGING | Enable logging to files (true/false)                 | false       |
| MCP_LOG_DIRECTORY     | Directory where log files will be stored             | logs        |
| MCP_DEBUG_CONSOLE     | Display debug level messages in console (true/false) | false       |

Example usage:

```bash
# Enable file logging
MCP_ENABLE_FILE_LOGGING=true node dist/index.js

# Specify a custom log directory
MCP_ENABLE_FILE_LOGGING=true MCP_LOG_DIRECTORY=my-logs
# Enable debug messages in console
MCP_DEBUG_CONSOLE=true```

## Quick Start

### Creating a Tool

```typescript
import { MCPTool } from "mcp-framework";
import { z } from "zod";

interface ExampleInput {
  message: string;
}

class ExampleTool extends MCPTool<ExampleInput> {
  name = "example_tool";
  description = "An example tool that processes messages";

  schema = {
    message: {
      type: z.string(),
      description: "Message to process",
    },
  };

  async execute(input: ExampleInput) {
    return `Processed: ${input.message}`;
  }
}

export default ExampleTool;
```

### Setting up the Server

```typescript
import { MCPServer } from "mcp-framework";

const server = new MCPServer();

// OR (mutually exclusive!) with SSE transport
const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: 8080            // Optional (default: 8080)
    }
  }
});

// Start the server
await server.start();
```

## Transport Configuration

### stdio Transport (Default)

The stdio transport is used by default if no transport configuration is provided:

```typescript
const server = new MCPServer();
// or explicitly:
const server = new MCPServer({
  transport: { type: "stdio" }
});
```

### SSE Transport

To use Server-Sent Events (SSE) transport:

```typescript
const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: 8080,            // Optional (default: 8080)
      endpoint: "/sse",      // Optional (default: "/sse")
      messageEndpoint: "/messages", // Optional (default: "/messages")
      cors: {
        allowOrigin: "*",    // Optional (default: "*")
        allowMethods: "GET, POST, OPTIONS", // Optional (default: "GET, POST, OPTIONS")
        allowHeaders: "Content-Type, Authorization, x-api-key", // Optional (default: "Content-Type, Authorization, x-api-key")
        exposeHeaders: "Content-Type, Authorization, x-api-key", // Optional (default: "Content-Type, Authorization, x-api-key")
        maxAge: "86400"      // Optional (default: "86400")
      }
    }
  }
});
### WebSockets Transport

The WebSockets transport enables full-duplex, low-latency communication between `MCPClient` and the MCP server. It is ideal for interactive applications requiring real-time updates or bidirectional messaging.

#### Benefits

- Persistent connection with low overhead.
- Real-time, bidirectional communication.
- Efficient for streaming data and interactive workflows.
- Supports multiplexing multiple requests/responses over a single connection.

#### Integration with MCP Client

To use WebSockets, configure the `MCPClient` with the `websocket` transport type and specify the server URL:

```typescript
const client = new MCPClient({
  transport: {
    type: "websocket",
    options: {
      url: "ws://localhost:8080/ws"
    }
  }
});
await client.connect();
```

On the server side, enable the WebSockets transport:

```typescript
import { MCPServer } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "websocket",
    options: {
      port: 8080,
      path: "/ws" // default or custom WebSocket path
    }
  }
});

await server.start();
```

This setup allows the client and server to communicate efficiently over WebSockets.

```

### HTTP Stream Transport

To use HTTP Stream transport:

```typescript
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080,                // Optional (default: 8080)
      endpoint: "/mcp",          // Optional (default: "/mcp") 
      responseMode: "batch",     // Optional (default: "batch"), can be "batch" or "stream"
      batchTimeout: 30000,       // Optional (default: 30000ms) - timeout for batch responses
      maxMessageSize: "4mb",     // Optional (default: "4mb") - maximum message size
      
      // Session configuration
      session: {
        enabled: true,           // Optional (default: true)
        headerName: "Mcp-Session-Id", // Optional (default: "Mcp-Session-Id")
        allowClientTermination: true, // Optional (default: true)
      },
      
      // Stream resumability (for missed messages)
      resumability: {
        enabled: false,          // Optional (default: false)
        historyDuration: 300000, // Optional (default: 300000ms = 5min) - how long to keep message history
      },
      
      // CORS configuration
      cors: {
        allowOrigin: "*"         // Other CORS options use defaults
      }
    }
  }
});
```

#### Response Modes

The HTTP Stream transport supports two response modes:

1. **Batch Mode** (Default): Responses are collected and sent as a single JSON-RPC response. This is suitable for typical request-response patterns and is more efficient for most use cases.

2. **Stream Mode**: All responses are sent over a persistent SSE connection opened for each request. This is ideal for long-running operations or when the server needs to send multiple messages in response to a single request.

You can configure the response mode based on your specific needs:

```typescript
// For batch mode (default):
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      responseMode: "batch"
    }
  }
});

// For stream mode:
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      responseMode: "stream"
    }
  }
});
```

#### HTTP Stream Transport Features

- **Session Management**: Automatic session tracking and management
- **Stream Resumability**: Optional support for resuming streams after connection loss
- **Batch Processing**: Support for JSON-RPC batch requests/responses
- **Comprehensive Error Handling**: Detailed error responses with JSON-RPC error codes

## Authentication

MCP Framework provides optional authentication for SSE endpoints. You can choose between JWT and API Key authentication, or implement your own custom authentication provider.

### JWT Authentication

```typescript
import { MCPServer, JWTAuthProvider } from "mcp-framework";
import { Algorithm } from "jsonwebtoken";

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      auth: {
        provider: new JWTAuthProvider({
          secret: process.env.JWT_SECRET,
          algorithms: ["HS256" as Algorithm], // Optional (default: ["HS256"])
          headerName: "Authorization"         // Optional (default: "Authorization")
        }),
        endpoints: {
          sse: true,      // Protect SSE endpoint (default: false)
          messages: true  // Protect message endpoint (default: true)
        }
      }
    }
  }
});
```

Clients must include a valid JWT token in the Authorization header:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### API Key Authentication

```typescript
import { MCPServer, APIKeyAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      auth: {
        provider: new APIKeyAuthProvider({
          keys: [process.env.API_KEY],
          headerName: "X-API-Key" // Optional (default: "X-API-Key")
        })
      }
    }
  }
});
```

Clients must include a valid API key in the X-API-Key header:
```
X-API-Key: your-api-key
```

### Custom Authentication

You can implement your own authentication provider by implementing the `AuthProvider` interface:

```typescript
import { AuthProvider, AuthResult } from "mcp-framework";
import { IncomingMessage } from "node:http";

class CustomAuthProvider implements AuthProvider {
  async authenticate(req: IncomingMessage): Promise<boolean | AuthResult> {
    // Implement your custom authentication logic
    return true;
  }

  getAuthError() {
    return {
      status: 401,
      message: "Authentication failed"
    };
  }
}
```

## License

MIT
