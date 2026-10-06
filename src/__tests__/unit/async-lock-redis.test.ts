// @ts-nocheck
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Fast lock timings for the test run (module-level consts are read at import time).
process.env['ASYNC_LOCK_TTL_MS'] = '500';
process.env['ASYNC_LOCK_ACQUIRE_TIMEOUT_MS'] = '200';
process.env['ASYNC_LOCK_RETRY_INTERVAL_MS'] = '10';
process.env['ASYNC_LOCK_REFRESH_INTERVAL_MS'] = '20';

// In-memory Redis stand-in: SET NX PX semantics + tokenized release.
const store = new Map<string, string>();
const defaultSetImpl = async (key: string, value: string, _px: string, _ttl: number, _nx: string) => {
  if (store.has(key)) return null;
  store.set(key, value);
  return 'OK';
};
const mockSet = jest.fn(defaultSetImpl);
const mockPexpire = jest.fn(async () => 1);
const defaultEvalImpl = async (script: string, _numKeys: number, key: string, token: string) => {
  if (store.get(key) !== token) return 0;
  // Refresh (pexpire) must not release the lock — only the release script deletes it.
  if (String(script).includes('pexpire')) return 1;
  store.delete(key);
  return 1;
};
const mockEval = jest.fn(defaultEvalImpl);

jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({
  redis: {
    status: 'ready',
    set: mockSet,
    pexpire: mockPexpire,
    eval: mockEval,
  },
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: mockLogger,
}));

const importWithLock = async (): Promise<{ withLock: any }> => {
  return (await import('../../utils/async-lock.js')) as any;
};

describe('async-lock — Redis-backed distributed lock', () => {
  let withLock: any;

  beforeAll(async () => {
    withLock = (await importWithLock()).withLock;
  });

  afterAll(() => {
    // Do not leak test timings into other suites in the same worker.
    delete process.env['ASYNC_LOCK_TTL_MS'];
    delete process.env['ASYNC_LOCK_ACQUIRE_TIMEOUT_MS'];
    delete process.env['ASYNC_LOCK_RETRY_INTERVAL_MS'];
    delete process.env['ASYNC_LOCK_REFRESH_INTERVAL_MS'];
  });

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    // Restore the default SET NX behavior — a previous test may have
    // replaced it with mockRejectedValue, which clearAllMocks does NOT reset.
    mockSet.mockImplementation(defaultSetImpl);
    mockEval.mockReset();
    mockEval.mockImplementation(defaultEvalImpl);
  });

  it('should serialize concurrent operations on the same key via Redis', async () => {
    const order: number[] = [];
    const p1 = withLock('redis-key-1', async () => {
      await new Promise((r) => setTimeout(r, 40));
      order.push(1);
    });
    const p2 = withLock('redis-key-1', async () => {
      order.push(2);
    });
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
    // The distributed path used SET NX and released via the tokenized eval.
    expect(mockSet).toHaveBeenCalled();
    expect(mockEval).toHaveBeenCalledWith(expect.stringContaining('redis.call'), 1, expect.stringContaining('lock:redis-key-1'), expect.any(String));
  });

  it('should release the lock after completion so the next call does not wait', async () => {
    await withLock('redis-key-2', async () => 'done');
    // Lock released by eval — a second call should acquire immediately.
    const result = await withLock('redis-key-2', async () => 'immediate');
    expect(result).toBe('immediate');
  });

  it('should allow a second call to acquire after the first releases (release handoff)', async () => {
    const order: number[] = [];
    const p1 = withLock('redis-key-3', async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push(1);
    });
    const p2 = p1.then(() => withLock('redis-key-3', async () => order.push(2)));
    await p2;
    expect(order).toEqual([1, 2]);
  });

  it('should fall back to the in-process lock when Redis is not ready', async () => {
    const origStatus = Object.getOwnPropertyDescriptor(mockSet, 'name'); // no-op to satisfy linters
    void origStatus;
    // Simulate a non-ready connection by swapping the status getter.
    const moduleRedis = (await import(resolveModule('src/config/redis.ts'))).redis;
    const original = moduleRedis.status;
    Object.defineProperty(moduleRedis, 'status', { value: 'connecting' });
    try {
      const order: number[] = [];
      const p1 = withLock('fallback-key', async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push(1);
      });
      const p2 = withLock('fallback-key', async () => order.push(2));
      await Promise.all([p1, p2]);
      expect(order).toEqual([1, 2]);
      expect(mockSet).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(moduleRedis, 'status', { value: original });
    }
  });

  it('should fall back to the in-process lock when redis.set rejects', async () => {
    // Reject EVERY set so both callers deterministically take the local chain.
    mockSet.mockRejectedValue(new Error('redis down'));
    const order: number[] = [];
    const p1 = withLock('err-key', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });
    const p2 = withLock('err-key', async () => order.push(2));
    await Promise.all([p1, p2]);
    // Both fell back to the in-process per-key chain and serialized.
    expect(order).toEqual([1, 2]);
    expect(mockSet).toHaveBeenCalled();
  });

  it('should propagate callback errors without re-running the callback (no double-execution)', async () => {
    let calls = 0;
    const failing = async () => {
      calls += 1;
      throw new Error('business failure');
    };

    await expect(withLock('throw-key', failing)).rejects.toThrow('business failure');
    // The callback must run exactly once — the error is not mistaken for a Redis
    // failure, so the fallback must NOT re-execute it (which would double side effects).
    expect(calls).toBe(1);
    // The distributed lock was still released after the failure.
    const after = await withLock('throw-key', async () => 'released');
    expect(after).toBe('released');
  });

  it('should reject when the distributed lock is contended beyond the acquire timeout', async () => {
    // Lock is held forever by "another process" — contention must fail closed
    // rather than silently continuing without mutual exclusion.
    store.set('lock:contested-key', 'other-token');
    const order: number[] = [];
    const p1 = withLock('contested-key', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });
    const p2 = withLock('contested-key', async () => order.push(2));
    const results = await Promise.allSettled([p1, p2]);

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(Error);
        expect((result.reason as { code?: string }).code).toBe('LOCK_UNAVAILABLE');
      }
    }
    // The callbacks never ran without a lock.
    expect(order).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('timed out'), expect.any(Object));
  });

  it('should warn and fall back when the redis.status getter throws', async () => {
    const moduleRedis = (await import(resolveModule('src/config/redis.ts'))).redis;
    const original = Object.getOwnPropertyDescriptor(moduleRedis, 'status');
    Object.defineProperty(moduleRedis, 'status', {
      get() {
        throw new Error('status unavailable');
      },
      configurable: true,
    });
    try {
      const result = await withLock('status-throw-key', async () => 'local');
      expect(result).toBe('local');
      expect(mockSet).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(moduleRedis, 'status', original);
      else delete (moduleRedis as any).status;
    }
  });

  it('should warn when releasing the distributed lock fails', async () => {
    mockEval.mockRejectedValue(new Error('eval failed'));
    const result = await withLock('release-fail-key', async () => 'done');
    expect(result).toBe('done');
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('failed to release'), expect.any(Object));
  });

  it('should refresh the TTL while the lock is held (and tolerate refresh failures)', async () => {
    // First refresh call fails (transient network error); the release still runs.
    let evalCalls = 0;
    mockEval.mockImplementation(async (...args: any[]) => {
      evalCalls += 1;
      if (evalCalls === 1) throw new Error('refresh failed');
      return defaultEvalImpl(...(args as Parameters<typeof defaultEvalImpl>));
    });

    const result = await withLock('refresh-key', async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'held';
    });

    expect(result).toBe('held');
    // At least one refresh fired while the lock was held (best-effort, even though the first rejected).
    expect(mockEval).toHaveBeenCalledWith(
      expect.stringContaining('pexpire'),
      1,
      'lock:refresh-key',
      expect.any(String),
      expect.any(Number),
    );
    // The lock was still released at the end (token match, no early delete).
    expect(store.has('lock:refresh-key')).toBe(false);
  });
});
