import { IncomingMessage } from 'node:http';
import { AuthProvider, AuthResult } from '../types.js';
import { JWTValidator, JWTValidationConfig, TokenClaims } from '../validators/jwt-validator.js';
import {
  IntrospectionValidator,
  IntrospectionConfig,
} from '../validators/introspection-validator.js';
import { logger } from '../../core/Logger.js';

export interface OAuthConfig {
  authorizationServers: string[];
  resource: string;

  validation: {
    type: 'jwt' | 'introspection';
    audience: string;
    issuer: string;

    jwksUri?: string;
    algorithms?: string[];

    introspection?: IntrospectionConfig;
  };

  headerName?: string;
}

export class OAuthAuthProvider implements AuthProvider {
  private config: OAuthConfig;
  private validator: JWTValidator | IntrospectionValidator;

  constructor(config: OAuthConfig) {
    this.config = {
      headerName: 'Authorization',
      ...config,
    };

    if (this.config.validation.type === 'jwt') {
      if (!this.config.validation.jwksUri) {
        throw new Error('OAuth JWT validation requires jwksUri');
      }

      const jwtConfig: JWTValidationConfig = {
        jwksUri: this.config.validation.jwksUri,
        audience: this.config.validation.audience,
        issuer: this.config.validation.issuer,
        algorithms: this.config.validation.algorithms || ['RS256', 'ES256'],
      };

      this.validator = new JWTValidator(jwtConfig);
      logger.info('OAuthAuthProvider initialized with JWT validation');
    } else {
      if (!this.config.validation.introspection) {
        throw new Error('OAuth introspection validation requires introspection config');
      }

      this.validator = new IntrospectionValidator(this.config.validation.introspection);
      logger.info('OAuthAuthProvider initialized with introspection validation');
    }

    logger.debug(
      `OAuthAuthProvider config - resource: ${this.config.resource}, auth servers: ${this.config.authorizationServers.join(', ')}`
    );
  }

  async authenticate(req: IncomingMessage): Promise<boolean | AuthResult> {
    try {
      logger.debug('OAuth authentication started');

      const token = this.extractToken(req);
      if (!token) {
        logger.warn('No Bearer token found in Authorization header');
        return false;
      }

      this.validateTokenNotInQueryString(req);

      const claims = await this.validator.validate(token);

      logger.info('OAuth authentication successful');
      logger.debug(`Token claims - sub: ${claims.sub}, scope: ${claims.scope || 'N/A'}`);

      return {
        data: claims,
      };
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`OAuth authentication failed: ${error.message}`);
      }
      return false;
    }
  }

  getAuthError(): { status: number; message: string } {
    return {
      status: 401,
      message: 'Unauthorized',
    };
  }

  getWWWAuthenticateHeader(error?: string, errorDescription?: string): string {
    let header = `Bearer realm="MCP Server", resource="${this.config.resource}"`;

    if (error) {
      header += `, error="${error}"`;
    }

    if (errorDescription) {
      header += `, error_description="${errorDescription}"`;
    }

    return header;
  }

  private extractToken(req: IncomingMessage): string | null {
    const authHeader = req.headers[this.config.headerName!.toLowerCase()];

    if (!authHeader) {
      return null;
    }

    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (!headerValue) {
      return null;
    }

    const parts = headerValue.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      logger.warn(`Invalid Authorization header format: expected 'Bearer <token>'`);
      return null;
    }

    const token = parts[1];

    if (!token || token.trim() === '') {
      logger.warn('Empty token in Authorization header');
      return null;
    }

    return token;
  }

  private validateTokenNotInQueryString(req: IncomingMessage): void {
    if (!req.url) {
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.searchParams.has('access_token') || url.searchParams.has('token')) {
      logger.error('Security violation: token found in query string');
      throw new Error('Tokens in query strings are not allowed');
    }
  }
}
