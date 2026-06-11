// @ts-nocheck
import { jest, describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    server: {
      nodeEnv: 'development',
    },
  },
}));

// Set up fake timers BEFORE the module loads so setInterval uses fake timers
jest.useFakeTimers();

const {
  rateLimiter: rateLimiterFn,
  loginRateLimiter,
  registerRateLimiter,
  passwordResetRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  sensitiveRateLimiter,
  fileUploadRateLimiter,
  withdrawalRateLimiter,
  mfaVerifyRateLimiter,
} = await import('../../middleware/rate-limiter.js');

function createReq(overrides: Record<string, any> = {}) {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '192.168.1.1' },
    headers: {},
    ...overrides,
  } as any;
}

function createRes() {
  const jsonMock = jest.fn().mockReturnThis();
  const statusMock = jest.fn().mockReturnThis();
  const setMock = jest.fn().mockReturnThis();
  return {
    status: statusMock,
    json: jsonMock,
    set: setMock,
  };
}

describe('Rate Limiter - Real Module Coverage', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('rateLimiter function', () => {
    it('should allow first request (new record)', () => {
      const limiter = rateLimiterFn('test-new', { windowMs: 60000, maxRequests: 5 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow requests within limit', () => {
      const limiter = rateLimiterFn('test-within', { windowMs: 60000, maxRequests: 3 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('should reject when rate limit exceeded', () => {
      const limiter = rateLimiterFn('test-exceeded', { windowMs: 60000, maxRequests: 2 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);
      limiter(req, res, next);

      expect(next).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED',
          }),
        })
      );
    });

    it('should set Retry-After header when rate limited', () => {
      const limiter = rateLimiterFn('test-retry', { windowMs: 60000, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);

      expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should use custom message when provided', () => {
      const limiter = rateLimiterFn('test-custom-msg', {
        windowMs: 60000,
        maxRequests: 1,
        message: 'Custom limit message',
      });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Custom limit message',
          }),
        })
      );
    });

    it('should use default message when none provided', () => {
      const limiter = rateLimiterFn('test-default-msg', { windowMs: 60000, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Too many requests, please try again later',
          }),
        })
      );
    });

    it('should reset after window expires', () => {
      const limiter = rateLimiterFn('test-reset', { windowMs: 1000, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1001);

      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('should include requestId from headers', () => {
      const limiter = rateLimiterFn('test-reqid', { windowMs: 60000, maxRequests: 1 });
      const req = createReq({ headers: { 'x-request-id': 'my-req-id' } });
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'my-req-id',
        })
      );
    });

    it('should use unknown requestId when header missing', () => {
      const limiter = rateLimiterFn('test-noreqid', { windowMs: 60000, maxRequests: 1 });
      const req = createReq({ headers: {} });
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'unknown',
        })
      );
    });

    it('should use socket.remoteAddress when ip is undefined', () => {
      const limiter = rateLimiterFn('test-socket', { windowMs: 60000, maxRequests: 1 });
      const req = createReq({ ip: undefined });
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should use unknown when both ip and socket are undefined', () => {
      const limiter = rateLimiterFn('test-unknown', { windowMs: 60000, maxRequests: 1 });
      const req = createReq({ ip: undefined, socket: {} });
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should track different clients separately', () => {
      const limiter = rateLimiterFn('test-clients', { windowMs: 60000, maxRequests: 1 });
      const res = createRes();
      const next = jest.fn();

      const req1 = createReq({ ip: '1.1.1.1' });
      const req2 = createReq({ ip: '2.2.2.2' });

      limiter(req1, res, next);
      limiter(req2, res, next);

      expect(next).toHaveBeenCalledTimes(2);
    });

    it('should share state between limiters with same name', () => {
      const limiter1 = rateLimiterFn('test-shared', { windowMs: 60000, maxRequests: 1 });
      const limiter2 = rateLimiterFn('test-shared', { windowMs: 60000, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      limiter1(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      limiter2(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('should include timestamp in rate limit response', () => {
      const limiter = rateLimiterFn('test-timestamp', { windowMs: 60000, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      limiter(req, res, next);
      limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );
    });

    it('should bypass rate limiting in test environment', async () => {
      const envModule = await import('../../config/env.js');
      const originalNodeEnv = (envModule as any).config.server.nodeEnv;
      (envModule as any).config.server.nodeEnv = 'test';

      try {
        const limiter = rateLimiterFn('test-bypass', { windowMs: 60000, maxRequests: 0 });
        const req = createReq();
        const res = createRes();
        const next = jest.fn();

        limiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
      } finally {
        (envModule as any).config.server.nodeEnv = originalNodeEnv;
      }
    });
  });

  describe('cleanup interval', () => {
    it('should clean up expired entries when interval fires', () => {
      const limiter = rateLimiterFn('test-cleanup', { windowMs: 1000, maxRequests: 5 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      // Create an entry
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Advance past the entry's expiry
      jest.advanceTimersByTime(1001);

      // Advance past the cleanup interval (5 minutes) to trigger cleanup
      // The cleanup function iterates over stores and deletes expired entries
      jest.advanceTimersByTime(5 * 60 * 1000);

      // The entry should have been cleaned up, so a new request should be allowed
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  describe('preset rate limiters', () => {
    it('should have loginRateLimiter as function', () => {
      expect(typeof loginRateLimiter).toBe('function');
    });

    it('should have authRateLimiter as alias for loginRateLimiter', () => {
      expect(authRateLimiter).toBe(loginRateLimiter);
    });

    it('should have registerRateLimiter as function', () => {
      expect(typeof registerRateLimiter).toBe('function');
    });

    it('should have passwordResetRateLimiter as function', () => {
      expect(typeof passwordResetRateLimiter).toBe('function');
    });

    it('should have apiRateLimiter as function', () => {
      expect(typeof apiRateLimiter).toBe('function');
    });

    it('should have sensitiveRateLimiter as function', () => {
      expect(typeof sensitiveRateLimiter).toBe('function');
    });

    it('should have fileUploadRateLimiter as function', () => {
      expect(typeof fileUploadRateLimiter).toBe('function');
    });

    it('should have withdrawalRateLimiter as function', () => {
      expect(typeof withdrawalRateLimiter).toBe('function');
    });

    it('should have mfaVerifyRateLimiter as function', () => {
      expect(typeof mfaVerifyRateLimiter).toBe('function');
    });

    it('should invoke loginRateLimiter as middleware', () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      loginRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke registerRateLimiter as middleware', () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      registerRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke passwordResetRateLimiter as middleware', () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      passwordResetRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke apiRateLimiter as middleware', () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      apiRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke sensitiveRateLimiter as middleware', () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      sensitiveRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke fileUploadRateLimiter as middleware', () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      fileUploadRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke withdrawalRateLimiter as middleware', () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      withdrawalRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke mfaVerifyRateLimiter as middleware', () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      mfaVerifyRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
