import { createServer, Server as HttpServer, IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';

export interface MockAuthServerConfig {
  port?: number;
  issuer?: string;
  audience?: string;
}

export class MockAuthServer {
  private server?: HttpServer;
  private port: number;
  private issuer: string;
  private audience: string;
  private privateKey: string;
  private publicKey: string;
  private kid: string;
  private tokens: Map<string, { active: boolean; claims: any }>;

  constructor(config: MockAuthServerConfig = {}) {
    this.port = config.port || 9000;
    this.issuer = config.issuer || 'https://auth.example.com';
    this.audience = config.audience || 'https://mcp.example.com';
    this.tokens = new Map();

    // Generate RSA key pair for testing
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.kid = 'test-key-1';
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url!, `http://localhost:${this.port}`);

    if (url.pathname === '/.well-known/jwks.json') {
      this.serveJWKS(res);
    } else if (url.pathname === '/oauth/introspect') {
      this.handleIntrospection(req, res);
    } else if (url.pathname === '/.well-known/oauth-authorization-server') {
      this.serveAuthServerMetadata(res);
    } else {
      res.writeHead(404).end('Not Found');
    }
  }

  private serveJWKS(res: ServerResponse): void {
    // Export the actual public key as JWK
    const keyObject = createPublicKey(this.publicKey);
    const jwk = keyObject.export({ format: 'jwk' }) as any;

    const jwks = {
      keys: [
        {
          kty: jwk.kty,
          use: 'sig',
          kid: this.kid,
          n: jwk.n,
          e: jwk.e,
          alg: 'RS256',
        },
      ],
    };

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(jwks));
  }

  private async handleIntrospection(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      const params = new URLSearchParams(body);
      const token = params.get('token');

      if (!token) {
        res.writeHead(400).end(JSON.stringify({ error: 'invalid_request' }));
        return;
      }

      const tokenData = this.tokens.get(token);
      if (!tokenData) {
        res.writeHead(200).end(
          JSON.stringify({
            active: false,
          })
        );
        return;
      }

      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(
        JSON.stringify({
          active: tokenData.active,
          ...tokenData.claims,
        })
      );
    });
  }

  private serveAuthServerMetadata(res: ServerResponse): void {
    const metadata = {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/authorize`,
      token_endpoint: `${this.issuer}/token`,
      jwks_uri: `http://localhost:${this.port}/.well-known/jwks.json`,
      introspection_endpoint: `http://localhost:${this.port}/oauth/introspect`,
    };

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(metadata));
  }

  generateToken(claims?: Partial<any>): string {
    const now = Math.floor(Date.now() / 1000);
    const tokenClaims = {
      iss: this.issuer,
      sub: 'test-user-123',
      aud: this.audience,
      exp: now + 3600,
      iat: now,
      nbf: now,
      ...claims,
    };

    return jwt.sign(tokenClaims, this.privateKey, {
      algorithm: 'RS256',
      keyid: this.kid,
    });
  }

  generateExpiredToken(claims?: Partial<any>): string {
    const now = Math.floor(Date.now() / 1000);
    const tokenClaims = {
      iss: this.issuer,
      sub: 'test-user-123',
      aud: this.audience,
      exp: now - 3600,
      iat: now - 7200,
      nbf: now - 7200,
      ...claims,
    };

    return jwt.sign(tokenClaims, this.privateKey, {
      algorithm: 'RS256',
      keyid: this.kid,
    });
  }

  generateFutureToken(claims?: Partial<any>): string {
    const now = Math.floor(Date.now() / 1000);
    const tokenClaims = {
      iss: this.issuer,
      sub: 'test-user-123',
      aud: this.audience,
      exp: now + 7200,
      iat: now,
      nbf: now + 3600,
      ...claims,
    };

    return jwt.sign(tokenClaims, this.privateKey, {
      algorithm: 'RS256',
      keyid: this.kid,
    });
  }

  registerTokenForIntrospection(token: string, claims: any, active: boolean = true): void {
    this.tokens.set(token, { active, claims });
  }

  getJWKSUri(): string {
    return `http://localhost:${this.port}/.well-known/jwks.json`;
  }

  getIntrospectionEndpoint(): string {
    return `http://localhost:${this.port}/oauth/introspect`;
  }

  getIssuer(): string {
    return this.issuer;
  }

  getAudience(): string {
    return this.audience;
  }
}
