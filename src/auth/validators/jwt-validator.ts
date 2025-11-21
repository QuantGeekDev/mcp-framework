import jwt, { VerifyOptions } from 'jsonwebtoken';
import jwksClient, { JwksClient, SigningKey } from 'jwks-rsa';
import { logger } from '../../core/Logger.js';

export interface TokenClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat?: number;
  scope?: string;
  [key: string]: unknown;
}

export interface JWTValidationConfig {
  jwksUri: string;
  audience: string;
  issuer: string;
  algorithms?: string[];
  cacheTTL?: number;
  rateLimit?: boolean;
  cacheMaxEntries?: number;
}

export class JWTValidator {
  private jwksClient: JwksClient;
  private config: Required<JWTValidationConfig>;

  constructor(config: JWTValidationConfig) {
    this.config = {
      algorithms: config.algorithms || ['RS256', 'ES256'],
      cacheTTL: config.cacheTTL || 900000,
      rateLimit: config.rateLimit ?? true,
      cacheMaxEntries: config.cacheMaxEntries || 5,
      ...config,
    };

    this.jwksClient = jwksClient({
      jwksUri: this.config.jwksUri,
      cache: true,
      cacheMaxEntries: this.config.cacheMaxEntries,
      cacheMaxAge: this.config.cacheTTL,
      rateLimit: this.config.rateLimit,
      jwksRequestsPerMinute: this.config.rateLimit ? 10 : undefined,
    });

    logger.debug(
      `JWTValidator initialized with JWKS URI: ${this.config.jwksUri}, audience: ${this.config.audience}`
    );
  }

  async validate(token: string): Promise<TokenClaims> {
    try {
      logger.debug('Starting JWT validation');

      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || typeof decoded === 'string') {
        throw new Error('Invalid token format: unable to decode');
      }

      logger.debug(`Token decoded, kid: ${decoded.header.kid}, alg: ${decoded.header.alg}`);

      if (!decoded.header.kid) {
        throw new Error('Invalid token: missing kid in header');
      }

      if (!this.config.algorithms.includes(decoded.header.alg)) {
        throw new Error(
          `Invalid token algorithm: ${decoded.header.alg}. Expected one of: ${this.config.algorithms.join(', ')}`
        );
      }

      const key = await this.getSigningKey(decoded.header.kid);

      logger.debug('Verifying token signature and claims');
      const verified = await this.verifyToken(token, key);

      logger.debug('JWT validation successful');
      return verified;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`JWT validation failed: ${error.message}`);
        throw error;
      }
      throw new Error('JWT validation failed: Unknown error');
    }
  }

  private async getSigningKey(kid: string): Promise<string> {
    try {
      logger.debug(`Fetching signing key for kid: ${kid}`);
      const key: SigningKey = await this.jwksClient.getSigningKey(kid);
      const publicKey = key.getPublicKey();
      logger.debug('Signing key retrieved successfully');
      return publicKey;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to fetch signing key: ${error.message}`);
        throw new Error(`Failed to fetch signing key: ${error.message}`);
      }
      throw new Error('Failed to fetch signing key: Unknown error');
    }
  }

  private async verifyToken(token: string, publicKey: string): Promise<TokenClaims> {
    return new Promise((resolve, reject) => {
      const options: VerifyOptions = {
        algorithms: this.config.algorithms as jwt.Algorithm[],
        issuer: this.config.issuer,
        complete: false,
      };

      // Only validate audience if not set to wildcard
      // For Cognito Access Tokens, 'aud' is missing but 'client_id' is present.
      // We disable the library's strict check and handle it manually in the callback.
      // if (this.config.audience !== '*') {
      //   options.audience = this.config.audience;
      // }

      jwt.verify(token, publicKey, options, (err, decoded) => {
        if (err) {
          if (err.name === 'TokenExpiredError') {
            logger.warn('Token has expired');
            reject(new Error('Token has expired'));
          } else if (err.name === 'JsonWebTokenError') {
            logger.warn(`Token verification failed: ${err.message}`);
            reject(new Error(`Token verification failed: ${err.message}`));
          } else if (err.name === 'NotBeforeError') {
            logger.warn('Token not yet valid (nbf claim)');
            reject(new Error('Token not yet valid'));
          } else {
            logger.error(`Token verification error: ${err.message}`);
            reject(new Error(`Token verification error: ${err.message}`));
          }
          return;
        }

        if (!decoded || typeof decoded === 'string') {
          reject(new Error('Invalid token payload'));
          return;
        }

        const claims = decoded as TokenClaims;

        if (!claims.sub) {
          reject(new Error('Token missing required claim: sub'));
          return;
        }

        if (!claims.iss) {
          reject(new Error('Token missing required claim: iss'));
          return;
        }

        // Only require aud/client_id claim if not set to wildcard
        if (this.config.audience !== '*') {
          const aud = claims.aud;
          const clientId = claims.client_id as string | undefined;
          const expectedAudience = this.config.audience;

          let isValidAudience = false;

          // Check 'aud' claim (ID Tokens)
          if (aud) {
            if (Array.isArray(aud)) {
              if (aud.includes(expectedAudience)) isValidAudience = true;
            } else {
              if (aud === expectedAudience) isValidAudience = true;
            }
          }
          
          // Check 'client_id' claim (Access Tokens)
          if (!isValidAudience && clientId) {
            if (clientId === expectedAudience) isValidAudience = true;
          }

          if (!isValidAudience) {
             reject(new Error(`Token audience mismatch. Expected ${expectedAudience}, got aud: ${aud}, client_id: ${clientId}`));
             return;
          }
        }

        if (!claims.exp) {
          reject(new Error('Token missing required claim: exp'));
          return;
        }

        const audInfo = claims.aud
          ? `aud: ${Array.isArray(claims.aud) ? claims.aud.join(', ') : claims.aud}`
          : 'aud: <not present - wildcard mode>';

        logger.debug(`Token claims validated - sub: ${claims.sub}, iss: ${claims.iss}, ${audInfo}`);
        resolve(claims);
      });
    });
  }
}
