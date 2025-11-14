/**
 * MCP Server for claude.ai with Cognito DCR OAuth 2.1
 *
 * This example is specifically designed for claude.ai integration where
 * the OAuth client is dynamically registered via DCR (RFC 7591).
 *
 * IMPORTANT: Since claude.ai registers itself dynamically via DCR, we don't
 * know its client_id in advance. This means we can't validate the audience
 * claim against a specific client_id. Instead, we validate:
 * - Token signature (via JWKS)
 * - Token issuer (Cognito User Pool)
 * - Token expiration
 *
 * This is secure because only tokens issued by our Cognito User Pool with
 * valid signatures will be accepted.
 *
 * Setup:
 * 1. Create .env file (see below)
 * 2. Run: npx tsx examples/cognito-oauth-claude-ai.ts
 * 3. Expose via ngrok: ngrok http 8080
 * 4. Add Custom Connector in claude.ai with ngrok URL
 * 5. Claude.ai will automatically register via DCR and complete OAuth flow
 */

import { MCPServer, OAuthAuthProvider } from "../src/index.js";
import { config } from "dotenv";

// Load environment variables
config();

// Validate required configuration
const requiredEnvVars = ['COGNITO_USER_POOL_ID', 'COGNITO_REGION'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error('   Required: COGNITO_USER_POOL_ID, COGNITO_REGION');
    console.error('   Optional: MCP_SERVER_PORT (default: 8080), MCP_RESOURCE_ID (default: https://mcp.example.com)');
    process.exit(1);
  }
}

// Build Cognito endpoints
const region = process.env.COGNITO_REGION!;
const userPoolId = process.env.COGNITO_USER_POOL_ID!;
const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
const jwksUri = `${issuer}/.well-known/jwks.json`;
const resourceId = process.env.MCP_RESOURCE_ID || 'https://mcp.example.com';
const port = parseInt(process.env.MCP_SERVER_PORT || '8080');

// Configuration summary
console.log('🚀 Starting MCP Server for claude.ai Integration\n');
console.log('Configuration:');
console.log(`  Port:         ${port}`);
console.log(`  Region:       ${region}`);
console.log(`  User Pool:    ${userPoolId}`);
console.log(`  Issuer:       ${issuer}`);
console.log(`  JWKS URI:     ${jwksUri}`);
console.log(`  Resource:     ${resourceId}`);
console.log('');
console.log('⚠️  Audience Validation:');
console.log('   Using issuer URL as audience placeholder.');
console.log('   Actual validation is based on issuer + signature, not client_id.');
console.log('   This is secure for DCR scenarios where client_id is unknown.\n');

// Create MCP server with OAuth authentication
// NOTE: We use the issuer URL as the audience since we don't know claude.ai's
// client_id in advance. The jsonwebtoken library requires an audience field,
// so we use the issuer as a placeholder. The real security comes from validating
// the issuer and signature.
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port,
      auth: {
        provider: new OAuthAuthProvider({
          authorizationServers: [issuer],
          resource: resourceId,
          validation: {
            type: 'jwt',
            jwksUri,
            audience: issuer,  // Using issuer as placeholder - see note above
            issuer
          }
        })
      }
    }
  }
});

// Add test tools
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
      text: `Hello, ${name}! This MCP server is secured with Cognito OAuth 2.1 and accessible from claude.ai via Dynamic Client Registration (RFC 7591).`
    }]
  };
});

server.tool({
  name: "current_time",
  description: "Returns the current server time",
  inputSchema: {
    type: "object",
    properties: {}
  }
}, async () => {
  const now = new Date();
  return {
    content: [{
      type: "text",
      text: `Current server time: ${now.toISOString()} (${now.toLocaleString()})`
    }]
  };
});

server.tool({
  name: "calculate",
  description: "Performs basic arithmetic calculations",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["add", "subtract", "multiply", "divide"],
        description: "The arithmetic operation to perform"
      },
      a: {
        type: "number",
        description: "First number"
      },
      b: {
        type: "number",
        description: "Second number"
      }
    },
    required: ["operation", "a", "b"]
  }
}, async ({ operation, a, b }) => {
  let result: number;
  let operationSymbol: string;

  switch (operation) {
    case "add":
      result = a + b;
      operationSymbol = "+";
      break;
    case "subtract":
      result = a - b;
      operationSymbol = "-";
      break;
    case "multiply":
      result = a * b;
      operationSymbol = "×";
      break;
    case "divide":
      if (b === 0) {
        return {
          content: [{
            type: "text",
            text: "Error: Division by zero is not allowed"
          }],
          isError: true
        };
      }
      result = a / b;
      operationSymbol = "÷";
      break;
    default:
      return {
        content: [{
          type: "text",
          text: `Error: Unknown operation: ${operation}`
        }],
        isError: true
      };
  }

  return {
    content: [{
      type: "text",
      text: `${a} ${operationSymbol} ${b} = ${result}`
    }]
  };
});

// Add test resource
server.resource({
  uri: "oauth://config",
  name: "OAuth Configuration",
  description: "Information about the OAuth configuration for this MCP server",
  mimeType: "application/json"
}, async () => {
  return {
    contents: [{
      uri: "oauth://config",
      mimeType: "application/json",
      text: JSON.stringify({
        issuer,
        jwksUri,
        userPoolId,
        region,
        resourceId,
        authorizationServers: [issuer],
        note: "claude.ai registers dynamically via DCR - client_id is not known in advance"
      }, null, 2)
    }]
  };
});

// Start the server
await server.start();

console.log(`✅ MCP Server started successfully!\n`);
console.log(`Server Details:`);
console.log(`  Local URL:        http://localhost:${port}`);
console.log(`  MCP Endpoint:     http://localhost:${port}/mcp`);
console.log(`  Metadata:         http://localhost:${port}/.well-known/oauth-protected-resource\n`);

console.log(`Next Steps:`);
console.log(`  1. Expose via ngrok:`);
console.log(`     ngrok http ${port}\n`);
console.log(`  2. Copy the ngrok HTTPS URL (e.g., https://abc123.ngrok.io)\n`);
console.log(`  3. Add Custom Connector in claude.ai:`);
console.log(`     - Go to: Settings > Connectors > Add Custom Connector`);
console.log(`     - Name: My MCP Server`);
console.log(`     - URL: https://abc123.ngrok.io/mcp\n`);
console.log(`  4. Claude.ai will:`);
console.log(`     - Discover OAuth metadata from /.well-known/oauth-protected-resource`);
console.log(`     - Automatically register via DCR`);
console.log(`     - Redirect you to Cognito for authorization`);
console.log(`     - Complete OAuth flow and start using your tools\n`);
console.log(`  5. Test in claude.ai:`);
console.log(`     - "Use my MCP server to say hello to Alice"`);
console.log(`     - "What's the current time on my server?"`);
console.log(`     - "Calculate 15 times 23"\n`);

console.log(`📝 Note about Security:`);
console.log(`  This server validates tokens from ANY client registered with Cognito.`);
console.log(`  This is necessary for DCR where client_ids are unknown in advance.`);
console.log(`  Security is maintained through:`);
console.log(`  - Issuer validation (only tokens from your Cognito User Pool)`);
console.log(`  - Signature validation (via JWKS from Cognito)`);
console.log(`  - Expiration checking (no expired tokens accepted)\n`);
