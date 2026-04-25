import { describe, it, expect, jest, afterEach, beforeEach } from "@jest/globals";
import { StdioServerTransport } from "../../../src/transports/stdio/server.js";

/**
 * Regression tests for stdin-EOF handling.
 *
 * Without the listeners installed in StdioServerTransport.start(), the
 * underlying SDK readline poll spins on null reads after the parent process
 * disconnects, leaving the MCP server reparented to init at ~99% CPU.
 *
 * These tests verify:
 *  1. process.stdin "close" → process.exit(0)
 *  2. process.stdin "end"   → process.exit(0)
 *  3. close() removes the listeners (no leak / re-instantiation safety)
 */
describe("StdioServerTransport — stdin EOF handling", () => {
  let transport: StdioServerTransport | undefined;
  let exitSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    // Mock process.exit so the test runner survives — record the call instead.
    exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {
      // Intentionally a no-op. Real behavior is verified via the spy assertion.
    }) as never);
  });

  afterEach(async () => {
    if (transport?.isRunning()) {
      await transport.close();
    }
    transport = undefined;
    exitSpy.mockRestore();
  });

  it('exits with code 0 when process.stdin emits "close"', async () => {
    transport = new StdioServerTransport();
    await transport.start();

    process.stdin.emit("close");
    // Wait one microtask + macrotask for transport.close().finally chain.
    await new Promise((resolve) => setImmediate(resolve));

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits with code 0 when process.stdin emits "end"', async () => {
    transport = new StdioServerTransport();
    await transport.start();

    process.stdin.emit("end");
    await new Promise((resolve) => setImmediate(resolve));

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("removes stdin listeners on close() so re-instantiation is leak-free", async () => {
    const baselineEnd = process.stdin.listenerCount("end");
    const baselineClose = process.stdin.listenerCount("close");

    transport = new StdioServerTransport();
    await transport.start();

    expect(process.stdin.listenerCount("end")).toBe(baselineEnd + 1);
    expect(process.stdin.listenerCount("close")).toBe(baselineClose + 1);

    await transport.close();
    transport = undefined;

    expect(process.stdin.listenerCount("end")).toBe(baselineEnd);
    expect(process.stdin.listenerCount("close")).toBe(baselineClose);
  });
});
