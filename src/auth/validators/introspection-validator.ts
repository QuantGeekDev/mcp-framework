import crypto from 'crypto';
import { logger } from '../../core/Logger.js';
import { TokenClaims } from './jwt-validator.js';

export interface IntrospectionConfig {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  cacheTTL?: number;
}

interface IntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  sub?: string;
  aud?: string | string[];
  iss?: string;
  jti?: string;
  [key: string]: unknown;
}

interface CachedIntrospection {
  response: IntrospectionResponse;
  timestamp: number;
}

export class IntrospectionValidator {
  private config: Required<IntrospectionConfig>;
  private cache: Map<string, CachedIntrospection>;

  constructor(config: IntrospectionConfig) {
    this.config = {
      cacheTTL: config.cacheTTL || 300000,
      ...config,
    };
    this.cache = new Map();

    logger.debug(
      `IntrospectionValidator initialized with endpoint: ${this.config.endpoint}, cacheTTL: ${this.config.cacheTTL}ms`
    );
  }

  async validate(token: string): Promise<TokenClaims> {
    try {
      logger.debug('Starting token introspection');

      const cached = this.getCachedIntrospection(token);
      if (cached) {
        logger.debug('Using cached introspection result');
        return this.convertToClaims(cached);
      }

      const response = await this.introspectToken(token);

      if (!response.active) {
        logger.warn('Token is inactive');
        throw new Error('Token is inactive');
      }

      this.cacheIntrospection(token, response);

      const claims = this.convertToClaims(response);
      logger.debug('Token introspection successful');
      return claims;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Token introspection failed: ${error.message}`);
        throw error;
      }
      throw new Error('Token introspection failed: Unknown error');
    }
  }

  private async introspectToken(token: string): Promise<IntrospectionResponse> {
    try {
      logger.debug('Calling introspection endpoint');

      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({ token }),
      });

      if (!response.ok) {
        throw new Error(
          `Introspection endpoint returned ${response.status}: ${response.statusText}`
        );
      }

      const data = (await response.json()) as IntrospectionResponse;

      if (typeof data.active !== 'boolean') {
        throw new Error('Invalid introspection response: missing active field');
      }

      logger.debug(
        `Introspection response received - active: ${data.active}, sub: ${data.sub || 'N/A'}`
      );
      return data;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Introspection request failed: ${error.message}`);
        throw new Error(`Introspection request failed: ${error.message}`);
      }
      throw new Error('Introspection request failed: Unknown error');
    }
  }

  private getCachedIntrospection(token: string): IntrospectionResponse | null {
    const tokenHash = this.hashToken(token);
    const cached = this.cache.get(tokenHash);

    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > this.config.cacheTTL) {
      logger.debug('Cached introspection expired, removing from cache');
      this.cache.delete(tokenHash);
      return null;
    }

    if (cached.response.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= cached.response.exp) {
        logger.debug('Cached token expired, removing from cache');
        this.cache.delete(tokenHash);
        return null;
      }
    }

    return cached.response;
  }

  private cacheIntrospection(token: string, response: IntrospectionResponse): void {
    const tokenHash = this.hashToken(token);
    this.cache.set(tokenHash, {
      response,
      timestamp: Date.now(),
    });

    this.cleanupCache();
    logger.debug('Introspection result cached');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [tokenHash, cached] of this.cache.entries()) {
      const age = now - cached.timestamp;
      if (age > this.config.cacheTTL) {
        this.cache.delete(tokenHash);
      } else if (cached.response.exp) {
        const nowSec = Math.floor(now / 1000);
        if (nowSec >= cached.response.exp) {
          this.cache.delete(tokenHash);
        }
      }
    }
  }

  private convertToClaims(response: IntrospectionResponse): TokenClaims {
    if (!response.sub) {
      throw new Error('Introspection response missing required field: sub');
    }

    if (!response.iss) {
      throw new Error('Introspection response missing required field: iss');
    }

    if (!response.aud) {
      throw new Error('Introspection response missing required field: aud');
    }

    if (!response.exp) {
      throw new Error('Introspection response missing required field: exp');
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= response.exp) {
      throw new Error('Token has expired');
    }

    if (response.nbf && now < response.nbf) {
      throw new Error('Token not yet valid (nbf claim)');
    }

    return {
      sub: response.sub,
      iss: response.iss,
      aud: response.aud,
      exp: response.exp,
      nbf: response.nbf,
      iat: response.iat,
      scope: response.scope,
      ...response,
    };
  }
}
