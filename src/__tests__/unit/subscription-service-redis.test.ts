// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

/**
 * The shared (Redis) cache tier of the entitlement read.
 *
 * Split from subscription-service.test.ts because that suite deliberately runs
 * with Redis unavailable to exercise the local-only path; here Redis is ready,
 * which is what production actually looks like.
 */
const redisGet = jest.fn<any>();
const redisSet = jest.fn<any>();
const redisDel = jest.fn<any>();
const mockGetByUserId = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { stripe: { devGrantPro: false } },
  getNodeEnv: () => 'test',
}));

jest.unstable_mockModule(resolveModule('src/config/stripe.ts'), () => ({
  isStripeConfigured: () => true,
}));

jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({
  redis: { status: 'ready', get: redisGet, set: redisSet, del: redisDel },
}));

jest.unstable_mockModule(resolveModule('src/repositories/subscription-repository.ts'), () => ({
  subscriptionRepository: { getByUserId: mockGetByUserId, getProUserIds: jest.fn() },
}));

const svc = await import('../../services/subscription-service.js');

const proRow = {
  id: 'u1', user_id: 'u1', plan: 'pro', status: 'active',
  stripe_customer_id: 'cus_1', current_period_end: null, cancel_at_period_end: false,
};

describe('entitlement caching with Redis available', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    redisGet.mockResolvedValue(null);
    redisSet.mockResolvedValue('OK');
    redisDel.mockResolvedValue(1);
    await svc.invalidateEntitlement('u1');
    jest.clearAllMocks();
  });

  it('serves a hit from Redis without touching the datastore', async () => {
    redisGet.mockResolvedValue(JSON.stringify({ plan: 'pro', status: 'active', isPro: true, currentPeriodEnd: null, cancelAtPeriodEnd: false, manageable: true }));

    const result = await svc.getEntitlement('u1');

    expect(result.data.isPro).toBe(true);
    expect(mockGetByUserId).not.toHaveBeenCalled();
  });

  it('writes through to Redis with an expiry on a miss', async () => {
    mockGetByUserId.mockResolvedValue(proRow);

    await svc.getEntitlement('u1');

    expect(redisSet).toHaveBeenCalledWith(
      'billing:entitlement:u1', expect.any(String), 'EX', expect.any(Number)
    );
  });

  it('clears the shared tier on invalidation, so a webhook reaches other replicas', async () => {
    await svc.invalidateEntitlement('u1');

    expect(redisDel).toHaveBeenCalledWith('billing:entitlement:u1');
  });

  it('falls back to the datastore when a Redis read fails', async () => {
    // A cache outage must degrade, never deny.
    redisGet.mockRejectedValue(new Error('redis down'));
    mockGetByUserId.mockResolvedValue(proRow);

    const result = await svc.getEntitlement('u1');

    expect(result.success).toBe(true);
    expect(result.data.isPro).toBe(true);
  });

  it('still returns the entitlement when the Redis write fails', async () => {
    redisSet.mockRejectedValue(new Error('redis down'));
    mockGetByUserId.mockResolvedValue(proRow);

    const result = await svc.getEntitlement('u1');

    expect(result.success).toBe(true);
  });

  it('does not throw when the Redis delete fails', async () => {
    redisDel.mockRejectedValue(new Error('redis down'));

    await expect(svc.invalidateEntitlement('u1')).resolves.toBeUndefined();
  });
});
