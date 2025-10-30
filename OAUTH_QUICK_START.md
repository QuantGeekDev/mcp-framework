# OAuth Quick Start Guide

## 5-Minute Setup

### 1. Install & Import

```typescript
import { MCPServer, OAuthProvider } from "mcp-framework";
```

### 2. Create OAuth Provider

```typescript
const oauthProvider = new OAuthProvider({
  authorizationServer: "https://your-auth-server.com",
  clientId: "your-client-id",
  resourceUri: "https://your-mcp-server.com",
});
```

### 3. Configure Server

```typescript
const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: 3001,
      auth: {
        provider: oauthProvider,
        endpoints: {
          messages: true,  // Require auth for messages
        }
      },
      oauth: {
        onCallback: async ({ accessToken }) => {
          console.log("User authorized!");
        }
      }
    }
  }
});
```

### 4. Start Server

```typescript
await server.start();
```

## Common Scenarios

### AWS Cognito

```typescript
new OAuthProvider({
  authorizationServer: "https://your-domain.auth.us-east-1.amazoncognito.com",
  clientId: process.env.COGNITO_CLIENT_ID,
  clientSecret: process.env.COGNITO_CLIENT_SECRET,
  resourceUri: "https://mcp.example.com",
  requiredScopes: ["openid", "profile"],
})
```

### Auth0

```typescript
new OAuthProvider({
  authorizationServer: "https://your-domain.auth0.com",
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  resourceUri: "https://mcp.example.com",
  requiredScopes: ["read:mcp", "write:mcp"],
})
```

### Custom Validator

```typescript
new OAuthProvider({
  authorizationServer: "https://auth.example.com",
  clientId: "your-client-id",
  resourceUri: "https://mcp.example.com",
  customValidator: async (token) => {
    // Your custom validation logic
    const valid = await validateToken(token);
    return { valid, data: { userId: "123" } };
  }
})
```

## Client Flow

### 1. Client Gets 401

```http
GET /messages HTTP/1.1

HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="MCP Server", 
                  resource="https://mcp.example.com",
                  authorization_uri="https://auth.example.com"
```

### 2. Client Discovers Metadata

```http
GET /.well-known/oauth-protected-resource HTTP/1.1

HTTP/1.1 200 OK
{
  "resource": "https://mcp.example.com",
  "authorization_servers": ["https://auth.example.com"]
}
```

### 3. Client Authorizes

User visits authorization URL → Logs in → Redirects back with code

### 4. Client Uses Token

```http
GET /messages HTTP/1.1
Authorization: Bearer eyJhbGc...

HTTP/1.1 200 OK
```

## Testing

### Test the OAuth Endpoints

```bash
# 1. Test metadata endpoint
curl http://localhost:3001/.well-known/oauth-protected-resource

# 2. Test without token (expect 401)
curl -i http://localhost:3001/messages

# 3. Test with token
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/messages
```

### Run Example Server

```bash
# Cognito example
export COGNITO_DOMAIN="your-domain.auth.us-east-1.amazoncognito.com"
export COGNITO_CLIENT_ID="your-client-id"
export COGNITO_CLIENT_SECRET="your-client-secret"
export RESOURCE_URI="https://mcp.example.com"

npm run build
node dist/examples/oauth-cognito-example.js
```

## Configuration Cheat Sheet

| Option | Required | Default | Use Case |
|--------|----------|---------|----------|
| `authorizationServer` | ✅ Yes | - | Your OAuth server URL |
| `clientId` | ⚠️ For auth flow | `undefined` | OAuth client ID |
| `resourceUri` | ✅ Yes | - | This server's URI |
| `requiredScopes` | No | `[]` | Scopes to require |
| `strictAudienceValidation` | No | `true` | Enforce aud claim |
| `tokenCacheTTL` | No | `300` | Cache duration (sec) |
| `customValidator` | No | - | Custom validation |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 401 always | Check `clientId` is set for auth flow |
| Audience mismatch | Verify `resourceUri` matches server URL |
| State expired | Callback must happen within 10 minutes |
| CORS error | Configure `cors.allowOrigin` |
| Metadata 404 | Ensure using SSE transport |

## Next Steps

📖 Read the full [OAuth Guide](./OAUTH_GUIDE.md)

💡 Check out [Examples](./examples/)

🔧 Review [Implementation Summary](./OAUTH_IMPLEMENTATION_SUMMARY.md)

## Need Help?

- Check the examples directory for working code
- Review the OAuth Guide for detailed setup
- Check authorization server documentation
- Verify environment variables are set correctly

