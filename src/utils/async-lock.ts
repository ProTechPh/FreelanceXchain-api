/**
 * Async lock utility to prevent race conditions on shared resources.
 *
 * Uses a Redis-backed distributed lock (SET NX PX + tokenized release) when
 * Redis is available, so serialization holds across multiple server replicas.
 * Falls back to an in-process per-key promise chain when Redis is not ready
 * or a Redis call fails (local development, tests, degraded deployments) —
 * availability over strictness, matching the pre-distributed behavior.
 *
 * NOTE: the distributed lock is not re-entrant. Do not call withLock with the
 * same key from inside a callback that already holds that key.
 */

import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Timing constants are overridable via env for ops tuning and fast test runs.
function getLockTtlMs(): number {
  return Number(process.env['ASYNC_LOCK_TTL_MS'] ?? 30_000);
}
function getLockAcquireTimeoutMs(): number {
  return Number(process.env['ASYNC_LOCK_ACQUIRE_TIMEOUT_MS'] ?? 10_000);
}
function getLockRetryIntervalMs(): number {
  return Number(process.env['ASYNC_LOCK_RETRY_INTERVAL_MS'] ?? 30);
}
function getLockRefreshIntervalMs(): number {
  return Number(process.env['ASYNC_LOCK_REFRESH_INTERVAL_MS'] ?? 10_000);
}

/** Per-key promise chain used for the in-process fallback lock. */
const localLocks = new Map<string, Promise<void>>();

/**
 * Shared lock key for milestone state transitions (approve / reject / dispute).
 * Every milestone-mutating flow MUST use this key so the operations serialize
 * against each other — without a single shared key, a concurrent approve + dispute
 * can both commit and move the same escrow twice (pay + dispute double-commit).
 */
export function milestoneLockKey(milestoneId: string): string {
  return `milestone-approve:${milestoneId}`;
}

/** Lua script: delete the lock key only if we still own it (token match). */
const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

function isRedisReady(): boolean {
  try {
    return redis.status === 'ready';
  } catch {
    return false;
  }
}

/** In-process fallback: serialize via a per-key promise chain. */
function localWithLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previousLock = localLocks.get(key) ?? Promise.resolve();

  const currentLock = previousLock.then(fn, fn);

  // Store the lock promise for cleanup. Use both fulfillment and rejection handlers
  // to ensure the cleanup promise itself never rejects (prevents unhandled rejections).
  localLocks.set(
    key,
    currentLock.then(
      () => {
        /* istanbul ignore next */
        if (localLocks.get(key) === currentLock) {
          localLocks.delete(key);
        }
      },
      () => {
        /* istanbul ignore next */
        if (localLocks.get(key) === currentLock) {
          localLocks.delete(key);
        }
      },
    ),
  );

  return currentLock;
}

/** Distributed lock: SET NX PX with tokenized release and automatic TTL refresh. */
async function redisWithLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = `lock:${key}`;
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lockTtl = getLockTtlMs();
  const deadline = Date.now() + getLockAcquireTimeoutMs();

  // Acquire phase — ONLY Redis failures here degrade to the in-process lock.
  // The callback (fn) runs outside this try/catch, so an application error inside
  // the locked section is never misread as a Redis failure and — critically — is
  // never re-executed through the fallback (that would double side effects).
  try {
    for (;;) {
      const acquired = await redis.set(lockKey, token, 'PX', lockTtl, 'NX');

      if (acquired === 'OK') break;

      if (Date.now() >= deadline) {
        // Could not acquire the distributed lock in time — degrade to the
        // in-process lock so the request is not blocked indefinitely.
        logger.warn('[async-lock] timed out acquiring distributed lock, falling back to in-process lock', { key });
        return localWithLock(key, fn);
      }

      await new Promise((resolve) => setTimeout(resolve, getLockRetryIntervalMs()));
    }
  } catch (error) {
    // Redis failure — fall back to the in-process lock so callers still get
    // mutual exclusion within this instance.
    logger.warn('[async-lock] Redis unavailable, falling back to in-process lock', { error, key });
    return localWithLock(key, fn);
  }

  // Lock held — run the callback. Errors propagate untouched (no re-run) and
  // the lock is always released with the ownership token.
  const refresher = setInterval(() => {
    redis.pexpire(lockKey, lockTtl).catch(() => {
      /* best-effort refresh */
    });
  }, getLockRefreshIntervalMs());
  if (typeof (refresher as NodeJS.Timeout).unref === 'function') {
    (refresher as NodeJS.Timeout).unref();
  }

  try {
    return await fn();
  } finally {
    clearInterval(refresher);
    try {
      await redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
    } catch (releaseError) {
      logger.warn('[async-lock] failed to release distributed lock', { error: releaseError, key });
    }
  }
}

/**
 * Acquire a lock for the given key and execute the callback exclusively.
 * Concurrent calls with the same key will queue and execute sequentially.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return isRedisReady() ? redisWithLock(key, fn) : localWithLock(key, fn);
}
