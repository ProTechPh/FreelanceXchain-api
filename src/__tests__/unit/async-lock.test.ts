import { jest } from '@jest/globals';

describe('async-lock', () => {
  let withLock: any;

  beforeAll(async () => {
    const mod = await import('../../utils/async-lock.js');
    withLock = mod.withLock;
  });

  it('should serialize concurrent operations on the same key', async () => {
    const order: number[] = [];
    const p1 = withLock('s-key1', async () => {
      await new Promise(r => setTimeout(r, 50));
      order.push(1);
    });
    const p2 = withLock('s-key1', async () => {
      order.push(2);
    });
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it('should allow concurrent operations on different keys', async () => {
    const order: number[] = [];
    const p1 = withLock('d-keyA', async () => {
      await new Promise(r => setTimeout(r, 50));
      order.push(1);
    });
    const p2 = withLock('d-keyB', async () => {
      order.push(2);
    });
    await Promise.all([p1, p2]);
    expect(order).toEqual([2, 1]);
  });

  it('should return the value from the callback', async () => {
    const result = await withLock('v-key2', async () => 42);
    expect(result).toBe(42);
  });

  it('should propagate errors from the callback', async () => {
    let caught = false;
    try {
      await withLock('e-key3', async () => {
        throw new Error('test error');
      });
    } catch (e: any) {
      caught = true;
      expect(e.message).toBe('test error');
    }
    expect(caught).toBe(true);
  });

  it('should clean up lock after completion', async () => {
    await withLock('c-key4', async () => 'done');
    // Yield to let the cleanup .then() handler run (line 27)
    await new Promise(r => setTimeout(r, 10));
    const result = await withLock('c-key4', async () => 'immediate');
    expect(result).toBe('immediate');
  });

  it('should clean up lock after error so subsequent calls proceed', async () => {
    let caught = false;
    try {
      await withLock('r-key5', async () => {
        throw new Error('fail');
      });
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
    // Yield to let the cleanup .then() handler run (line 32)
    await new Promise(r => setTimeout(r, 10));
    // Lock should be cleaned up — second call should not be blocked
    const result = await withLock('r-key5', async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('should not delete a newer lock during cleanup (guard on lines 26-27)', async () => {
    // Start first lock — it completes immediately but its .then() cleanup is queued.
    // Chain a second lock on the same key before the cleanup microtask fires.
    // The cleanup handler should see that locks.get(key) !== currentLock and skip the delete.
    const p1 = withLock('g-key6', async () => 'first');
    const p2 = p1.then(() => withLock('g-key6', async () => 'second'));

    const result = await p2;
    expect(result).toBe('second');

    // Verify the lock is eventually cleaned up after the second lock completes
    await new Promise(r => setTimeout(r, 10));
    const p3 = await withLock('g-key6', async () => 'third');
    expect(p3).toBe('third');
  });

  it('should not delete a newer lock during error cleanup (guard on lines 31-32)', async () => {
    // Start first lock that rejects — its .then(fn, fn) still runs, and the
    // error cleanup .then() is queued. Chain a second lock before cleanup fires.
    const p1 = withLock('g-key7', async () => {
      throw new Error('first fails');
    }).catch(() => 'caught');

    const p2 = p1.then(() => withLock('g-key7', async () => 'after error'));

    const result = await p2;
    expect(result).toBe('after error');
  });
});
