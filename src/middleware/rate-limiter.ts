import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Atomic fixed-window rate limit via Lua — INCR + PEXPIRE in one round-trip.
// Returns [currentCount, remainingTtlMs]
const rateLimitScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {current, redis.call('PTTL', KEYS[1])}
`;

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
  message?: string;
  /** When true (default), requests pass through on Redis errors. Auth limiters should set false. */
  failOpen?: boolean;
};

export function rateLimiter(name: string, rateLimitConfig: RateLimitConfig) {
  const { windowMs, maxRequests, message, failOpen = true } = rateLimitConfig;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (config.server.nodeEnv === 'test') {
      next();
      return;
    }

    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const windowStart = Math.floor(Date.now() / windowMs);
    const key = `ratelimit:${name}:${ip}:${windowStart}`;

    try {
      const [current, ttlMs] = (await redis.eval(
        rateLimitScript,
        1,
        key,
        String(windowMs),
      )) as [number, number];

      if (current > maxRequests) {
        const retryAfter = Math.ceil(ttlMs / 1000);
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: message ?? 'Too many requests, please try again later',
          },
          retryAfter,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] ?? 'unknown',
        });
        return;
      }
    } catch (err) {
      if (!failOpen) {
        // Fail closed for security-critical endpoints (login, MFA, password reset).
        // Blocking the request during Redis outage is safer than allowing unlimited attempts.
        logger.error('[rate-limiter] Redis error, failing closed', err as Error);
        const retryAfter = Math.ceil(windowMs / 1000);
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: message ?? 'Too many requests, please try again later',
          },
          retryAfter,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] ?? 'unknown',
        });
        return;
      }
      // Fail open: if Redis is unavailable, let the request through rather than
      // blocking all traffic. Log so ops can detect the outage.
      logger.error('[rate-limiter] Redis error, failing open', err as Error);
    }

    next();
  };
}

// Preset rate limiters
export const loginRateLimiter = rateLimiter('login', {
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many login attempts, please try again later',
  failOpen: false,
});

export const registerRateLimiter = rateLimiter('register', {
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many registration attempts, please try again later',
  failOpen: false,
});

export const passwordResetRateLimiter = rateLimiter('password-reset', {
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many password reset attempts, please try again later',
  failOpen: false,
});

export const authRateLimiter = loginRateLimiter;

export const apiRateLimiter = rateLimiter('api', {
  windowMs: 60 * 1000,
  maxRequests: 100,
  message: 'Too many requests, please slow down',
});

export const sensitiveRateLimiter = rateLimiter('sensitive', {
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many attempts for this sensitive operation',
});

export const fileUploadRateLimiter = rateLimiter('file-upload', {
  windowMs: 60 * 60 * 1000,
  maxRequests: 20,
  message: 'Too many file uploads, please try again later',
});

export const withdrawalRateLimiter = rateLimiter('withdrawal', {
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many withdrawal attempts, please try again later',
});

export const mfaVerifyRateLimiter = rateLimiter('mfa-verify', {
  windowMs: 5 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many MFA verification attempts, please try again later',
  failOpen: false,
});
