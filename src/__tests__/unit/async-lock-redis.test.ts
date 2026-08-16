// @ts-nocheck
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Fast lock timings for the test run (module-level consts are read at import time).
process.env['ASYNC_LOCK_TTL_MS'] = '500';
process.env['ASYNC_LOCK_ACQUIRE_TIMEOUT_MS'] = '200';
process.env['ASYNC_LOCK_RETRY_INTERVAL_MS'] = '10';
process.env['ASYNC_LOCK_REFRESH_INTERVAL_MS'] = '100';

// In-memory Redis stand-in: SET NX PX semantics + tokenized release.
const store = new Map<string, string>();
const mockSet = jest.fn(async (key: string, value: string, _px: string, _ttl: number, _nx: string) => {
  if (store.has(key)) return null;
  store.set(key, value);
  return 'OK';
});
const mockPexpire = jest.fn(async () => 1);
const mockEval = jest.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
  if (store.get(key) === token) {
    store.delete(key);
    return 1;
  }
  return 0;
});

jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({
  redis: {
    status: 'ready',
    set: mockSet,
    pexpire: mockPexpire,
    eval: mockEval,
  },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
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

  it('should fall back to the in-process lock when the distributed lock cannot be acquired in time', async () => {
    // Lock is held forever by "another process".
    store.set('lock:contested-key', 'other-token');
    const order: number[] = [];
    const p1 = withLock('contested-key', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });
    const p2 = withLock('contested-key', async () => order.push(2));
    await Promise.all([p1, p2]);
    // Both fell back to the local chain after the short acquire timeout and serialized.
    expect(order).toEqual([1, 2]);
  });
});
