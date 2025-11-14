# OAuth 2.1 Implementation Plan for MCP Framework

**Project**: mcp-framework
**Feature**: OAuth 2.1 Authorization per MCP Specification 2025-06-18
**Related**: OAUTH_USER_STORY.md
**Estimated Timeline**: 30-40 hours (~1-2 weeks)

---

## Overview

Implement OAuth 2.1 authorization compliant with MCP specification 2025-06-18, including:
- Protected Resource Metadata (RFC 9728)
- Resource Indicators (RFC 8707)
- Authorization Server Metadata discovery (RFC 8414)
- Proper token validation with JWKS support
- WWW-Authenticate challenge headers (RFC 6750)

## Current State Analysis

### Strengths
✅ Clean `AuthProvider` interface that's OAuth-ready
✅ Per-endpoint auth control provides flexibility
✅ SSE transport has mature auth implementation
✅ CORS handling is well-structured
✅ Configuration flow from MCPServer to transports is clear

### Critical Gaps
❌ **HTTP Stream transport accepts auth config but never validates it** (bug)
❌ No OAuth 2.1 provider implementation
❌ No metadata endpoints for discovery
❌ No async token validation (JWKS support)
❌ No test coverage for authentication

---

## Phase 1: Foundation & Bug Fixes
**Duration**: 3-4 hours
**Priority**: Critical (prerequisite for OAuth)

### 1.1 Fix HTTP Stream Authentication
**Problem**: HTTP Stream transport has a critical bug - it accepts auth configuration but never enforces authentication.

**Files to Modify**:
- `src/transports/http/server.ts`
- `src/transports/http/types.ts`

**Tasks**:
1. Add authentication enforcement in `HttpStreamTransport.handleMcpRequest()`
2. Implement `handleAuthentication()` method following SSE pattern
3. Add per-endpoint control:
   - Initialize endpoint (session creation)
   - Message endpoint (MCP requests)
4. Change `auth?: any` to `auth?: AuthConfig` in HttpStreamTransportConfig
5. Test with existing JWT and API Key providers
6. Verify consistency with SSE transport behavior

**Acceptance Criteria**:
- [ ] HTTP Stream transport validates auth when configured
- [ ] Per-endpoint control works (initialize vs messages)
- [ ] Existing JWT provider works with HTTP Stream
- [ ] Existing API Key provider works with HTTP Stream
- [ ] No breaking changes to existing configurations

### 1.2 Add Dependencies
**File**: `package.json`

**Tasks**:
1. Add `jwks-rsa` (JWKS key fetching and caching)
2. Add `@types/jwks-rsa` (TypeScript types)
3. Run `npm install` and verify build succeeds
4. Update package-lock.json

**Dependencies**:
```json
{
  "dependencies": {
    "jwks-rsa": "^3.1.0"
  },
  "devDependencies": {
    "@types/jwks-rsa": "^3.0.0"
  }
}
```

---

## Phase 2: OAuth Provider Core
**Duration**: 6-8 hours
**Priority**: Critical

### 2.1 Create Token Validators

#### JWT Validator
**File**: `src/auth/validators/jwt-validator.ts`

**Features**:
- Async JWT validation with JWKS support using `jwks-rsa`
- Fetch and cache public keys from authorization server
- Validate signature (RS256, ES256 support)
- Validate claims:
  - `exp` (expiration) - reject expired tokens
  - `aud` (audience) - must match MCP server resource identifier
  - `iss` (issuer) - must match configured authorization server
  - `nbf` (not before) - honor not-before timestamp
  - `sub` (subject) - extract user/client identity
- Handle JWKS key rotation gracefully
- Cache keys with configurable TTL (default: 15 minutes)
- Comprehensive error handling with specific error messages

**Interface**:
```typescript
export interface JWTValidationConfig {
  jwksUri: string;
  audience: string;
  issuer: string;
  algorithms?: string[];  // default: ['RS256', 'ES256']
  cacheTTL?: number;      // default: 900000 (15 minutes)
}

export class JWTValidator {
  constructor(config: JWTValidationConfig);
  async validate(token: string): Promise<TokenClaims>;
}
```

**Acceptance Criteria**:
- [ ] Fetches JWKS from authorization server
- [ ] Caches keys efficiently (avoids repeated fetches)
- [ ] Validates all required claims
- [ ] Rejects expired tokens
- [ ] Rejects tokens with wrong audience
- [ ] Handles key rotation
- [ ] Returns decoded claims on success

#### Introspection Validator
**File**: `src/auth/validators/introspection-validator.ts`

**Features**:
- OAuth token introspection per RFC 7662
- Support client authentication (client_id/client_secret)
- POST to introspection endpoint with token
- Parse introspection response (active/inactive)
- Cache introspection results with TTL (reduce load on auth server)
- Handle network errors gracefully

**Interface**:
```typescript
export interface IntrospectionConfig {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  cacheTTL?: number;  // default: 300000 (5 minutes)
}

export class IntrospectionValidator {
  constructor(config: IntrospectionConfig);
  async validate(token: string): Promise<TokenClaims>;
}
```

**Acceptance Criteria**:
- [ ] Calls introspection endpoint with proper auth
- [ ] Parses active/inactive responses
- [ ] Caches results to reduce API calls
- [ ] Handles network failures gracefully
- [ ] Returns standardized claims format

### 2.2 Create OAuth Auth Provider
**File**: `src/auth/providers/oauth.ts`

**Features**:
- Implement `OAuthAuthProvider` class extending `AuthProvider` interface
- Support both JWT and introspection validation modes
- Extract Bearer token from Authorization header
- Validate tokens using appropriate validator
- Return `AuthResult` with token claims (sub, scope, etc.)
- Generate RFC 6750 compliant WWW-Authenticate headers
- Never accept tokens from URI query strings (security requirement)
- Comprehensive error handling and logging

**Interface**:
```typescript
export interface OAuthConfig {
  // Authorization server configuration
  authorizationServers: string[];  // For metadata endpoint
  resource: string;                 // This MCP server's identifier

  // Token validation strategy
  validation: {
    type: 'jwt' | 'introspection';
    audience: string;
    issuer: string;

    // For JWT validation
    jwksUri?: string;
    algorithms?: string[];

    // For introspection validation
    introspection?: {
      endpoint: string;
      clientId: string;
      clientSecret: string;
    };
  };

  // Optional: custom header name (default: "Authorization")
  headerName?: string;
}

export class OAuthAuthProvider implements AuthProvider {
  constructor(config: OAuthConfig);

  async authenticate(req: IncomingMessage): Promise<boolean | AuthResult>;

  getAuthError(): { status: number; message: string };

  // Generate WWW-Authenticate challenge header
  getWWWAuthenticateHeader(error?: string): string;
}
```

**WWW-Authenticate Header Format** (RFC 6750):
```
WWW-Authenticate: Bearer realm="MCP Server",
                  resource="https://mcp.example.com",
                  error="invalid_token",
                  error_description="The access token expired"
```

**Acceptance Criteria**:
- [ ] Extracts Bearer token from Authorization header
- [ ] Rejects tokens in query strings
- [ ] Validates tokens using configured strategy
- [ ] Returns AuthResult with claims on success
- [ ] Returns false on validation failure
- [ ] Generates proper WWW-Authenticate headers
- [ ] Logs authentication attempts appropriately
- [ ] Handles missing Authorization header
- [ ] Handles malformed tokens

---

## Phase 3: Metadata Endpoints
**Duration**: 3-4 hours
**Priority**: Critical (required by MCP spec)

### 3.1 Protected Resource Metadata
**File**: `src/auth/metadata/protected-resource.ts`

**Features**:
- Generate RFC 9728 compliant Protected Resource Metadata
- Support multiple authorization servers
- Provide resource identifier
- Serve as JSON with proper Content-Type

**Interface**:
```typescript
export interface OAuthMetadataConfig {
  authorizationServers: string[];
  resource: string;
}

export class ProtectedResourceMetadata {
  constructor(config: OAuthMetadataConfig);

  generateMetadata(): {
    resource: string;
    authorization_servers: string[];
  };

  toJSON(): string;
}
```

**Metadata Format** (RFC 9728):
```json
{
  "resource": "https://mcp.example.com",
  "authorization_servers": [
    "https://auth.example.com",
    "https://backup-auth.example.com"
  ]
}
```

**Acceptance Criteria**:
- [ ] Generates valid RFC 9728 metadata
- [ ] Supports multiple authorization servers
- [ ] Returns proper JSON format
- [ ] Validates configuration on construction

### 3.2 Integrate Metadata Endpoints in Transports

#### SSE Transport
**File**: `src/transports/sse/server.ts`

**Tasks**:
1. Add `/.well-known/oauth-protected-resource` route in `handleRequest()`
2. Insert before SSE connection handling (around line 116)
3. Serve metadata as JSON
4. Set `Content-Type: application/json` header
5. Apply CORS headers
6. No authentication required (public endpoint per RFC 9728)

**Code Location**:
```typescript
// In handleRequest(), before SSE handling
if (req.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
  await this.handleOAuthMetadata(req, res);
  return;
}
```

**Acceptance Criteria**:
- [ ] Endpoint accessible at `/.well-known/oauth-protected-resource`
- [ ] Returns proper JSON with Content-Type header
- [ ] Publicly accessible (no auth required)
- [ ] CORS headers applied
- [ ] Only responds to GET requests

#### HTTP Stream Transport
**File**: `src/transports/http/server.ts`

**Tasks**:
1. Add same metadata endpoint route
2. Ensure consistent behavior with SSE transport
3. Integrate into request router (around line 49)
4. Apply CORS headers
5. Return metadata from configuration

**Acceptance Criteria**:
- [ ] Same endpoint behavior as SSE transport
- [ ] Consistent response format
- [ ] CORS headers applied
- [ ] No authentication required

---

## Phase 4: Configuration & Types
**Duration**: 2-3 hours
**Priority**: High

### 4.1 Type Definitions

#### Export OAuth Types
**File**: `src/auth/index.ts`

**Tasks**:
1. Export `OAuthAuthProvider`
2. Export `OAuthConfig`
3. Export validator types (optional, if needed publicly)
4. Maintain backward compatibility

**Changes**:
```typescript
export * from './providers/oauth.js';
export type { OAuthConfig } from './providers/oauth.js';
export type { JWTValidationConfig } from './validators/jwt-validator.js';
export type { IntrospectionConfig } from './validators/introspection-validator.js';
```

#### Public API Exports
**File**: `src/index.ts`

**Tasks**:
1. Export OAuthAuthProvider from main entry point
2. Export OAuthConfig type
3. Ensure tree-shaking works properly

**Changes**:
```typescript
export { OAuthAuthProvider } from './auth/providers/oauth.js';
export type { OAuthConfig } from './auth/providers/oauth.js';
```

### 4.2 Configuration Flow

**Tasks**:
1. Verify OAuth config flows: MCPServer → TransportConfig → Transport
2. Update MCPServer to pass metadata config to transports
3. Validate authorization server URLs on initialization
4. Provide helpful error messages for invalid config

**Files**:
- `src/core/MCPServer.ts` (may need minor updates)
- `src/transports/http/types.ts` (already updated in Phase 1)
- `src/transports/sse/types.ts` (verify compatibility)

**Acceptance Criteria**:
- [ ] OAuth config properly propagates to transports
- [ ] Metadata config accessible in transport handlers
- [ ] Invalid configurations caught early with clear errors
- [ ] Backward compatible with existing auth configs

---

## Phase 5: Testing
**Duration**: 8-10 hours
**Priority**: Critical

### 5.1 Unit Tests

#### OAuth Provider Tests
**File**: `tests/auth/providers/oauth.test.ts`

**Test Cases**:
- [ ] Token extraction from Authorization header (Bearer scheme)
- [ ] Rejection of tokens in query strings
- [ ] Audience validation (valid, invalid, missing)
- [ ] Token expiration handling
- [ ] Issuer validation
- [ ] WWW-Authenticate header generation (various error types)
- [ ] Both JWT and introspection validation modes
- [ ] Missing Authorization header handling
- [ ] Malformed token handling
- [ ] Claims extraction and AuthResult format

#### JWT Validator Tests
**File**: `tests/auth/validators/jwt-validator.test.ts`

**Test Cases**:
- [ ] JWKS fetching from authorization server
- [ ] Key caching behavior (cache hit/miss)
- [ ] Signature validation (RS256, ES256)
- [ ] Claim validation (exp, aud, iss, nbf, sub)
- [ ] Expired token rejection
- [ ] Future token rejection (nbf not yet valid)
- [ ] Wrong audience rejection
- [ ] Wrong issuer rejection
- [ ] Malformed JWT handling
- [ ] JWKS endpoint unavailable handling
- [ ] Key rotation simulation

**Test Data Needed**:
- Generate test JWTs with various claims
- Mock JWKS endpoint with rotating keys
- Create expired and future-dated tokens

#### Introspection Validator Tests
**File**: `tests/auth/validators/introspection-validator.test.ts`

**Test Cases**:
- [ ] Introspection endpoint calls with proper auth
- [ ] Active token response parsing
- [ ] Inactive token response handling
- [ ] Caching behavior (cache hit/miss)
- [ ] Client authentication (Basic Auth)
- [ ] Network error handling
- [ ] Timeout handling
- [ ] Invalid response format handling
- [ ] Cache TTL expiration

**Test Data Needed**:
- Mock introspection endpoint
- Various introspection response formats
- Network failure scenarios

#### Protected Resource Metadata Tests
**File**: `tests/auth/metadata/protected-resource.test.ts`

**Test Cases**:
- [ ] Metadata JSON generation
- [ ] Multiple authorization servers
- [ ] Resource identifier inclusion
- [ ] JSON format validation
- [ ] Invalid configuration handling

### 5.2 Integration Tests

#### HTTP Stream OAuth Integration
**File**: `tests/transports/http/oauth-integration.test.ts`

**Test Cases**:
- [ ] Metadata endpoint accessibility (GET /.well-known/oauth-protected-resource)
- [ ] Metadata response format and headers
- [ ] Authenticated requests with valid OAuth tokens
- [ ] 401 responses with WWW-Authenticate headers
- [ ] Token validation in batch mode
- [ ] Token validation in stream mode
- [ ] Session association with OAuth identity
- [ ] Per-endpoint auth control (initialize vs messages)

#### SSE OAuth Integration
**File**: `tests/transports/sse/oauth-integration.test.ts`

**Test Cases**:
- [ ] Metadata endpoint accessibility
- [ ] SSE connection with OAuth authentication
- [ ] Message endpoint with OAuth authentication
- [ ] Per-endpoint control (SSE connection vs messages)
- [ ] 401 response format and headers
- [ ] CORS headers on all responses

### 5.3 Mock Authorization Server

**File**: `tests/fixtures/mock-auth-server.ts`

**Features**:
- Mock JWKS endpoint (`/.well-known/jwks.json`)
- Mock introspection endpoint (`/oauth/introspect`)
- Mock authorization server metadata (`/.well-known/oauth-authorization-server`)
- Generate test tokens with various claims
- Simulate key rotation
- Configurable response delays and errors

**Test Tokens**:
- Valid token (all claims correct)
- Expired token
- Wrong audience token
- Wrong issuer token
- Future-dated token (nbf)
- Token with custom scopes
- Malformed token

**Acceptance Criteria**:
- [ ] Provides realistic OAuth server behavior
- [ ] Supports all test scenarios
- [ ] Can simulate failures (network, invalid responses)
- [ ] Generates cryptographically valid JWTs

### 5.4 Test Coverage Goals
- **Target**: >80% coverage (per user story)
- **Critical Paths**: 100% coverage for security-related code
  - Token validation logic
  - Audience validation
  - WWW-Authenticate header generation
  - Authorization header parsing

---

## Phase 6: Documentation
**Duration**: 4-5 hours
**Priority**: High

### 6.1 Update README.md

**Sections to Add**:

#### OAuth Authentication Section
```markdown
### OAuth 2.1 Authentication

MCP Framework supports OAuth 2.1 authentication per the MCP specification 2025-06-18.

#### Configuration

[Configuration examples here]

#### Supported Validation Strategies

1. **JWT Validation** (recommended for performance)
2. **Token Introspection** (recommended for centralized control)

[Details and trade-offs]

#### Security Best Practices

[Security guidance]
```

**Content**:
- Configuration examples for both JWT and introspection
- Security best practices (HTTPS only, token handling, etc.)
- Common pitfalls and troubleshooting
- Links to detailed OAuth guide

### 6.2 Create OAuth Setup Guide

**File**: `docs/OAUTH.md` (or add comprehensive section to README)

**Outline**:

1. **Introduction**
   - What is OAuth in MCP?
   - When to use OAuth vs JWT vs API Key

2. **Quick Start**
   - Minimal OAuth configuration
   - Testing with mock authorization server

3. **Authorization Server Setup**
   - Requirements for MCP-compatible auth server
   - Required endpoints and metadata
   - Configuration checklist

4. **Provider Integration Guides**

   a. **Auth0**
   - Create application in Auth0
   - Configure redirect URIs
   - Get JWKS URI and issuer
   - Example configuration

   b. **Okta**
   - Create OAuth application
   - Configure authorization server
   - Example configuration

   c. **AWS Cognito**
   - Create user pool and app client
   - Configure OAuth scopes
   - Get JWKS URI
   - Example configuration

   d. **Custom Authorization Server**
   - Requirements (RFC compliance)
   - Endpoint structure
   - Testing metadata

5. **Token Validation Strategies**
   - JWT vs Introspection comparison
   - Performance considerations
   - Security trade-offs
   - When to use each

6. **Advanced Configuration**
   - Multiple authorization servers
   - Custom scopes and claims
   - Token caching strategies
   - JWKS key rotation handling

7. **Security Considerations**
   - HTTPS enforcement
   - Token storage (client side)
   - Audience validation importance
   - Scope-based authorization (future)

8. **Troubleshooting**
   - Common error messages
   - Debug logging
   - Testing with curl
   - Authorization server compatibility

9. **Migration Guide**
   - Moving from JWT provider to OAuth
   - Moving from API Key to OAuth
   - Backward compatibility notes

**Acceptance Criteria**:
- [ ] Complete setup guide for 3+ auth providers
- [ ] Working code examples for each provider
- [ ] Security best practices documented
- [ ] Troubleshooting section with common issues
- [ ] Migration guide from existing auth methods

### 6.3 Update CLAUDE.md

**Add Section**: OAuth Authentication Architecture

**Content**:
```markdown
### OAuth 2.1 Authentication

The framework implements OAuth 2.1 per MCP specification 2025-06-18:

**Components:**
- OAuthAuthProvider: Main provider implementing AuthProvider interface
- JWTValidator: Async JWT validation with JWKS support
- IntrospectionValidator: OAuth token introspection (RFC 7662)
- ProtectedResourceMetadata: RFC 9728 metadata generation

**Metadata Endpoint:**
- Path: `/.well-known/oauth-protected-resource`
- Public (no auth required)
- Returns authorization server URLs and resource identifier

**Token Validation:**
- Supports JWT (RS256, ES256) and introspection
- Validates: signature, expiration, audience, issuer
- JWKS key caching for performance

**Security:**
- Tokens must be in Authorization header (Bearer scheme)
- Tokens in query strings rejected
- Audience validation prevents token reuse
- WWW-Authenticate challenges per RFC 6750

**Configuration:**
[Example configuration code]
```

**Acceptance Criteria**:
- [ ] OAuth architecture clearly explained
- [ ] Integration points documented
- [ ] Security model described
- [ ] Links to detailed documentation

### 6.4 Code Examples

**File**: `examples/oauth-server/` (new directory)

**Contents**:
- `index.ts` - Complete MCP server with OAuth
- `package.json` - Dependencies
- `.env.example` - Configuration template
- `README.md` - Setup instructions

**Example Configuration**:
```typescript
import { MCPServer, OAuthAuthProvider } from 'mcp-framework';

const server = new MCPServer({
  transport: {
    type: 'http-stream',
    options: {
      port: 8080,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [
            process.env.OAUTH_AUTHORIZATION_SERVER!
          ],
          resource: process.env.OAUTH_RESOURCE!,
          validation: {
            type: 'jwt',
            jwksUri: process.env.OAUTH_JWKS_URI!,
            audience: process.env.OAUTH_AUDIENCE!,
            issuer: process.env.OAUTH_ISSUER!
          }
        })
      }
    }
  }
});

await server.start();
```

**.env.example**:
```bash
# Authorization Server Configuration
OAUTH_AUTHORIZATION_SERVER=https://auth.example.com
OAUTH_RESOURCE=https://mcp.example.com

# JWT Validation
OAUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
OAUTH_AUDIENCE=https://mcp.example.com
OAUTH_ISSUER=https://auth.example.com

# OR: Introspection Validation
# OAUTH_INTROSPECTION_ENDPOINT=https://auth.example.com/oauth/introspect
# OAUTH_CLIENT_ID=mcp-server
# OAUTH_CLIENT_SECRET=your-client-secret
```

**Acceptance Criteria**:
- [ ] Working example that can be run
- [ ] Clear setup instructions
- [ ] Shows both JWT and introspection modes
- [ ] Includes error handling examples

---

## Phase 7: CLI & Templates
**Duration**: 3-4 hours
**Priority**: Medium

### 7.1 Update Project Templates

**Files**:
- `src/cli/templates/` (various template files)
- `src/cli/project/create.ts`

**Features**:
- Add `--oauth` flag to `mcp create` command
- Generate OAuth-ready project configuration
- Include OAuth provider imports
- Add .env.example with OAuth variables

**Example**:
```bash
# Create project with OAuth template
mcp create my-server --oauth

# Generated files include:
# - src/index.ts (with OAuthAuthProvider)
# - .env.example (with OAuth variables)
# - README.md (with OAuth setup instructions)
```

**Template Content** (src/index.ts):
```typescript
import { MCPServer, OAuthAuthProvider } from 'mcp-framework';

const server = new MCPServer({
  transport: {
    type: 'http-stream',
    options: {
      port: process.env.PORT || 8080,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [
            process.env.OAUTH_AUTHORIZATION_SERVER || 'https://auth.example.com'
          ],
          resource: process.env.OAUTH_RESOURCE || 'https://mcp.example.com',
          validation: {
            type: process.env.OAUTH_VALIDATION_TYPE === 'introspection' ? 'introspection' : 'jwt',
            jwksUri: process.env.OAUTH_JWKS_URI,
            audience: process.env.OAUTH_AUDIENCE,
            issuer: process.env.OAUTH_ISSUER,
            introspection: process.env.OAUTH_VALIDATION_TYPE === 'introspection' ? {
              endpoint: process.env.OAUTH_INTROSPECTION_ENDPOINT!,
              clientId: process.env.OAUTH_CLIENT_ID!,
              clientSecret: process.env.OAUTH_CLIENT_SECRET!
            } : undefined
          }
        })
      }
    }
  }
});

server.start();
```

**.env.example Template**:
```bash
# Server Configuration
PORT=8080

# OAuth Configuration (choose JWT or introspection)
OAUTH_AUTHORIZATION_SERVER=https://auth.example.com
OAUTH_RESOURCE=https://mcp.example.com

# For JWT validation (recommended)
OAUTH_VALIDATION_TYPE=jwt
OAUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
OAUTH_AUDIENCE=https://mcp.example.com
OAUTH_ISSUER=https://auth.example.com

# For introspection validation (uncomment if needed)
# OAUTH_VALIDATION_TYPE=introspection
# OAUTH_INTROSPECTION_ENDPOINT=https://auth.example.com/oauth/introspect
# OAUTH_CLIENT_ID=your-client-id
# OAUTH_CLIENT_SECRET=your-client-secret
```

**README Template Section**:
```markdown
## OAuth Setup

This server uses OAuth 2.1 authentication. Configure your authorization server:

1. Set up an OAuth authorization server (Auth0, Okta, AWS Cognito, etc.)
2. Copy `.env.example` to `.env`
3. Fill in your OAuth configuration
4. Run `npm start`

See [OAuth Setup Guide](https://github.com/QuantGeekDev/mcp-framework#oauth-authentication) for detailed instructions.
```

**Acceptance Criteria**:
- [ ] `mcp create --oauth` generates OAuth-ready project
- [ ] All OAuth configuration in .env.example
- [ ] Clear setup instructions in generated README
- [ ] Template works out-of-box with valid OAuth config
- [ ] Backward compatible (default templates unchanged)

### 7.2 Update CLI Help

**File**: `src/cli/index.ts`

**Tasks**:
- Add `--oauth` flag documentation
- Update help text for `mcp create`
- Add examples of OAuth project creation

**Example**:
```bash
$ mcp create --help

Usage: mcp create <project-name> [options]

Options:
  --http          Use HTTP transport instead of default stdio
  --port <port>   Specify HTTP port (default: 8080)
  --cors          Enable CORS with wildcard (*) access
  --oauth         Configure OAuth 2.1 authentication
  -h, --help      Display help for command

Examples:
  $ mcp create my-server
  $ mcp create my-server --http --port 3000
  $ mcp create my-server --http --oauth
```

**Acceptance Criteria**:
- [ ] `--oauth` flag documented in help
- [ ] Examples include OAuth usage
- [ ] Clear explanation of what --oauth does

---

## Phase 8: Validation & Polish
**Duration**: 2-3 hours
**Priority**: High

### 8.1 Security Review

**Review Checklist**:

#### HTTPS Enforcement
- [ ] Verify production requires HTTPS
- [ ] Document HTTPS requirement clearly
- [ ] Warn on HTTP usage in production

#### Token Handling
- [ ] Tokens never appear in logs (even debug logs)
- [ ] Tokens never in error messages
- [ ] Tokens never in query strings
- [ ] Tokens never forwarded to upstream APIs

#### Validation Security
- [ ] Audience validation prevents token reuse across resources
- [ ] Issuer validation prevents rogue auth servers
- [ ] Expiration always checked
- [ ] Signature verification mandatory for JWTs
- [ ] No eval() or similar dangerous code

#### Headers & Responses
- [ ] WWW-Authenticate header properly formatted
- [ ] CORS headers don't expose sensitive info
- [ ] Error messages don't leak implementation details
- [ ] Rate limiting considered for metadata endpoint

#### Configuration Security
- [ ] Secrets not in code or logs
- [ ] .env.example has placeholders (no real secrets)
- [ ] Documentation emphasizes secret management
- [ ] Client secrets properly protected (introspection)

**Security Testing**:
- [ ] Test with expired tokens
- [ ] Test with wrong audience
- [ ] Test with modified signatures
- [ ] Test token replay attacks
- [ ] Test CORS bypass attempts

### 8.2 Performance Testing

**Performance Benchmarks**:

#### JWKS Caching
- [ ] Measure cache hit/miss ratio
- [ ] Verify cache reduces auth server load
- [ ] Test cache expiration and refresh
- [ ] Compare cached vs uncached performance

**Target**:
- First request (cache miss): <200ms
- Cached requests: <10ms
- Cache hit rate: >95% in normal operation

#### Token Validation
- [ ] Benchmark JWT validation speed
- [ ] Benchmark introspection speed
- [ ] Compare JWT vs introspection performance
- [ ] Test under load (concurrent requests)

**Target**:
- JWT validation: <10ms
- Introspection (cached): <20ms
- Introspection (uncached): <100ms

#### Metadata Endpoint
- [ ] Verify metadata serves from memory (no file I/O)
- [ ] Test response time under load
- [ ] Ensure no blocking operations

**Target**: <5ms per request

#### Overall Impact
- [ ] Measure auth overhead on request latency
- [ ] Compare to no-auth baseline
- [ ] Ensure no memory leaks (long-running tests)

**Target**: <20ms auth overhead per request (JWT mode)

### 8.3 Backward Compatibility Testing

**Test Scenarios**:

#### Existing JWT Provider
- [ ] JWT provider continues to work unchanged
- [ ] All existing configurations valid
- [ ] No performance regression
- [ ] Error messages unchanged

#### Existing API Key Provider
- [ ] API Key provider continues to work
- [ ] All existing configurations valid
- [ ] WWW-Authenticate header unchanged
- [ ] Behavior identical to pre-OAuth

#### Existing Configurations
- [ ] Servers without auth still work
- [ ] SSE transport backward compatible
- [ ] HTTP Stream transport backward compatible (with auth bug fixed)
- [ ] All existing CLI commands work

#### Public API
- [ ] No breaking changes to exported types
- [ ] No breaking changes to interfaces
- [ ] New exports are additive only
- [ ] TypeScript compilation succeeds for old code

**Acceptance Criteria**:
- [ ] All existing test suites pass
- [ ] No breaking changes in semver
- [ ] Migration guide provided if any deprecations
- [ ] Clear changelog entry

### 8.4 Code Quality

**Code Review Checklist**:
- [ ] All code follows project style guide (ESLint passes)
- [ ] All code formatted with Prettier
- [ ] No TypeScript errors or warnings
- [ ] All public APIs have JSDoc comments
- [ ] Complex logic has inline comments
- [ ] Error messages are clear and actionable
- [ ] Logging is consistent with framework conventions

**Static Analysis**:
- [ ] Run `npm run lint` - no errors
- [ ] Run `npm run format` - all files formatted
- [ ] Run `npm run build` - successful compilation
- [ ] TypeScript strict mode compliance

---

## Success Metrics

### Functional Requirements
✅ All acceptance criteria from OAUTH_USER_STORY.md met
✅ MCP specification 2025-06-18 compliant
✅ OAuth 2.1 with PKCE support
✅ RFC 9728 (Protected Resource Metadata) implemented
✅ RFC 8707 (Resource Indicators) implemented
✅ RFC 6750 (WWW-Authenticate) implemented

### Quality Requirements
✅ Test coverage >80%
✅ All tests passing (unit + integration)
✅ No security vulnerabilities identified
✅ Performance targets met
✅ Code quality checks pass

### Documentation Requirements
✅ OAuth setup guide complete
✅ 3+ provider integration examples
✅ API documentation complete
✅ CLAUDE.md updated
✅ Code examples working

### Compatibility Requirements
✅ No breaking changes to existing auth
✅ HTTP Stream auth bug fixed
✅ Existing JWT provider works
✅ Existing API Key provider works
✅ Backward compatible configuration

---

## File Structure Summary

### New Files (8 files)
```
src/auth/
├── providers/
│   └── oauth.ts                          (OAuth provider)
├── validators/
│   ├── jwt-validator.ts                  (JWT validation with JWKS)
│   └── introspection-validator.ts        (Token introspection)
└── metadata/
    └── protected-resource.ts             (RFC 9728 metadata)

tests/auth/
├── providers/
│   └── oauth.test.ts
├── validators/
│   ├── jwt-validator.test.ts
│   └── introspection-validator.test.ts
└── metadata/
    └── protected-resource.test.ts

tests/transports/
├── http/
│   └── oauth-integration.test.ts
└── sse/
    └── oauth-integration.test.ts

tests/fixtures/
└── mock-auth-server.ts

examples/
└── oauth-server/
    ├── index.ts
    ├── package.json
    ├── .env.example
    └── README.md

docs/
└── OAUTH.md                              (OAuth setup guide)
```

### Modified Files (6+ files)
```
src/transports/
├── http/
│   ├── server.ts                         (Add auth + metadata endpoint)
│   └── types.ts                          (Fix auth type)
└── sse/
    └── server.ts                         (Add metadata endpoint)

src/auth/
└── index.ts                              (Export OAuth types)

src/
└── index.ts                              (Export OAuth provider)

package.json                              (Add jwks-rsa dependency)

README.md                                 (Add OAuth section)

CLAUDE.md                                 (Add OAuth architecture)

src/cli/
└── templates/                            (Add OAuth templates)
```

---

## Risk Mitigation

### High Risk Items

#### Risk: HTTP Stream Auth Bug Impact
**Mitigation**: Fix in Phase 1 before OAuth implementation
**Validation**: Test with existing providers first

#### Risk: JWKS Performance Issues
**Mitigation**: Implement caching from start, benchmark early
**Validation**: Performance tests in Phase 8

#### Risk: Security Vulnerabilities
**Mitigation**: Security review in Phase 8, follow RFCs strictly
**Validation**: Security-focused test cases

#### Risk: Breaking Existing Functionality
**Mitigation**: Comprehensive backward compatibility testing
**Validation**: All existing tests must pass

### Medium Risk Items

#### Risk: Complex Configuration
**Mitigation**: Clear documentation, .env.example templates
**Validation**: User testing with OAuth providers

#### Risk: Authorization Server Compatibility
**Mitigation**: Test with 3+ real providers (Auth0, Okta, Cognito)
**Validation**: Integration tests with each provider

#### Risk: Token Introspection Performance
**Mitigation**: Implement aggressive caching
**Validation**: Performance benchmarks

---

## Timeline & Milestones

### Week 1
- **Day 1-2**: Phase 1 (Foundation)
  - Fix HTTP Stream auth
  - Add dependencies

- **Day 3-5**: Phase 2 (OAuth Provider Core)
  - Validators
  - OAuth provider implementation

### Week 2
- **Day 1-2**: Phase 3 (Metadata Endpoints)
  - Protected Resource Metadata
  - Transport integration

- **Day 3**: Phase 4 (Configuration & Types)
  - Type definitions
  - Configuration flow

- **Day 4-5**: Phase 5 (Testing) - Part 1
  - Unit tests
  - Mock auth server

### Week 3 (if needed)
- **Day 1-2**: Phase 5 (Testing) - Part 2
  - Integration tests
  - Coverage improvements

- **Day 3**: Phase 6 (Documentation)
  - README updates
  - OAuth guide
  - Examples

- **Day 4**: Phase 7 (CLI & Templates)
  - Project templates
  - CLI updates

- **Day 5**: Phase 8 (Validation & Polish)
  - Security review
  - Performance testing
  - Backward compatibility

---

## Definition of Done

### Code Complete
- [ ] All phases completed
- [ ] All acceptance criteria met
- [ ] All tests passing
- [ ] Code reviewed
- [ ] No linter errors
- [ ] Build succeeds

### Quality Complete
- [ ] Test coverage >80%
- [ ] Security review passed
- [ ] Performance targets met
- [ ] No known bugs
- [ ] Backward compatible

### Documentation Complete
- [ ] README updated
- [ ] OAuth guide complete
- [ ] CLAUDE.md updated
- [ ] Code examples working
- [ ] API documentation complete

### Release Ready
- [ ] Changelog updated
- [ ] Version bumped (minor version)
- [ ] Migration guide provided
- [ ] All stakeholders notified

---

## Next Steps After Completion

1. **Alpha Testing**
   - Internal testing with real OAuth providers
   - Gather feedback from initial users

2. **Beta Release**
   - Release as beta version (e.g., 0.3.0-beta.1)
   - Announce in community channels
   - Collect bug reports and feedback

3. **Production Release**
   - Address beta feedback
   - Final security audit
   - Release as stable version (e.g., 0.3.0)

4. **Future Enhancements**
   - Scope-based authorization
   - Token refresh support
   - Additional grant types
   - OAuth 2.1 client implementation (for MCP clients)

---

## Related Documents

- [OAUTH_USER_STORY.md](OAUTH_USER_STORY.md) - User story with acceptance criteria
- [CLAUDE.md](CLAUDE.md) - Codebase architecture guide
- [README.md](README.md) - Project README
- [MCP Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) - Official specification

---

**Last Updated**: 2025-01-05
**Status**: Ready for Implementation
**Estimated Effort**: 30-40 hours
