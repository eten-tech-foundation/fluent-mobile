type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type Transport = (
  level: LogLevel,
  tag: string,
  message: string,
  context?: Record<string, unknown>,
) => void;

// Default: console output in __DEV__ only
const defaultTransport: Transport = (level, tag, message, context) => {
  if (!__DEV__) return;
  const prefix = `[${tag}]`;
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    prefix,
    message,
    context,
  );
};

let transport = defaultTransport;

// Scoped loggers
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
};

export type { LogLevel, Transport };
