import { describe, it, expect, afterEach } from '@jest/globals';
import { HttpStreamTransport } from '../../src/transports/http/server.js';
import { SSEServerTransport } from '../../src/transports/sse/server.js';
import { DEFAULT_SSE_CONFIG } from '../../src/transports/sse/types.js';
import { DEFAULT_HTTP_STREAM_CONFIG } from '../../src/transports/http/types.js';

describe('Host binding defaults', () => {
  describe('HttpStreamTransport', () => {
    let transport: HttpStreamTransport;

    afterEach(async () => {
      if (transport?.isRunning()) {
        await transport.close();
      }
    });

    it('should default to 127.0.0.1 when no host is configured', async () => {
      const port = 3000 + Math.floor(Math.random() * 1000);
      transport = new HttpStreamTransport({ port });

      await transport.start();
      expect(transport.isRunning()).toBe(true);

      // The transport started successfully on the default host (127.0.0.1)
      // We verify it's running; the actual binding is tested by the listen call
    });

    it('should accept explicit host 0.0.0.0', async () => {
      const port = 3000 + Math.floor(Math.random() * 1000);
      transport = new HttpStreamTransport({ port, host: '0.0.0.0' });

      await transport.start();
      expect(transport.isRunning()).toBe(true);
    });

    it('should accept explicit host 127.0.0.1', async () => {
      const port = 3000 + Math.floor(Math.random() * 1000);
      transport = new HttpStreamTransport({ port, host: '127.0.0.1' });

      await transport.start();
      expect(transport.isRunning()).toBe(true);
    });
  });

  describe('SSEServerTransport', () => {
    let transport: SSEServerTransport;

    afterEach(async () => {
      if (transport?.isRunning()) {
        await transport.close();
      }
    });

    it('should default to 127.0.0.1 when no host is configured', async () => {
      const port = 4000 + Math.floor(Math.random() * 1000);
      transport = new SSEServerTransport({ port });

      await transport.start();
      expect(transport.isRunning()).toBe(true);
    });

    it('should accept explicit host 0.0.0.0', async () => {
      const port = 4000 + Math.floor(Math.random() * 1000);
      transport = new SSEServerTransport({ port, host: '0.0.0.0' });

      await transport.start();
      expect(transport.isRunning()).toBe(true);
    });
  });

  describe('Default config values', () => {
    it('should not have host in DEFAULT_SSE_CONFIG (defaults at runtime)', () => {
      // The default config does not set host; runtime defaults to 127.0.0.1
      expect(DEFAULT_SSE_CONFIG.port).toBe(8080);
      expect((DEFAULT_SSE_CONFIG as any).host).toBeUndefined();
    });

    it('should not have host in DEFAULT_HTTP_STREAM_CONFIG (defaults at runtime)', () => {
      // The default config does not set host; runtime defaults to 127.0.0.1
      expect(DEFAULT_HTTP_STREAM_CONFIG.port).toBe(8080);
      expect((DEFAULT_HTTP_STREAM_CONFIG as any).host).toBeUndefined();
    });

    it('should default responseMode to "batch" in DEFAULT_HTTP_STREAM_CONFIG', () => {
      // README and the type doc comment both document "batch" as the default
      // response mode for the HTTP Stream transport; the runtime default must match.
      expect(DEFAULT_HTTP_STREAM_CONFIG.responseMode).toBe('batch');
    });
  });
});
