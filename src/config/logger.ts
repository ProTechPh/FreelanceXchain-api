/**
 * Logger Configuration
 * Structured logging with automatic sanitization
 * 
 * OWASP A02:2021 - Cryptographic Failures
 * OWASP A09:2021 - Security Logging and Monitoring Failures
 * 
 * Note: This is a simple implementation using console with sanitization.
 * For production, consider upgrading to Winston or Pino for better features
 * like log rotation, multiple transports, and centralized logging.
 */

import { sanitizeLogData, sanitizeError } from '../utils/log-sanitizer.js';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log level priority for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * Current log level from environment
 */
const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || LogLevel.INFO;

/**
 * Check if a log level should be logged
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL];
}

/**
 * Format log entry
 */
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

/**
 * Logger class with sanitization
 */
class Logger {
  /**
   * Log debug message
   */
  debug(message: string, meta?: any): void {
    if (!shouldLog(LogLevel.DEBUG)) return;
    
    const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
    console.log(formatLogEntry(LogLevel.DEBUG, sanitizedMessage, meta));
  }

  /**
   * Log info message
   */
  info(message: string, meta?: any): void {
    if (!shouldLog(LogLevel.INFO)) return;
    
    const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
    console.log(formatLogEntry(LogLevel.INFO, sanitizedMessage, meta));
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: any): void {
    if (!shouldLog(LogLevel.WARN)) return;
    
    const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
    console.warn(formatLogEntry(LogLevel.WARN, sanitizedMessage, meta));
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | any, meta?: any): void {
    if (!shouldLog(LogLevel.ERROR)) return;
    
    const sanitizedMessage = typeof message === 'string' ? sanitizeLogData(message) : message;
    const logMeta: any = { ...meta };

    if (error) {
      if (error instanceof Error) {
        logMeta.error = sanitizeError(error);
      } else {
        logMeta.error = sanitizeLogData(error);
      }
    }

    console.error(formatLogEntry(LogLevel.ERROR, sanitizedMessage, logMeta));
  }

  /**
   * Log security event (always logged regardless of level)
   */
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

  /**
   * Log authentication event
   */
  auth(event: string, userId?: string, meta?: any): void {
    this.security(`AUTH: ${event}`, {
      userId,
      ...meta,
    });
  }

  /**
   * Log authorization failure
   */
  authzFailure(userId: string, resource: string, action: string, meta?: any): void {
    this.security('AUTHORIZATION_FAILURE', {
      userId,
      resource,
      action,
      ...meta,
    });
  }

  /**
   * Log rate limit violation
   */
  rateLimit(identifier: string, endpoint: string, meta?: any): void {
    this.security('RATE_LIMIT_EXCEEDED', {
      identifier,
      endpoint,
      ...meta,
    });
  }

  /**
   * Log suspicious activity
   */
  suspicious(activity: string, meta?: any): void {
    this.security('SUSPICIOUS_ACTIVITY', {
      activity,
      ...meta,
    });
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();

/**
 * Export logger as default
 */
export default logger;
