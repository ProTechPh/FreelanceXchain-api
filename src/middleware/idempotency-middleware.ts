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

function extractIdempotencyKey(req: Request): string | null {
  const rawKey = req.header('Idempotency-Key') ?? req.header('X-Idempotency-Key');
  return rawKey ? rawKey.trim() : null;
}

function handleExistingEntry(
  existing: IdempotencyEntry,
  key: string,
  req: Request,
  res: Response
): boolean {
  if (existing.status === 'in_progress') {
    sendErrorResponse(
      res,
      409,
      'IDEMPOTENCY_CONFLICT',
      `A request with idempotency key "${key}" is currently being processed. Please wait for it to complete.`,
      { requestId: getRequestId(req) }
    );
    return true;
  }

  if (existing.status === 'completed' && existing.statusCode !== undefined) {
    logger.debug('Replaying cached idempotent response', { key, statusCode: existing.statusCode });
    res.setHeader('Idempotent-Replayed', 'true');
    res.setHeader('X-Idempotency-Key', key);
    res.status(existing.statusCode).json(existing.body);
    return true;
  }

  return false;
}

function attachResponseCaching(res: Response, cacheKey: string, ttlMs: number): void {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let captured = false;

  const commitCache = (body: any): void => {
    if (captured) return;
    captured = true;
    if (res.statusCode < 500) {
      idempotencyCache.set(cacheKey, { status: 'completed', statusCode: res.statusCode, body }, ttlMs);
    } else {
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
        // keep as string
      }
    }
    commitCache(parsed);
    return originalSend(body);
  };

  res.on('close', () => {
    if (!res.writableEnded && !captured) {
      idempotencyCache.delete(cacheKey);
    }
  });
}

/**
 * Idempotency middleware for mutating endpoints (escrow releases, refunds, payments).
 */
export function idempotencyMiddleware(ttlMs: number = DEFAULT_TTL_MS): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'PUT' && req.method !== 'DELETE') {
      next();
      return;
    }

    const key = extractIdempotencyKey(req);
    if (key === null) {
      next();
      return;
    }

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
    if (existing && handleExistingEntry(existing, key, req, res)) {
      return;
    }

    idempotencyCache.set(cacheKey, { status: 'in_progress' }, IN_PROGRESS_TTL_MS);
    res.setHeader('X-Idempotency-Key', key);

    attachResponseCaching(res, cacheKey, ttlMs);
    next();
  };
}
