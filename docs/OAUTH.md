# OAuth 2.1 Setup Guide for MCP Framework

This guide provides comprehensive instructions for setting up OAuth 2.1 authentication in your MCP server, including integration examples for popular OAuth providers.

## Table of Contents

- [Introduction](#introduction)
- [Quick Start](#quick-start)
- [Token Validation Strategies](#token-validation-strategies)
- [Provider Integration](#provider-integration)
  - [Auth0](#auth0)
  - [Okta](#okta)
  - [AWS Cognito](#aws-cognito)
  - [Azure AD / Entra ID](#azure-ad--entra-id)
  - [Custom Authorization Server](#custom-authorization-server)
- [Advanced Configuration](#advanced-configuration)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Migration Guide](#migration-guide)

---

## Introduction

### What is OAuth in MCP?

OAuth 2.1 authentication in MCP (Model Context Protocol) provides secure, standardized authorization for your MCP servers. The MCP specification (2025-06-18) mandates OAuth 2.1 with PKCE support for production deployments.

### When to Use OAuth

| Authentication Method | Use Case |
|---------------------|----------|
| **OAuth 2.1** | Production deployments, enterprise environments, multi-tenant systems, services requiring user-level authorization |
| **JWT** | Internal services, simpler authorization needs, when you control token issuance |
| **API Key** | Development, testing, simple single-tenant deployments, internal tools |

### Key Benefits

- ✅ **Standardized**: Industry-standard OAuth 2.1 protocol
- ✅ **Secure**: PKCE support, token validation, audience verification
- ✅ **Scalable**: Works with any RFC-compliant authorization server
- ✅ **Flexible**: Supports both JWT and introspection validation
- ✅ **Discoverable**: Automatic metadata endpoint (RFC 9728)

---

## Quick Start

### Minimal Configuration

Here's the simplest OAuth configuration to get started:

```typescript
import { MCPServer, OAuthAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: ["https://auth.example.com"],
          resource: "https://mcp.example.com",
          validation: {
            type: 'jwt',
            jwksUri: "https://auth.example.com/.well-known/jwks.json",
            audience: "https://mcp.example.com",
            issuer: "https://auth.example.com"
          }
        })
      }
    }
  }
});

await server.start();
console.log("MCP Server with OAuth running on http://localhost:8080");
```

### Testing Your Setup

1. **Check metadata endpoint:**
```bash
curl http://localhost:8080/.well-known/oauth-protected-resource
```

Expected response:
```json
{
  "resource": "https://mcp.example.com",
  "authorization_servers": ["https://auth.example.com"]
}
```

2. **Test without token (should fail):**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

Expected response:
```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="MCP Server", resource="https://mcp.example.com"
```

3. **Test with valid token:**
```bash
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

---

## Token Validation Strategies

MCP Framework supports two token validation strategies, each with different trade-offs:

### JWT Validation

**How it works:** The framework fetches public keys from your authorization server's JWKS endpoint and validates JWT signatures locally.

**Pros:**
- ⚡ **Fast**: No network call required for each request (after key caching)
- 🔒 **Secure**: Cryptographic signature validation
- 📉 **Low latency**: ~10ms validation time (cached keys)
- 💰 **Cost-effective**: Reduces load on authorization server

**Cons:**
- ⏱️ **Revocation delay**: Tokens remain valid until expiration (can't revoke immediately)
- 🔑 **Key management**: Requires JWKS endpoint with proper key rotation
- 💾 **Stateless only**: No way to check token status in real-time

**Best for:**
- High-performance APIs
- Microservices architectures
- Short-lived tokens (15-60 minutes)
- Systems without real-time revocation needs

**Configuration:**
```typescript
validation: {
  type: 'jwt',
  jwksUri: "https://auth.example.com/.well-known/jwks.json",
  audience: "https://mcp.example.com",
  issuer: "https://auth.example.com",
  algorithms: ['RS256', 'ES256'] // Optional, defaults to RS256 and ES256
}
```

**Performance characteristics:**
- First request (cache miss): ~150-200ms
- Cached requests: ~5-10ms
- JWKS cache TTL: 15 minutes (configurable)

### Token Introspection

**How it works:** For each request, the framework calls your authorization server's introspection endpoint to check if the token is valid.

**Pros:**
- ⚡ **Real-time revocation**: Tokens can be revoked immediately
- 📊 **Centralized control**: Auth server has full control over token validity
- 🎯 **Accurate**: Always reflects current token status
- 🔍 **Auditable**: All validation requests logged at auth server

**Cons:**
- 🐌 **Slower**: Network call required for each validation (even with caching)
- 📈 **Higher latency**: ~50-100ms (cached) to ~200-300ms (uncached)
- 💰 **Higher load**: More requests to authorization server
- 🌐 **Network dependent**: Requires reliable connection to auth server

**Best for:**
- Systems requiring real-time token revocation
- Long-lived tokens (hours to days)
- Compliance requirements (audit trail)
- Scenarios with frequent permission changes

**Configuration:**
```typescript
validation: {
  type: 'introspection',
  audience: "https://mcp.example.com",
  issuer: "https://auth.example.com",
  introspection: {
    endpoint: "https://auth.example.com/oauth/introspect",
    clientId: "mcp-server",
    clientSecret: process.env.OAUTH_CLIENT_SECRET
  }
}
```

**Performance characteristics:**
- First request (cache miss): ~200-300ms
- Cached requests: ~20-50ms
- Cache TTL: 5 minutes (configurable)

### Choosing a Strategy

| Factor | JWT Validation | Token Introspection |
|--------|---------------|---------------------|
| **Performance** | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐⭐ Good |
| **Revocation** | ⭐⭐ Delayed | ⭐⭐⭐⭐⭐ Immediate |
| **Complexity** | ⭐⭐⭐ Moderate | ⭐⭐⭐⭐ Simple |
| **Auth Server Load** | ⭐⭐⭐⭐⭐ Very Low | ⭐⭐⭐ Moderate |
| **Network Dependency** | ⭐⭐⭐⭐ Low | ⭐⭐ High |

**Recommendation:**
- Use **JWT validation** for most use cases (better performance)
- Use **token introspection** when you need real-time revocation

---

## Provider Integration

### Auth0

Auth0 is a popular identity platform that provides OAuth 2.1 support out of the box.

#### Setup Steps

1. **Create an Auth0 Application:**
   - Log in to [Auth0 Dashboard](https://manage.auth0.com/)
   - Go to Applications → Create Application
   - Choose "Machine to Machine Application"
   - Select your Auth0 API (or create one)

2. **Get Configuration Values:**
   - **Domain**: Your Auth0 tenant domain (e.g., `your-tenant.auth0.com`)
   - **Issuer**: `https://your-tenant.auth0.com/`
   - **JWKS URI**: `https://your-tenant.auth0.com/.well-known/jwks.json`
   - **Audience**: Your API identifier (e.g., `https://mcp.example.com`)

3. **Configure Your MCP Server:**

```typescript
import { MCPServer, OAuthAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [`https://${process.env.AUTH0_DOMAIN}`],
          resource: process.env.AUTH0_AUDIENCE,
          validation: {
            type: 'jwt',
            jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
            audience: process.env.AUTH0_AUDIENCE,
            issuer: `https://${process.env.AUTH0_DOMAIN}/`
          }
        })
      }
    }
  }
});

await server.start();
```

4. **Environment Variables (.env):**

```bash
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://mcp.example.com
```

#### Testing with Auth0

Get a test token using Auth0's test endpoint:

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

Use the returned token to test your MCP server:

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

---

### Okta

Okta is an enterprise identity platform with comprehensive OAuth 2.1 support.

#### Setup Steps

1. **Create an Okta Application:**
   - Log in to [Okta Admin Console](https://admin.okta.com/)
   - Go to Applications → Create App Integration
   - Choose "API Services" (OAuth 2.0)
   - Give it a name (e.g., "MCP Server")

2. **Configure Authorization Server:**
   - Go to Security → API
   - Use the "default" authorization server or create a custom one
   - Note your authorization server's issuer URL

3. **Get Configuration Values:**
   - **Issuer**: `https://your-domain.okta.com/oauth2/default` (or your custom auth server)
   - **JWKS URI**: `https://your-domain.okta.com/oauth2/default/v1/keys`
   - **Audience**: Your API identifier (configure in authorization server)

4. **Configure Your MCP Server:**

```typescript
import { MCPServer, OAuthAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [process.env.OKTA_ISSUER],
          resource: process.env.OKTA_AUDIENCE,
          validation: {
            type: 'jwt',
            jwksUri: `${process.env.OKTA_ISSUER}/v1/keys`,
            audience: process.env.OKTA_AUDIENCE,
            issuer: process.env.OKTA_ISSUER
          }
        })
      }
    }
  }
});

await server.start();
```

5. **Environment Variables (.env):**

```bash
OKTA_ISSUER=https://your-domain.okta.com/oauth2/default
OKTA_AUDIENCE=api://mcp-server
```

#### Testing with Okta

```bash
curl --request POST \
  --url https://your-domain.okta.com/oauth2/default/v1/token \
  --header 'accept: application/json' \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials&scope=your_scope&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET'
```

---

### AWS Cognito

AWS Cognito provides user pools and identity pools with OAuth 2.1 support.

#### Setup Steps

1. **Create a User Pool:**
   - Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito/)
   - Create a new user pool
   - Configure app client (enable client credentials flow)

2. **Create Resource Server (Optional):**
   - In your user pool, go to "App integration" → "Resource servers"
   - Create a resource server with identifier (e.g., `https://mcp.example.com`)
   - Define custom scopes if needed

3. **Get Configuration Values:**
   - **Issuer**: `https://cognito-idp.{region}.amazonaws.com/{user-pool-id}`
   - **JWKS URI**: `https://cognito-idp.{region}.amazonaws.com/{user-pool-id}/.well-known/jwks.json`
   - **Audience**: Your app client ID

4. **Configure Your MCP Server:**

```typescript
import { MCPServer, OAuthAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [process.env.COGNITO_ISSUER],
          resource: process.env.COGNITO_AUDIENCE,
          validation: {
            type: 'jwt',
            jwksUri: `${process.env.COGNITO_ISSUER}/.well-known/jwks.json`,
            audience: process.env.COGNITO_AUDIENCE,
            issuer: process.env.COGNITO_ISSUER
          }
        })
      }
    }
  }
});

await server.start();
```

5. **Environment Variables (.env):**

```bash
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX
COGNITO_AUDIENCE=1234567890abcdefghijklmnop
AWS_REGION=us-east-1
```

#### Testing with Cognito

```bash
curl -X POST https://your-domain.auth.us-east-1.amazoncognito.com/oauth2/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&scope=your_resource_server/scope'
```

---

### Azure AD / Entra ID

Microsoft Entra ID (formerly Azure AD) provides enterprise OAuth 2.1 support.

#### Setup Steps

1. **Register an Application:**
   - Go to [Azure Portal](https://portal.azure.com/)
   - Azure Active Directory → App registrations → New registration
   - Name your application (e.g., "MCP Server")

2. **Configure API Permissions:**
   - In your app registration, go to "Expose an API"
   - Add an Application ID URI (e.g., `api://mcp-server`)
   - Add scopes if needed

3. **Create Client Credentials:**
   - Go to "Certificates & secrets"
   - Create a new client secret
   - Save the secret value

4. **Get Configuration Values:**
   - **Issuer**: `https://login.microsoftonline.com/{tenant-id}/v2.0`
   - **JWKS URI**: `https://login.microsoftonline.com/{tenant-id}/discovery/v2.0/keys`
   - **Audience**: Your Application ID URI

5. **Configure Your MCP Server:**

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
            `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`
          ],
          resource: process.env.AZURE_AUDIENCE,
          validation: {
            type: 'jwt',
            jwksUri: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
            audience: process.env.AZURE_AUDIENCE,
            issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`
          }
        })
      }
    }
  }
});

await server.start();
```

6. **Environment Variables (.env):**

```bash
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_AUDIENCE=api://mcp-server
```

#### Testing with Azure AD

```bash
curl -X POST https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&scope=api://mcp-server/.default'
```

---

### Custom Authorization Server

If you're running your own OAuth authorization server, ensure it's RFC-compliant:

#### Requirements

Your authorization server must support:

1. **RFC 6749**: OAuth 2.0 Authorization Framework
2. **RFC 8414**: Authorization Server Metadata (recommended)
3. **RFC 7517**: JSON Web Key (JWK) for JWT validation
4. **RFC 7662**: Token Introspection (if using introspection)
5. **RFC 6750**: Bearer Token Usage

#### Endpoints Required

For **JWT validation**:
- `/.well-known/jwks.json` - JWKS endpoint with public keys

For **Token introspection**:
- `/oauth/introspect` - Token introspection endpoint (RFC 7662)

#### Configuration Example

```typescript
import { MCPServer, OAuthAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: ["https://your-auth-server.com"],
          resource: "https://mcp.example.com",
          validation: {
            type: 'jwt',
            jwksUri: "https://your-auth-server.com/.well-known/jwks.json",
            audience: "https://mcp.example.com",
            issuer: "https://your-auth-server.com"
          }
        })
      }
    }
  }
});

await server.start();
```

#### Testing Your Auth Server

Verify your authorization server is properly configured:

```bash
# Test JWKS endpoint
curl https://your-auth-server.com/.well-known/jwks.json

# Test authorization server metadata (optional but recommended)
curl https://your-auth-server.com/.well-known/oauth-authorization-server
```

---

## Advanced Configuration

### Multiple Authorization Servers

MCP Framework supports multiple authorization servers (useful for federation):

```typescript
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [
            "https://primary-auth.example.com",
            "https://backup-auth.example.com",
            "https://partner-auth.example.com"
          ],
          resource: "https://mcp.example.com",
          validation: {
            type: 'jwt',
            jwksUri: "https://primary-auth.example.com/.well-known/jwks.json",
            audience: "https://mcp.example.com",
            issuer: "https://primary-auth.example.com"
          }
        })
      }
    }
  }
});
```

### Custom Caching Configuration

Adjust cache TTLs for your use case:

```typescript
import { JWTValidator, IntrospectionValidator } from "mcp-framework";

// Custom JWT validator with shorter cache
const jwtValidator = new JWTValidator({
  jwksUri: "https://auth.example.com/.well-known/jwks.json",
  audience: "https://mcp.example.com",
  issuer: "https://auth.example.com",
  cacheTTL: 600000 // 10 minutes (default: 15 minutes)
});

// Custom introspection validator with longer cache
const introspectionValidator = new IntrospectionValidator({
  endpoint: "https://auth.example.com/oauth/introspect",
  clientId: "mcp-server",
  clientSecret: process.env.CLIENT_SECRET,
  cacheTTL: 600000 // 10 minutes (default: 5 minutes)
});
```

### Per-Endpoint Authentication Control

Control which endpoints require authentication:

```typescript
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      auth: {
        provider: new OAuthAuthProvider({
          // ... OAuth config
        }),
        endpoints: {
          initialize: true,   // Require auth for session creation
          messages: true      // Require auth for MCP messages
        }
      }
    }
  }
});
```

---

## Security Considerations

### HTTPS in Production

**Always use HTTPS in production.** OAuth tokens transmitted over HTTP can be intercepted.

```typescript
// ❌ DO NOT use in production
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080, // Unencrypted HTTP
      auth: { /* OAuth config */ }
    }
  }
});

// ✅ Production setup (behind HTTPS proxy/load balancer)
// Use nginx, Caddy, or AWS ALB to terminate TLS
```

### Token Storage

**Client-side recommendations:**
- Store tokens in secure, httpOnly cookies or secure storage
- Never store tokens in localStorage (XSS vulnerability)
- Use short-lived access tokens (15-60 minutes)
- Implement token refresh flow

### Audience Validation

Audience validation prevents token reuse across different services:

```typescript
// Each service should have a unique audience
const apiServer = new OAuthAuthProvider({
  resource: "https://api.example.com",  // ← Unique audience
  validation: {
    audience: "https://api.example.com" // ← Must match
  }
});

const mcpServer = new OAuthAuthProvider({
  resource: "https://mcp.example.com",  // ← Different audience
  validation: {
    audience: "https://mcp.example.com" // ← Must match
  }
});
```

### Token Scopes

While MCP Framework validates tokens, you can implement scope-based authorization in your tools:

```typescript
import { MCPTool, McpInput } from "mcp-framework";
import { z } from "zod";

class AdminTool extends MCPTool {
  name = "admin_action";
  description = "Admin-only action";
  schema = z.object({
    action: z.string().describe("Action to perform")
  });

  async execute(input: McpInput<this>, context?: any) {
    // Access token claims from auth context
    const claims = context?.auth?.data;

    if (!claims?.scope?.includes('admin')) {
      throw new Error('Insufficient permissions');
    }

    // Perform admin action
    return "Admin action completed";
  }
}
```

---

## Troubleshooting

### Common Issues

#### 1. "Invalid token signature"

**Cause:** JWKS endpoint returning wrong keys or keys don't match token

**Solution:**
```bash
# Verify JWKS endpoint is accessible
curl https://your-auth-server.com/.well-known/jwks.json

# Check token header for 'kid' (Key ID)
echo "YOUR_TOKEN" | cut -d'.' -f1 | base64 -d | jq

# Ensure kid matches a key in JWKS
```

#### 2. "Token audience invalid"

**Cause:** Token's `aud` claim doesn't match configured audience

**Solution:**
```typescript
// Ensure audience matches in both OAuth config and token
validation: {
  audience: "https://mcp.example.com" // Must match token's aud claim
}
```

Debug the token:
```bash
# Decode token to check audience
echo "YOUR_TOKEN" | cut -d'.' -f2 | base64 -d | jq .aud
```

#### 3. "Token has expired"

**Cause:** Token's `exp` claim is in the past

**Solution:**
- Request a new token from your authorization server
- Check system clock synchronization (tokens use Unix timestamps)
- Reduce token lifetime if tokens expire too quickly

#### 4. "JWKS endpoint unreachable"

**Cause:** Network issues or wrong JWKS URI

**Solution:**
```bash
# Test JWKS endpoint
curl -v https://your-auth-server.com/.well-known/jwks.json

# Check DNS resolution
nslookup your-auth-server.com

# Check firewall rules
```

#### 5. "Token introspection failed"

**Cause:** Introspection endpoint credentials incorrect or endpoint unavailable

**Solution:**
```typescript
// Verify introspection config
introspection: {
  endpoint: "https://auth.example.com/oauth/introspect", // Check URL
  clientId: "mcp-server",    // Verify client ID
  clientSecret: process.env.OAUTH_CLIENT_SECRET // Check secret
}
```

Test introspection manually:
```bash
curl -X POST https://auth.example.com/oauth/introspect \
  -u "client-id:client-secret" \
  -d "token=YOUR_TOKEN"
```

### Debug Logging

Enable debug logging to troubleshoot OAuth issues:

```bash
# Enable debug logging
MCP_DEBUG_CONSOLE=true node dist/index.js

# Enable file logging
MCP_ENABLE_FILE_LOGGING=true MCP_LOG_DIRECTORY=logs node dist/index.js
```

Look for OAuth-related log messages:
```
[INFO] OAuthAuthProvider initialized with JWT validation
[DEBUG] Token claims - sub: user-123, scope: read write
[ERROR] OAuth authentication failed: Token has expired
```

### Testing with curl

Test your OAuth setup with curl:

```bash
# 1. Get metadata endpoint
curl http://localhost:8080/.well-known/oauth-protected-resource

# 2. Try without token (should fail with 401)
curl -v -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

# 3. Try with invalid token (should fail with 401)
curl -v -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

# 4. Try with valid token (should succeed)
curl -v -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

---

## Migration Guide

### From JWT Provider to OAuth

If you're currently using the simple JWT provider:

**Before (JWT Provider):**
```typescript
import { MCPServer, JWTAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      auth: {
        provider: new JWTAuthProvider({
          secret: process.env.JWT_SECRET,
          algorithms: ["HS256"]
        })
      }
    }
  }
});
```

**After (OAuth Provider):**
```typescript
import { MCPServer, OAuthAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [process.env.OAUTH_ISSUER],
          resource: process.env.OAUTH_RESOURCE,
          validation: {
            type: 'jwt',
            jwksUri: process.env.OAUTH_JWKS_URI,
            audience: process.env.OAUTH_AUDIENCE,
            issuer: process.env.OAUTH_ISSUER
          }
        })
      }
    }
  }
});
```

**Key differences:**
- OAuth uses asymmetric keys (RS256/ES256) instead of symmetric (HS256)
- Tokens must come from a proper authorization server
- Automatic metadata endpoint at `/.well-known/oauth-protected-resource`
- Better security with audience validation

### From API Key to OAuth

**Before (API Key):**
```typescript
import { MCPServer, APIKeyAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "http-stream",
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

**After (OAuth):**
```typescript
import { MCPServer, OAuthAuthProvider } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [process.env.OAUTH_ISSUER],
          resource: process.env.OAUTH_RESOURCE,
          validation: {
            type: 'jwt',
            jwksUri: process.env.OAUTH_JWKS_URI,
            audience: process.env.OAUTH_AUDIENCE,
            issuer: process.env.OAUTH_ISSUER
          }
        })
      }
    }
  }
});
```

**Migration steps:**
1. Set up an OAuth authorization server (Auth0, Okta, etc.)
2. Update environment variables
3. Update client applications to obtain OAuth tokens
4. Test with both old and new auth (if gradual migration)
5. Switch over and retire API keys

---

## Additional Resources

- [MCP Specification - OAuth 2.1](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 6750 - Bearer Token Usage](https://datatracker.ietf.org/doc/html/rfc6750)
- [RFC 7662 - Token Introspection](https://datatracker.ietf.org/doc/html/rfc7662)
- [OAuth 2.1 Draft Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07)

---

**Need help?** Open an issue on [GitHub](https://github.com/QuantGeekDev/mcp-framework/issues) or check the [documentation](https://mcp-framework.com).
