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

function getClientKey(req: Request): string {
  // Use X-Forwarded-For if behind proxy, otherwise use IP
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : req.ip;
  return ip ?? 'unknown';
}

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
export const authRateLimiter = rateLimiter('auth', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later',
});

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
