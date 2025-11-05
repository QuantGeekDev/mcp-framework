import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { SSEServerTransport } from '../../../src/transports/sse/server.js';
import { OAuthAuthProvider } from '../../../src/auth/providers/oauth.js';
import { MockAuthServer } from '../../fixtures/mock-auth-server.js';
import http from 'node:http';

describe('SSEServerTransport OAuth Authentication', () => {
  let mockAuthServer: MockAuthServer;
  let transport: SSEServerTransport;
  let oauthProvider: OAuthAuthProvider;
  let testPort: number;
  let validToken: string;
  let invalidToken: string;

  beforeAll(async () => {
    // Start mock OAuth server
    mockAuthServer = new MockAuthServer({ port: 9101 });
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
    testPort = 4000 + Math.floor(Math.random() * 1000);

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

    // Create SSE transport with OAuth authentication
    transport = new SSEServerTransport({
      port: testPort,
      endpoint: '/sse',
      messageEndpoint: '/messages',
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

  describe('WWW-Authenticate Header (Bug #1) - SSE Endpoint', () => {
    it('should return 401 with WWW-Authenticate header when no auth token provided for SSE connection', async () => {
      await transport.start();

      const response = await makeGetRequest(testPort, '/sse');

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
      expect(response.headers['www-authenticate']).toContain('Bearer');
      expect(response.headers['www-authenticate']).toContain('realm="MCP Server"');
      expect(response.headers['www-authenticate']).toContain(`resource="${mockAuthServer.getAudience()}"`);
      expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
      expect(response.headers['www-authenticate']).toContain('error_description="Missing or invalid authentication token"');
    });

    it('should return 401 with WWW-Authenticate header when invalid token provided for SSE connection', async () => {
      await transport.start();

      const response = await makeGetRequest(testPort, '/sse', invalidToken);

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
      expect(response.headers['www-authenticate']).toContain('Bearer');
      expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
    });

    it('should accept valid OAuth token for SSE connection', async () => {
      await transport.start();

      // Start SSE connection with valid token
      const response = await makeGetRequest(testPort, '/sse', validToken);

      // SSE connections should succeed (200 OK with text/event-stream)
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });
  });

  describe('WWW-Authenticate Header (Bug #1) - Message Endpoint', () => {
    it('should return 401 with WWW-Authenticate header when no auth token provided for messages', async () => {
      await transport.start();

      // Try to post message without auth (will fail auth before session check)
      const response = await makePostRequest(testPort, '/messages', {
        jsonrpc: '2.0',
        method: 'ping',
        id: 1,
      });

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
      expect(response.headers['www-authenticate']).toContain('Bearer');
      expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
    });

    it('should return 401 with WWW-Authenticate header when invalid token provided for messages', async () => {
      await transport.start();

      // Try to post message with invalid token
      const response = await makePostRequest(
        testPort,
        '/messages',
        {
          jsonrpc: '2.0',
          method: 'ping',
          id: 1,
        },
        invalidToken
      );

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBeDefined();
    });

    it('should NOT return 401 when valid OAuth token is provided for messages', async () => {
      await transport.start();

      // Register message handler
      transport.onmessage = async () => {};

      // Post message with valid token
      const response = await makePostRequest(
        testPort,
        '/messages',
        {
          jsonrpc: '2.0',
          method: 'ping',
          id: 1,
        },
        validToken
      );

      // Auth should pass (not 401), even though request may fail for other reasons (403/409)
      expect(response.statusCode).not.toBe(401);
      expect(response.headers['www-authenticate']).toBeUndefined();
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

  describe('Authentication with Session Management', () => {
    it('should require auth for both SSE connection and messages', async () => {
      await transport.start();

      // Register message handler
      transport.onmessage = async () => {};

      // 1. Connect to SSE with valid token (should pass auth)
      const sseResponse = await makeGetRequest(testPort, '/sse', validToken);
      expect(sseResponse.statusCode).toBe(200);

      // 2. Post message with valid token (should pass auth, may fail for other reasons)
      const messageResponse = await makePostRequest(
        testPort,
        '/messages',
        {
          jsonrpc: '2.0',
          method: 'ping',
          id: 1,
        },
        validToken
      );
      // Auth should pass (not 401)
      expect(messageResponse.statusCode).not.toBe(401);

      // 3. Try to post message without token (should fail with 401)
      const unauthorizedResponse = await makePostRequest(testPort, '/messages', {
        jsonrpc: '2.0',
        method: 'ping',
        id: 2,
      });
      expect(unauthorizedResponse.statusCode).toBe(401);
      expect(unauthorizedResponse.headers['www-authenticate']).toBeDefined();
    });
  });
});

// Helper function to make HTTP GET requests (for SSE)
function makeGetRequest(
  port: number,
  path: string,
  bearerToken?: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: http.OutgoingHttpHeaders = {};

    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        // For SSE connections, end after first chunk
        if (res.headers['content-type']?.includes('text/event-stream')) {
          // Read a bit of data then close
          setTimeout(() => {
            req.destroy();
            resolve({
              statusCode: res.statusCode!,
              headers: res.headers,
              body: responseBody,
            });
          }, 100);
        } else {
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode!,
              headers: res.headers,
              body: responseBody,
            });
          });
        }
      }
    );

    req.on('error', (err: any) => {
      // Connection destroyed intentionally for SSE
      if (err.code === 'ECONNRESET') {
        return;
      }
      reject(err);
    });
    req.end();
  });
}

// Helper function to make HTTP POST requests (for messages)
function makePostRequest(
  port: number,
  path: string,
  body: any,
  bearerToken?: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: http.OutgoingHttpHeaders = {
      'Content-Type': 'application/json',
    };

    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
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
