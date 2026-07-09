/**
 * Simple async lock utility to prevent race conditions on shared resources.
 * Uses a per-key promise chain to serialize concurrent operations.
 *
 * This is an application-level lock suitable for single-instance deployments.
 * For multi-instance deployments, replace with a distributed lock (e.g., Redis SETNX).
 */

const locks = new Map<string, Promise<void>>();

/**
 * Acquire a lock for the given key and execute the callback exclusively.
 * Concurrent calls with the same key will queue and execute sequentially.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previousLock = locks.get(key) ?? Promise.resolve();

  const currentLock = previousLock.then(fn, fn);

  // Store the lock promise for cleanup. Use both fulfillment and rejection handlers
  // to ensure the cleanup promise itself never rejects (prevents unhandled rejections).
  locks.set(
    key,
    currentLock.then(
      () => {
        /* istanbul ignore next */
        if (locks.get(key) === currentLock) {
          locks.delete(key);
        }
      },
      () => {
        /* istanbul ignore next */
        if (locks.get(key) === currentLock) {
          locks.delete(key);
        }
      },
    ),
  );

  return currentLock;
}
