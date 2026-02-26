import { Request, Response, NextFunction } from 'express';

type RateLimitStore = Map<string, { count: number; resetTime: number }>;

const stores: Map<string, RateLimitStore> = new Map();

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
  message?: string;
};

function getStore(name: string): RateLimitStore {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
}

/**
 * Get client IP for rate limiting.
 * FIXED: Only trust X-Forwarded-For when Express trust proxy is configured.
 * Using req.ip which respects the trust proxy setting, falling back to socket address.
 * This prevents attackers from spoofing X-Forwarded-For to bypass rate limits.
 */
function getClientKey(req: Request): string {
  // req.ip respects Express 'trust proxy' setting
  // If trust proxy is not configured, req.ip = socket remote address (safe)
  // If trust proxy is configured, req.ip = leftmost untrusted X-Forwarded-For entry (safe)
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * Periodic cleanup of expired rate limit entries to prevent memory leaks.
 * Runs every 5 minutes.
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [, store] of stores) {
    for (const [key, record] of store) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }
}

// Run cleanup every 5 minutes to prevent memory leaks from expired entries
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

export function rateLimiter(name: string, config: RateLimitConfig) {
  const { windowMs, maxRequests, message } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
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

    record.count++;
    next();
  };
}

// Preset rate limiters
// FIXED: Separated auth rate limiters by operation to prevent
// login exhaustion from blocking password reset
export const loginRateLimiter = rateLimiter('login', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later',
});

export const registerRateLimiter = rateLimiter('register', {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 registration attempts per hour
  message: 'Too many registration attempts, please try again later',
});

export const passwordResetRateLimiter = rateLimiter('password-reset', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 reset attempts per 15 minutes
  message: 'Too many password reset attempts, please try again later',
});

// Keep backward compatible export
export const authRateLimiter = loginRateLimiter;

export const apiRateLimiter = rateLimiter('api', {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  message: 'Too many requests, please slow down',
});

export const sensitiveRateLimiter = rateLimiter('sensitive', {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 attempts per hour
  message: 'Too many attempts for this sensitive operation',
});

export const fileUploadRateLimiter = rateLimiter('file-upload', {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20, // 20 file uploads per hour (allows multiple proposals/evidence submissions)
  message: 'Too many file uploads, please try again later',
});
