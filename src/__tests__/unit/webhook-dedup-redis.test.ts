// @ts-nocheck
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
const redisGet = jest.fn<any>();
const redisSet = jest.fn<any>();
const redis = { status: 'ready', get: redisGet, set: redisSet };

jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({ redis }));

const { WebhookDeduper } = await import('../../utils/webhook-dedup.js');

describe('WebhookDeduper shared Redis tier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.status = 'ready';
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
  });

  it('hydrates local memory from a shared-cache duplicate', async () => {
    const deduper = new WebhookDeduper();
    redisGet.mockResolvedValueOnce('1');

    await expect(deduper.hasAsync('provider:event-1')).resolves.toBe(true);
    expect(redisGet).toHaveBeenCalledWith('webhook:dedup:provider:event-1');

    redisGet.mockClear();
    await expect(deduper.hasAsync('provider:event-1')).resolves.toBe(true);
    expect(redisGet).not.toHaveBeenCalled();
  });

  it('returns false for Redis misses and failures', async () => {
    const deduper = new WebhookDeduper();
    await expect(deduper.hasAsync('missing')).resolves.toBe(false);

    redisGet.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(deduper.hasAsync('failed-read')).resolves.toBe(false);
  });

  it('writes processed keys with the configured TTL and tolerates background failure', async () => {
    const deduper = new WebhookDeduper({ ttlMs: 1_234 });
    redisSet.mockRejectedValueOnce(new Error('redis unavailable'));

    expect(() => deduper.markProcessed('provider:event-2')).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(redisSet).toHaveBeenCalledWith(
      'webhook:dedup:provider:event-2',
      '1',
      'PX',
      1_234,
    );
    expect(deduper.has('provider:event-2')).toBe(true);
  });

  it('uses local memory only while Redis is not ready', async () => {
    const deduper = new WebhookDeduper();
    redis.status = 'connecting';

    await expect(deduper.hasAsync('event')).resolves.toBe(false);
    deduper.markProcessed('event');

    expect(redisGet).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });
});
