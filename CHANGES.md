# OAuth 2.1 Implementation - Change Log

## Summary

OAuth 2.1 authorization support has been added to the MCP Framework, implementing the Model Context Protocol authorization specification. This enables secure user authentication with authorization servers like AWS Cognito, Auth0, Okta, and others.

## New Files Created

### Core Implementation
- **`src/auth/providers/oauth.ts`** (630+ lines)
  - Complete OAuth 2.1 provider with PKCE
  - Token validation (JWT and introspection)
  - Protected Resource Metadata generation
  - Authorization flow management
  - Token caching with configurable TTL

### Documentation
- **`OAUTH_GUIDE.md`** - Comprehensive OAuth setup guide with:
  - Feature overview
  - Quick start examples
  - AWS Cognito setup instructions
  - Authorization flow details
  - Advanced configuration
  - Security considerations
  - Testing instructions
  - Troubleshooting guide

- **`OAUTH_IMPLEMENTATION_SUMMARY.md`** - Technical implementation summary
- **`OAUTH_QUICK_START.md`** - 5-minute quick start guide

### Examples
- **`examples/oauth-simple-example.ts`** - Minimal OAuth setup
- **`examples/oauth-cognito-example.ts`** - Complete Cognito integration
- **`examples/oauth-custom-validator.ts`** - Advanced token validation
- **`examples/oauth-test-client.ts`** - OAuth testing client
- **`examples/README.md`** - Examples documentation with flow diagrams

## Modified Files

### Core Framework

1. **`src/auth/types.ts`**
   - Added optional `headers` field to `AuthProvider.getAuthError()` return type
   - Added `oauth` endpoint option to `AuthConfig.endpoints`

2. **`src/auth/index.ts`**
   - Export `OAuthProvider` class
   - Export `OAuthConfig` type

3. **`src/transports/sse/types.ts`**
   - Added `oauth` configuration section with callback handlers
   - Updated `SSETransportConfigInternal` to include oauth option

4. **`src/transports/sse/server.ts`**
   - Added `/.well-known/oauth-protected-resource` endpoint (RFC 9728)
   - Added OAuth callback handler at `/oauth/callback`
   - Enhanced authentication handling with OAuth-specific WWW-Authenticate headers
   - Added `handleProtectedResourceMetadata()` method
   - Added `handleOAuthCallback()` method
   - Updated `handleAuthentication()` to support OAuth provider

5. **`README.md`**
   - Added OAuth 2.1 authentication section
   - Updated features list to mention OAuth support
   - Added links to OAuth documentation

## Features Implemented

### OAuth 2.1 Core
- ✅ Authorization Code Flow with PKCE (RFC 7636)
- ✅ Token validation (JWT and opaque tokens)
- ✅ State parameter for CSRF protection
- ✅ Token caching with configurable TTL
- ✅ Automatic token cache cleanup

### RFC Compliance
- ✅ **RFC 9728**: OAuth 2.0 Protected Resource Metadata
  - `/.well-known/oauth-protected-resource` endpoint
  - Automatic metadata generation
  
- ✅ **RFC 8707**: Resource Indicators for OAuth 2.0
  - `resource` parameter in authorization/token requests
  - Audience validation in tokens
  
- ✅ **RFC 8414**: OAuth 2.0 Authorization Server Metadata
  - Automatic metadata discovery
  - Endpoint caching

- ✅ **RFC 7636**: Proof Key for Code Exchange
  - SHA256 code challenge generation
  - Code verifier validation

### Security Features
- ✅ Strict audience validation (prevents token misuse)
- ✅ PKCE mandatory for all flows
- ✅ WWW-Authenticate headers with proper metadata
- ✅ Token passthrough prevention
- ✅ Configurable security policies

### Integration Support
- ✅ AWS Cognito compatibility
- ✅ Auth0 support
- ✅ Okta support
- ✅ Custom token validators
- ✅ Generic OAuth 2.1 server support

## API Changes

### New Exports from `mcp-framework`

```typescript
// OAuth Provider
export { OAuthProvider } from "./auth/providers/oauth.js";

// OAuth Types
export type { OAuthConfig } from "./auth/providers/oauth.js";
```

### New Configuration Options

```typescript
// SSE Transport OAuth Configuration
interface SSETransportConfig {
  oauth?: {
    onCallback?: (params: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      state?: string;
    }) => Promise<void> | void;
    
    onError?: (error: Error, state?: string) => Promise<void> | void;
  };
}

// OAuth Provider Configuration
interface OAuthConfig {
  authorizationServer: string;
  clientId?: string;
  clientSecret?: string;
  resourceUri: string;
  callbackPath?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  requiredScopes?: string[];
  customValidator?: (token: string) => Promise<{ valid: boolean; data?: Record<string, any> }>;
  tokenCacheTTL?: number;
  supportDynamicRegistration?: boolean;
  authorizationEndpoint?: string;
  strictAudienceValidation?: boolean;
  metadata?: Record<string, any>;
}
```

## Usage Example

### Before (API Key)
```typescript
import { MCPServer, APIKeyAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      auth: {
        provider: new APIKeyAuthProvider({
          keys: [process.env.API_KEY]
        })
      }
    }
  }
});
```

### After (OAuth with Cognito)
```typescript
import { MCPServer, OAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      auth: {
        provider: new OAuthProvider({
          authorizationServer: "https://your-domain.auth.us-east-1.amazoncognito.com",
          clientId: process.env.COGNITO_CLIENT_ID,
          clientSecret: process.env.COGNITO_CLIENT_SECRET,
          resourceUri: "https://mcp.example.com",
          requiredScopes: ["openid", "profile"],
        }),
        endpoints: {
          sse: false,
          messages: true,
        }
      },
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

## Backward Compatibility

✅ **Fully Backward Compatible**

- All existing authentication providers (JWT, API Key) continue to work unchanged
- OAuth is opt-in - no breaking changes to existing code
- SSE transport works exactly as before if OAuth is not configured
- No changes to STDIO transport

## Testing

### Automated Tests
- OAuth provider can be unit tested independently
- PKCE generation is deterministic and testable
- Token validation logic is isolated

### Manual Testing
- Test client provided (`examples/oauth-test-client.ts`)
- Full example servers for various scenarios
- Step-by-step testing instructions in documentation

## Documentation

| Document | Purpose |
|----------|---------|
| `OAUTH_GUIDE.md` | Complete setup and usage guide |
| `OAUTH_QUICK_START.md` | 5-minute quick start |
| `OAUTH_IMPLEMENTATION_SUMMARY.md` | Technical details |
| `examples/README.md` | Example usage and flow diagrams |
| `README.md` | Updated with OAuth section |

## Migration Guide

### From API Key to OAuth

1. Replace `APIKeyAuthProvider` with `OAuthProvider`
2. Configure OAuth settings (authorization server, client ID, resource URI)
3. Add OAuth callback handlers
4. Update client to use OAuth flow instead of static API keys

### From JWT to OAuth

1. Replace `JWTAuthProvider` with `OAuthProvider`
2. Configure authorization server (instead of JWT secret)
3. Optionally use `customValidator` for JWT validation with JWKS
4. Add OAuth callback handlers

## Known Limitations

1. **HTTP Only**: OAuth requires HTTP-based transport (SSE)
2. **No Token Persistence**: Framework doesn't persist refresh tokens
3. **Basic JWT Validation**: Use `customValidator` for production JWKS validation
4. **No Dynamic Registration**: Clients must pre-register with auth server

## Future Enhancements

Planned improvements:
- Built-in JWKS-based JWT validation
- Refresh token management
- Token revocation support
- Full dynamic client registration (RFC 7591)
- OpenID Connect support
- Multi-tenant authorization

## Dependencies

No new dependencies added - uses existing dependencies:
- `jsonwebtoken` (already present for JWT auth)
- Native `crypto` module for PKCE
- Native `fetch` for HTTP requests

## Performance

- Token validation results are cached (default 5 minutes)
- PKCE session cleanup runs automatically
- Authorization server metadata is cached (1 hour)
- Minimal overhead - only validates tokens on protected endpoints

## Security Audit Checklist

✅ PKCE mandatory for all authorization flows
✅ State parameter prevents CSRF
✅ Strict audience validation prevents token misuse
✅ Token caching reduces validation overhead
✅ Tokens not logged or exposed
✅ HTTPS enforcement for authorization server
✅ Proper WWW-Authenticate headers
✅ No token passthrough to upstream services

## Version

- **Implementation Date**: October 30, 2025
- **MCP Framework Version**: 0.1.29+
- **OAuth Specification**: OAuth 2.1 (draft-ietf-oauth-v2-1-13)

## Contributors

Implementation completed by AI Assistant for MCP Framework.

