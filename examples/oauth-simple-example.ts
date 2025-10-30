/**
 * Example: Simple OAuth 2.1 Authentication
 * 
 * This is a minimal example showing how to add OAuth authentication to your MCP server.
 * Use this as a starting point for integrating with any OAuth 2.1 authorization server.
 */

import { MCPServer, OAuthProvider } from "mcp-framework";

// Create OAuth provider
const oauthProvider = new OAuthProvider({
  // Your OAuth 2.1 authorization server
  authorizationServer: "https://auth.example.com",
  
  // OAuth client credentials
  clientId: "your-client-id",
  clientSecret: "your-client-secret", // Optional for public clients
  
  // The canonical URI of this MCP server
  resourceUri: "https://mcp.example.com",
  
  // Optional: Required scopes
  requiredScopes: ["mcp:read", "mcp:write"],
});

// Create MCP server
const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: 3001,
      
      // Add OAuth authentication
      auth: {
        provider: oauthProvider,
        endpoints: {
          sse: false,      // Public SSE endpoint
          messages: true,  // Protected messages endpoint
        }
      },
      
      // Handle OAuth callbacks
      oauth: {
        onCallback: async ({ accessToken, refreshToken, expiresIn }) => {
          console.log("User authorized! Access token received.");
          // Store tokens as needed
        },
        onError: async (error) => {
          console.error("Authorization failed:", error.message);
        }
      }
    }
  }
});

// Start the server
server.start().then(() => {
  console.log("MCP Server with OAuth is running!");
  console.log("\nProtected Resource Metadata available at:");
  console.log("http://localhost:3001/.well-known/oauth-protected-resource");
}).catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

