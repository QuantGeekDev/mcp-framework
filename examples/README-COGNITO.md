# Cognito DCR OAuth Integration Example

This example demonstrates how to integrate the mcp-framework with the Cognito Dynamic Client Registration (DCR) implementation for OAuth 2.1 authentication.

## Quick Start (5 minutes)

### Step 1: Register OAuth Client

From the cognito-dcr directory, register a new client:

```bash
cd ../../cognito-dcr/examples
./quick-dcr-test.sh "MCP Test Server" "http://localhost:8080/oauth/callback"
```

**Save the output** - you'll need the `CLIENT_ID` and `CLIENT_SECRET`.

Example output:
```
📋 Client Credentials
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Client ID:     1m3mpk6fioslohhl54the6ugoh
Client Secret: prohg87lsuon3gnemk11ahkiu1kcnjsekghuesoideihh5m2dtu
```

### Step 2: Configure Environment

Create a `.env` file in the mcp-framework root directory:

```bash
cd ../../mcp-framework
cp .env.example.cognito .env
```

Edit `.env` and add your credentials:

```env
CLIENT_ID=1m3mpk6fioslohhl54the6ugoh
CLIENT_SECRET=prohg87lsuon3gnemk11ahkiu1kcnjsekghuesoideihh5m2dtu

COGNITO_USER_POOL_ID=us-west-2_pJpps8NA4
COGNITO_REGION=us-west-2
COGNITO_DOMAIN=dcr-staging-78okmfo6

MCP_SERVER_PORT=8080
MCP_RESOURCE_ID=https://mcp.example.com
```

### Step 3: Run the Example

```bash
npx tsx examples/cognito-oauth-simple.ts
```

You should see:
```
🚀 Starting MCP Server with Cognito OAuth 2.1

Configuration:
  Port:         8080
  Region:       us-west-2
  User Pool:    us-west-2_pJpps8NA4
  Issuer:       https://cognito-idp.us-west-2.amazonaws.com/us-west-2_pJpps8NA4
  JWKS URI:     https://cognito-idp.us-west-2.amazonaws.com/us-west-2_pJpps8NA4/.well-known/jwks.json
  Client ID:    1m3mpk6fioslohhl54the6ugoh
  Resource:     https://mcp.example.com

✅ MCP Server started successfully!
```

### Step 4: Test the Integration

#### A. Check Metadata (No Auth Required)

```bash
curl http://localhost:8080/.well-known/oauth-protected-resource | jq
```

Expected response:
```json
{
  "resource": "https://mcp.example.com",
  "authorization_servers": [
    "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_pJpps8NA4"
  ]
}
```

#### B. Get Access Token

Using client credentials grant (service-to-service):

```bash
curl -X POST https://dcr-staging-78okmfo6.auth.us-west-2.amazoncognito.com/oauth2/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "1m3mpk6fioslohhl54the6ugoh:prohg87lsuon3gnemk11ahkiu1kcnjsekghuesoideihh5m2dtu" \
  -d 'grant_type=client_credentials&scope=openid' | jq
```

Save the `access_token` from the response.

#### C. Call MCP Endpoint

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }' | jq
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "hello",
        "description": "Returns a greeting message",
        "inputSchema": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Name to greet"
            }
          },
          "required": ["name"]
        }
      }
    ]
  }
}
```

## What's Happening?

1. **Dynamic Client Registration (DCR)**: The `quick-dcr-test.sh` script registers your application as an OAuth client with Cognito via the RFC 7591 DCR endpoint.

2. **OAuth 2.1 Configuration**: The MCP server is configured to:
   - Accept access tokens from Cognito
   - Validate JWT signatures using Cognito's JWKS endpoint
   - Check audience claims match the client ID
   - Verify issuer claims match the Cognito User Pool

3. **Token Validation**: When you call the MCP endpoint with a Bearer token:
   - The `OAuthAuthProvider` extracts the token from the Authorization header
   - Fetches the public key from the JWKS URI (cached for performance)
   - Validates the JWT signature, expiration, audience, and issuer
   - Allows or denies the request based on validation results

## OAuth Grant Types

### Client Credentials (Service-to-Service)

Best for backend-to-backend communication where no user is involved.

```bash
# Get token
curl -X POST https://dcr-staging-78okmfo6.auth.us-west-2.amazoncognito.com/oauth2/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  -d 'grant_type=client_credentials&scope=openid'
```

### Authorization Code (User Context)

For applications that need to authenticate users and act on their behalf.

```bash
# 1. Redirect user to authorization endpoint
open "https://dcr-staging-78okmfo6.auth.us-west-2.amazoncognito.com/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=http://localhost:8080/oauth/callback&scope=openid+email&state=random_state"

# 2. After user signs in, Cognito redirects back with code
# http://localhost:8080/oauth/callback?code=AUTHORIZATION_CODE&state=random_state

# 3. Exchange code for token
curl -X POST https://dcr-staging-78okmfo6.auth.us-west-2.amazoncognito.com/oauth2/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  -d "grant_type=authorization_code&code=AUTHORIZATION_CODE&redirect_uri=http://localhost:8080/oauth/callback"
```

## Cognito Endpoints Reference

All endpoints for the staging DCR deployment:

```typescript
const COGNITO_CONFIG = {
  // DCR Registration
  registrationEndpoint: "https://7a03vnsj7i.execute-api.us-west-2.amazonaws.com/.well-known/oauth-registration",

  // Authorization Server Metadata
  metadataEndpoint: "https://7a03vnsj7i.execute-api.us-west-2.amazonaws.com/.well-known/oauth-authorization-server",

  // Cognito OAuth Endpoints
  issuer: "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_pJpps8NA4",
  authorizationEndpoint: "https://dcr-staging-78okmfo6.auth.us-west-2.amazoncognito.com/oauth2/authorize",
  tokenEndpoint: "https://dcr-staging-78okmfo6.auth.us-west-2.amazoncognito.com/oauth2/token",
  jwksUri: "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_pJpps8NA4/.well-known/jwks.json",

  // User Pool Details
  userPoolId: "us-west-2_pJpps8NA4",
  region: "us-west-2",
  domain: "dcr-staging-78okmfo6"
};
```

## Creating Test Users

For testing the authorization code flow, you need Cognito users:

```bash
# Create user
aws cognito-idp admin-create-user \
  --user-pool-id us-west-2_pJpps8NA4 \
  --username testuser@example.com \
  --user-attributes Name=email,Value=testuser@example.com Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id us-west-2_pJpps8NA4 \
  --username testuser@example.com \
  --password MyPassword123! \
  --permanent
```

## Troubleshooting

### "Invalid token signature"

**Cause**: JWKS URI incorrect or network issues

**Solution**: Verify JWKS endpoint is accessible:
```bash
curl https://cognito-idp.us-west-2.amazonaws.com/us-west-2_pJpps8NA4/.well-known/jwks.json
```

### "Token audience invalid"

**Cause**: Token's `aud` claim doesn't match CLIENT_ID

**Solution**: Ensure the token was issued for your client ID:
```bash
# Decode token to check audience
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d | jq '.aud'
```

### "Authorization header missing"

**Cause**: Not sending Bearer token

**Solution**: Always include Authorization header:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" ...
```

## Additional Resources

- [Cognito DCR Integration Guide](../../cognito-dcr/docs/MCP_FRAMEWORK_INTEGRATION.md)
- [Cognito DCR Testing Guide](../../cognito-dcr/docs/TESTING_GUIDE.md)
- [MCP Framework OAuth Documentation](../docs/OAUTH.md)
- [RFC 7591 - Dynamic Client Registration](https://tools.ietf.org/html/rfc7591)
- [RFC 8414 - Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414.html)
- [MCP Authorization Spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
