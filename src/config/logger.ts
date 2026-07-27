// OWASP A02:2021 / A09:2021 — structured logging with automatic sanitization

import { sanitizeLogData, sanitizeError } from '../utils/log-sanitizer.js';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || LogLevel.INFO;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL];
}

function formatLogEntry(level: LogLevel, message: string, meta?: any): string {
  const timestamp = new Date().toISOString();
  const entry: any = {
    timestamp,
    level,
    message,
  };

  if (meta) {
    entry.meta = sanitizeLogData(meta);
  }

  return JSON.stringify(entry);
}

class Logger {
  debug(message: string, meta?: any): void {
    if (!shouldLog(LogLevel.DEBUG)) return;

    const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
    // eslint-disable-next-line no-console
    console.log(formatLogEntry(LogLevel.DEBUG, sanitizedMessage, meta));
  }

  info(message: string, meta?: any): void {
    if (!shouldLog(LogLevel.INFO)) return;

    const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
    // eslint-disable-next-line no-console
    console.log(formatLogEntry(LogLevel.INFO, sanitizedMessage, meta));
  }

  warn(message: string, meta?: any): void {
    if (!shouldLog(LogLevel.WARN)) return;

    const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
    console.warn(formatLogEntry(LogLevel.WARN, sanitizedMessage, meta));
  }

  error(message: string, error?: Error | any, meta?: any): void {
    if (!shouldLog(LogLevel.ERROR)) return;

    const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
    const logMeta: any = { ...meta };

    if (error) {
      if (error instanceof Error) {
        /* istanbul ignore next */
        logMeta.error = sanitizeError(error);
      } else {
        logMeta.error = sanitizeLogData(error);
      }
    }

    console.error(formatLogEntry(LogLevel.ERROR, sanitizedMessage, logMeta));
  }

  // Always logged regardless of level
  security(event: string, meta?: any): void {
    const sanitizedEvent = sanitizeLogData(event);
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'security',
      event: sanitizedEvent,
      meta: sanitizeLogData(meta),
    };
    console.warn(JSON.stringify(entry));
  }

  auth(event: string, userId?: string, meta?: any): void {
    this.security(`AUTH: ${event}`, {
      userId,
      ...meta,
    });
  }

  authzFailure(userId: string, resource: string, action: string, meta?: any): void {
    this.security('AUTHORIZATION_FAILURE', {
      userId,
      resource,
      action,
      ...meta,
    });
  }

  rateLimit(identifier: string, endpoint: string, meta?: any): void {
    this.security('RATE_LIMIT_EXCEEDED', {
      identifier,
      endpoint,
      ...meta,
    });
  }

  suspicious(activity: string, meta?: any): void {
    this.security('SUSPICIOUS_ACTIVITY', {
      activity,
      ...meta,
    });
  }
}

export const logger = new Logger();

export default logger;
