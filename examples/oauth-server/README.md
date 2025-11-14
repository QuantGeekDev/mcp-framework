# MCP OAuth Server Example

This is a complete example of an MCP server with OAuth 2.1 authentication using `mcp-framework`.

## Features

- ✅ OAuth 2.1 authentication per MCP specification
- ✅ Supports both JWT and token introspection validation
- ✅ RFC 9728 Protected Resource Metadata endpoint
- ✅ Works with Auth0, Okta, AWS Cognito, Azure AD, and custom OAuth servers
- ✅ Example secure tool with authentication context access
- ✅ Comprehensive error handling and logging

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure OAuth Provider

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and configure your OAuth provider. See [Provider-Specific Setup](#provider-specific-setup) below.

### 3. Build and Run

```bash
npm run build
npm start
```

The server will start on `http://localhost:8080` (or your configured PORT).

### 4. Test the Setup

**Check metadata endpoint:**
```bash
curl http://localhost:8080/.well-known/oauth-protected-resource
```

**Test without authentication (should fail with 401):**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

**Test with authentication (replace YOUR_TOKEN):**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

**Call the secure tool:**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "secure_data",
      "arguments": {
        "query": "test query"
      }
    },
    "id": 1
  }'
```

## Provider-Specific Setup

### Auth0

1. Create an Auth0 account at [auth0.com](https://auth0.com)
2. Create a new API in your Auth0 dashboard
3. Create a Machine-to-Machine application
4. Configure your `.env`:

```bash
OAUTH_VALIDATION_TYPE=jwt
OAUTH_AUTHORIZATION_SERVER=https://your-tenant.auth0.com
OAUTH_JWKS_URI=https://your-tenant.auth0.com/.well-known/jwks.json
OAUTH_AUDIENCE=https://mcp.example.com  # Your API identifier
OAUTH_ISSUER=https://your-tenant.auth0.com/
OAUTH_RESOURCE=https://mcp.example.com
```

**Get a test token:**
```bash
curl --request POST \
  --url https://your-tenant.auth0.com/oauth/token \
  --header 'content-type: application/json' \
  --data '{
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "audience": "https://mcp.example.com",
    "grant_type": "client_credentials"
  }'
```

### Okta

1. Create an Okta account at [okta.com](https://okta.com)
2. Create a new App Integration (API Services)
3. Configure your authorization server
4. Configure your `.env`:

```bash
OAUTH_VALIDATION_TYPE=jwt
OAUTH_AUTHORIZATION_SERVER=https://your-domain.okta.com/oauth2/default
OAUTH_JWKS_URI=https://your-domain.okta.com/oauth2/default/v1/keys
OAUTH_AUDIENCE=api://mcp-server
OAUTH_ISSUER=https://your-domain.okta.com/oauth2/default
OAUTH_RESOURCE=api://mcp-server
```

**Get a test token:**
```bash
curl --request POST \
  --url https://your-domain.okta.com/oauth2/default/v1/token \
  --header 'accept: application/json' \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials&scope=your_scope&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET'
```

### AWS Cognito

1. Create a User Pool in AWS Cognito
2. Create an app client with client credentials flow enabled
3. Configure your `.env`:

```bash
OAUTH_VALIDATION_TYPE=jwt
OAUTH_AUTHORIZATION_SERVER=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX
OAUTH_JWKS_URI=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX/.well-known/jwks.json
OAUTH_AUDIENCE=1234567890abcdefghijklmnop  # Your app client ID
OAUTH_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX
OAUTH_RESOURCE=1234567890abcdefghijklmnop
```

### Azure AD / Entra ID

1. Register an application in Azure Portal
2. Configure API permissions and expose an API
3. Create a client secret
4. Configure your `.env`:

```bash
OAUTH_VALIDATION_TYPE=jwt
OAUTH_AUTHORIZATION_SERVER=https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0
OAUTH_JWKS_URI=https://login.microsoftonline.com/YOUR_TENANT_ID/discovery/v2.0/keys
OAUTH_AUDIENCE=api://mcp-server
OAUTH_ISSUER=https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0
OAUTH_RESOURCE=api://mcp-server
```

## Validation Strategies

This example supports two OAuth token validation strategies:

### JWT Validation (Default)

**Performance:** ~5-10ms per request (with caching)

**Pros:**
- Fast local validation
- Low authorization server load
- Good for high-traffic APIs

**Cons:**
- Tokens can't be revoked immediately
- Requires JWKS endpoint

**Configuration:**
```bash
OAUTH_VALIDATION_TYPE=jwt
OAUTH_JWKS_URI=https://your-auth-server.com/.well-known/jwks.json
```

### Token Introspection

**Performance:** ~20-50ms per request (with caching)

**Pros:**
- Real-time token revocation
- Centralized token management
- No JWKS required

**Cons:**
- Higher latency
- More load on authorization server
- Requires introspection endpoint and credentials

**Configuration:**
```bash
OAUTH_VALIDATION_TYPE=introspection
OAUTH_INTROSPECTION_ENDPOINT=https://your-auth-server.com/oauth/introspect
OAUTH_CLIENT_ID=mcp-server
OAUTH_CLIENT_SECRET=your-client-secret
```

## Project Structure

```
oauth-server/
├── src/
│   ├── index.ts           # Main server configuration
│   └── tools/
│       └── SecureDataTool.ts  # Example authenticated tool
├── .env.example           # Environment variables template
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

## Adding More Tools

Create new tools in `src/tools/`:

```typescript
import { MCPTool, McpInput } from "mcp-framework";
import { z } from "zod";

const MyToolSchema = z.object({
  input: z.string().describe("Your input parameter"),
});

class MyTool extends MCPTool {
  name = "my_tool";
  description = "My authenticated tool";
  schema = MyToolSchema;

  async execute(input: McpInput<this>, context?: any) {
    // Access authentication claims
    const claims = context?.auth?.data;
    const userId = claims?.sub;

    // Implement scope-based authorization if needed
    if (!claims?.scope?.includes('required:scope')) {
      throw new Error('Insufficient permissions');
    }

    // Your tool logic here
    return `Processed for user ${userId}`;
  }
}

export default MyTool;
```

The framework automatically discovers and loads all tools from the `src/tools/` directory.

## Debugging

Enable debug logging:

```bash
MCP_DEBUG_CONSOLE=true npm start
```

Enable file logging:

```bash
MCP_ENABLE_FILE_LOGGING=true MCP_LOG_DIRECTORY=logs npm start
```

Look for authentication-related logs:
```
[INFO] OAuthAuthProvider initialized with JWT validation
[DEBUG] Token claims - sub: user-123, scope: read write
[ERROR] OAuth authentication failed: Token has expired
```

## Security Best Practices

1. **Always use HTTPS in production** - OAuth tokens should never be sent over HTTP
2. **Use short-lived tokens** - Recommended: 15-60 minutes
3. **Validate audience claims** - Prevents token reuse across services
4. **Store secrets securely** - Never commit `.env` to version control
5. **Monitor authentication failures** - Track and investigate failed auth attempts

## Troubleshooting

### "Invalid token signature"
- Verify JWKS_URI is correct and accessible
- Check that token's `kid` matches a key in JWKS

### "Token audience invalid"
- Ensure `OAUTH_AUDIENCE` matches token's `aud` claim
- Check authorization server configuration

### "Token has expired"
- Request a new token from your authorization server
- Check system clock synchronization

### "JWKS endpoint unreachable"
- Verify network connectivity to authorization server
- Check firewall rules and DNS resolution

## Learn More

- [MCP Framework Documentation](https://mcp-framework.com)
- [OAuth 2.1 Setup Guide](../../docs/OAUTH.md)
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)

## License

MIT
