# MCP Framework Examples

This directory contains comprehensive examples demonstrating various features of the MCP Framework.

## OAuth Examples

### 1. Simple OAuth Example (`oauth-simple-example.ts`)

A minimal example showing the basics of OAuth integration:

```bash
npm run build
node dist/examples/oauth-simple-example.js
```

**What it demonstrates:**
- Basic OAuth provider setup
- Simple configuration
- Callback handling

### 2. Cognito OAuth Example (`oauth-cognito-example.ts`)

Complete example for AWS Cognito integration:

```bash
# Set environment variables
export COGNITO_DOMAIN="your-domain.auth.us-east-1.amazoncognito.com"
export COGNITO_CLIENT_ID="your-client-id"
export COGNITO_CLIENT_SECRET="your-client-secret"
export RESOURCE_URI="https://mcp.example.com"
export PORT=3001

# Run the example
npm run build
node dist/examples/oauth-cognito-example.js
```

**What it demonstrates:**
- AWS Cognito setup
- Authorization flow initiation
- Token management
- Production-ready configuration

### 3. Custom Token Validator (`oauth-custom-validator.ts`)

Advanced example with custom token validation:

```bash
npm run build
node dist/examples/oauth-custom-validator.js
```

**What it demonstrates:**
- JWT validation with JWKS
- Token introspection
- Custom claims validation
- Advanced security features

### 4. OAuth Test Client (`oauth-test-client.ts`)

A test client to verify OAuth implementation:

```bash
# Start your OAuth-enabled MCP server first, then:
export SERVER_URL="http://localhost:3001"
npm run build
node dist/examples/oauth-test-client.js
```

**What it demonstrates:**
- OAuth discovery flow
- Protected Resource Metadata
- Authorization Server Metadata
- Token validation testing

## Running the Examples

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

### AWS Cognito Setup (for Cognito example)

1. **Create a User Pool:**
```bash
aws cognito-idp create-user-pool \
  --pool-name mcp-user-pool \
  --auto-verified-attributes email
```

2. **Create an App Client:**
```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id <your-pool-id> \
  --client-name mcp-app-client \
  --generate-secret \
  --allowed-o-auth-flows authorization_code \
  --allowed-o-auth-scopes openid profile email \
  --callback-urls http://localhost:3001/oauth/callback \
  --supported-identity-providers COGNITO
```

3. **Configure a Domain:**
```bash
aws cognito-idp create-user-pool-domain \
  --domain your-unique-domain \
  --user-pool-id <your-pool-id>
```

### Testing the OAuth Flow

1. **Start the server:**
```bash
node dist/examples/oauth-cognito-example.js
```

2. **Visit the authorization URL** (printed in the console)

3. **Log in with your Cognito credentials**

4. **Server receives the callback** and exchanges code for token

5. **Use the access token** to make authenticated requests:
```bash
curl -X POST http://localhost:3001/messages?sessionId=<session-id> \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Example Flow Diagram

```
┌─────────┐                    ┌──────────────┐                    ┌─────────────┐
│  Client │                    │  MCP Server  │                    │   Cognito   │
└────┬────┘                    └──────┬───────┘                    └──────┬──────┘
     │                                │                                   │
     │  1. Request (no token)         │                                   │
     ├───────────────────────────────>│                                   │
     │                                │                                   │
     │  2. 401 + WWW-Authenticate     │                                   │
     │<───────────────────────────────┤                                   │
     │                                │                                   │
     │  3. GET /.well-known/oauth-protected-resource                      │
     ├───────────────────────────────>│                                   │
     │                                │                                   │
     │  4. Protected Resource Metadata│                                   │
     │<───────────────────────────────┤                                   │
     │                                │                                   │
     │  5. Redirect to authorization URL                                  │
     ├───────────────────────────────────────────────────────────────────>│
     │                                │                                   │
     │  6. User logs in and authorizes│                                   │
     │<───────────────────────────────────────────────────────────────────┤
     │                                │                                   │
     │  7. Redirect to callback with code                                 │
     ├───────────────────────────────>│                                   │
     │                                │                                   │
     │                                │  8. Exchange code for token       │
     │                                ├──────────────────────────────────>│
     │                                │                                   │
     │                                │  9. Access token + Refresh token  │
     │                                │<──────────────────────────────────┤
     │                                │                                   │
     │ 10. Success page               │                                   │
     │<───────────────────────────────┤                                   │
     │                                │                                   │
     │ 11. Request with Bearer token  │                                   │
     ├───────────────────────────────>│                                   │
     │                                │                                   │
     │ 12. Validate token (cached)    │                                   │
     │                                │                                   │
     │ 13. Response                   │                                   │
     │<───────────────────────────────┤                                   │
     │                                │                                   │
```

## Common Issues

### "OAuth not configured" error

- Ensure you're using SSE transport (OAuth only works with HTTP-based transports)
- Verify the OAuth provider is configured in the `auth` section

### "Invalid or expired OAuth state"

- State parameters expire after 10 minutes
- Ensure the callback happens within this timeframe
- Clear cookies and try again

### "Token audience mismatch"

- Verify your `resourceUri` matches how clients access your server
- Check Cognito app client settings
- Ensure the resource parameter is being sent in token requests

### CORS errors

- Configure CORS appropriately for your domain
- For local testing, use `allowOrigin: "*"`
- For production, specify exact origins

## Additional Resources

- [OAuth Setup Guide](../OAUTH_GUIDE.md)
- [MCP Framework Documentation](https://mcp-framework.com)
- [OAuth 2.1 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [AWS Cognito OAuth Endpoints](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-userpools-server-contract-reference.html)

