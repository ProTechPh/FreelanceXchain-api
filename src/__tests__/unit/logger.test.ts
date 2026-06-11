import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSanitizeLogData = jest.fn((data: any) => data);
const mockSanitizeError = jest.fn((err: Error) => ({ name: err.name, message: err.message }));

jest.unstable_mockModule(resolveModule('src/utils/log-sanitizer.ts'), () => ({
  sanitizeLogData: mockSanitizeLogData,
  sanitizeError: mockSanitizeError,
}));

describe('Logger', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;
  let consoleOutput: Array<{ level: string; args: any[] }>;

  const importModule = async () => {
    return await import('../../config/logger.js');
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    consoleOutput = [];
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;
    console.log = (...args: any[]) => { consoleOutput.push({ level: 'log', args }); };
    console.warn = (...args: any[]) => { consoleOutput.push({ level: 'warn', args }); };
    console.error = (...args: any[]) => { consoleOutput.push({ level: 'error', args }); };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  describe('log level filtering', () => {
    it('should log debug when LOG_LEVEL is debug', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { logger } = await importModule();
      logger.debug('debug msg');
      expect(consoleOutput.some(o => o.level === 'log')).toBe(true);
    });

    it('should not log debug when LOG_LEVEL is info', async () => {
      process.env.LOG_LEVEL = 'info';
      const { logger } = await importModule();
      logger.debug('debug msg');
      expect(consoleOutput.some(o => o.level === 'log')).toBe(false);
    });

    it('should not log debug or info when LOG_LEVEL is warn', async () => {
      process.env.LOG_LEVEL = 'warn';
      const { logger } = await importModule();
      logger.debug('debug msg');
      logger.info('info msg');
      expect(consoleOutput).toHaveLength(0);
    });

    it('should only log error when LOG_LEVEL is error', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await importModule();
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');
      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0]!.level).toBe('error');
    });

    it('should default to INFO level when LOG_LEVEL is not set', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.debug('debug msg');
      logger.info('info msg');
      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0]!.level).toBe('log');
    });
  });

  describe('formatting', () => {
    it('should include timestamp, level, and message in log entry', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.info('test message');
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('test message');
    });

    it('should include meta when provided', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.info('test message', { userId: '123' });
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.meta).toEqual({ userId: '123' });
    });

    it('should not include meta when not provided', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.info('test message');
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.meta).toBeUndefined();
    });
  });

  describe('error logging', () => {
    it('should log error with Error object', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      const err = new Error('Something failed');
      logger.error('Operation failed', err);
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.meta.error).toBeDefined();
      expect(mockSanitizeError).toHaveBeenCalledWith(err);
    });

    it('should log error with non-Error object', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.error('Operation failed', { code: 'ERR_1' });
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.meta.error).toEqual({ code: 'ERR_1' });
      expect(mockSanitizeLogData).toHaveBeenCalledWith({ code: 'ERR_1' });
    });

    it('should log error without error object', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.error('Operation failed');
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.meta.error).toBeUndefined();
    });

    it('should log error with meta', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.error('Operation failed', new Error('fail'), { requestId: 'r1' });
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.meta.requestId).toBe('r1');
      expect(entry.meta.error).toBeDefined();
    });
  });

  describe('security logging', () => {
    it('should always log security events regardless of level', async () => {
      process.env.LOG_LEVEL = 'error';
      const { logger } = await importModule();
      logger.security('LOGIN_ATTEMPT', { ip: '127.0.0.1' });
      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0]!.level).toBe('warn');
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.level).toBe('security');
      expect(entry.event).toBe('LOGIN_ATTEMPT');
      expect(entry.meta).toEqual({ ip: '127.0.0.1' });
    });

    it('should log auth event', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.auth('USER_LOGIN', 'user-1');
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.event).toBe('AUTH: USER_LOGIN');
      expect(entry.meta.userId).toBe('user-1');
    });

    it('should log authorization failure', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.authzFailure('user-1', 'projects', 'delete');
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.event).toBe('AUTHORIZATION_FAILURE');
      expect(entry.meta.userId).toBe('user-1');
      expect(entry.meta.resource).toBe('projects');
      expect(entry.meta.action).toBe('delete');
    });

    it('should log rate limit violation', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.rateLimit('127.0.0.1', '/api/login');
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.event).toBe('RATE_LIMIT_EXCEEDED');
      expect(entry.meta.identifier).toBe('127.0.0.1');
      expect(entry.meta.endpoint).toBe('/api/login');
    });

    it('should log suspicious activity', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.suspicious('SQL_INJECTION_ATTEMPT');
      const entry = JSON.parse(consoleOutput[0]!.args[0]);
      expect(entry.event).toBe('SUSPICIOUS_ACTIVITY');
      expect(entry.meta.activity).toBe('SQL_INJECTION_ATTEMPT');
    });
  });

  describe('message sanitization', () => {
    it('should sanitize string messages', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.info('sensitive message');
      expect(mockSanitizeLogData).toHaveBeenCalledWith('sensitive message');
    });

    it('should pass through non-string messages', async () => {
      delete process.env.LOG_LEVEL;
      const { logger } = await importModule();
      logger.info(123 as any);
      expect(mockSanitizeLogData).not.toHaveBeenCalled();
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
      expect(consoleOutput.some(o => o.level === 'log')).toBe(true);
    });

    it('should handle non-string messages in info', async () => {
      const { logger } = await importModule();
      logger.info(123 as any);
      expect(consoleOutput.some(o => o.level === 'log')).toBe(true);
    });

    it('should handle non-string messages in warn', async () => {
      const { logger } = await importModule();
      logger.warn(123 as any);
      expect(consoleOutput.some(o => o.level === 'warn')).toBe(true);
    });

    it('should handle non-string messages in error', async () => {
      const { logger } = await importModule();
      logger.error(123 as any);
      expect(consoleOutput.some(o => o.level === 'error')).toBe(true);
    });
  });
});
