//! src/main logger — forwards to main process console with timestamps.
//! Used by jsonrpc.ts, mcp-host.ts, mcp-ipc.ts.

const timestamp = (): string => new Date().toISOString().slice(11, 23);

export const logger = {
  debug: (...args: unknown[]): void => console.debug(`[${timestamp()}]`, ...args),
  info: (...args: unknown[]): void => console.info(`[${timestamp()}]`, ...args),
  warn: (...args: unknown[]): void => console.warn(`[${timestamp()}]`, ...args),
  error: (...args: unknown[]): void => console.error(`[${timestamp()}]`, ...args),
};
