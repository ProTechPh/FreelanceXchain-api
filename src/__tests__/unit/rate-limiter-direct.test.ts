// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// In-memory store that simulates Redis INCR behaviour for the Lua script
const redisStore = new Map<string, number>();
const evalMock = jest.fn().mockImplementation((_script: unknown, _numKeys: number, key: string, windowMs: string) => {
  const current = (redisStore.get(key) ?? 0) + 1;
  redisStore.set(key, current);
  return Promise.resolve([current, parseInt(windowMs, 10)]);
});

jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({
  redis: { eval: evalMock, on: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    server: { nodeEnv: 'development' },
    redis: { host: 'localhost', port: 6379, password: undefined, tls: false },
  },
}));

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
  return { status: statusMock, json: jsonMock, set: setMock };
}

describe('Rate Limiter - Real Module Coverage', () => {
  beforeEach(() => {
    redisStore.clear();
    evalMock.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('rateLimiter function', () => {
    it('should allow first request (new record)', async () => {
      const limiter = rateLimiterFn('test-new', { windowMs: 60000, maxRequests: 5 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow requests within limit', async () => {
      const limiter = rateLimiterFn('test-within', { windowMs: 60000, maxRequests: 3 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      await limiter(req, res, next);
      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('should reject when rate limit exceeded', async () => {
      const limiter = rateLimiterFn('test-exceeded', { windowMs: 60000, maxRequests: 2 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      await limiter(req, res, next);
      await limiter(req, res, next);

      expect(next).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
        })
      );
    });

    it('should set Retry-After header when rate limited', async () => {
      const limiter = rateLimiterFn('test-retry', { windowMs: 60000, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      await limiter(req, res, next);

      expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should use custom message when provided', async () => {
      const limiter = rateLimiterFn('test-custom-msg', {
        windowMs: 60000,
        maxRequests: 1,
        message: 'Custom limit message',
      });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      await limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ message: 'Custom limit message' }) })
      );
    });

    it('should use default message when none provided', async () => {
      const limiter = rateLimiterFn('test-default-msg', { windowMs: 60000, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      await limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ message: 'Too many requests, please try again later' }),
        })
      );
    });

    it('should reset after window expires (key changes with new window)', async () => {
      const windowMs = 1000;
      const limiter = rateLimiterFn('test-reset', { windowMs, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1); // blocked

      // Advance into the next window — the Redis key changes so count resets
      jest.advanceTimersByTime(windowMs + 1);
      redisStore.clear(); // simulate key expiry

      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('should include requestId from headers', async () => {
      const limiter = rateLimiterFn('test-reqid', { windowMs: 60000, maxRequests: 1 });
      const req = createReq({ headers: { 'x-request-id': 'my-req-id' } });
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      await limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'my-req-id' }));
    });

    it('should use unknown requestId when header missing', async () => {
      const limiter = rateLimiterFn('test-noreqid', { windowMs: 60000, maxRequests: 1 });
      const req = createReq({ headers: {} });
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      await limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'unknown' }));
    });

    it('should use socket.remoteAddress when ip is undefined', async () => {
      const limiter = rateLimiterFn('test-socket', { windowMs: 60000, maxRequests: 1 });
      const req = createReq({ ip: undefined });
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should use unknown when both ip and socket are undefined', async () => {
      const limiter = rateLimiterFn('test-unknown', { windowMs: 60000, maxRequests: 1 });
      const req = createReq({ ip: undefined, socket: {} });
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should track different clients separately', async () => {
      const limiter = rateLimiterFn('test-clients', { windowMs: 60000, maxRequests: 1 });
      const res = createRes();
      const next = jest.fn();

      const req1 = createReq({ ip: '1.1.1.1' });
      const req2 = createReq({ ip: '2.2.2.2' });

      await limiter(req1, res, next);
      await limiter(req2, res, next);

      expect(next).toHaveBeenCalledTimes(2);
    });

    it('should include timestamp in rate limit response', async () => {
      const limiter = rateLimiterFn('test-timestamp', { windowMs: 60000, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      await limiter(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: expect.any(String) })
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

        await limiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(evalMock).not.toHaveBeenCalled();
      } finally {
        (envModule as any).config.server.nodeEnv = originalNodeEnv;
      }
    });

    it('should fail open when Redis throws', async () => {
      evalMock.mockRejectedValueOnce(new Error('Redis connection refused'));
      const limiter = rateLimiterFn('test-failopen', { windowMs: 60000, maxRequests: 1 });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should fail closed when Redis throws and failOpen is false', async () => {
      evalMock.mockRejectedValueOnce(new Error('Redis connection refused'));
      const limiter = rateLimiterFn('test-failclosed', { windowMs: 60000, maxRequests: 1, failOpen: false });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
        })
      );
    });

    it('should fail closed with custom message when Redis throws and failOpen is false', async () => {
      evalMock.mockRejectedValueOnce(new Error('Redis connection refused'));
      const limiter = rateLimiterFn('test-failclosed-msg', {
        windowMs: 60000,
        maxRequests: 1,
        failOpen: false,
        message: 'Custom fail-closed message',
      });
      const req = createReq();
      const res = createRes();
      const next = jest.fn();

      await limiter(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ message: 'Custom fail-closed message' }),
        })
      );
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

    it('should invoke loginRateLimiter as middleware', async () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      await loginRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke registerRateLimiter as middleware', async () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      await registerRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke passwordResetRateLimiter as middleware', async () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      await passwordResetRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke apiRateLimiter as middleware', async () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      await apiRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke sensitiveRateLimiter as middleware', async () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      await sensitiveRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke fileUploadRateLimiter as middleware', async () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      await fileUploadRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke withdrawalRateLimiter as middleware', async () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      await withdrawalRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should invoke mfaVerifyRateLimiter as middleware', async () => {
      const req = createReq();
      const res = createRes();
      const next = jest.fn();
      await mfaVerifyRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
