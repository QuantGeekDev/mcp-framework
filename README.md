# MCP Framework

MCP-Framework is a framework for building Model Context Protocol (MCP) servers elegantly in TypeScript.

MCP-Framework gives you architecture out of the box, with automatic directory-based discovery for tools, resources, and prompts. Use our powerful MCP abstractions to define tools, resources, or prompts in an elegant way. Our cli makes getting started with your own MCP server a breeze

## Features

- 🛠️ Automatic discovery and loading of tools, resources, and prompts
- Multiple transport support (stdio, SSE, HTTP Stream)
- TypeScript-first development with full type safety
- Built on the official MCP SDK
- Easy-to-use base classes for tools, prompts, and resources
- Out of the box authentication for SSE endpoints (OAuth 2.1, JWT, API Key)

## Projects Built with MCP Framework

The following projects and services are built using MCP Framework:

- ### [tip.md](https://tip.md)
A crypto tipping service that enables AI assistants to help users send cryptocurrency tips to content creators directly from their chat interface. The MCP service allows for:
 - Checking wallet types for users
 - Preparing cryptocurrency tips for users/agents to complete
Setup instructions for various clients (Cursor, Sage, Claude Desktop) are available in their [MCP Server documentation](https://docs.tip.md/mcp-server/).

## Support our work

[![Tip in Crypto](https://tip.md/badge.svg)](https://tip.md/QuantGeekDev)


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

### Building and Validation

The framework provides comprehensive validation to ensure your tools are properly documented and functional:

```bash
# Build with automatic validation (recommended)
npm run build

# Build with custom validation settings
MCP_SKIP_TOOL_VALIDATION=false npm run build  # Force validation (default)
MCP_SKIP_TOOL_VALIDATION=true npm run build   # Skip validation (not recommended)
```

### Validating Tools

```bash
# Validate all tools have proper descriptions (for Zod schemas)
mcp validate
```

This command checks that all tools using Zod schemas have descriptions for every field. The validation runs automatically during build, but you can also run it standalone:

- ✅ **During build**: `npm run build` automatically validates tools
- ✅ **Standalone**: `mcp validate` for manual validation
- ✅ **Development**: Use `defineSchema()` helper for immediate feedback
- ✅ **Runtime**: Server validates tools on startup

**Example validation error:**
```bash
❌ Tool validation failed:
  ❌ PriceFetcher.js: Missing descriptions for fields in price_fetcher: symbol, currency. 
All fields must have descriptions when using Zod object schemas. 
Use .describe() on each field, e.g., z.string().describe("Field description")
```

**Integrating validation into CI/CD:**
```json
{
  "scripts": {
    "build": "tsc && mcp-build",
    "test": "jest && mcp validate",
    "prepack": "npm run build && mcp validate"
  }
}
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

1. **Create your project:**
   ```bash
   mcp create my-mcp-server
   cd my-mcp-server
   ```

2. **Add tools:**
   ```bash
   mcp add tool data-fetcher
   mcp add tool data-processor
   mcp add tool report-generator
   ```

3. **Define your tool schemas with automatic validation:**
   ```typescript
   // tools/DataFetcher.ts
   import { MCPTool, MCPInput as AddToolInput } from "mcp-framework";
  import { z } from "zod";

  const AddToolSchema = z.object({
  a: z.number().describe("First number to add"),
  b: z.number().describe("Second number to add"),
  });

  class AddTool extends MCPTool {
  name = "add";
  description = "Add tool description";
  schema = AddToolSchema;

  async execute(input: AddToolInput<this>) {
    const result = input.a + input.b;
    return `Result: ${result}`;
    }
  }
  export default AddTool;

   ```

4. **Build with automatic validation:**
   ```bash
   npm run build  # Automatically validates schemas and compiles
   ```

5. **Optional: Run standalone validation:**
   ```bash
   mcp validate  # Check all tools independently
   ```

6. **Test your server:**
   ```bash
   node dist/index.js  # Server validates tools on startup
   ```

7. **Add to MCP Client** (see Claude Desktop example below)

**Pro Tips:**
- Use `defineSchema()` during development for immediate feedback
- Build process automatically catches missing descriptions
- Server startup validates all tools before accepting connections
- Use TypeScript's autocomplete with `McpInput<this>` for better DX

## Using with Claude Desktop

### Local Development

Add this configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

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

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

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
2. Run `npm run build` to compile
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
MCP_ENABLE_FILE_LOGGING=true MCP_LOG_DIRECTORY=my-logs node dist/index.js

# Enable debug messages in console
MCP_DEBUG_CONSOLE=true node dist/index.js
```

## Quick Start

### Defining Tools

MCP Framework uses Zod schemas for defining tool inputs, providing type safety, validation, and automatic documentation:

```typescript
import { MCPTool, McpInput } from "mcp-framework";
import { z } from "zod";

const AddToolSchema = z.object({
  a: z.number().describe("First number to add"),
  b: z.number().describe("Second number to add"),
});

class AddTool extends MCPTool {
  name = "add";
  description = "Add tool description";
  schema = AddToolSchema;

  async execute(input: McpInput<this>) {
    const result = input.a + input.b;
    return `Result: ${result}`;
  }
}

export default AddTool;
```

**Key Benefits:**
- ✅ **Single source of truth** - Define types and validation in one place
- ✅ **Automatic type inference** - TypeScript types are inferred from your schema
- ✅ **Rich validation** - Leverage Zod's powerful validation features
- ✅ **Required descriptions** - Framework enforces documentation
- ✅ **Better IDE support** - Full autocomplete and type checking
- ✅ **Cleaner code** - No duplicate type definitions

### Advanced Zod Schema Features

The framework supports all Zod features:

```typescript
import { MCPTool, McpInput } from "mcp-framework";
import { z } from "zod";

const AdvancedSchema = z.object({
  // String constraints and formats
  email: z.string().email().describe("User email address"),
  name: z.string().min(2).max(50).describe("User name"),
  website: z.string().url().optional().describe("Optional website URL"),
  
  // Number constraints
  age: z.number().int().positive().max(120).describe("User age"),
  rating: z.number().min(1).max(5).describe("Rating from 1 to 5"),
  
  // Arrays and objects
  tags: z.array(z.string()).describe("List of tags"),
  metadata: z.object({
    priority: z.enum(['low', 'medium', 'high']).describe("Task priority"),
    dueDate: z.string().optional().describe("Due date in ISO format")
  }).describe("Additional metadata"),
  
  // Default values
  status: z.string().default('pending').describe("Current status"),
  
  // Unions and enums
  category: z.union([
    z.literal('personal'),
    z.literal('work'),
    z.literal('other')
  ]).describe("Category type")
});

class AdvancedTool extends MCPTool {
  name = "advanced_tool";
  description = "Tool demonstrating advanced Zod features";
  schema = AdvancedSchema;

  async execute(input: McpInput<this>) {
    // TypeScript automatically knows all the types!
    const { email, name, website, age, rating, tags, metadata, status, category } = input;
    
    console.log(input.name.toUpperCase()); // ✅ TypeScript knows this is valid
    console.log(input.age.toFixed(2));     // ✅ Number methods available
    console.log(input.tags.length);       // ✅ Array methods available
    console.log(input.website?.includes("https")); // ✅ Optional handling
    
    return `Processed user: ${name}`;
  }
}
```

### Automatic Type Inference

The `McpInput<this>` type automatically infers the correct input type from your schema, eliminating the need for manual type definitions:

```typescript
class MyTool extends MCPTool {
  schema = z.object({
    name: z.string().describe("User name"),
    age: z.number().optional().describe("User age"),
    tags: z.array(z.string()).describe("User tags")
  });

  async execute(input: McpInput<this>) {
    // TypeScript automatically knows:
    // input.name is string
    // input.age is number | undefined  
    // input.tags is string[]
    
    console.log(input.name.toUpperCase()); // ✅ TypeScript knows this is valid
    console.log(input.age?.toFixed(2));    // ✅ Handles optional correctly
    console.log(input.tags.length);       // ✅ Array methods available
  }
}
```

No more duplicate interfaces or generic type parameters needed!

### Schema Validation & Descriptions

**All schema fields must have descriptions**. This ensures your tools are well-documented and provides better user experience in MCP clients.

The framework validates descriptions at multiple levels:

#### 1. Build-time Validation (Recommended)
```bash
npm run build  # Automatically validates during compilation
```

#### 2. Development-time Validation
Use the `defineSchema` helper for immediate feedback:

```typescript
import { defineSchema } from "mcp-framework";

// This will throw an error immediately if descriptions are missing
const MySchema = defineSchema({
  name: z.string(),  // ❌ Error: Missing description
  age: z.number().describe("User age")  // ✅ Good
});
```

#### 3. Standalone Validation
```bash
mcp validate  # Check all tools for proper descriptions
```

#### 4. Runtime Validation
The server automatically validates tools on startup.

**To skip validation** (not recommended):
```bash
# Skip during build
MCP_SKIP_TOOL_VALIDATION=true npm run build

# Skip during development
NODE_ENV=production npm run dev
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

### OAuth 2.1 Authentication

MCP Framework supports OAuth 2.1 authentication per the MCP specification (2025-06-18), including Protected Resource Metadata (RFC 9728) and proper token validation with JWKS support.

OAuth authentication works with both SSE and HTTP Stream transports and supports two validation strategies:

#### JWT Validation (Recommended for Performance)

JWT validation fetches public keys from your authorization server's JWKS endpoint and validates tokens locally. This is the fastest option as it doesn't require a round-trip to the auth server for each request.

```typescript
import { MCPServer, OAuthAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [
            process.env.OAUTH_AUTHORIZATION_SERVER
          ],
          resource: process.env.OAUTH_RESOURCE,
          validation: {
            type: 'jwt',
            jwksUri: process.env.OAUTH_JWKS_URI,
            audience: process.env.OAUTH_AUDIENCE,
            issuer: process.env.OAUTH_ISSUER,
            algorithms: ['RS256', 'ES256'] // Optional (default: ['RS256', 'ES256'])
          }
        }),
        endpoints: {
          initialize: true,  // Protect session initialization
          messages: true     // Protect MCP messages
        }
      }
    }
  }
});
```

**Environment Variables:**
```bash
OAUTH_AUTHORIZATION_SERVER=https://auth.example.com
OAUTH_RESOURCE=https://mcp.example.com
OAUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
OAUTH_AUDIENCE=https://mcp.example.com
OAUTH_ISSUER=https://auth.example.com
```

#### Token Introspection (Recommended for Centralized Control)

Token introspection validates tokens by calling your authorization server's introspection endpoint. This provides centralized control and is useful when you need real-time token revocation.

```typescript
import { MCPServer, OAuthAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [
            process.env.OAUTH_AUTHORIZATION_SERVER
          ],
          resource: process.env.OAUTH_RESOURCE,
          validation: {
            type: 'introspection',
            audience: process.env.OAUTH_AUDIENCE,
            issuer: process.env.OAUTH_ISSUER,
            introspection: {
              endpoint: process.env.OAUTH_INTROSPECTION_ENDPOINT,
              clientId: process.env.OAUTH_CLIENT_ID,
              clientSecret: process.env.OAUTH_CLIENT_SECRET
            }
          }
        })
      }
    }
  }
});
```

**Environment Variables:**
```bash
OAUTH_AUTHORIZATION_SERVER=https://auth.example.com
OAUTH_RESOURCE=https://mcp.example.com
OAUTH_AUDIENCE=https://mcp.example.com
OAUTH_ISSUER=https://auth.example.com
OAUTH_INTROSPECTION_ENDPOINT=https://auth.example.com/oauth/introspect
OAUTH_CLIENT_ID=mcp-server
OAUTH_CLIENT_SECRET=your-client-secret
```

#### OAuth Features

- **RFC 9728 Compliance**: Automatic Protected Resource Metadata endpoint at `/.well-known/oauth-protected-resource`
- **RFC 6750 WWW-Authenticate Headers**: Proper OAuth error responses with challenge headers
- **JWKS Key Caching**: Public keys cached for 15 minutes (configurable)
- **Token Introspection Caching**: Introspection results cached for 5 minutes (configurable)
- **Security**: Tokens in query strings are automatically rejected
- **Claims Extraction**: Access token claims in your tool handlers via `AuthResult`

#### Popular OAuth Providers

The OAuth provider works with any RFC-compliant OAuth 2.1 authorization server:

- **Auth0**: Use your Auth0 tenant's JWKS URI and issuer
- **Okta**: Use your Okta authorization server configuration
- **AWS Cognito**: Use your Cognito user pool's JWKS endpoint
- **Azure AD / Entra ID**: Use Microsoft Entra ID endpoints
- **Custom**: Any OAuth 2.1 compliant authorization server

For detailed setup guides with specific providers, see the [OAuth Setup Guide](#oauth-setup-guide).

#### Client Usage

Clients must include a valid OAuth access token in the Authorization header:

```bash
# Make a request with OAuth token
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

# Discover OAuth configuration
curl http://localhost:8080/.well-known/oauth-protected-resource
```

#### Security Best Practices

- **Always use HTTPS in production** - OAuth tokens should never be transmitted over unencrypted connections
- **Validate audience claims** - Prevents token reuse across different services
- **Use short-lived tokens** - Reduces risk if tokens are compromised
- **Enable token introspection caching** - Reduces load on authorization server while maintaining security
- **Monitor token errors** - Track failed authentication attempts for security insights

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
