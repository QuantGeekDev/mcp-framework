# OAuth 2.1 Support for MCP Framework

The MCP Framework now supports OAuth 2.1 authorization for HTTP-based transports, implementing the Model Context Protocol authorization specification.

## Features

- **OAuth 2.1 Compliance**: Full implementation of OAuth 2.1 authorization flow
- **PKCE Support**: Proof Key for Code Exchange (RFC 7636) for enhanced security
- **Protected Resource Metadata**: RFC 9728 implementation for authorization server discovery
- **Resource Indicators**: RFC 8707 support for explicit audience binding
- **Token Validation**: Support for both JWT and opaque token validation
- **Cognito Compatible**: Works with AWS Cognito and other OAuth 2.1 providers

## Quick Start

### Basic OAuth Configuration

```typescript
import { MCPServer, OAuthProvider } from "mcp-framework";

const oauthProvider = new OAuthProvider({
  // Your authorization server (e.g., Cognito domain)
  authorizationServer: "https://your-domain.auth.us-east-1.amazoncognito.com",
  
  // OAuth client ID (can be registered dynamically or pre-configured)
  clientId: "your-client-id",
  
  // Resource URI - the canonical URI of this MCP server
  // This MUST match how clients access your server
  resourceUri: "https://mcp.example.com",
  
  // Optional: Client secret for confidential clients
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  
  // Optional: Required scopes
  requiredScopes: ["mcp:read", "mcp:write"],
});

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: 3001,
      endpoint: "/sse",
      auth: {
        provider: oauthProvider,
        endpoints: {
          sse: false,      // Public SSE endpoint
          messages: true,  // Protected message endpoint (requires auth)
        }
      },
      // OAuth callback handlers
      oauth: {
        onCallback: async ({ accessToken, refreshToken, expiresIn, state }) => {
          console.log("OAuth authorization successful!");
          console.log("Access token received:", accessToken.substring(0, 20) + "...");
          // Store tokens securely if needed
        },
        onError: async (error, state) => {
          console.error("OAuth error:", error.message);
        }
      }
    }
  }
});

server.start();
```

## AWS Cognito Setup

### 1. Create a Cognito User Pool

```bash
# Using AWS CLI
aws cognito-idp create-user-pool \
  --pool-name mcp-user-pool \
  --auto-verified-attributes email
```

### 2. Create an App Client

```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id us-east-1_XXXXXXX \
  --client-name mcp-app-client \
  --generate-secret \
  --allowed-o-auth-flows authorization_code \
  --allowed-o-auth-scopes openid profile email \
  --callback-urls https://mcp.example.com/oauth/callback \
  --supported-identity-providers COGNITO
```

### 3. Configure MCP Server with Cognito

```typescript
import { MCPServer, OAuthProvider } from "mcp-framework";

const oauthProvider = new OAuthProvider({
  authorizationServer: "https://your-domain.auth.us-east-1.amazoncognito.com",
  clientId: process.env.COGNITO_CLIENT_ID,
  clientSecret: process.env.COGNITO_CLIENT_SECRET,
  resourceUri: "https://mcp.example.com",
  
  // Cognito scopes
  requiredScopes: ["openid", "profile"],
  
  // Custom token validator for Cognito JWT tokens
  customValidator: async (token) => {
    try {
      // Implement JWT validation using Cognito's JWKS
      // You can use libraries like 'jsonwebtoken' and 'jwks-rsa'
      const decoded = await verifyToken(token);
      return {
        valid: true,
        data: decoded
      };
    } catch (error) {
      return { valid: false };
    }
  }
});

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: 3001,
      auth: {
        provider: oauthProvider,
        endpoints: {
          sse: false,
          messages: true,
        }
      },
      oauth: {
        onCallback: async ({ accessToken, refreshToken }) => {
          console.log("User authenticated via Cognito!");
          // Store refresh token for long-lived sessions
        }
      }
    }
  }
});

server.start();
```

## Authorization Flow

### 1. Client Discovers Authorization Server

The client makes an unauthenticated request to your MCP server and receives a 401 response with `WWW-Authenticate` header:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="MCP Server", resource="https://mcp.example.com", authorization_uri="https://your-domain.auth.us-east-1.amazoncognito.com"
```

### 2. Client Retrieves Protected Resource Metadata

```http
GET /.well-known/oauth-protected-resource HTTP/1.1
Host: mcp.example.com

HTTP/1.1 200 OK
Content-Type: application/json

{
  "resource": "https://mcp.example.com",
  "authorization_servers": [
    "https://your-domain.auth.us-east-1.amazoncognito.com"
  ]
}
```

### 3. Client Initiates Authorization Flow

The client can use the `startAuthorizationFlow` method from the OAuth provider:

```typescript
// On the client side or for testing
const { authorizationUrl, state } = await oauthProvider.startAuthorizationFlow(
  "https://mcp.example.com/oauth/callback",
  {
    scope: "openid profile"
  }
);

// Redirect user to authorizationUrl
console.log("Visit:", authorizationUrl);
```

### 4. User Authorizes

The user is redirected to the authorization server (Cognito), logs in, and authorizes the application.

### 5. Callback and Token Exchange

The authorization server redirects back to your callback URL with an authorization code. The MCP server automatically:
- Validates the state parameter
- Exchanges the code for an access token using PKCE
- Calls your `onCallback` handler with the tokens

### 6. Client Uses Access Token

```http
POST /messages?sessionId=xxx HTTP/1.1
Host: mcp.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

## Advanced Configuration

### Custom Token Validation

```typescript
const oauthProvider = new OAuthProvider({
  authorizationServer: "https://auth.example.com",
  clientId: "your-client-id",
  resourceUri: "https://mcp.example.com",
  
  // Custom validation logic
  customValidator: async (token) => {
    // Call your token introspection endpoint
    const response = await fetch("https://auth.example.com/oauth/introspect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token,
        token_type_hint: "access_token"
      })
    });
    
    const result = await response.json();
    
    return {
      valid: result.active,
      data: result
    };
  }
});
```

### Disable Strict Audience Validation

By default, the OAuth provider enforces strict audience validation (RFC 8707). To disable:

```typescript
const oauthProvider = new OAuthProvider({
  authorizationServer: "https://auth.example.com",
  clientId: "your-client-id",
  resourceUri: "https://mcp.example.com",
  strictAudienceValidation: false, // Not recommended for production
});
```

### Token Caching

Tokens are cached to avoid repeated validation. Configure the cache TTL:

```typescript
const oauthProvider = new OAuthProvider({
  authorizationServer: "https://auth.example.com",
  clientId: "your-client-id",
  resourceUri: "https://mcp.example.com",
  tokenCacheTTL: 600, // 10 minutes (default is 5 minutes)
});
```

### Custom Metadata

Add custom metadata to the Protected Resource Metadata document:

```typescript
const oauthProvider = new OAuthProvider({
  authorizationServer: "https://auth.example.com",
  clientId: "your-client-id",
  resourceUri: "https://mcp.example.com",
  metadata: {
    resource_name: "My MCP Server",
    scopes_supported: ["mcp:read", "mcp:write", "mcp:admin"],
    custom_field: "custom_value"
  }
});
```

## Security Considerations

### 1. Token Audience Validation

Always ensure tokens are issued specifically for your MCP server:

- Keep `strictAudienceValidation: true` (default)
- Set `resourceUri` to match your server's canonical URI
- Include the `resource` parameter in authorization requests (automatically handled)

### 2. PKCE

PKCE is automatically used for all authorization flows to prevent authorization code interception.

### 3. HTTPS Requirements

- All authorization server endpoints MUST use HTTPS
- Redirect URIs MUST use HTTPS (except for localhost during development)

### 4. Token Storage

- Never log or expose access tokens in client-facing responses
- Store refresh tokens securely (encrypted at rest)
- Implement proper token rotation

### 5. Confused Deputy Prevention

The MCP server validates that tokens are specifically intended for it:

- Validates the audience claim (`aud`) matches the `resourceUri`
- Never passes tokens through to upstream services
- If calling upstream APIs, obtains separate tokens for those services

## Testing

### Test Authorization Flow Locally

```typescript
import { MCPServer, OAuthProvider } from "mcp-framework";

const oauthProvider = new OAuthProvider({
  authorizationServer: "https://your-domain.auth.us-east-1.amazoncognito.com",
  clientId: "test-client-id",
  resourceUri: "http://localhost:3001", // Use localhost for testing
  requiredScopes: ["openid"],
});

// Start authorization flow
const { authorizationUrl, state } = await oauthProvider.startAuthorizationFlow(
  "http://localhost:3001/oauth/callback"
);

console.log("Visit this URL to authorize:");
console.log(authorizationUrl);

// Start the server
const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: 3001,
      auth: {
        provider: oauthProvider,
        endpoints: {
          messages: true,
        }
      },
      oauth: {
        onCallback: async ({ accessToken }) => {
          console.log("✅ Authorization successful!");
          console.log("Access token:", accessToken);
        },
        onError: async (error) => {
          console.error("❌ Authorization failed:", error.message);
        }
      }
    }
  }
});

await server.start();
```

### Test Token Validation

```bash
# Get a token from your authorization server
TOKEN="eyJhbGciOiJSUzI1NiIs..."

# Test authenticated request
curl -X POST http://localhost:3001/messages?sessionId=xxx \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Migration from API Key or JWT

If you're currently using API Key or JWT authentication:

```typescript
// Before (API Key)
import { APIKeyAuthProvider } from "mcp-framework";

const provider = new APIKeyAuthProvider({
  keys: [process.env.API_KEY]
});

// After (OAuth)
import { OAuthProvider } from "mcp-framework";

const provider = new OAuthProvider({
  authorizationServer: process.env.OAUTH_SERVER,
  clientId: process.env.CLIENT_ID,
  resourceUri: process.env.RESOURCE_URI,
});

// The rest of the configuration remains the same
const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: 3001,
      auth: { provider }
    }
  }
});
```

## Troubleshooting

### "Invalid or expired OAuth state"

- State parameters expire after 10 minutes
- Ensure the callback happens within this timeframe
- Check that the state in the callback matches the one from the authorization URL

### "Token audience mismatch"

- Ensure your `resourceUri` exactly matches how clients access your server
- Check that your authorization server is configured to issue tokens with the correct audience
- Verify the `resource` parameter is included in authorization requests

### "Authorization endpoint not configured"

- Check that `authorizationServer` is correctly set
- Verify the authorization server's `.well-known/oauth-authorization-server` endpoint is accessible
- Consider manually setting `authorizationEndpoint` if metadata discovery fails

### Protected Resource Metadata returns 404

- Ensure you're using the SSE transport (OAuth is only supported for HTTP-based transports)
- Check that the OAuth provider is configured in the `auth` config
- Verify the endpoint is `/.well-known/oauth-protected-resource` (note the leading dot)

## Additional Resources

- [OAuth 2.1 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8707: Resource Indicators for OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc8707)
- [RFC 7636: Proof Key for Code Exchange (PKCE)](https://datatracker.ietf.org/doc/html/rfc7636)
- [AWS Cognito OAuth 2.0 Endpoints](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-userpools-server-contract-reference.html)

## Support

For issues or questions about OAuth support in MCP Framework, please open an issue on GitHub.

