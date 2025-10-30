/**
 * Example: OAuth 2.1 Authentication with AWS Cognito
 * 
 * This example demonstrates how to set up an MCP server with OAuth authentication
 * using AWS Cognito as the authorization server.
 * 
 * Prerequisites:
 * 1. AWS Cognito User Pool created
 * 2. App Client configured with authorization_code flow
 * 3. Callback URL registered: https://your-domain.com/oauth/callback
 * 4. Environment variables set (see below)
 */

import { MCPServer, OAuthProvider } from "mcp-framework";

// Configuration from environment variables
const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN; // e.g., "your-domain.auth.us-east-1.amazoncognito.com"
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET; // Optional for public clients
const RESOURCE_URI = process.env.RESOURCE_URI || "https://mcp.example.com";
const PORT = parseInt(process.env.PORT || "3001");

if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
  console.error("Missing required environment variables:");
  console.error("- COGNITO_DOMAIN: Your Cognito domain (e.g., your-domain.auth.us-east-1.amazoncognito.com)");
  console.error("- COGNITO_CLIENT_ID: Your Cognito app client ID");
  process.exit(1);
}

// Create OAuth provider with Cognito configuration
const oauthProvider = new OAuthProvider({
  // Cognito authorization server
  authorizationServer: `https://${COGNITO_DOMAIN}`,
  
  // OAuth client credentials
  clientId: COGNITO_CLIENT_ID,
  clientSecret: COGNITO_CLIENT_SECRET,
  
  // Resource URI - the canonical URI of this MCP server
  // This MUST match how clients access your server
  resourceUri: RESOURCE_URI,
  
  // Required scopes for Cognito
  requiredScopes: ["openid", "profile"],
  
  // Token cache TTL in seconds
  tokenCacheTTL: 300, // 5 minutes
  
  // Strict audience validation (recommended)
  strictAudienceValidation: true,
  
  // Custom metadata for Protected Resource Metadata endpoint
  metadata: {
    resource_name: "MCP Server with Cognito",
    scopes_supported: ["openid", "profile", "email"]
  }
});

// Create MCP server with OAuth authentication
const server = new MCPServer({
  name: "oauth-cognito-example",
  version: "1.0.0",
  
  transport: {
    type: "sse",
    options: {
      port: PORT,
      endpoint: "/sse",
      messageEndpoint: "/messages",
      
      // CORS configuration for web clients
      cors: {
        allowOrigin: "*", // Configure this appropriately for production
        allowHeaders: "Content-Type, Authorization",
        allowMethods: "GET, POST, OPTIONS"
      },
      
      // Authentication configuration
      auth: {
        provider: oauthProvider,
        endpoints: {
          sse: false,      // SSE connection endpoint is public
          messages: true,  // Message endpoint requires authentication
          oauth: false,    // OAuth callback endpoint is public
        }
      },
      
      // OAuth callback handlers
      oauth: {
        // Called when user successfully authorizes
        onCallback: async ({ accessToken, refreshToken, expiresIn, state }) => {
          console.log("\n✅ OAuth Authorization Successful!");
          console.log("State:", state);
          console.log("Access Token (first 20 chars):", accessToken.substring(0, 20) + "...");
          console.log("Expires in:", expiresIn, "seconds");
          
          if (refreshToken) {
            console.log("Refresh Token received:", refreshToken.substring(0, 20) + "...");
            // TODO: Store refresh token securely for long-lived sessions
          }
          
          // You can store the token mapping here
          // For example, associate the token with a user session
        },
        
        // Called when OAuth authorization fails
        onError: async (error, state) => {
          console.error("\n❌ OAuth Authorization Failed!");
          console.error("State:", state);
          console.error("Error:", error.message);
        }
      }
    }
  }
});

// Start the server
async function main() {
  try {
    console.log("\n🚀 Starting MCP Server with OAuth (Cognito)...");
    console.log("\nConfiguration:");
    console.log("- Authorization Server:", `https://${COGNITO_DOMAIN}`);
    console.log("- Client ID:", COGNITO_CLIENT_ID);
    console.log("- Resource URI:", RESOURCE_URI);
    console.log("- Port:", PORT);
    
    await server.start();
    
    console.log("\n✨ Server is running!");
    console.log("\nEndpoints:");
    console.log(`- SSE Connection: http://localhost:${PORT}/sse`);
    console.log(`- Messages: http://localhost:${PORT}/messages`);
    console.log(`- OAuth Callback: http://localhost:${PORT}/oauth/callback`);
    console.log(`- Protected Resource Metadata: http://localhost:${PORT}/.well-known/oauth-protected-resource`);
    
    console.log("\n📋 To test authorization flow:");
    console.log("1. Try to access the server without a token (you'll get a 401)");
    console.log("2. Follow the WWW-Authenticate header to get authorization");
    console.log("3. Or use the initiate authorization endpoint to get an auth URL");
    
    // Example: Generate authorization URL for testing
    const { authorizationUrl, state } = await oauthProvider.startAuthorizationFlow(
      `http://localhost:${PORT}/oauth/callback`,
      {
        // Additional parameters for Cognito
        // scope is automatically added from requiredScopes
      }
    );
    
    console.log("\n🔐 Test Authorization URL:");
    console.log(authorizationUrl);
    console.log("\nVisit this URL in your browser to authorize.");
    console.log("State:", state);
    
  } catch (error) {
    console.error("\n❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Shutting down server...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⏹️  Shutting down server...');
  await server.stop();
  process.exit(0);
});

main();

