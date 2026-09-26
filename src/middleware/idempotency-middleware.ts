import { Request, Response, NextFunction, RequestHandler } from 'express';
import { idempotencyCache } from '../utils/cache.js';
import { sendErrorResponse } from '../utils/response-helpers.js';
import { getRequestId } from '../utils/route-helpers.js';
import { logger } from '../config/logger.js';

export interface IdempotencyEntry {
  status: 'in_progress' | 'completed';
  statusCode?: number;
  body?: any;
}

const DEFAULT_TTL_MS = 15 * 60_000; // 15 minutes
const IN_PROGRESS_TTL_MS = 60_000; // 1 minute in-flight guard

export function clearIdempotencyCache(): void {
  if (typeof idempotencyCache?.clear === 'function') {
    idempotencyCache.clear();
  }
}

/**
 * Idempotency middleware for mutating endpoints (escrow releases, refunds, payments).
 * Ensures that if a client retries a request with the same Idempotency-Key:
 * 1. Concurrent in-flight duplicates receive 409 Conflict.
 * 2. Already completed requests replay the identical cached response (with Idempotent-Replayed: true header).
 * 3. 5xx server errors do not poison the cache and can be safely retried.
 * 4. Requests without an Idempotency-Key header proceed without caching (backward-compatible).
 */
export function idempotencyMiddleware(ttlMs: number = DEFAULT_TTL_MS): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Only apply to mutating HTTP methods
    if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT' && req.method !== 'DELETE') {
      next();
      return;
    }

    const rawKey = req.header('Idempotency-Key') ?? req.header('X-Idempotency-Key');
    if (!rawKey) {
      // Header not provided - allow normal execution for backward compatibility
      next();
      return;
    }

    const key = rawKey.trim();
    if (key.length === 0 || key.length > 255) {
      sendErrorResponse(
        res,
        400,
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key header must be between 1 and 255 characters',
        { requestId: getRequestId(req) }
      );
      return;
    }

    const userId = req.user?.userId ?? 'anon';
    const endpointPath = `${req.baseUrl || ''}${req.path}`;
    const cacheKey = `idemp:${userId}:${req.method}:${endpointPath}:${key}`;

    const existing = idempotencyCache.get(cacheKey) as IdempotencyEntry | undefined;

    if (existing) {
      if (existing.status === 'in_progress') {
        sendErrorResponse(
          res,
          409,
          'IDEMPOTENCY_CONFLICT',
          `A request with idempotency key "${key}" is currently being processed. Please wait for it to complete.`,
          { requestId: getRequestId(req) }
        );
        return;
      }

      if (existing.status === 'completed' && existing.statusCode !== undefined) {
        logger.debug('Replaying cached idempotent response', { cacheKey, statusCode: existing.statusCode });
        res.setHeader('Idempotent-Replayed', 'true');
        res.setHeader('X-Idempotency-Key', key);
        res.status(existing.statusCode).json(existing.body);
        return;
      }
    }

    // Mark key as in-progress with a short TTL to prevent permanently stuck states if process aborts
    idempotencyCache.set(cacheKey, { status: 'in_progress' }, IN_PROGRESS_TTL_MS);
    res.setHeader('X-Idempotency-Key', key);

    // Intercept response completion
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let captured = false;

    const commitCache = (body: any): void => {
      if (captured) return;
      captured = true;

      // Only cache successful or non-transient responses (< 500)
      if (res.statusCode < 500) {
        idempotencyCache.set(
          cacheKey,
          {
            status: 'completed',
            statusCode: res.statusCode,
            body,
          },
          ttlMs
        );
      } else {
        // Evict 5xx server errors so client can retry
        idempotencyCache.delete(cacheKey);
      }
    };

    res.json = (body: any): Response => {
      commitCache(body);
      return originalJson(body);
    };

    res.send = (body: any): Response => {
      let parsed = body;
      if (typeof body === 'string') {
        try {
          parsed = JSON.parse(body);
        } catch {
          // keep as string if not JSON
        }
      }
      commitCache(parsed);
      return originalSend(body);
    };

    // Clean up if connection closed before completion
    res.on('close', () => {
      if (!res.writableEnded && !captured) {
        idempotencyCache.delete(cacheKey);
      }
    });

    next();
  };
}
