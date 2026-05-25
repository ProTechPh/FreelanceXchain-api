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

describe('Rate Limiter - Extended Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
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

  const importModule = async () => {
    return await import('../../middleware/rate-limiter.js');
  };

  describe('default message', () => {
    it('should use default message when none provided', async () => {
      const { rateLimiter } = await importModule();
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
      const { rateLimiter } = await importModule();
      const limiter1 = rateLimiter('shared', { windowMs: 60000, maxRequests: 1 });
      const limiter2 = rateLimiter('shared', { windowMs: 60000, maxRequests: 1 });

      limiter1(req as Request, res as Response, next as NextFunction);
      limiter2(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);
      expect(statusMock).toHaveBeenCalledWith(429);
    });

    it('should not share state between different limiter names', async () => {
      const { rateLimiter } = await importModule();
      const limiter1 = rateLimiter('name-a', { windowMs: 60000, maxRequests: 1 });
      const limiter2 = rateLimiter('name-b', { windowMs: 60000, maxRequests: 1 });

      limiter1(req as Request, res as Response, next as NextFunction);
      limiter2(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  describe('request id fallback', () => {
    it('should use unknown when x-request-id is missing', async () => {
      const { rateLimiter } = await importModule();
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
      const { rateLimiter } = await importModule();
      const limiter = rateLimiter('boundary', { windowMs: 60000, maxRequests: 2 });

      limiter(req as Request, res as Response, next as NextFunction);
      limiter(req as Request, res as Response, next as NextFunction);

      expect(next).toHaveBeenCalledTimes(2);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should block on maxRequests + 1', async () => {
      const { rateLimiter } = await importModule();
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
      const { rateLimiter } = await importModule();
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
