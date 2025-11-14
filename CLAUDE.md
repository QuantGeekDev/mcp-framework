# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mcp-framework is a TypeScript framework for building Model Context Protocol (MCP) servers. It provides an opinionated architecture with automatic directory-based discovery for tools, resources, and prompts. The framework is used as a dependency in other projects (similar to Express.js) and runs from node_modules.

## Development Commands

### Build and Watch
```bash
npm run build          # Compile TypeScript to dist/
npm run watch          # Watch mode for development
```

### Testing
```bash
npm test                    # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test:coverage       # Run tests with coverage report
```

### Linting and Formatting
```bash
npm run lint            # Run ESLint
npm run lint:fix        # Run ESLint with auto-fix
npm run format          # Format code with Prettier
```

### Local Development with yalc
```bash
npm run dev:pub         # Build and publish to yalc for local testing
```

### CLI Commands (for projects using the framework)
```bash
mcp create <project-name>           # Create new MCP server project
mcp add tool <tool-name>            # Add a new tool
mcp add prompt <prompt-name>        # Add a new prompt
mcp add resource <resource-name>    # Add a new resource
mcp validate                        # Validate tool schemas
mcp-build                          # Build project (used in build scripts)
```

## Architecture

### Core Components

1. **MCPServer** ([src/core/MCPServer.ts](src/core/MCPServer.ts))
   - Main server class that orchestrates everything
   - Handles capability detection (tools, prompts, resources)
   - Manages transport configuration (stdio, SSE, HTTP stream)
   - Loads and validates tools/prompts/resources on startup
   - Resolves basePath from config or process.argv[1] or process.cwd()

2. **Loaders** ([src/loaders/](src/loaders/))
   - ToolLoader, PromptLoader, ResourceLoader
   - Automatically discover and load implementations from directories
   - Look for files in `<basePath>/tools`, `<basePath>/prompts`, `<basePath>/resources`
   - Load from compiled JS in dist/ (not from src/)

3. **Base Classes**
   - **MCPTool** ([src/tools/BaseTool.ts](src/tools/BaseTool.ts)) - Base for all tools
   - **BasePrompt** ([src/prompts/BasePrompt.ts](src/prompts/BasePrompt.ts)) - Base for prompts
   - **BaseResource** ([src/resources/BaseResource.ts](src/resources/BaseResource.ts)) - Base for resources

4. **Transport Layer** ([src/transports/](src/transports/))
   - stdio: Standard input/output (default)
   - SSE: Server-Sent Events transport
   - HTTP Stream: HTTP-based streaming with session management

### Tool Schema System

The framework uses Zod schemas with **mandatory descriptions** for all fields:

```typescript
const schema = z.object({
  message: z.string().describe("Message to process"),  // Description is required
  count: z.number().optional().describe("Optional count")
});

class MyTool extends MCPTool {
  name = "my_tool";
  description = "Tool description";
  schema = schema;

  async execute(input: MCPInput<this>) {
    // input is fully typed from schema
  }
}
```

**Validation occurs at multiple levels:**
- Build-time: `npm run build` validates all schemas
- Development: `defineSchema()` helper validates immediately
- Standalone: `mcp validate` command
- Runtime: Server validates on startup

Missing descriptions will cause build failures. Skip with `MCP_SKIP_TOOL_VALIDATION=true` (not recommended).

### Path Resolution

Since mcp-framework runs from node_modules:
- `basePath` is resolved from config, process.argv[1], or process.cwd()
- Loaders search for tools/prompts/resources relative to basePath
- Framework code uses `import.meta.url` for its own files
- Projects using the framework have tools/prompts/resources in their own directory structure

## Key Technical Details

### Module System
- ESM modules (type: "module" in package.json)
- TypeScript config: module="Node16", moduleResolution="Node16"
- All imports use .js extensions (even for .ts files)
- Jest configured for ESM with ts-jest

### Authentication

The framework supports three authentication providers for SSE and HTTP Stream transports:

#### OAuth 2.1 Authentication (Recommended for Production)

OAuth 2.1 authentication per MCP specification (2025-06-18) with RFC compliance:

**Components:**
- **OAuthAuthProvider** ([src/auth/providers/oauth.ts](src/auth/providers/oauth.ts)): Main provider implementing AuthProvider interface
- **JWTValidator** ([src/auth/validators/jwt-validator.ts](src/auth/validators/jwt-validator.ts)): Async JWT validation with JWKS support
- **IntrospectionValidator** ([src/auth/validators/introspection-validator.ts](src/auth/validators/introspection-validator.ts)): OAuth token introspection (RFC 7662)
- **ProtectedResourceMetadata** ([src/auth/metadata/protected-resource.ts](src/auth/metadata/protected-resource.ts)): RFC 9728 metadata generation

**Metadata Endpoint:**
- Path: `/.well-known/oauth-protected-resource`
- Public (no auth required)
- Returns authorization server URLs and resource identifier
- Automatically served by SSE and HTTP Stream transports when OAuth is configured

**Token Validation Strategies:**

1. **JWT Validation** (recommended for performance):
   - Fetches public keys from JWKS endpoint
   - Validates: signature, expiration, audience, issuer, nbf
   - JWKS key caching for 15 minutes (configurable)
   - Supports RS256 and ES256 algorithms
   - Fast: ~5-10ms per request (cached keys)

2. **Token Introspection** (recommended for real-time revocation):
   - Calls authorization server's introspection endpoint (RFC 7662)
   - Validates: active status, expiration, audience, issuer
   - Caches results for 5 minutes (configurable)
   - Allows immediate token revocation
   - Slower: ~20-50ms per request (cached)

**Security Features:**
- Tokens must be in Authorization header (Bearer scheme)
- Tokens in query strings rejected automatically (security requirement)
- Audience validation prevents token reuse across services
- WWW-Authenticate challenges per RFC 6750
- Comprehensive logging of authentication events

**Configuration Example:**
```typescript
import { OAuthAuthProvider } from 'mcp-framework';

// JWT validation
const provider = new OAuthAuthProvider({
  authorizationServers: ['https://auth.example.com'],
  resource: 'https://mcp.example.com',
  validation: {
    type: 'jwt',
    jwksUri: 'https://auth.example.com/.well-known/jwks.json',
    audience: 'https://mcp.example.com',
    issuer: 'https://auth.example.com'
  }
});

// Token introspection
const provider = new OAuthAuthProvider({
  authorizationServers: ['https://auth.example.com'],
  resource: 'https://mcp.example.com',
  validation: {
    type: 'introspection',
    audience: 'https://mcp.example.com',
    issuer: 'https://auth.example.com',
    introspection: {
      endpoint: 'https://auth.example.com/oauth/introspect',
      clientId: 'mcp-server',
      clientSecret: process.env.CLIENT_SECRET
    }
  }
});
```

**Integration:** Works with Auth0, Okta, AWS Cognito, Azure AD/Entra ID, and any RFC-compliant OAuth 2.1 server. See [docs/OAUTH.md](docs/OAUTH.md) for detailed setup guides.

#### JWT Authentication (Simple Token-Based)

- **JWTAuthProvider**: Token-based auth with configurable algorithms (HS256, RS256, etc.)
- Simpler than OAuth, suitable for internal services
- No automatic metadata endpoint

#### API Key Authentication

- **APIKeyAuthProvider**: Simple key-based auth
- Good for development and testing
- Not recommended for production

#### Custom Authentication

- **AuthProvider interface**: Implement custom authentication logic
- Async authenticate method returns boolean or AuthResult with claims
- getAuthError method provides error responses

### Transport Features
- **SSE**: CORS configuration, optional auth on endpoints
- **HTTP Stream**:
  - Response modes: "batch" (default) or "stream"
  - Session management with configurable headers
  - Stream resumability for missed messages
  - Batch request/response support

### CLI Templates
The CLI uses templates ([src/cli/templates/](src/cli/templates/)) to scaffold new projects and components. These templates are used by the `mcp create` and `mcp add` commands.

### Logging
- Logger utility in [src/core/Logger.ts](src/core/Logger.ts)
- Environment variables:
  - `MCP_ENABLE_FILE_LOGGING`: Enable file logging (default: false)
  - `MCP_LOG_DIRECTORY`: Log directory (default: "logs")
  - `MCP_DEBUG_CONSOLE`: Show debug messages in console (default: false)

## Testing

Tests are in the `tests/` directory with the pattern `*.test.ts`. The project uses Jest with ts-jest for ESM support. Run tests with:
- `NODE_OPTIONS='--experimental-vm-modules' jest`
- Or use npm scripts: `npm test`, `npm run test:watch`, `npm run test:coverage`

## Important Notes

- All tool schema fields must have descriptions (enforced at build time)
- The framework is meant to be used as a dependency, not modified directly
- When testing locally, use `yalc` for linking instead of npm link
- Transport layer is pluggable - choose stdio (default), SSE, or HTTP stream based on use case
- Server performs validation on startup - tools with invalid schemas will prevent server start
