import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { HttpStreamTransport } from '../../../src/transports/http/server.js';
import { OAuthAuthProvider } from '../../../src/auth/providers/oauth.js';
import { MockAuthServer } from '../../fixtures/mock-auth-server.js';
import http from 'node:http';

describe('HttpStreamTransport OAuth Authentication', () => {
  let mockAuthServer: MockAuthServer;
  let transport: HttpStreamTransport;
  let oauthProvider: OAuthAuthProvider;
  let testPort: number;
  let validToken: string;
  let invalidToken: string;

  beforeAll(async () => {
    // Start mock OAuth server
    mockAuthServer = new MockAuthServer({ port: 9100 });
    await mockAuthServer.start();

    // Generate test tokens
    validToken = mockAuthServer.generateToken();
    invalidToken = mockAuthServer.generateExpiredToken();
  });

  afterAll(async () => {
    await mockAuthServer.stop();
  });

  beforeEach(() => {
    // Use random port for each test to avoid conflicts
    testPort = 3000 + Math.floor(Math.random() * 1000);

    // Create OAuth provider
    oauthProvider = new OAuthAuthProvider({
      authorizationServers: [mockAuthServer.getIssuer()],
      resource: mockAuthServer.getAudience(),
      validation: {
        type: 'jwt',
        jwksUri: mockAuthServer.getJWKSUri(),
        audience: mockAuthServer.getAudience(),
        issuer: mockAuthServer.getIssuer(),
      },
    });

    // Create HTTP transport with OAuth authentication
    transport = new HttpStreamTransport({
      port: testPort,
      endpoint: '/mcp',
      responseMode: 'batch',
      auth: {
        provider: oauthProvider,
        endpoints: {
          sse: true,
          messages: true,
        },
      },
    });
  });

  afterEach(async () => {
    if (transport.isRunning()) {
      await transport.close();
    }
  });

  describe('WWW-Authenticate Header (Bug #1)', () => {
    it('should return 401 with WWW-Authenticate header when no auth token provided', async () => {
      await transport.start();

      const response = await makeRequest(testPort, '/mcp', {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
        id: 1,
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
      expect(response.headers['www-authenticate']).toContain('Bearer');
      expect(response.headers['www-authenticate']).toContain('realm="MCP Server"');
      expect(response.headers['www-authenticate']).toContain(`resource="${mockAuthServer.getAudience()}"`);
      expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
      expect(response.headers['www-authenticate']).toContain('error_description="Missing or invalid authentication token"');
    });

    it('should return 401 with WWW-Authenticate header when invalid token provided', async () => {
      await transport.start();

      const response = await makeRequest(
        testPort,
        '/mcp',
        {
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
          id: 1,
        },
        invalidToken
      );

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
      expect(response.headers['www-authenticate']).toContain('Bearer');
      expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
    });

    it('should return 401 with WWW-Authenticate header when malformed token provided', async () => {
      await transport.start();

      const response = await makeRequest(
        testPort,
        '/mcp',
        {
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
          id: 1,
        },
        'not-a-valid-jwt-token'
      );

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
    });
  });

  describe('Authentication Success', () => {
    it('should NOT return 401 when valid OAuth token is provided for initialize request', async () => {
      // Register message handler
      transport.onmessage = async (message) => {
        // Handle incoming messages
      };

      await transport.start();

      const response = await makeRequest(
        testPort,
        '/mcp',
        {
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
          id: 1,
        },
        validToken
      );

      // Should NOT be 401 Unauthorized with valid token
      expect(response.statusCode).not.toBe(401);
      // Should not have WWW-Authenticate header since auth succeeded
      expect(response.headers['www-authenticate']).toBeUndefined();
    });

    it('should accept valid OAuth token and authenticate subsequent requests', async () => {
      // This test verifies that valid tokens pass authentication,
      // even if the MCP protocol itself may reject the request for other reasons
      await transport.start();

      // Request with valid token should pass authentication (not 401)
      const response = await makeRequest(
        testPort,
        '/mcp',
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
        validToken
      );

      // Auth should pass (not 401), even though request may fail for other reasons (400/404)
      expect(response.statusCode).not.toBe(401);
      expect(response.headers['www-authenticate']).toBeUndefined();
    });
  });

  describe('Authentication Order (Bug #2)', () => {
    it('should return 401 BEFORE 400 when no auth and no session ID', async () => {
      await transport.start();

      // Request without auth token and without session ID (but not initialize)
      const response = await makeRequest(testPort, '/mcp', {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      });

      // Should fail with 401 (auth) not 400 (no session)
      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
      expect(response.body).toContain('Unauthorized');
    });

    it('should return 401 BEFORE 404 when no auth and invalid session ID', async () => {
      await transport.start();

      // Request without auth token but with invalid session ID
      const response = await makeRequest(
        testPort,
        '/mcp',
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
        undefined,
        'invalid-session-id-12345'
      );

      // Should fail with 401 (auth) not 404 (session not found)
      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
    });

    it('should return 404 when valid auth but invalid session ID', async () => {
      await transport.start();

      // Request with valid auth but invalid session ID
      const response = await makeRequest(
        testPort,
        '/mcp',
        {
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
        },
        validToken,
        'invalid-session-id-12345'
      );

      // Should fail with 404 (session not found) because auth passed
      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('Session not found');
    });
  });

  describe('OAuth Metadata Endpoint', () => {
    it('should serve OAuth protected resource metadata without authentication', async () => {
      await transport.start();

      const response = await makeGetRequest(testPort, '/.well-known/oauth-protected-resource');

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const metadata = JSON.parse(response.body);
      expect(metadata.resource).toBe(mockAuthServer.getAudience());
      expect(metadata.authorization_servers).toContain(mockAuthServer.getIssuer());
    });
  });
});

// Helper function to make HTTP requests
function makeRequest(
  port: number,
  path: string,
  body: any,
  bearerToken?: string,
  sessionId?: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: http.OutgoingHttpHeaders = {
      'Content-Type': 'application/json',
    };

    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId;
    }

    const bodyStr = JSON.stringify(body);

    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode!,
            headers: res.headers,
            body: responseBody,
          });
        });
      }
    );

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// Helper function to make HTTP GET requests
function makeGetRequest(
  port: number,
  path: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'GET',
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode!,
            headers: res.headers,
            body: responseBody,
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}
