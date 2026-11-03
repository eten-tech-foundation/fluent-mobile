export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Transport = (
  level: LogLevel,
  tag: string,
  message: string,
  context?: Record<string, unknown>,
) => void;

export const defaultTransport: Transport = (level, tag, message, context) => {
  if (!(globalThis as any).__DEV__) return;
  // Debug stays on the transport for tests. The Metro console only shows
  // info and above, so per-request timings do not flood a refresh.
  if (level === 'debug') return;
  const prefix = `[${tag}]`;

  const logMethod =
    level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';

  if (context !== undefined) {
    console[logMethod](prefix, message, context);
  } else {
    console[logMethod](prefix, message);
  }
};

let transport: Transport = defaultTransport;

function create(tag: string) {
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      transport('debug', tag, message, context),
    info: (message: string, context?: Record<string, unknown>) =>
      transport('info', tag, message, context),
    warn: (message: string, context?: Record<string, unknown>) =>
      transport('warn', tag, message, context),
    error: (message: string, context?: Record<string, unknown>) =>
      transport('error', tag, message, context),
  };
}

export const logger = {
  create,
  setTransport: (fn: Transport) => {
    transport = fn;
  },
  reset: () => {
    transport = defaultTransport;
  },
};
