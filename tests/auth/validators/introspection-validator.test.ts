import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { IntrospectionValidator } from '../../../src/auth/validators/introspection-validator.js';
import { MockAuthServer } from '../../fixtures/mock-auth-server.js';

describe('IntrospectionValidator', () => {
  let mockServer: MockAuthServer;
  let validator: IntrospectionValidator;

  beforeAll(async () => {
    mockServer = new MockAuthServer({ port: 9002 });
    await mockServer.start();

    validator = new IntrospectionValidator({
      endpoint: mockServer.getIntrospectionEndpoint(),
      clientId: 'test-client',
      clientSecret: 'test-secret',
      cacheTTL: 1000,
    });
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  describe('Active Token Validation', () => {
    it('should validate active token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'test-active-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
          exp: now + 3600,
          scope: 'read write',
        },
        true
      );

      const claims = await validator.validate(token);

      expect(claims).toBeDefined();
      expect(claims.sub).toBe('test-user');
      expect(claims.iss).toBe(mockServer.getIssuer());
      expect(claims.aud).toBe(mockServer.getAudience());
      expect(claims.scope).toBe('read write');
    });

    it('should reject inactive token', async () => {
      const token = 'test-inactive-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
        },
        false
      );

      await expect(validator.validate(token)).rejects.toThrow('Token is inactive');
    });

    it('should reject unknown token', async () => {
      const token = 'unknown-token';

      await expect(validator.validate(token)).rejects.toThrow('Token is inactive');
    });
  });

  describe('Required Claims', () => {
    it('should reject token missing sub claim', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'test-no-sub-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
          exp: now + 3600,
        },
        true
      );

      await expect(validator.validate(token)).rejects.toThrow(
        'Introspection response missing required field: sub'
      );
    });

    it('should reject token missing iss claim', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'test-no-iss-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          aud: mockServer.getAudience(),
          exp: now + 3600,
        },
        true
      );

      await expect(validator.validate(token)).rejects.toThrow(
        'Introspection response missing required field: iss'
      );
    });

    it('should reject token missing aud claim', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'test-no-aud-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          exp: now + 3600,
        },
        true
      );

      await expect(validator.validate(token)).rejects.toThrow(
        'Introspection response missing required field: aud'
      );
    });

    it('should reject token missing exp claim', async () => {
      const token = 'test-no-exp-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
        },
        true
      );

      await expect(validator.validate(token)).rejects.toThrow(
        'Introspection response missing required field: exp'
      );
    });
  });

  describe('Token Expiration', () => {
    it('should reject expired token from introspection', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'test-expired-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
          exp: now - 3600,
        },
        true
      );

      await expect(validator.validate(token)).rejects.toThrow('Token has expired');
    });

    it('should accept token with future expiration', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'test-future-exp-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
          exp: now + 7200,
        },
        true
      );

      const claims = await validator.validate(token);
      expect(claims).toBeDefined();
    });

    it('should reject token with future nbf claim', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'test-future-nbf-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
          exp: now + 7200,
          nbf: now + 3600,
        },
        true
      );

      await expect(validator.validate(token)).rejects.toThrow('Token not yet valid');
    });
  });

  describe('Caching', () => {
    it('should cache introspection results', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'test-cache-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
          exp: now + 3600,
        },
        true
      );

      const startTime = Date.now();
      await validator.validate(token);
      const firstCallTime = Date.now() - startTime;

      const cachedStartTime = Date.now();
      await validator.validate(token);
      const cachedCallTime = Date.now() - cachedStartTime;

      expect(cachedCallTime).toBeLessThanOrEqual(firstCallTime);
    });

    it('should expire cache after TTL', async () => {
      const shortTTLValidator = new IntrospectionValidator({
        endpoint: mockServer.getIntrospectionEndpoint(),
        clientId: 'test-client',
        clientSecret: 'test-secret',
        cacheTTL: 100,
      });

      const now = Math.floor(Date.now() / 1000);
      const token = 'test-ttl-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
          exp: now + 3600,
        },
        true
      );

      await shortTTLValidator.validate(token);

      await new Promise((resolve) => setTimeout(resolve, 150));

      await shortTTLValidator.validate(token);
    });
  });

  describe('Custom Claims', () => {
    it('should return custom claims from introspection', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = 'test-custom-claims-token';

      mockServer.registerTokenForIntrospection(
        token,
        {
          sub: 'test-user',
          iss: mockServer.getIssuer(),
          aud: mockServer.getAudience(),
          exp: now + 3600,
          scope: 'admin read write',
          custom_field: 'custom_value',
          roles: ['admin', 'user'],
        },
        true
      );

      const claims = await validator.validate(token);

      expect(claims.scope).toBe('admin read write');
      expect((claims as any).custom_field).toBe('custom_value');
      expect((claims as any).roles).toEqual(['admin', 'user']);
    });
  });
});
