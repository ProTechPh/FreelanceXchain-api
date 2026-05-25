// @ts-nocheck
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

describe('Rate Limiter - Cleanup Coverage', () => {
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

  it('should cleanup expired entries when interval fires', async () => {
    const { rateLimiter } = await import('../../middleware/rate-limiter.js');
    const limiter = rateLimiter('cleanup-test', { windowMs: 1000, maxRequests: 5 });

    // Make a request to populate the store
    limiter(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);

    // Advance time past the window
    jest.advanceTimersByTime(1001);

    // Advance time to trigger the cleanup interval (5 minutes)
    jest.advanceTimersByTime(5 * 60 * 1000);

    // Make another request - should be allowed since entry was cleaned up
    limiter(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should not cleanup entries that have not expired', async () => {
    const { rateLimiter } = await import('../../middleware/rate-limiter.js');
    const limiter = rateLimiter('cleanup-active', { windowMs: 10 * 60 * 1000, maxRequests: 2 });

    // Make requests to populate the store
    limiter(req as Request, res as Response, next as NextFunction);
    limiter(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);

    // Advance time to trigger cleanup but NOT past the window
    jest.advanceTimersByTime(5 * 60 * 1000);

    // Third request should still be blocked (entry not cleaned up)
    limiter(req as Request, res as Response, next as NextFunction);
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  it('should use socket remoteAddress when req.ip is undefined', async () => {
    const { rateLimiter } = await import('../../middleware/rate-limiter.js');
    const limiter = rateLimiter('ip-fallback', { windowMs: 60000, maxRequests: 1 });

    const reqNoIp = {
      ip: undefined,
      socket: { remoteAddress: '10.0.0.1' },
      headers: {},
    };

    limiter(reqNoIp as any, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);

    // Second request from same socket address should be blocked
    limiter(reqNoIp as any, res as Response, next as NextFunction);
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  it('should use unknown when both ip and socket are undefined', async () => {
    const { rateLimiter } = await import('../../middleware/rate-limiter.js');
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
