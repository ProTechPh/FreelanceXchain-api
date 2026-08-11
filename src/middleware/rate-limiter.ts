import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { getRequestId, sendErrorResponse } from '../utils/response-helpers.js';

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

/**
 * Emit the standard 429 response (shared by the quota-exceeded and fail-closed paths).
 */
function sendRateLimitError(res: Response, req: Request, message: string | undefined, retryAfter: number): void {
  res.set('Retry-After', String(retryAfter));
  sendErrorResponse(res, 429, 'RATE_LIMIT_EXCEEDED', message ?? 'Too many requests, please try again later', getRequestId(req), undefined, undefined, retryAfter);
}

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
        sendRateLimitError(res, req, message, Math.ceil(ttlMs / 1000));
        return;
      }
    } catch (err) {
      if (!failOpen) {
        // Fail closed for security-critical endpoints (login, MFA, password reset).
        // Blocking the request during Redis outage is safer than allowing unlimited attempts.
        logger.error('[rate-limiter] Redis error, failing closed', err as Error);
        sendRateLimitError(res, req, message, Math.ceil(windowMs / 1000));
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

// Fail closed: sensitive operations (manual KYC approval, admin overrides) must
// not lose their brute-force/abuse protection during a Redis outage.
export const sensitiveRateLimiter = rateLimiter('sensitive', {
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many attempts for this sensitive operation',
  failOpen: false,
});

export const fileUploadRateLimiter = rateLimiter('file-upload', {
  windowMs: 60 * 60 * 1000,
  maxRequests: 20,
  message: 'Too many file uploads, please try again later',
});

// Dedicated per-IP limiter for unauthenticated webhook endpoints (email inbox,
// Didit KYC, blockchain). Kept separate from the general API limiter so spikes
// from webhook providers can't exhaust the shared per-user budget, and so the
// webhook endpoints aren't stuck behind a single shared counter. Fail-open on
// Redis errors (matching apiRateLimiter): signature verification is the real
// authz boundary, and blocking providers during a Redis outage would drop
// KYC/email events that the senders retry only slowly.
export const webhookRateLimiter = rateLimiter('webhook', {
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Too many webhook requests, please try again later',
});

// Fail closed: money-movement endpoints (proposal withdrawal, refund flows) must
// block during a Redis outage rather than allow unlimited attempts.
export const withdrawalRateLimiter = rateLimiter('withdrawal', {
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many withdrawal attempts, please try again later',
  failOpen: false,
});

export const mfaVerifyRateLimiter = rateLimiter('mfa-verify', {
  windowMs: 5 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many MFA verification attempts, please try again later',
  failOpen: false,
});
