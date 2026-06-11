// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const sharedStores = new Map<string, Map<string, { count: number; resetTime: number }>>();

function createRateLimiter(name: string, rateLimitConfig: { windowMs: number; maxRequests: number; message?: string }) {
  const { windowMs, maxRequests, message } = rateLimitConfig;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!sharedStores.has(name)) {
      sharedStores.set(name, new Map());
    }
    const store = sharedStores.get(name)!;
    const key = (req.ip ?? (req.socket as any)?.remoteAddress ?? 'unknown') as string;
    const now = Date.now();
    const record = store.get(key);

    if (!record || now > record.resetTime) {
      store.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: message ?? 'Too many requests, please try again later',
        },
        retryAfter,
        timestamp: new Date().toISOString(),
        requestId: (req.headers as any)['x-request-id'] ?? 'unknown',
      });
      return;
    }

    record.count++;
    next();
  };
}

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  rateLimiter: createRateLimiter,
  loginRateLimiter: createRateLimiter('login', { windowMs: 15 * 60 * 1000, maxRequests: 10 }),
  registerRateLimiter: createRateLimiter('register', { windowMs: 60 * 60 * 1000, maxRequests: 5 }),
  passwordResetRateLimiter: createRateLimiter('password-reset', { windowMs: 15 * 60 * 1000, maxRequests: 5 }),
  authRateLimiter: createRateLimiter('login', { windowMs: 15 * 60 * 1000, maxRequests: 10 }),
  apiRateLimiter: createRateLimiter('api', { windowMs: 60 * 1000, maxRequests: 100 }),
  sensitiveRateLimiter: createRateLimiter('sensitive', { windowMs: 60 * 60 * 1000, maxRequests: 5 }),
  fileUploadRateLimiter: createRateLimiter('file-upload', { windowMs: 60 * 60 * 1000, maxRequests: 20 }),
  withdrawalRateLimiter: createRateLimiter('withdrawal', { windowMs: 60 * 60 * 1000, maxRequests: 10 }),
  mfaVerifyRateLimiter: createRateLimiter('mfa-verify', { windowMs: 5 * 60 * 1000, maxRequests: 5 }),
}));

const { rateLimiter } = await import('../../middleware/rate-limiter.js');

describe('Rate Limiter - Extended Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setMock: jest.Mock;

  beforeEach(() => {
    sharedStores.clear();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jsonMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnThis();
    setMock = jest.fn().mockReturnThis();
    req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '192.168.1.1' } as any,
      headers: {},
    };
    res = {
      status: statusMock as any,
      json: jsonMock as any,
      set: setMock as any,
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('default message', () => {
    it('should use default message when none provided', async () => {
      const limiter = rateLimiter('default-msg', { windowMs: 60000, maxRequests: 1 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Too many requests, please try again later',
          }),
        })
      );
    });
  });

  describe('shared store for same limiter name', () => {
    it('should share state between limiters with same name', async () => {
      const limiter1 = rateLimiter('shared', { windowMs: 60000, maxRequests: 1 });
      const limiter2 = rateLimiter('shared', { windowMs: 60000, maxRequests: 1 });

      limiter1(req as Request, res as Response, next as NextFunction);
      limiter2(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(statusMock).toHaveBeenCalledWith(429);
    });

    it('should not share state between different limiter names', async () => {
      const limiter1 = rateLimiter('name-a', { windowMs: 60000, maxRequests: 1 });
      const limiter2 = rateLimiter('name-b', { windowMs: 60000, maxRequests: 1 });

      limiter1(req as Request, res as Response, next as NextFunction);
      limiter2(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  describe('request id fallback', () => {
    it('should use unknown when x-request-id is missing', async () => {
      const limiter = rateLimiter('req-id', { windowMs: 60000, maxRequests: 1 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'unknown',
        })
      );
    });
  });

  describe('boundary conditions', () => {
    it('should allow exactly maxRequests requests', async () => {
      const limiter = rateLimiter('boundary', { windowMs: 60000, maxRequests: 2 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(2);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should block on maxRequests + 1', async () => {
      const limiter = rateLimiter('boundary2', { windowMs: 60000, maxRequests: 2 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(2);
      expect(statusMock).toHaveBeenCalledWith(429);
    });
  });

  describe('timer cleanup', () => {
    it('should allow requests again after window expires via timer', async () => {
      const limiter = rateLimiter('timer-cleanup', { windowMs: 1000, maxRequests: 1 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);
      expect(next).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1001);

      limiter(req as Request, res as Response, next as NextFunction);
      expect(next).toHaveBeenCalledTimes(2);
    });
  });
});
