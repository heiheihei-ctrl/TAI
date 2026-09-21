import { createLogger, type Logger } from 'vite';

const disconnectCodes = new Set(['ECONNABORTED', 'ECONNRESET', 'EPIPE']);

/** Only downgrade downstream socket disconnects; keep upstream/HTTP failures visible. */
export function createProxyLogger(logger: Logger = createLogger()): Logger {
  const originalError = logger.error.bind(logger);
  logger.error = (message, options) => {
    const code = (options?.error as NodeJS.ErrnoException | undefined)?.code;
    if (message.includes('ws proxy socket error:') && code && disconnectCodes.has(code)) {
      logger.warn(
        `WebSocket proxy client disconnected (${code}). If repeated, check the network and backend.`,
        { timestamp: true },
      );
      return;
    }
    originalError(message, options);
  };
  return logger;
}