# OAuth 2.1 Implementation Summary

## Overview

OAuth 2.1 authorization has been successfully implemented for the MCP Framework, following the Model Context Protocol authorization specification. This implementation enables secure user authentication and authorization for HTTP-based MCP servers.

## Implementation Details

### Core Components

#### 1. OAuthProvider (`src/auth/providers/oauth.ts`)

The main OAuth provider class that implements:

- **OAuth 2.1 Authorization Flow** with PKCE (Proof Key for Code Exchange)
- **Token Validation**: Support for both JWT and opaque tokens
- **Token Caching**: Configurable TTL to reduce validation overhead
- **Protected Resource Metadata (RFC 9728)**: Server metadata for authorization discovery
- **Resource Indicators (RFC 8707)**: Explicit token audience binding
- **Authorization Server Metadata Discovery (RFC 8414)**: Automatic endpoint discovery

**Key Methods:**
- `authenticate(req)`: Validates Bearer tokens from incoming requests
- `getProtectedResourceMetadata()`: Returns RFC 9728 metadata
- `startAuthorizationFlow(redirectUri)`: Initiates OAuth flow with PKCE
- `handleCallback(code, state, redirectUri)`: Exchanges authorization code for token

#### 2. SSE Transport Updates (`src/transports/sse/server.ts`)

Extended the SSE transport to support OAuth endpoints:

- `/.well-known/oauth-protected-resource`: Serves Protected Resource Metadata (public endpoint per RFC 9728)
- `/oauth/callback`: Handles OAuth authorization callbacks
- Enhanced authentication handling with proper WWW-Authenticate headers for OAuth

#### 3. Type Definitions

**Updated Files:**
- `src/auth/types.ts`: Added `headers` field to `AuthProvider.getAuthError()` for OAuth WWW-Authenticate
- `src/transports/sse/types.ts`: Added `oauth` configuration section for callback handlers

### Standards Compliance

The implementation adheres to:

- ✅ **OAuth 2.1** (draft-ietf-oauth-v2-1-13): Core authorization framework
- ✅ **RFC 9728**: OAuth 2.0 Protected Resource Metadata
- ✅ **RFC 8414**: OAuth 2.0 Authorization Server Metadata
- ✅ **RFC 8707**: Resource Indicators for OAuth 2.0
- ✅ **RFC 7636**: Proof Key for Code Exchange (PKCE)

### Security Features

1. **PKCE**: Mandatory for all authorization flows to prevent code interception
2. **Audience Validation**: Strict validation that tokens are intended for this server
3. **Token Caching**: Configurable TTL with automatic cleanup
4. **State Parameter**: Generated and validated to prevent CSRF attacks
5. **Token Passthrough Prevention**: Validates tokens are specifically for this resource

## Configuration

### Basic Setup

```typescript
import { MCPServer, OAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      auth: {
        provider: new OAuthProvider({
          authorizationServer: "https://auth.example.com",
          clientId: "your-client-id",
          resourceUri: "https://mcp.example.com",
        })
      }
    }
  }
});
```

### Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `authorizationServer` | Yes | - | OAuth authorization server URL |
| `clientId` | No | `undefined` | OAuth client ID (required for auth flow) |
| `clientSecret` | No | `undefined` | Client secret for confidential clients |
| `resourceUri` | Yes | - | Canonical URI of this MCP server |
| `callbackPath` | No | `/oauth/callback` | OAuth callback endpoint path |
| `requiredScopes` | No | `[]` | Scopes required in access tokens |
| `tokenCacheTTL` | No | `300` | Token validation cache TTL (seconds) |
| `strictAudienceValidation` | No | `true` | Enforce audience claim validation |
| `customValidator` | No | `undefined` | Custom token validation function |

## Integration Examples

### AWS Cognito

```typescript
const oauthProvider = new OAuthProvider({
  authorizationServer: "https://your-domain.auth.us-east-1.amazoncognito.com",
  clientId: process.env.COGNITO_CLIENT_ID,
  clientSecret: process.env.COGNITO_CLIENT_SECRET,
  resourceUri: "https://mcp.example.com",
  requiredScopes: ["openid", "profile"],
});
```

### Auth0

```typescript
const oauthProvider = new OAuthProvider({
  authorizationServer: "https://your-domain.auth0.com",
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  resourceUri: "https://mcp.example.com",
  requiredScopes: ["read:mcp", "write:mcp"],
});
```

### Okta

```typescript
const oauthProvider = new OAuthProvider({
  authorizationServer: "https://your-domain.okta.com/oauth2/default",
  clientId: process.env.OKTA_CLIENT_ID,
  clientSecret: process.env.OKTA_CLIENT_SECRET,
  resourceUri: "https://mcp.example.com",
});
```

## Authorization Flow

```
1. Client → Server (no token)
   GET /messages
   
2. Server → Client (401 Unauthorized)
   HTTP/1.1 401 Unauthorized
   WWW-Authenticate: Bearer realm="MCP Server", 
                     resource="https://mcp.example.com",
                     authorization_uri="https://auth.example.com"

3. Client → Server (metadata discovery)
   GET /.well-known/oauth-protected-resource
   
4. Server → Client (protected resource metadata)
   {
     "resource": "https://mcp.example.com",
     "authorization_servers": ["https://auth.example.com"]
   }

5. Client → Authorization Server (authorization request with PKCE)
   GET /authorize?response_type=code&client_id=...&code_challenge=...
       &resource=https://mcp.example.com

6. User authorizes → Authorization Server

7. Authorization Server → Server (callback)
   GET /oauth/callback?code=...&state=...

8. Server → Authorization Server (token exchange with PKCE)
   POST /token
   grant_type=authorization_code&code=...&code_verifier=...

9. Authorization Server → Server (access token)
   {
     "access_token": "...",
     "token_type": "Bearer",
     "expires_in": 3600
   }

10. Client → Server (authenticated request)
    GET /messages
    Authorization: Bearer <access-token>

11. Server validates token → Success
```

## Testing

### Unit Tests Location
- Token validation logic can be tested independently
- PKCE generation can be verified
- Metadata generation can be validated

### Integration Testing

Use the provided test client:
```bash
npm run build
node dist/examples/oauth-test-client.js
```

### Manual Testing

1. Start server with OAuth enabled
2. Access protected endpoint (expect 401)
3. Visit authorization URL (printed in console)
4. Authorize and get redirected
5. Server receives token
6. Use token for authenticated requests

## Files Modified/Created

### New Files
1. `src/auth/providers/oauth.ts` - OAuth provider implementation
2. `OAUTH_GUIDE.md` - Comprehensive OAuth setup guide
3. `OAUTH_IMPLEMENTATION_SUMMARY.md` - This file
4. `examples/oauth-cognito-example.ts` - Cognito integration example
5. `examples/oauth-simple-example.ts` - Basic OAuth example
6. `examples/oauth-custom-validator.ts` - Custom validator example
7. `examples/oauth-test-client.ts` - Test client
8. `examples/README.md` - Examples documentation

### Modified Files
1. `src/auth/types.ts` - Added `headers` to `AuthProvider.getAuthError()`
2. `src/auth/index.ts` - Export OAuth provider and types
3. `src/transports/sse/types.ts` - Added OAuth config options
4. `src/transports/sse/server.ts` - Added OAuth endpoints and handling
5. `README.md` - Added OAuth documentation section

## Usage in Production

### Environment Variables

```bash
# Required
OAUTH_AUTHORIZATION_SERVER=https://your-domain.auth.example.com
OAUTH_CLIENT_ID=your-client-id
OAUTH_RESOURCE_URI=https://mcp.example.com

# Optional
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_REQUIRED_SCOPES=openid,profile,mcp:read
```

### Production Configuration

```typescript
const oauthProvider = new OAuthProvider({
  authorizationServer: process.env.OAUTH_AUTHORIZATION_SERVER!,
  clientId: process.env.OAUTH_CLIENT_ID,
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  resourceUri: process.env.OAUTH_RESOURCE_URI!,
  requiredScopes: process.env.OAUTH_REQUIRED_SCOPES?.split(','),
  
  // Production settings
  strictAudienceValidation: true,
  tokenCacheTTL: 300,
});

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: parseInt(process.env.PORT || "3001"),
      
      // CORS for production
      cors: {
        allowOrigin: process.env.ALLOWED_ORIGIN || "https://your-app.com",
        allowMethods: "GET, POST, OPTIONS",
        allowHeaders: "Content-Type, Authorization",
      },
      
      auth: {
        provider: oauthProvider,
        endpoints: {
          sse: false,      // SSE endpoint public
          messages: true,  // Messages require auth
        }
      },
      
      oauth: {
        onCallback: async ({ accessToken, refreshToken, expiresIn }) => {
          // Store tokens securely
          logger.info("User authorized successfully");
        },
        onError: async (error) => {
          logger.error("Authorization failed:", error);
        }
      }
    }
  }
});
```

## Known Limitations

1. **HTTP Transport Only**: OAuth is only supported for HTTP-based transports (SSE). STDIO transport should use environment-based credentials.
2. **Token Storage**: The framework does not persist tokens - implement your own storage if needed for refresh tokens.
3. **JWKS Validation**: Default JWT validation is basic. For production, implement `customValidator` with full JWKS verification.
4. **Dynamic Client Registration**: While the provider supports it conceptually, full RFC 7591 dynamic registration is not implemented (clients must pre-register with the authorization server).

## Future Enhancements

Potential improvements for future versions:

- [ ] Built-in JWKS-based JWT validation
- [ ] Refresh token management
- [ ] Token revocation support
- [ ] Full dynamic client registration (RFC 7591)
- [ ] OpenID Connect support
- [ ] Multi-tenant authorization
- [ ] Token introspection caching

## Support & Resources

- [OAuth Setup Guide](./OAUTH_GUIDE.md)
- [Examples Directory](./examples/)
- [OAuth 2.1 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [MCP Authorization Specification](https://modelcontextprotocol.io/docs/authorization)

## Contributors

Implementation completed on October 30, 2025

