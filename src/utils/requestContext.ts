import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  token?: string; // The raw token
  user?: Record<string, unknown>; // Decoded user data/claims
  [key: string]: unknown;
}

export const requestContext = new AsyncLocalStorage<RequestContextData>();

/**
 * Get the current request context.
 * Returns undefined if called outside of a request context.
 */
export function getRequestContext(): RequestContextData | undefined {
  return requestContext.getStore();
}

/**
 * Run a function within a request context.
 */
export function runInRequestContext<T>(context: RequestContextData, fn: () => T): T {
  return requestContext.run(context, fn);
}


