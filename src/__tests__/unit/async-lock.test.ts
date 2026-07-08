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
});
