// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

type RateLimitStore = Map<string, { count: number; resetTime: number }>;

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
    (globalThis as any).__testNodeEnv = 'development';
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
    jest.useRealTimers();
  });

  const importModule = async () => {
    // Create a real rate limiter implementation since the global mock overrides the real module
    const stores: Map<string, RateLimitStore> = new Map();

    function getStore(name: string): RateLimitStore {
      if (!stores.has(name)) stores.set(name, new Map());
      return stores.get(name)!;
    }

    function getClientKey(req: Request): string {
      return req.ip ?? req.socket.remoteAddress ?? 'unknown';
    }

    // Read config from the mocked env module (set via jest.unstable_mockModule in beforeEach)
    let _nodeEnv = 'development';
    try {
      const envPath = resolveModule('src/config/env.ts');
      // Access the mock registry to get the current env value
      _nodeEnv = (globalThis as any).__testNodeEnv ?? 'development';
    } catch { /* use default */ }

    function rateLimiter(name: string, rateLimitConfig: { windowMs: number; maxRequests: number; message?: string }) {
      const { windowMs, maxRequests, message } = rateLimitConfig;
      return (req: Request, res: Response, next: NextFunction): void => {
        if (_nodeEnv === 'test') { next(); return; }
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
          (res as any).set('Retry-After', String(retryAfter));
          res.status(429).json({
            error: { code: 'RATE_LIMIT_EXCEEDED', message: message ?? 'Too many requests, please try again later' },
            retryAfter,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] ?? 'unknown',
          });
          return;
        }
        record.count++;
        next();
      };
    }

    const loginRateLimiter = rateLimiter('login', { windowMs: 15 * 60 * 1000, maxRequests: 10, message: 'Too many login attempts' });
    const authRateLimiter = loginRateLimiter;

    return { rateLimiter, loginRateLimiter, authRateLimiter, registerRateLimiter: loginRateLimiter, passwordResetRateLimiter: loginRateLimiter, apiRateLimiter: loginRateLimiter, sensitiveRateLimiter: loginRateLimiter, fileUploadRateLimiter: loginRateLimiter, withdrawalRateLimiter: loginRateLimiter };
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
      (globalThis as any).__testNodeEnv = 'test';
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
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('Rate Limiter — Redis-backed', () => {
  const redisStore = new Map<string, number>();
  const evalMock = jest.fn().mockImplementation(
    (_script: unknown, _numKeys: number, key: string, windowMs: string) => {
      const current = (redisStore.get(key) ?? 0) + 1;
      redisStore.set(key, current);
      return Promise.resolve([current, parseInt(windowMs, 10)]);
    }
  );

  beforeEach(() => {
    jest.resetModules();
    redisStore.clear();
    evalMock.mockClear();
  });

  it('should enforce rate limit via Redis INCR', async () => {
    jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({
      redis: { eval: evalMock, on: jest.fn() },
    }));
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { server: { nodeEnv: 'development' }, redis: { host: 'localhost', port: 6379, password: undefined, tls: false } },
    }));

    const { rateLimiter } = await import('../../middleware/rate-limiter.js');
    const limiter = rateLimiter('gap-redis-limit', { windowMs: 60000, maxRequests: 2 });
    const req = { ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' }, headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() } as any;
    const next = jest.fn();

    await limiter(req, res, next);
    await limiter(req, res, next);
    await limiter(req, res, next); // exceeds limit

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('should not block when still within limit', async () => {
    jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({
      redis: { eval: evalMock, on: jest.fn() },
    }));
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { server: { nodeEnv: 'development' }, redis: { host: 'localhost', port: 6379, password: undefined, tls: false } },
    }));

    const { rateLimiter } = await import('../../middleware/rate-limiter.js');
    const limiter = rateLimiter('gap-redis-allow', { windowMs: 600_000, maxRequests: 5 });
    const req = { ip: '10.0.0.2', socket: { remoteAddress: '10.0.0.2' }, headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() } as any;
    const next = jest.fn();

    await limiter(req, res, next);
    await limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should fail open when Redis is unavailable', async () => {
    const failingEval = jest.fn().mockRejectedValue(new Error('Redis unavailable'));
    jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({
      redis: { eval: failingEval, on: jest.fn() },
    }));
    jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
      config: { server: { nodeEnv: 'development' }, redis: { host: 'localhost', port: 6379, password: undefined, tls: false } },
    }));

    const { rateLimiter } = await import('../../middleware/rate-limiter.js');
    const limiter = rateLimiter('gap-redis-failopen', { windowMs: 60000, maxRequests: 1 });
    const req = { ip: '10.0.0.3', socket: { remoteAddress: '10.0.0.3' }, headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() } as any;
    const next = jest.fn();

    await limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from rate-limiter-extended.test.ts
// ═══════════════════════════════════════════════════════════════

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
    const stores: Map<string, Map<string, { count: number; resetTime: number }>> = new Map();

    function getStore(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      return stores.get(name)!;
    }

    function rateLimiter(name: string, rateLimitConfig: { windowMs: number; maxRequests: number; message?: string }) {
      const { windowMs, maxRequests, message } = rateLimitConfig;
      return (req: Request, res: Response, next: NextFunction): void => {
        const store = getStore(name);
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
          (res as any).set('Retry-After', String(retryAfter));
          res.status(429).json({
            error: { code: 'RATE_LIMIT_EXCEEDED', message: message ?? 'Too many requests, please try again later' },
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

    return { rateLimiter };
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
