import { MCPTool, McpInput } from "mcp-framework";
import { z } from "zod";

const SecureDataSchema = z.object({
  query: z.string().describe("Data query to process"),
});

/**
 * Example tool that demonstrates OAuth authentication.
 * This tool is protected by OAuth and only accessible with a valid token.
 */
class SecureDataTool extends MCPTool {
  name = "secure_data";
  description = "Query secure data (requires OAuth authentication)";
  schema = SecureDataSchema;

  async execute(input: McpInput<this>, context?: any) {
    // Access token claims from authentication context
    const claims = context?.auth?.data;

    if (!claims) {
      throw new Error("No authentication context available");
    }

    // Log user information from token
    const userId = claims.sub;
    const scope = claims.scope || 'N/A';

    // You can implement scope-based authorization here
    // if (!scope.includes('read:data')) {
    //   throw new Error('Insufficient permissions');
    // }

    // Process the secure query
    const result = {
      query: input.query,
      authenticatedAs: userId,
      tokenScope: scope,
      issuer: claims.iss,
      data: {
        message: `Secure data processed for ${userId}`,
        timestamp: new Date().toISOString(),
        query: input.query,
      }
    };

    return JSON.stringify(result, null, 2);
  }
}

export default SecureDataTool;
