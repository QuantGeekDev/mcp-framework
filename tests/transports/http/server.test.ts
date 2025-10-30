import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { HttpStreamTransport } from '../../../src/transports/http/server.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

describe('HttpStreamTransport', () => {
  let transport: HttpStreamTransport;

  beforeEach(() => {
    // Use a random port for testing
    const mockPort = 3000 + Math.floor(Math.random() * 1000);

    transport = new HttpStreamTransport({
      port: mockPort,
      endpoint: '/mcp',
      responseMode: 'stream',
    });
  });

  afterEach(async () => {
    if (transport.isRunning()) {
      await transport.close();
    }
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultTransport = new HttpStreamTransport();
      expect(defaultTransport).toBeDefined();
      expect(defaultTransport.type).toBe('http-stream');
    });

    it('should initialize with custom configuration', () => {
      const customTransport = new HttpStreamTransport({
        port: 9999,
        endpoint: '/custom-mcp',
        responseMode: 'batch',
      });

      expect(customTransport).toBeDefined();
      expect(customTransport.type).toBe('http-stream');
    });
  });

  describe('Transport Management', () => {
    it('should start and stop successfully', async () => {
      expect(transport.isRunning()).toBe(false);

      await transport.start();
      expect(transport.isRunning()).toBe(true);

      await transport.close();
      expect(transport.isRunning()).toBe(false);
    });

    it('should handle multiple start/stop cycles', async () => {
      // First cycle
      await transport.start();
      expect(transport.isRunning()).toBe(true);
      await transport.close();
      expect(transport.isRunning()).toBe(false);

      // Second cycle
      await transport.start();
      expect(transport.isRunning()).toBe(true);
      await transport.close();
      expect(transport.isRunning()).toBe(false);
    });

    it('should not throw when closing a non-running transport', async () => {
      expect(transport.isRunning()).toBe(false);
      await expect(transport.close()).resolves.toBeUndefined();
    });

    it('should throw when trying to start an already running transport', async () => {
      await transport.start();
      expect(transport.isRunning()).toBe(true);

      await expect(transport.start()).rejects.toThrow('HttpStreamTransport already started');
    });
  });

  describe('Message Broadcasting', () => {
    it('should handle empty session list gracefully', async () => {
      const testMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
      };

      // Should not throw when no sessions exist
      await expect(transport.send(testMessage)).resolves.toBeUndefined();
    });

    it('should handle message sending without active server', async () => {
      const testMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'notification',
        params: { data: 'test' },
      };

      // Should handle gracefully when transport not started
      await expect(transport.send(testMessage)).resolves.toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should handle different response modes', () => {
      const streamTransport = new HttpStreamTransport({
        responseMode: 'stream',
      });
      expect(streamTransport).toBeDefined();

      const batchTransport = new HttpStreamTransport({
        responseMode: 'batch',
      });
      expect(batchTransport).toBeDefined();
    });
  });

  describe('Multi-Client Architecture', () => {
    it('should initialize transport maps correctly', () => {
      const transport = new HttpStreamTransport();

      // Transport should be created successfully
      expect(transport).toBeDefined();
      expect(transport.type).toBe('http-stream');

      // Should start in non-running state
      expect(transport.isRunning()).toBe(false);
    });

    it('should handle server lifecycle correctly', async () => {
      // Start and verify state
      await transport.start();
      expect(transport.isRunning()).toBe(true);

      // Stop and verify cleanup
      await transport.close();
      expect(transport.isRunning()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle port conflicts gracefully', async () => {
      const port = 3000 + Math.floor(Math.random() * 1000);

      const transport1 = new HttpStreamTransport({ port });
      const transport2 = new HttpStreamTransport({ port });

      try {
        await transport1.start();
        expect(transport1.isRunning()).toBe(true);

        // Second transport should fail to start on same port
        await expect(transport2.start()).rejects.toThrow();
      } finally {
        await transport1.close();
        await transport2.close();
      }
    });

    it('should handle configuration errors gracefully', () => {
      // Invalid configurations should still create transport objects
      // but may fail during start()
      const invalidTransport = new HttpStreamTransport({
        port: -1, // Invalid port
      });

      expect(invalidTransport).toBeDefined();
      expect(invalidTransport.type).toBe('http-stream');
    });
  });

  describe('Unified Transport Architecture', () => {
    it('should use standard MCP protocol flow like other transports', () => {
      // HTTP transport now uses the same unified architecture as SSE and stdio
      expect(transport).toBeDefined();
      expect(transport.type).toBe('http-stream');

      // Should have standard transport interface methods
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.close).toBe('function');
      expect(typeof transport.start).toBe('function');
      expect(typeof transport.isRunning).toBe('function');
    });

    it('should support message handling through onmessage handler', () => {
      // HTTP transport now uses standard onmessage handler like other transports
      let messageReceived: JSONRPCMessage | undefined;

      // Setting onmessage should not throw
      expect(() => {
        transport.onmessage = async (message: JSONRPCMessage) => {
          messageReceived = message;
        };
      }).not.toThrow();

      // Verify the transport has the onmessage property in its interface
      expect('onmessage' in transport).toBe(true);
    });
  });
});
