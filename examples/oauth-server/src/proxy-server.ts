/**
 * OAuth Proxy Server for Claude.ai Integration
 *
 * This server proxies OAuth metadata and authorization requests to Cognito DCR.
 * Claude.ai expects all OAuth endpoints on the MCP server, so we proxy them.
 */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '8080');

// CORS
app.use(cors());

// Proxy /.well-known/oauth-authorization-server to Cognito DCR
// BUT rewrite the response to point authorization/token endpoints to proxy
app.get('/.well-known/oauth-authorization-server', async (req, res) => {
  console.log(`[Proxy] Authorization server metadata: ${req.url}`);

  try {
    const response = await fetch('https://7a03vnsj7i.execute-api.us-west-2.amazonaws.com/.well-known/oauth-authorization-server');
    const metadata = await response.json();

    // Get ngrok URL from request headers or use localhost for testing
    const baseUrl = req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
      : `http://localhost:${port}`;

    // Rewrite endpoints to point to proxy
    metadata.authorization_endpoint = `${baseUrl}/authorize`;
    metadata.token_endpoint = `${baseUrl}/token`;

    res.json(metadata);
  } catch (error) {
    console.error('[Proxy] Error fetching OAuth metadata:', error);
    res.status(500).json({ error: 'Failed to fetch OAuth metadata' });
  }
});

// Proxy /authorize to Cognito
app.get('/authorize', (req, res, next) => {
  console.log(`[Proxy] Authorization request: ${req.url}`);
  next();
}, createProxyMiddleware({
  target: 'https://dcr-staging-78okmfo6.auth.us-west-2.amazoncognito.com',
  changeOrigin: true,
  pathRewrite: {
    '^/authorize': '/oauth2/authorize'
  }
}));

// Proxy /token to Cognito
app.post('/token', express.urlencoded({ extended: true }), async (req, res) => {
  console.log(`[Proxy] Token request with body:`, req.body);

  try {
    // Forward to Cognito
    const tokenResponse = await fetch('https://dcr-staging-78okmfo6.auth.us-west-2.amazoncognito.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(req.body as any).toString()
    });

    const tokenData = await tokenResponse.json();
    console.log(`[Proxy] Token response:`, JSON.stringify(tokenData, null, 2));

    res.status(tokenResponse.status).json(tokenData);
  } catch (error) {
    console.error('[Proxy] Error exchanging token:', error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

// Proxy /.well-known/oauth-protected-resource to local MCP server
app.get('/.well-known/oauth-protected-resource', createProxyMiddleware({
  target: 'http://localhost:8081',  // MCP server on different port
  changeOrigin: true
}));

// Proxy /mcp to local MCP server
app.use('/mcp', (req, res, next) => {
  console.log(`[Proxy] MCP request: ${req.method} /mcp${req.url}`);
  console.log(`[Proxy] Authorization header: ${req.headers.authorization ? 'Present' : 'Missing'}`);
  next();
}, createProxyMiddleware({
  target: 'http://localhost:8081',
  changeOrigin: true,
  ws: true,  // Support websockets if needed
  pathRewrite: {
    '^/': '/mcp'  // Rewrite / to /mcp (since Express already stripped /mcp prefix)
  },
  on: {
    proxyReq: (proxyReq: any, req: any) => {
      // Ensure Authorization header is forwarded
      if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
        console.log(`[Proxy] Forwarding Authorization header to MCP server`);
      }
    }
  }
} as any));


app.listen(port, () => {
  console.log(`\n🔀 OAuth Proxy Server running on port ${port}`);
  console.log(`\nProxying:`);
  console.log(`  /.well-known/oauth-authorization-server → Cognito DCR`);
  console.log(`  /authorize → Cognito OAuth`);
  console.log(`  /token → Cognito OAuth`);
  console.log(`  /mcp → Local MCP server (port 8081)`);
  console.log(`\nMake sure MCP server is running on port 8081!`);
  console.log(`Start it with: PORT=8081 npm start`);
  console.log('');
});
