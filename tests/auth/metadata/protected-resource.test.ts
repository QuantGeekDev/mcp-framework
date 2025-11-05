import { describe, it, expect } from '@jest/globals';
import { ServerResponse } from 'node:http';
import { ProtectedResourceMetadata } from '../../../src/auth/metadata/protected-resource.js';
import { Socket } from 'node:net';

describe('ProtectedResourceMetadata', () => {
  describe('Configuration Validation', () => {
    it('should create metadata with valid config', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://auth.example.com'],
        resource: 'https://mcp.example.com',
      });

      expect(metadata).toBeDefined();
    });

    it('should throw error for empty resource', () => {
      expect(() => {
        new ProtectedResourceMetadata({
          authorizationServers: ['https://auth.example.com'],
          resource: '',
        });
      }).toThrow('OAuth metadata requires a resource identifier');
    });

    it('should throw error for missing authorization servers', () => {
      expect(() => {
        new ProtectedResourceMetadata({
          authorizationServers: [],
          resource: 'https://mcp.example.com',
        });
      }).toThrow('OAuth metadata requires at least one authorization server');
    });

    it('should throw error for invalid authorization server URL', () => {
      expect(() => {
        new ProtectedResourceMetadata({
          authorizationServers: ['not-a-valid-url'],
          resource: 'https://mcp.example.com',
        });
      }).toThrow('Invalid authorization server URL');
    });

    it('should throw error for empty authorization server URL', () => {
      expect(() => {
        new ProtectedResourceMetadata({
          authorizationServers: [''],
          resource: 'https://mcp.example.com',
        });
      }).toThrow('Authorization server URL cannot be empty');
    });
  });

  describe('Metadata Generation', () => {
    it('should generate RFC 9728 compliant metadata', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://auth.example.com'],
        resource: 'https://mcp.example.com',
      });

      const generated = metadata.generateMetadata();

      expect(generated).toEqual({
        resource: 'https://mcp.example.com',
        authorization_servers: ['https://auth.example.com'],
      });
    });

    it('should support multiple authorization servers', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: [
          'https://auth1.example.com',
          'https://auth2.example.com',
          'https://auth3.example.com',
        ],
        resource: 'https://mcp.example.com',
      });

      const generated = metadata.generateMetadata();

      expect(generated.authorization_servers).toHaveLength(3);
      expect(generated.authorization_servers).toContain('https://auth1.example.com');
      expect(generated.authorization_servers).toContain('https://auth2.example.com');
      expect(generated.authorization_servers).toContain('https://auth3.example.com');
    });

    it('should generate valid JSON', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://auth.example.com'],
        resource: 'https://mcp.example.com',
      });

      const json = metadata.toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.resource).toBe('https://mcp.example.com');
      expect(parsed.authorization_servers).toEqual(['https://auth.example.com']);
    });

    it('should format JSON with proper indentation', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://auth.example.com'],
        resource: 'https://mcp.example.com',
      });

      const json = metadata.toJSON();

      expect(json).toContain('\n');
      expect(json).toMatch(/"resource":/);
      expect(json).toMatch(/"authorization_servers":/);
    });
  });

  describe('HTTP Serving', () => {
    const createMockResponse = (): ServerResponse => {
      const res = new ServerResponse(
        {} as any
      );
      const socket = new Socket();
      res.assignSocket(socket);
      return res;
    };

    it('should serve metadata with correct Content-Type', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://auth.example.com'],
        resource: 'https://mcp.example.com',
      });

      const res = createMockResponse();
      const capturedHeaders: Record<string, string> = {};
      let capturedStatus = 0;
      let capturedBody = '';

      res.setHeader = (name: string, value: string | string[]) => {
        capturedHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
        return res;
      };

      res.writeHead = ((status: number) => {
        capturedStatus = status;
        return res;
      }) as any;

      res.end = ((body?: string) => {
        capturedBody = body || '';
        return res;
      }) as any;

      metadata.serve(res);

      expect(capturedHeaders['content-type']).toBe('application/json');
      expect(capturedHeaders['cache-control']).toBe('public, max-age=3600');
      expect(capturedStatus).toBe(200);
      expect(capturedBody).toBeTruthy();
    });

    it('should serve valid JSON body', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://auth.example.com'],
        resource: 'https://mcp.example.com',
      });

      const res = createMockResponse();
      let capturedBody = '';

      res.setHeader = () => res;
      res.writeHead = (() => res) as any;
      res.end = ((body?: string) => {
        capturedBody = body || '';
        return res;
      }) as any;

      metadata.serve(res);

      const parsed = JSON.parse(capturedBody);
      expect(parsed.resource).toBe('https://mcp.example.com');
      expect(parsed.authorization_servers).toEqual(['https://auth.example.com']);
    });

    it('should set cache control header', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://auth.example.com'],
        resource: 'https://mcp.example.com',
      });

      const res = createMockResponse();
      let cacheControl = '';

      res.setHeader = (name: string, value: string | string[]) => {
        if (name.toLowerCase() === 'cache-control') {
          cacheControl = Array.isArray(value) ? value.join(', ') : value;
        }
        return res;
      };

      res.writeHead = (() => res) as any;
      res.end = (() => res) as any;

      metadata.serve(res);

      expect(cacheControl).toContain('public');
      expect(cacheControl).toContain('max-age=3600');
    });
  });

  describe('URL Formats', () => {
    it('should accept HTTPS URLs', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://secure-auth.example.com'],
        resource: 'https://secure-mcp.example.com',
      });

      expect(metadata).toBeDefined();
    });

    it('should accept HTTP URLs (for local development)', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['http://localhost:9000'],
        resource: 'http://localhost:8080',
      });

      expect(metadata).toBeDefined();
    });

    it('should accept URLs with ports', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://auth.example.com:8443'],
        resource: 'https://mcp.example.com:8080',
      });

      const generated = metadata.generateMetadata();
      expect(generated.authorization_servers[0]).toBe('https://auth.example.com:8443');
    });

    it('should accept URLs with paths', () => {
      const metadata = new ProtectedResourceMetadata({
        authorizationServers: ['https://example.com/oauth/server'],
        resource: 'https://example.com/mcp/server',
      });

      const generated = metadata.generateMetadata();
      expect(generated.resource).toBe('https://example.com/mcp/server');
    });
  });
});
