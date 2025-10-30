/**
 * Example: OAuth with Custom Token Validator
 * 
 * This example shows how to implement custom token validation logic,
 * which is useful for:
 * - Validating JWT tokens with JWKS
 * - Using token introspection endpoints
 * - Implementing custom claims validation
 * - Integration with non-standard OAuth servers
 */

import { MCPServer, OAuthProvider } from "mcp-framework";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

// Setup JWKS client for JWT validation (example with Cognito)
const jwksClientInstance = jwksClient({
  jwksUri: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXX/.well-known/jwks.json",
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
});

// Function to get signing key
function getKey(header: any, callback: any) {
  jwksClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

// Custom token validator function
async function validateToken(token: string): Promise<{ valid: boolean; data?: Record<string, any> }> {
  try {
    // Verify JWT signature and claims
    const decoded = await new Promise<any>((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          algorithms: ["RS256"],
          audience: "https://mcp.example.com", // Should match resourceUri
          issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXX",
        },
        (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        }
      );
    });

    // Additional custom validations
    if (decoded.token_use !== "access") {
      console.warn("Token is not an access token");
      return { valid: false };
    }

    // Check custom claims
    if (decoded["custom:role"] !== "admin" && decoded["custom:role"] !== "user") {
      console.warn("Invalid role in token");
      return { valid: false };
    }

    console.log("Token validated successfully:", {
      sub: decoded.sub,
      username: decoded.username,
      role: decoded["custom:role"],
    });

    return {
      valid: true,
      data: decoded,
    };
  } catch (error) {
    console.error("Token validation failed:", error);
    return { valid: false };
  }
}

// Alternative: Token introspection validator
async function introspectionValidator(token: string): Promise<{ valid: boolean; data?: Record<string, any> }> {
  try {
    const response = await fetch("https://auth.example.com/oauth/introspect", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
      },
      body: new URLSearchParams({
        token,
        token_type_hint: "access_token",
      }),
    });

    if (!response.ok) {
      return { valid: false };
    }

    const result = await response.json();

    if (!result.active) {
      return { valid: false };
    }

    // Additional validations
    if (!result.scope?.includes("mcp:read")) {
      console.warn("Token missing required scope");
      return { valid: false };
    }

    return {
      valid: true,
      data: result,
    };
  } catch (error) {
    console.error("Token introspection failed:", error);
    return { valid: false };
  }
}

// Create OAuth provider with custom validator
const oauthProvider = new OAuthProvider({
  authorizationServer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXX",
  clientId: process.env.COGNITO_CLIENT_ID || "",
  clientSecret: process.env.COGNITO_CLIENT_SECRET,
  resourceUri: "https://mcp.example.com",
  requiredScopes: ["openid", "profile"],

  // Use custom validator instead of default JWT/introspection
  customValidator: validateToken,
  // Or use introspection: customValidator: introspectionValidator,

  // Token cache TTL (custom validator results are also cached)
  tokenCacheTTL: 300, // 5 minutes
});

// Create MCP server
const server = new MCPServer({
  name: "oauth-custom-validator-example",
  version: "1.0.0",

  transport: {
    type: "sse",
    options: {
      port: 3001,

      auth: {
        provider: oauthProvider,
        endpoints: {
          sse: false,
          messages: true,
        },
      },

      oauth: {
        onCallback: async ({ accessToken, refreshToken, expiresIn }) => {
          console.log("✅ Authorization successful!");
          console.log("Token expires in:", expiresIn, "seconds");

          // Validate the token immediately to check custom claims
          const validation = await validateToken(accessToken);
          if (validation.valid && validation.data) {
            console.log("User data:", validation.data);
          }
        },

        onError: async (error) => {
          console.error("❌ Authorization failed:", error.message);
        },
      },
    },
  },
});

// Start the server
server.start().then(() => {
  console.log("\n🚀 MCP Server with Custom Token Validator is running!");
  console.log("\nThe server validates tokens using custom logic:");
  console.log("- JWT signature verification with JWKS");
  console.log("- Custom claims validation (role, etc.)");
  console.log("- Audience and issuer validation");
}).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

