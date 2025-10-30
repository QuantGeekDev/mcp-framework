/**
 * Pre-stringified JSON-RPC ping message formatted for Server-Sent Events (SSE).
 * Includes the 'data: ' prefix and trailing newlines.
 */
export const PING_SSE_MESSAGE = 'data: {"jsonrpc":"2.0","method":"ping"}\n\n';