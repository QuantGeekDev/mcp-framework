import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { IncomingMessage } from 'node:http';
import { OAuthAuthProvider } from '../../../src/auth/providers/oauth.js';
import { MockAuthServer } from '../../fixtures/mock-auth-server.js';
import { Socket } from 'node:net';

describe('OAuthAuthProvider', () => {
  let mockServer: MockAuthServer;
  let jwtProvider: OAuthAuthProvider;
  let introspectionProvider: OAuthAuthProvider;

  beforeAll(async () => {
    mockServer = new MockAuthServer({ port: 9003 });
    await mockServer.start();

    jwtProvider = new OAuthAuthProvider({
      authorizationServers: [mockServer.getIssuer()],
      resource: mockServer.getAudience(),
      validation: {
        type: 'jwt',
        jwksUri: mockServer.getJWKSUri(),
        audience: mockServer.getAudience(),
        issuer: mockServer.getIssuer(),
      },
    });

    introspectionProvider = new OAuthAuthProvider({
      authorizationServers: [mockServer.getIssuer()],
      resource: mockServer.getAudience(),
      validation: {
        type: 'introspection',
        audience: mockServer.getAudience(),
        issuer: mockServer.getIssuer(),
        introspection: {
          endpoint: mockServer.getIntrospectionEndpoint(),
          clientId: 'test-client',
          clientSecret: 'test-secret',
        },
      },
    });
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  const createMockRequest = (headers: Record<string, string>): IncomingMessage => {
    const socket = new Socket();
    Object.defineProperty(socket, 'remoteAddress', {
      value: '127.0.0.1',
      writable: false,
    });
    const req = new IncomingMessage(socket);
    req.headers = headers;
    req.url = '/test';
    return req;
  };

  describe('JWT Validation Mode', () => {
    it('should authenticate with valid Bearer token', async () => {
      const token = mockServer.generateToken();
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });

      const result = await jwtProvider.authenticate(req);

      expect(result).toBeTruthy();
      expect(typeof result === 'object' && 'data' in result).toBe(true);
      if (typeof result === 'object' && 'data' in result) {
        expect(result.data?.sub).toBe('test-user-123');
        expect(result.data?.iss).toBe(mockServer.getIssuer());
        expect(result.data?.aud).toBe(mockServer.getAudience());
      }
    });

    it('should reject request without Authorization header', async () => {
      const req = createMockRequest({});

      const result = await jwtProvider.authenticate(req);

      expect(result).toBe(false);
    });

    it('should reject request with malformed Authorization header', async () => {
      const req = createMockRequest({
        authorization: 'InvalidFormat token',
      });

      const result = await jwtProvider.authenticate(req);

      expect(result).toBe(false);
    });

    it('should reject request with expired token', async () => {
      const token = mockServer.generateExpiredToken();
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });

      const result = await jwtProvider.authenticate(req);

      expect(result).toBe(false);
    });

    it('should reject token with wrong audience', async () => {
      const token = mockServer.generateToken({ aud: 'https://wrong-audience.com' });
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });

      const result = await jwtProvider.authenticate(req);

      expect(result).toBe(false);
    });

    it('should extract custom claims from token', async () => {
      const token = mockServer.generateToken({
        scope: 'read write admin',
        custom_claim: 'custom_value',
      });
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });

      const result = await jwtProvider.authenticate(req);

      expect(result).toBeTruthy();
      if (typeof result === 'object' && 'data' in result) {
        expect(result.data?.scope).toBe('read write admin');
        expect((result.data as any)?.custom_claim).toBe('custom_value');
      }
    });
  });

  describe('Introspection Validation Mode', () => {
    it('should authenticate with valid token via introspection', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'introspection-valid-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'introspection-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
          exp: now + 3600,
          scope: 'read',
        },
        true
      );

      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });

      const result = await introspectionProvider.authenticate(req);

      expect(result).toBeTruthy();
      if (typeof result === 'object' && 'data' in result) {
        expect(result.data?.sub).toBe('introspection-user');
        expect(result.data?.scope).toBe('read');
      }
    });

    it('should reject inactive token', async () => {
      const token = 'introspection-inactive-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
        },
        false
      );

      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });

      const result = await introspectionProvider.authenticate(req);

      expect(result).toBe(false);
    });
  });

  describe('Token in Query String Protection', () => {
    it('should reject token in query string (access_token)', async () => {
      const token = mockServer.generateToken();
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
        host: 'localhost:8080',
      });
      req.url = `/test?access_token=${token}`;

      const result = await jwtProvider.authenticate(req);

      expect(result).toBe(false);
    });

    it('should reject token in query string (token)', async () => {
      const token = mockServer.generateToken();
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
        host: 'localhost:8080',
      });
      req.url = `/test?token=${token}`;

      const result = await jwtProvider.authenticate(req);

      expect(result).toBe(false);
    });

    it('should allow tokens when query params dont contain tokens', async () => {
      const token = mockServer.generateToken();
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
        host: 'localhost:8080',
      });
      req.url = '/test?param1=value1&param2=value2';

      const result = await jwtProvider.authenticate(req);

      expect(result).toBeTruthy();
    });
  });

  describe('WWW-Authenticate Header', () => {
    it('should generate basic WWW-Authenticate header', () => {
      const header = jwtProvider.getWWWAuthenticateHeader();

      expect(header).toContain('Bearer');
      expect(header).toContain('realm="MCP Server"');
      expect(header).toContain(`resource="${mockServer.getAudience()}"`);
    });

    it('should include error in WWW-Authenticate header', () => {
      const header = jwtProvider.getWWWAuthenticateHeader('invalid_token');

      expect(header).toContain('error="invalid_token"');
    });

    it('should include error description in WWW-Authenticate header', () => {
      const header = jwtProvider.getWWWAuthenticateHeader(
        'invalid_token',
        'The access token expired'
      );

      expect(header).toContain('error="invalid_token"');
      expect(header).toContain('error_description="The access token expired"');
    });
  });

  describe('Configuration Validation', () => {
    it('should throw error if JWT validation missing jwksUri', () => {
      expect(() => {
        new OAuthAuthProvider({
          authorizationServers: [mockServer.getIssuer()],
          resource: mockServer.getAudience(),
          validation: {
            type: 'jwt',
            audience: mockServer.getAudience(),
            issuer: mockServer.getIssuer(),
          },
        });
      }).toThrow('OAuth JWT validation requires jwksUri');
    });

    it('should throw error if introspection validation missing config', () => {
      expect(() => {
        new OAuthAuthProvider({
          authorizationServers: [mockServer.getIssuer()],
          resource: mockServer.getAudience(),
          validation: {
            type: 'introspection',
            audience: mockServer.getAudience(),
            issuer: mockServer.getIssuer(),
          },
        });
      }).toThrow('OAuth introspection validation requires introspection config');
    });
  });

  describe('Error Handling', () => {
    it('should return proper error info', () => {
      const error = jwtProvider.getAuthError();

      expect(error.status).toBe(401);
      expect(error.message).toBe('Unauthorized');
    });

    it('should handle missing Bearer token gracefully', async () => {
      const req = createMockRequest({
        authorization: 'Bearer ',
      });

      const result = await jwtProvider.authenticate(req);

      expect(result).toBe(false);
    });

    it('should handle empty Authorization header', async () => {
      const req = createMockRequest({
        authorization: '',
      });

      const result = await jwtProvider.authenticate(req);

      expect(result).toBe(false);
    });
  });

  describe('Case Sensitivity', () => {
    it('should handle lowercase authorization header', async () => {
      const token = mockServer.generateToken();
      const req = createMockRequest({
        authorization: `Bearer ${token}`,
      });

      const result = await jwtProvider.authenticate(req);

      expect(result).toBeTruthy();
    });

    it('should handle Authorization header (capitalized)', async () => {
      const token = mockServer.generateToken();
      const socket = new Socket();
      Object.defineProperty(socket, 'remoteAddress', {
        value: '127.0.0.1',
        writable: false,
      });
      const req = new IncomingMessage(socket);
      // Node.js normalizes all header names to lowercase
      req.headers = { authorization: `Bearer ${token}` };
      req.url = '/test';

      const result = await jwtProvider.authenticate(req);

      expect(result).toBeTruthy();
    });
  });
});
