# OAuth for MCP - User Story

## Story Title
Implement OAuth 2.1 Authorization for MCP Framework per 2025-06-18 Specification

## User Story

**As a** developer building MCP servers with mcp-framework
**I want** OAuth 2.1 authorization support compliant with the MCP specification (2025-06-18)
**So that** my MCP servers can securely authenticate clients using industry-standard OAuth flows and provide proper authorization metadata discovery

## Business Value

- **Standards Compliance**: Aligns with the latest MCP specification (2025-06-18) requiring OAuth 2.1 for MCP servers
- **Enterprise Readiness**: Enables enterprise adoption by supporting standard OAuth infrastructure
- **Security**: Provides robust authentication with PKCE, audience validation, and proper token handling
- **Interoperability**: Ensures MCP servers work with any OAuth 2.1 compliant authorization server (Auth0, Okta, AWS Cognito, etc.)
- **Developer Experience**: Simplifies server authentication setup with out-of-the-box OAuth support

## Current State

The mcp-framework currently provides:
- ✅ JWT-based authentication (custom implementation)
- ✅ API Key authentication
- ✅ Pluggable `AuthProvider` interface
- ✅ Transport-level authentication (SSE, HTTP Stream)

**Gap**: No OAuth 2.1 compliant authorization per MCP specification requirements

## Acceptance Criteria

### 1. OAuth 2.1 Authorization Provider
- [ ] Create `OAuthAuthProvider` class implementing the `AuthProvider` interface
- [ ] Support OAuth 2.1 with mandatory PKCE (Proof Key for Code Exchange)
- [ ] Validate access tokens from Authorization header: `Authorization: Bearer <token>`
- [ ] Validate token audience claims per RFC 8707 (Resource Indicators)
- [ ] Return HTTP 401 with proper `WWW-Authenticate` header for invalid/missing tokens
- [ ] Never accept tokens in URI query strings (security requirement)

### 2. Protected Resource Metadata (RFC 9728)
- [ ] Implement `/.well-known/oauth-protected-resource` metadata endpoint
- [ ] Expose `authorization_servers` array with at least one authorization server URL
- [ ] Include `resource` identifier for the MCP server
- [ ] Serve metadata as JSON with proper Content-Type header
- [ ] Make metadata publicly accessible (no authentication required)

### 3. WWW-Authenticate Challenge
- [ ] Return proper `WWW-Authenticate` header on HTTP 401 responses
- [ ] Include `error="invalid_token"` for expired/malformed tokens
- [ ] Include `error="insufficient_scope"` for authorization failures
- [ ] Include `resource` parameter pointing to MCP server identifier

### 4. Authorization Server Integration
- [ ] Support configuring one or more authorization server URLs
- [ ] Validate authorization server exposes OAuth 2.0 Authorization Server Metadata (RFC 8414) at `/.well-known/oauth-authorization-server`
- [ ] Support custom token introspection endpoints (optional)
- [ ] Support both local token validation (JWT) and remote validation (introspection)

### 5. Dynamic Client Registration Support (RFC 7591)
- [ ] Document how to configure authorization servers supporting Dynamic Client Registration
- [ ] Provide examples for common providers (Auth0, Okta, AWS Cognito)
- [ ] Support metadata indicating DCR endpoint availability

### 6. Token Validation
- [ ] Validate token signature (for JWT tokens)
- [ ] Validate token expiration (`exp` claim)
- [ ] Validate token audience (`aud` claim) matches MCP server resource identifier
- [ ] Validate token issuer (`iss` claim) matches configured authorization server
- [ ] Validate token is not used before `nbf` (not before) claim
- [ ] Support both symmetric (HS256) and asymmetric (RS256) token validation
- [ ] Cache public keys for asymmetric validation (JWKS support)

### 7. Configuration API
```typescript
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [
            "https://auth.example.com"
          ],
          resource: "https://mcp.example.com",
          validation: {
            type: "jwt",  // or "introspection"
            jwksUri: "https://auth.example.com/.well-known/jwks.json",
            audience: "https://mcp.example.com",
            issuer: "https://auth.example.com"
          },
          // Optional: for introspection-based validation
          introspection: {
            endpoint: "https://auth.example.com/oauth/introspect",
            clientId: "mcp-server",
            clientSecret: process.env.CLIENT_SECRET
          }
        })
      }
    }
  }
});
```

### 8. HTTP Transport Enhancements
- [ ] Ensure all OAuth endpoints work with HTTP Stream transport
- [ ] Ensure all OAuth endpoints work with SSE transport
- [ ] Add OAuth-specific CORS headers when configured
- [ ] Support OAuth for both batch and stream response modes

### 9. Documentation
- [ ] Add OAuth setup guide to README
- [ ] Document configuration options for OAuthAuthProvider
- [ ] Provide examples for Auth0, Okta, AWS Cognito integration
- [ ] Document metadata endpoint structure
- [ ] Add security best practices documentation
- [ ] Document token validation strategies (JWT vs introspection)
- [ ] Update CLAUDE.md with OAuth architecture details

### 10. Testing
- [ ] Unit tests for OAuthAuthProvider token validation
- [ ] Unit tests for metadata endpoint responses
- [ ] Integration tests with mock authorization server
- [ ] Tests for WWW-Authenticate header generation
- [ ] Tests for audience validation
- [ ] Tests for expired token rejection
- [ ] Tests for missing authorization header
- [ ] Tests for malformed tokens

### 11. CLI Support
- [ ] `mcp create` command includes OAuth template option
- [ ] Generate OAuth configuration scaffold
- [ ] Include `.env.example` with OAuth variables

## Technical Implementation Notes

### Required RFCs to Implement
1. **OAuth 2.1** (draft-ietf-oauth-v2-1-13) - Base authorization framework
2. **RFC 9728** - OAuth 2.0 Protected Resource Metadata
3. **RFC 8707** - Resource Indicators for OAuth 2.0
4. **RFC 8414** - OAuth 2.0 Authorization Server Metadata (client discovery)
5. **RFC 7591** - OAuth 2.0 Dynamic Client Registration Protocol (optional)

### Architecture Changes

```
src/auth/
├── providers/
│   ├── jwt.ts (existing)
│   ├── apikey.ts (existing)
│   └── oauth.ts (NEW - OAuthAuthProvider)
├── validators/
│   ├── jwt-validator.ts (NEW)
│   └── introspection-validator.ts (NEW)
└── metadata/
    └── protected-resource.ts (NEW)

src/transports/
├── http/
│   └── middleware/
│       └── oauth-metadata.ts (NEW - /.well-known endpoint)
└── sse/
    └── middleware/
        └── oauth-metadata.ts (NEW - /.well-known endpoint)
```

### Security Considerations
- **HTTPS Only**: OAuth endpoints must use HTTPS in production
- **No Token Leakage**: Never log or expose tokens in error messages
- **Audience Validation**: Critical for preventing token reuse across resources
- **Token Scope**: Support scope validation if authorization server provides scopes
- **Rate Limiting**: Consider rate limiting for metadata endpoints
- **CORS Configuration**: Properly configure CORS for OAuth flows

### Performance Considerations
- **JWKS Caching**: Cache public keys to avoid repeated fetches
- **Token Validation Caching**: Cache valid tokens (with short TTL) to reduce validation overhead
- **Metadata Caching**: Serve metadata from memory, not re-generated per request

## Out of Scope
- Authorization Server implementation (only client/resource server side)
- Custom OAuth grant types beyond authorization code
- OAuth 1.0 support
- SAML integration
- Custom authentication protocols

## Dependencies
- `jsonwebtoken` (already installed) - for JWT validation
- `jwks-rsa` (NEW) - for JWKS key fetching and caching
- `node-fetch` or native fetch - for authorization server metadata discovery

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Code reviewed and approved
- [ ] Unit tests passing with >80% coverage
- [ ] Integration tests passing
- [ ] Documentation complete and reviewed
- [ ] CLAUDE.md updated with OAuth architecture
- [ ] Example implementation created and tested
- [ ] No security vulnerabilities identified
- [ ] Backward compatible with existing auth providers

## Related Specifications
- [MCP Authorization Spec (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
- [RFC 9728 - Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728.html)
- [RFC 8707 - Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
- [RFC 8414 - Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414.html)
- [RFC 7591 - Dynamic Client Registration](https://www.rfc-editor.org/rfc/rfc7591.html)

## Story Points
**Estimate**: 13 points (Large/Complex)

**Rationale**:
- Multiple RFC implementations required
- New middleware and validation layer
- Extensive testing requirements
- Documentation and examples needed
- Security-critical implementation

## Priority
**High** - Required for MCP specification compliance and enterprise adoption
