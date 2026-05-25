import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/utils/log-sanitizer.ts'), () => ({
  sanitizeLogData: jest.fn((data: any) => data),
  sanitizeError: jest.fn((error: Error) => ({ message: error.message, stack: error.stack })),
}));

// Save original env and console methods
const originalEnv = process.env;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

describe('Logger Config', () => {
  let consoleLogSpy: jest.Mock;
  let consoleWarnSpy: jest.Mock;
  let consoleErrorSpy: jest.Mock;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    consoleLogSpy = jest.fn();
    consoleWarnSpy = jest.fn();
    consoleErrorSpy = jest.fn();
    console.log = consoleLogSpy;
    console.warn = consoleWarnSpy;
    console.error = consoleErrorSpy;
  });

  afterEach(() => {
    process.env = originalEnv;
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  const importModule = async () => {
    return await import('../../config/logger.js');
  };

  describe('log level filtering', () => {
    it('should log debug when LOG_LEVEL is debug', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { logger } = await importModule();
      logger.debug('debug message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not log debug when LOG_LEVEL is info', async () => {
      process.env.LOG_LEVEL = 'info';
      const { logger } = await importModule();
      logger.debug('debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log info when LOG_LEVEL is warn', async () => {
      process.env.LOG_LEVEL = 'warn';
      const { logger } = await importModule();
      logger.info('info message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log warn when LOG_LEVEL is error', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await importModule();
      logger.warn('warn message');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should always log error regardless of level', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await importModule();
      logger.error('error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should default to INFO when LOG_LEVEL is not set', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.debug('debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      logger.info('info message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('log methods', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'debug';
    });

    it('should log debug with meta', async () => {
      const { logger } = await importModule();
      logger.debug('debug message', { key: 'value' });
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0]![0] as string);
      expect(logEntry.level).toBe('debug');
      expect(logEntry.message).toBe('debug message');
      expect(logEntry.meta).toEqual({ key: 'value' });
    });

    it('should log info with meta', async () => {
      const { logger } = await importModule();
      logger.info('info message', { userId: '123' });
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0]![0] as string);
      expect(logEntry.level).toBe('info');
    });

    it('should log warn with meta', async () => {
      const { logger } = await importModule();
      logger.warn('warn message', { alert: true });
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0]![0] as string);
      expect(logEntry.level).toBe('warn');
    });

    it('should log error without error object', async () => {
      const { logger } = await importModule();
      logger.error('error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0]![0] as string);
      expect(logEntry.level).toBe('error');
    });

    it('should log error with Error object', async () => {
      const { logger } = await importModule();
      const error = new Error('Test error');
      logger.error('error message', error);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0]![0] as string);
      expect(logEntry.meta.error.message).toBe('Test error');
    });

    it('should log error with non-Error object', async () => {
      const { logger } = await importModule();
      logger.error('error message', { foo: 'bar' });
      expect(consoleErrorSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0]![0] as string);
      expect(logEntry.meta.error).toEqual({ foo: 'bar' });
    });

    it('should log error with meta', async () => {
      const { logger } = await importModule();
      const error = new Error('Test error');
      logger.error('error message', error, { context: 'test' });
      expect(consoleErrorSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0]![0] as string);
      expect(logEntry.meta.context).toBe('test');
    });

    it('should always log security events', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await importModule();
      logger.security('Security event');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0]![0] as string);
      expect(logEntry.level).toBe('security');
      expect(logEntry.event).toBe('Security event');
    });

    it('should log auth events', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await importModule();
      logger.auth('Login successful', 'user-123');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0]![0] as string);
      expect(logEntry.event).toBe('AUTH: Login successful');
      expect(logEntry.meta.userId).toBe('user-123');
    });

    it('should log authz failures', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await importModule();
      logger.authzFailure('user-123', 'projects', 'delete');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0]![0] as string);
      expect(logEntry.event).toBe('AUTHORIZATION_FAILURE');
      expect(logEntry.meta.userId).toBe('user-123');
      expect(logEntry.meta.resource).toBe('projects');
      expect(logEntry.meta.action).toBe('delete');
    });

    it('should log rate limit violations', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await importModule();
      logger.rateLimit('192.168.1.1', '/api/login');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0]![0] as string);
      expect(logEntry.event).toBe('RATE_LIMIT_EXCEEDED');
      expect(logEntry.meta.identifier).toBe('192.168.1.1');
    });

    it('should log suspicious activity', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await importModule();
      logger.suspicious('Multiple failed logins');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0]![0] as string);
      expect(logEntry.event).toBe('SUSPICIOUS_ACTIVITY');
      expect(logEntry.meta.activity).toBe('Multiple failed logins');
    });
  });

  describe('LogLevel enum', () => {
    it('should export LogLevel enum', async () => {
      const { LogLevel } = await importModule();
      expect(LogLevel.DEBUG).toBe('debug');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.WARN).toBe('warn');
      expect(LogLevel.ERROR).toBe('error');
    });
  });

  describe('default export', () => {
    it('should export logger as default', async () => {
      const mod = await importModule();
      expect(mod.default).toBe(mod.logger);
    });
  });

  describe('non-string message handling', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'debug';
    });

    it('should handle non-string messages in debug', async () => {
      const { logger } = await importModule();
      logger.debug(123 as any);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle non-string messages in info', async () => {
      const { logger } = await importModule();
      logger.info(123 as any);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle non-string messages in warn', async () => {
      const { logger } = await importModule();
      logger.warn(123 as any);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should handle non-string messages in error', async () => {
      const { logger } = await importModule();
      logger.error(123 as any);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
