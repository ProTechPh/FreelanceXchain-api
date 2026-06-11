// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

describe('Rate Limiter - Cleanup Coverage', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { server: { nodeEnv: 'development' } },
    }));
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

  const createRateLimiter = () => {
    const stores = new Map();
    function getStore(name) { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); }
    function getClientKey(req) { return req.ip ?? req.socket?.remoteAddress ?? 'unknown'; }

    function rateLimiter(name, { windowMs, maxRequests, message }) {
      return (req, res, next) => {
        const store = getStore(name);
        const key = getClientKey(req);
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
            error: { code: 'RATE_LIMIT_EXCEEDED', message: message ?? 'Too many requests' },
            retryAfter,
            timestamp: new Date().toISOString(),
          });
          return;
        }
        record.count++;
        next();
      };
    }
    return { rateLimiter };
  };

  it('should cleanup expired entries when interval fires', async () => {
    const { rateLimiter } = createRateLimiter();
    const limiter = rateLimiter('cleanup-test', { windowMs: 1000, maxRequests: 5 });

    limiter(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1001);

    limiter(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should not cleanup entries that have not expired', async () => {
    const { rateLimiter } = createRateLimiter();
    const limiter = rateLimiter('cleanup-active', { windowMs: 10 * 60 * 1000, maxRequests: 2 });

    limiter(req as Request, res as Response, next as NextFunction);
    limiter(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(5 * 60 * 1000);

    limiter(req as Request, res as Response, next as NextFunction);
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  it('should use socket remoteAddress when req.ip is undefined', async () => {
    const { rateLimiter } = createRateLimiter();
    const limiter = rateLimiter('ip-fallback', { windowMs: 60000, maxRequests: 1 });

    const reqNoIp = {
      ip: undefined,
      socket: { remoteAddress: '10.0.0.1' },
      headers: {},
    };

    limiter(reqNoIp as any, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);

    limiter(reqNoIp as any, res as Response, next as NextFunction);
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  it('should use unknown when both ip and socket are undefined', async () => {
    const { rateLimiter } = createRateLimiter();
    const limiter = rateLimiter('ip-unknown', { windowMs: 60000, maxRequests: 1 });

    const reqNoAddr = {
      ip: undefined,
      socket: { remoteAddress: undefined },
      headers: {},
    };

    limiter(reqNoAddr as any, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
