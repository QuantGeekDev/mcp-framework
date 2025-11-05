import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { JWTValidator } from '../../../src/auth/validators/jwt-validator.js';
import { MockAuthServer } from '../../fixtures/mock-auth-server.js';

describe('JWTValidator', () => {
  let mockServer: MockAuthServer;
  let validator: JWTValidator;

  beforeAll(async () => {
    mockServer = new MockAuthServer({ port: 9001 });
    await mockServer.start();

    validator = new JWTValidator({
      jwksUri: mockServer.getJWKSUri(),
      audience: mockServer.getAudience(),
      issuer: mockServer.getIssuer(),
    });
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  describe('Token Validation', () => {
    it('should validate a valid JWT token', async () => {
      const token = mockServer.generateToken();
      const claims = await validator.validate(token);

      expect(claims).toBeDefined();
      expect(claims.sub).toBe('test-user-123');
      expect(claims.iss).toBe(mockServer.getIssuer());
      expect(claims.aud).toBe(mockServer.getAudience());
      expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should validate token with custom claims', async () => {
      const token = mockServer.generateToken({
        sub: 'custom-user',
        scope: 'read:data write:data',
        custom_claim: 'custom_value',
      });

      const claims = await validator.validate(token);

      expect(claims.sub).toBe('custom-user');
      expect(claims.scope).toBe('read:data write:data');
      expect((claims as any).custom_claim).toBe('custom_value');
    });

    it('should reject expired token', async () => {
      const token = mockServer.generateExpiredToken();

      await expect(validator.validate(token)).rejects.toThrow('Token has expired');
    });

    it('should reject token not yet valid (nbf)', async () => {
      const token = mockServer.generateFutureToken();

      await expect(validator.validate(token)).rejects.toThrow('Token not yet valid');
    });

    it('should reject token with wrong audience', async () => {
      const token = mockServer.generateToken({
        aud: 'https://wrong-audience.com',
      });

      await expect(validator.validate(token)).rejects.toThrow();
    });

    it('should reject token with wrong issuer', async () => {
      const token = mockServer.generateToken({
        iss: 'https://wrong-issuer.com',
      });

      await expect(validator.validate(token)).rejects.toThrow();
    });

    it('should reject malformed token', async () => {
      const malformedToken = 'not.a.valid.jwt.token';

      await expect(validator.validate(malformedToken)).rejects.toThrow();
    });

    it('should reject token without kid in header', async () => {
      const tokenWithoutKid = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid';

      await expect(validator.validate(tokenWithoutKid)).rejects.toThrow();
    });
  });

  describe('Algorithm Support', () => {
    it('should accept RS256 algorithm by default', async () => {
      const token = mockServer.generateToken();
      const claims = await validator.validate(token);

      expect(claims).toBeDefined();
    });

    it('should reject unsupported algorithm when configured', async () => {
      const restrictedValidator = new JWTValidator({
        jwksUri: mockServer.getJWKSUri(),
        audience: mockServer.getAudience(),
        issuer: mockServer.getIssuer(),
        algorithms: ['ES256'],
      });

      const token = mockServer.generateToken();

      await expect(restrictedValidator.validate(token)).rejects.toThrow(
        'Invalid token algorithm: RS256'
      );
    });
  });

  describe('Required Claims', () => {
    it('should extract all standard claims', async () => {
      const token = mockServer.generateToken({
        scope: 'read write',
      });

      const claims = await validator.validate(token);

      expect(claims.sub).toBeDefined();
      expect(claims.iss).toBeDefined();
      expect(claims.aud).toBeDefined();
      expect(claims.exp).toBeDefined();
      expect(claims.iat).toBeDefined();
      expect(claims.nbf).toBeDefined();
      expect(claims.scope).toBe('read write');
    });
  });

  describe('JWKS Caching', () => {
    it('should cache keys for performance', async () => {
      const token1 = mockServer.generateToken();
      const token2 = mockServer.generateToken({ sub: 'another-user' });

      const startTime = Date.now();
      await validator.validate(token1);
      const firstValidationTime = Date.now() - startTime;

      const cachedStartTime = Date.now();
      await validator.validate(token2);
      const cachedValidationTime = Date.now() - cachedStartTime;

      expect(cachedValidationTime).toBeLessThanOrEqual(firstValidationTime);
    });
  });
});
