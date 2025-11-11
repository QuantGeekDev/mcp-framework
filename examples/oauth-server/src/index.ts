import { MCPServer, OAuthAuthProvider } from "mcp-framework";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvs = [
  'OAUTH_AUTHORIZATION_SERVER',
  'OAUTH_RESOURCE',
  'OAUTH_AUDIENCE',
  'OAUTH_ISSUER',
];

for (const env of requiredEnvs) {
  if (!process.env[env]) {
    console.error(`❌ Missing required environment variable: ${env}`);
    console.error('Please copy .env.example to .env and configure your OAuth provider');
    process.exit(1);
  }
}

// Get validation type (jwt or introspection)
const validationType = (process.env.OAUTH_VALIDATION_TYPE || 'jwt') as 'jwt' | 'introspection';

// Build validation config based on type
const validationConfig: any = {
  type: validationType,
  audience: process.env.OAUTH_AUDIENCE!,
  issuer: process.env.OAUTH_ISSUER!,
};

if (validationType === 'jwt') {
  // JWT validation requires JWKS URI
  if (!process.env.OAUTH_JWKS_URI) {
    console.error('❌ Missing OAUTH_JWKS_URI for JWT validation');
    process.exit(1);
  }
  validationConfig.jwksUri = process.env.OAUTH_JWKS_URI;
  validationConfig.algorithms = ['RS256', 'ES256'];
} else if (validationType === 'introspection') {
  // Introspection requires endpoint and credentials
  const introspectionRequired = [
    'OAUTH_INTROSPECTION_ENDPOINT',
    'OAUTH_CLIENT_ID',
    'OAUTH_CLIENT_SECRET',
  ];

  for (const env of introspectionRequired) {
    if (!process.env[env]) {
      console.error(`❌ Missing ${env} for introspection validation`);
      process.exit(1);
    }
  }

  validationConfig.introspection = {
    endpoint: process.env.OAUTH_INTROSPECTION_ENDPOINT!,
    clientId: process.env.OAUTH_CLIENT_ID!,
    clientSecret: process.env.OAUTH_CLIENT_SECRET!,
  };
}

// Create OAuth provider
const oauthProvider = new OAuthAuthProvider({
  authorizationServers: [process.env.OAUTH_AUTHORIZATION_SERVER!],
  resource: process.env.OAUTH_RESOURCE!,
  validation: validationConfig,
});

// Create MCP server with OAuth authentication
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: Number(process.env.PORT) || 8080,
      auth: {
        provider: oauthProvider
      },
      // Enable CORS for web clients
      cors: {
        allowOrigin: "*",
        allowMethods: "GET, POST, OPTIONS",
        allowHeaders: "Content-Type, Authorization",
        exposeHeaders: "Content-Type, Authorization",
        maxAge: "86400"
      }
    }
  }
});

// Start the server
await server.start();

const port = process.env.PORT || 8080;
console.log('');
console.log('✅ MCP Server with OAuth 2.1 is running!');
console.log('');
console.log(`🌐 Server URL: http://localhost:${port}`);
console.log(`🔐 OAuth Metadata: http://localhost:${port}/.well-known/oauth-protected-resource`);
console.log('');
console.log('📋 Configuration:');
console.log(`   Validation Type: ${validationType}`);
console.log(`   Authorization Server: ${process.env.OAUTH_AUTHORIZATION_SERVER}`);
console.log(`   Resource: ${process.env.OAUTH_RESOURCE}`);
console.log(`   Audience: ${process.env.OAUTH_AUDIENCE}`);
console.log(`   Issuer: ${process.env.OAUTH_ISSUER}`);
console.log('');
console.log('🔍 Test with:');
console.log(`   curl http://localhost:${port}/.well-known/oauth-protected-resource`);
console.log('');
console.log('📖 For detailed setup instructions, see README.md');
console.log('');
