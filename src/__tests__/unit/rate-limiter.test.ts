import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    server: {
      nodeEnv: 'development',
    },
  },
}));

describe('Rate Limiter', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: {
        server: {
          nodeEnv: 'development',
        },
      },
    }));
    jest.clearAllMocks();
    jsonMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnThis();
    setMock = jest.fn().mockReturnThis();
    req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '192.168.1.1' } as any,
      headers: { 'x-request-id': 'test-id' },
    };
    res = {
      status: statusMock as any,
      json: jsonMock as any,
      set: setMock as any,
    };
    next = jest.fn();
  });

  afterEach(() => {
  });

  const importModule = async () => {
    return await import('../../middleware/rate-limiter.js');
  };

  describe('rateLimiter', () => {
    it('should allow first request', async () => {
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 5 });

      limiter(req as Request, res as Response, next as NextFunction);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow requests within limit', async () => {
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 3 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(3);
    });

    it('should reject requests over limit', async () => {
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 2 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(2);
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED',
          }),
        })
      );
    });

    it('should set Retry-After header', async () => {
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 1 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);

      expect(setMock).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should reset count after window expires', async () => {
      jest.useFakeTimers();
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 1 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);
      expect(next).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(61000);

      limiter(req as Request, res as Response, next as NextFunction);
      expect(next).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('should use custom message', async () => {
      const { rateLimiter } = await importModule();
      const customMessage = 'Custom rate limit message';
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 1, message: customMessage });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: customMessage,
          }),
        })
      );
    });

    it('should bypass rate limiting in test environment', async () => {
      jest.resetModules();
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          server: {
            nodeEnv: 'test',
          },
        },
      }));
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 0 });

      limiter(req as Request, res as Response, next as NextFunction);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should track different clients separately', async () => {
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 1 });

      const req1 = { ...req, ip: '1.1.1.1' } as Request;
      const req2 = { ...req, ip: '2.2.2.2' } as Request;

      limiter(req1, res as Response, next as NextFunction);
      limiter(req2, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(2);
    });

    it('should use socket remoteAddress when ip is not available', async () => {
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 1 });

      const reqNoIp = { ...req, ip: undefined } as Request;
      limiter(reqNoIp, res as Response, next as NextFunction);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should use unknown when no address available', async () => {
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('test', { windowMs: 60000, maxRequests: 1 });

      const reqNoAddr = { ...req, ip: undefined, socket: { remoteAddress: undefined } } as Request;
      limiter(reqNoAddr, res as Response, next as NextFunction);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('preset rate limiters', () => {
    it('should export loginRateLimiter', async () => {
      const { loginRateLimiter } = await importModule();
      expect(typeof loginRateLimiter).toBe('function');
    });

    it('should export registerRateLimiter', async () => {
      const { registerRateLimiter } = await importModule();
      expect(typeof registerRateLimiter).toBe('function');
    });

    it('should export passwordResetRateLimiter', async () => {
      const { passwordResetRateLimiter } = await importModule();
      expect(typeof passwordResetRateLimiter).toBe('function');
    });

    it('should export authRateLimiter as alias', async () => {
      const { authRateLimiter, loginRateLimiter } = await importModule();
      expect(authRateLimiter).toBe(loginRateLimiter);
    });

    it('should export apiRateLimiter', async () => {
      const { apiRateLimiter } = await importModule();
      expect(typeof apiRateLimiter).toBe('function');
    });

    it('should export sensitiveRateLimiter', async () => {
      const { sensitiveRateLimiter } = await importModule();
      expect(typeof sensitiveRateLimiter).toBe('function');
    });

    it('should export fileUploadRateLimiter', async () => {
      const { fileUploadRateLimiter } = await importModule();
      expect(typeof fileUploadRateLimiter).toBe('function');
    });

    it('should export withdrawalRateLimiter', async () => {
      const { withdrawalRateLimiter } = await importModule();
      expect(typeof withdrawalRateLimiter).toBe('function');
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('should clean up expired entries', async () => {
      jest.useFakeTimers();
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('cleanup-test', { windowMs: 1000, maxRequests: 1 });

      limiter(req as Request, res as Response, next as NextFunction);

      jest.advanceTimersByTime(2000);

      limiter(req as Request, res as Response, next as NextFunction);
      expect(next).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });
});
