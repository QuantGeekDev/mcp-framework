/**
 * Simple MCP Server with Cognito DCR OAuth 2.1
 *
 * This example demonstrates how to integrate an MCP server with the
 * Cognito DCR implementation for OAuth 2.1 authentication.
 *
 * Prerequisites:
 * 1. Register an OAuth client using DCR:
 *    cd ../cognito-dcr/examples
 *    ./quick-dcr-test.sh "My MCP Server" "http://localhost:8080/oauth/callback"
 *
 * 2. Create a .env file with your credentials (see .env.example.cognito)
 *
 * 3. Run this example:
 *    npx tsx examples/cognito-oauth-simple.ts
 */

import { MCPServer, OAuthAuthProvider } from "../src/index.js";
import { config } from "dotenv";

// Load environment variables
config();

// Validate required configuration
const requiredEnvVars = ['CLIENT_ID', 'COGNITO_USER_POOL_ID', 'COGNITO_REGION'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error('   Please create a .env file based on .env.example.cognito');
    process.exit(1);
  }
}

// Build Cognito endpoints
const region = process.env.COGNITO_REGION!;
const userPoolId = process.env.COGNITO_USER_POOL_ID!;
const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
const jwksUri = `${issuer}/.well-known/jwks.json`;

// Configuration summary
console.log('🚀 Starting MCP Server with Cognito OAuth 2.1\n');
console.log('Configuration:');
console.log(`  Port:         ${process.env.MCP_SERVER_PORT || '8080'}`);
console.log(`  Region:       ${region}`);
console.log(`  User Pool:    ${userPoolId}`);
console.log(`  Issuer:       ${issuer}`);
console.log(`  JWKS URI:     ${jwksUri}`);
console.log(`  Client ID:    ${process.env.CLIENT_ID}`);
console.log(`  Resource:     ${process.env.MCP_RESOURCE_ID || 'https://mcp.example.com'}\n`);

// Create MCP server with OAuth authentication
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: parseInt(process.env.MCP_SERVER_PORT || '8080'),
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [issuer],
          resource: process.env.MCP_RESOURCE_ID || 'https://mcp.example.com',
          validation: {
            type: 'jwt',
            jwksUri,
            audience: process.env.CLIENT_ID!,
            issuer
          }
        })
      }
    }
  }
});

// Add a simple test tool
server.tool({
  name: "hello",
  description: "Returns a greeting message",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name to greet"
      }
    },
    required: ["name"]
  }
}, async ({ name }) => {
  return {
    content: [{
      type: "text",
      text: `Hello, ${name}! This MCP server is secured with Cognito OAuth 2.1 via Dynamic Client Registration (RFC 7591).`
    }]
  };
});

// Add a test resource
server.resource({
  uri: "cognito://info",
  name: "Cognito OAuth Info",
  description: "Information about the Cognito OAuth configuration",
  mimeType: "application/json"
}, async () => {
  return {
    contents: [{
      uri: "cognito://info",
      mimeType: "application/json",
      text: JSON.stringify({
        issuer,
        jwksUri,
        userPoolId,
        region,
        clientId: process.env.CLIENT_ID,
        resourceId: process.env.MCP_RESOURCE_ID || 'https://mcp.example.com'
      }, null, 2)
    }]
  };
});

// Start the server
await server.start();

const port = process.env.MCP_SERVER_PORT || '8080';
console.log(`✅ MCP Server started successfully!\n`);
console.log(`Server Details:`);
console.log(`  URL:              http://localhost:${port}`);
console.log(`  Metadata:         http://localhost:${port}/.well-known/oauth-protected-resource`);
console.log(`  MCP Endpoint:     http://localhost:${port}/mcp\n`);

console.log(`Testing Instructions:`);
console.log(`  1. Get an access token using client credentials:`);
console.log(`     curl -X POST https://dcr-staging-78okmfo6.auth.us-west-2.amazoncognito.com/oauth2/token \\`);
console.log(`       -H 'Content-Type: application/x-www-form-urlencoded' \\`);
console.log(`       -u "\${CLIENT_ID}:\${CLIENT_SECRET}" \\`);
console.log(`       -d 'grant_type=client_credentials&scope=openid'\n`);

console.log(`  2. Test the MCP endpoint with the token:`);
console.log(`     curl -X POST http://localhost:${port}/mcp \\`);
console.log(`       -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\`);
console.log(`       -H "Content-Type: application/json" \\`);
console.log(`       -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'\n`);

console.log(`  3. Check the metadata endpoint (no auth required):`);
console.log(`     curl http://localhost:${port}/.well-known/oauth-protected-resource | jq\n`);
