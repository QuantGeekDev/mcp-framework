/**
 * OAuth Test Client
 * 
 * This is a simple test client to verify OAuth functionality.
 * It demonstrates the complete OAuth flow from a client perspective.
 */

import fetch from "node-fetch";

interface TestConfig {
  serverUrl: string;
  clientId?: string;
  clientSecret?: string;
}

class OAuthTestClient {
  private config: TestConfig;
  private accessToken?: string;

  constructor(config: TestConfig) {
    this.config = config;
  }

  /**
   * Step 1: Make an unauthenticated request to trigger 401
   */
  async discoverAuthServer(): Promise<{
    authorizationServer: string;
    resourceUri: string;
  }> {
    console.log("\n📡 Step 1: Discovering authorization server...");
    
    try {
      // Try to access protected endpoint without auth
      const response = await fetch(`${this.config.serverUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        const wwwAuth = response.headers.get("WWW-Authenticate");
        console.log("✅ Received 401 with WWW-Authenticate:", wwwAuth);

        // Parse WWW-Authenticate header
        // Format: Bearer realm="MCP Server", resource="https://mcp.example.com", authorization_uri="https://..."
        const authMatch = wwwAuth?.match(/authorization_uri="([^"]+)"/);
        const resourceMatch = wwwAuth?.match(/resource="([^"]+)"/);

        if (authMatch && resourceMatch) {
          return {
            authorizationServer: authMatch[1],
            resourceUri: resourceMatch[1],
          };
        }
      }

      throw new Error("Failed to discover authorization server");
    } catch (error) {
      console.error("❌ Discovery failed:", error);
      throw error;
    }
  }

  /**
   * Step 2: Get Protected Resource Metadata
   */
  async getProtectedResourceMetadata(): Promise<any> {
    console.log("\n📋 Step 2: Fetching Protected Resource Metadata...");
    
    try {
      const response = await fetch(
        `${this.config.serverUrl}/.well-known/oauth-protected-resource`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const metadata = await response.json();
      console.log("✅ Protected Resource Metadata:");
      console.log(JSON.stringify(metadata, null, 2));
      
      return metadata;
    } catch (error) {
      console.error("❌ Failed to get metadata:", error);
      throw error;
    }
  }

  /**
   * Step 3: Get Authorization Server Metadata
   */
  async getAuthServerMetadata(authServer: string): Promise<any> {
    console.log("\n🔍 Step 3: Fetching Authorization Server Metadata...");
    
    try {
      const response = await fetch(
        `${authServer}/.well-known/oauth-authorization-server`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const metadata = await response.json();
      console.log("✅ Authorization Server Metadata:");
      console.log(JSON.stringify(metadata, null, 2));
      
      return metadata;
    } catch (error) {
      console.error("❌ Failed to get auth server metadata:", error);
      console.log("ℹ️  This is expected if using a test/mock auth server");
      return null;
    }
  }

  /**
   * Test authenticated request
   */
  async testAuthenticatedRequest(accessToken: string): Promise<void> {
    console.log("\n🔐 Testing authenticated request...");
    
    try {
      const response = await fetch(`${this.config.serverUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1,
        }),
      });

      console.log("Response status:", response.status);
      
      if (response.ok || response.status === 202) {
        console.log("✅ Authenticated request successful!");
        const body = await response.text();
        if (body) {
          console.log("Response:", body);
        }
      } else {
        const error = await response.text();
        console.log("❌ Request failed:", error);
      }
    } catch (error) {
      console.error("❌ Request error:", error);
    }
  }

  /**
   * Test with invalid token
   */
  async testInvalidToken(): Promise<void> {
    console.log("\n🚫 Testing with invalid token...");
    
    try {
      const response = await fetch(`${this.config.serverUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-token-12345",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1,
        }),
      });

      if (response.status === 401) {
        console.log("✅ Correctly rejected invalid token with 401");
        const wwwAuth = response.headers.get("WWW-Authenticate");
        console.log("WWW-Authenticate:", wwwAuth);
      } else {
        console.log("⚠️  Unexpected status:", response.status);
      }
    } catch (error) {
      console.error("❌ Request error:", error);
    }
  }

  /**
   * Run full test suite
   */
  async runTests(): Promise<void> {
    console.log("🧪 Starting OAuth Test Suite");
    console.log("Server URL:", this.config.serverUrl);
    console.log("=".repeat(60));

    try {
      // Step 1: Discover authorization server
      const { authorizationServer, resourceUri } = await this.discoverAuthServer();
      
      // Step 2: Get Protected Resource Metadata
      await this.getProtectedResourceMetadata();
      
      // Step 3: Get Authorization Server Metadata (optional)
      await this.getAuthServerMetadata(authorizationServer);
      
      // Step 4: Test with invalid token
      await this.testInvalidToken();
      
      console.log("\n" + "=".repeat(60));
      console.log("✅ OAuth discovery tests completed!");
      console.log("\nTo complete the authorization flow:");
      console.log("1. Visit the authorization URL (would be provided by startAuthorizationFlow)");
      console.log("2. Log in and authorize");
      console.log("3. Server will receive the callback and exchange code for token");
      console.log("4. Use the access token to make authenticated requests");
      
    } catch (error) {
      console.error("\n❌ Test suite failed:", error);
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const serverUrl = process.env.SERVER_URL || "http://localhost:3001";
  
  const client = new OAuthTestClient({
    serverUrl,
  });

  await client.runTests();
}

// Run tests if this is the main module
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export default OAuthTestClient;

