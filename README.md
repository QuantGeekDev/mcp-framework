# MCP Framework

MCP-Framework is a framework for building Model Context Protocol (MCP) servers elegantly in TypeScript.

MCP-Framework gives you architecture out of the box, with automatic directory-based discovery for tools, resources, and prompts. Use our powerful MCP abstractions to define tools, resources, or prompts in an elegant way. Our cli makes getting started with your own MCP server a breeze

## Features

- 🛠️ Automatic discovery and loading of tools, resources, and prompts
- Multiple transport support (stdio, SSE)
- TypeScript-first development with full type safety
- Built on the official MCP SDK
- Easy-to-use base classes for tools, prompts, and resources
- Out of the box authentication for SSE endpoints (OAuth 2.1, JWT, API Key)


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
```

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
```

#### CORS Configuration

The SSE transport supports flexible CORS configuration. By default, it uses permissive settings suitable for development. For production, you should configure CORS according to your security requirements:

```typescript
const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      // Restrict to specific origin
      cors: {
        allowOrigin: "https://myapp.com",
        allowMethods: "GET, POST",
        allowHeaders: "Content-Type, Authorization",
        exposeHeaders: "Content-Type, Authorization",
        maxAge: "3600"
      }
    }
  }
});

// Or with multiple allowed origins
const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      cors: {
        allowOrigin: "https://app1.com, https://app2.com",
        allowMethods: "GET, POST, OPTIONS",
        allowHeaders: "Content-Type, Authorization, Custom-Header",
        exposeHeaders: "Content-Type, Authorization",
        maxAge: "86400"
      }
    }
  }
});
```

## Authentication

MCP Framework provides optional authentication for SSE endpoints. You can choose between JWT, API Key, OAuth 2.1 authentication, or implement your own custom authentication provider.

### OAuth 2.1 Authentication

The framework supports OAuth 2.1 authorization with PKCE, implementing the MCP authorization specification. This is ideal for integrating with authorization servers like AWS Cognito, Auth0, Okta, etc.

```typescript
import { MCPServer, OAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      auth: {
        provider: new OAuthProvider({
          // Your authorization server (e.g., Cognito)
          authorizationServer: "https://your-domain.auth.us-east-1.amazoncognito.com",
          
          // OAuth client credentials
          clientId: process.env.OAUTH_CLIENT_ID,
          clientSecret: process.env.OAUTH_CLIENT_SECRET, // Optional for public clients
          
          // The canonical URI of this MCP server
          resourceUri: "https://mcp.example.com",
          
          // Required scopes
          requiredScopes: ["openid", "profile"],
        }),
        endpoints: {
          sse: false,      // SSE endpoint is public
          messages: true,  // Messages require authentication
        }
      },
      // Handle OAuth callbacks
      oauth: {
        onCallback: async ({ accessToken, refreshToken }) => {
          console.log("User authorized successfully!");
        },
        onError: async (error) => {
          console.error("Authorization failed:", error);
        }
      }
    }
  }
});
```

**OAuth Features:**
- 🔐 **OAuth 2.1 with PKCE**: Enhanced security with Proof Key for Code Exchange
- 🌐 **Protected Resource Metadata (RFC 9728)**: Automatic authorization server discovery
- 🎯 **Resource Indicators (RFC 8707)**: Explicit token audience binding
- ✅ **Token Validation**: Support for JWT and opaque tokens
- 🔄 **Token Caching**: Configurable token validation caching
- 🛡️ **Strict Audience Validation**: Prevents token misuse across services

**Quick Links:**
- [OAuth Setup Guide](./OAUTH_GUIDE.md)
- [Cognito Example](./examples/oauth-cognito-example.ts)
- [Custom Validator Example](./examples/oauth-custom-validator.ts)

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
