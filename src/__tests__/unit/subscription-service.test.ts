// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetByUserId = jest.fn<any>();
const mockGetProUserIds = jest.fn<any>();
const mockIsStripeConfigured = jest.fn<any>(() => true);

const mockConfig = { stripe: { devGrantPro: false } };
let nodeEnv = 'test';

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: mockConfig,
  getNodeEnv: () => nodeEnv,
}));

jest.unstable_mockModule(resolveModule('src/config/stripe.ts'), () => ({
  isStripeConfigured: mockIsStripeConfigured,
}));

jest.unstable_mockModule(resolveModule('src/config/redis.ts'), () => ({
  redis: { status: 'end', get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/repositories/subscription-repository.ts'), () => ({
  subscriptionRepository: { getByUserId: mockGetByUserId, getProUserIds: mockGetProUserIds },
}));

const svc = await import('../../services/subscription-service.js');

const row = (over: any = {}) => ({
  id: 'u1', user_id: 'u1', plan: 'pro', status: 'active',
  stripe_customer_id: 'cus_1', current_period_end: '2026-10-11T00:00:00.000Z',
  cancel_at_period_end: false, ...over,
});

describe('subscription entitlement', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.stripe.devGrantPro = false;
    nodeEnv = 'test';
    mockIsStripeConfigured.mockReturnValue(true);
    await svc.invalidateEntitlement('u1');
  });

  it('treats a missing subscription document as the free tier', async () => {
    // Absence IS free — no backfill, and no document is created on read.
    mockGetByUserId.mockResolvedValue(null);

    const result = await svc.getEntitlement('u1');

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ plan: 'free', status: 'none', isPro: false, manageable: false });
  });

  it.each([
    ['active', true],
    ['trialing', true],
    // Included on purpose: Stripe retries a failed invoice for days, and
    // revoking access mid-dunning hurts recovery more than a grace period costs.
    ['past_due', true],
    ['canceled', false],
    ['unpaid', false],
    ['incomplete', false],
    ['paused', false],
  ])('status %s → entitled: %s', async (status, entitled) => {
    mockGetByUserId.mockResolvedValue(row({ status }));
    await svc.invalidateEntitlement('u1');

    expect(await svc.isPro('u1')).toBe(entitled);
  });

  it('does not trust a stored plan=pro on a lapsed subscription', async () => {
    mockGetByUserId.mockResolvedValue(row({ plan: 'pro', status: 'canceled' }));

    const result = await svc.getEntitlement('u1');

    expect(result.data.plan).toBe('free');
    expect(result.data.isPro).toBe(false);
  });

  it('reports a cancelling subscription as still Pro until it ends', async () => {
    mockGetByUserId.mockResolvedValue(row({ cancel_at_period_end: true }));

    const result = await svc.getEntitlement('u1');

    expect(result.data.isPro).toBe(true);
    expect(result.data.cancelAtPeriodEnd).toBe(true);
  });

  it('caches the result so a gated request does not hit the datastore twice', async () => {
    mockGetByUserId.mockResolvedValue(row());

    await svc.getEntitlement('u1');
    await svc.getEntitlement('u1');

    expect(mockGetByUserId).toHaveBeenCalledTimes(1);
  });

  it('caches free users too, or every free request would hit the datastore', async () => {
    mockGetByUserId.mockResolvedValue(null);

    await svc.getEntitlement('u2');
    await svc.getEntitlement('u2');

    expect(mockGetByUserId).toHaveBeenCalledTimes(1);
    await svc.invalidateEntitlement('u2');
  });

  it('re-reads after invalidation, so a webhook takes effect', async () => {
    mockGetByUserId.mockResolvedValue(row());
    await svc.getEntitlement('u1');

    await svc.invalidateEntitlement('u1');
    await svc.getEntitlement('u1');

    expect(mockGetByUserId).toHaveBeenCalledTimes(2);
  });

  it('reports a read failure instead of silently downgrading', async () => {
    mockGetByUserId.mockRejectedValue(new Error('appwrite down'));

    const result = await svc.getEntitlement('u3');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('SUBSCRIPTION_CHECK_FAILED');
  });

  it('isPro throws on a read failure so the gate can answer 503, not 403', async () => {
    mockGetByUserId.mockRejectedValue(new Error('appwrite down'));

    await expect(svc.isPro('u4')).rejects.toThrow();
  });

  it('serves a stale cached value rather than downgrading during an outage', async () => {
    mockGetByUserId.mockResolvedValueOnce(row());
    await svc.getEntitlement('u5');

    // The local cache still holds the value; the next read fails.
    mockGetByUserId.mockRejectedValue(new Error('appwrite down'));
    const result = await svc.getEntitlement('u5');

    expect(result.success).toBe(true);
    expect(result.data.isPro).toBe(true);
    await svc.invalidateEntitlement('u5');
  });

  describe('getProUserIdSet', () => {
    it('returns an empty set for no ids without touching the datastore', async () => {
      expect((await svc.getProUserIdSet([])).size).toBe(0);
      expect(mockGetProUserIds).not.toHaveBeenCalled();
    });

    it('short-circuits when Stripe is unconfigured, keeping matching tests offline', async () => {
      mockIsStripeConfigured.mockReturnValue(false);

      expect((await svc.getProUserIdSet(['a'])).size).toBe(0);
      expect(mockGetProUserIds).not.toHaveBeenCalled();
    });

    it('passes the ids through when billing is live', async () => {
      mockGetProUserIds.mockResolvedValue(new Set(['a']));

      expect((await svc.getProUserIdSet(['a', 'b'])).has('a')).toBe(true);
    });

    it('degrades to no boost rather than breaking recommendations', async () => {
      mockGetProUserIds.mockRejectedValue(new Error('boom'));

      expect((await svc.getProUserIdSet(['a'])).size).toBe(0);
    });
  });

  describe('dev grant', () => {
    it('grants Pro only when Stripe is unconfigured outside production', async () => {
      mockConfig.stripe.devGrantPro = true;
      mockIsStripeConfigured.mockReturnValue(false);
      nodeEnv = 'development';

      expect(svc.isDevProGrantActive()).toBe(true);
      expect((await svc.getEntitlement('anyone')).data.isPro).toBe(true);
    });

    it('is inert once Stripe is actually configured', async () => {
      mockConfig.stripe.devGrantPro = true;
      mockIsStripeConfigured.mockReturnValue(true);
      nodeEnv = 'development';

      expect(svc.isDevProGrantActive()).toBe(false);
    });

    it('throws at boot if enabled in production', () => {
      // A dev escape hatch that can reach production is not an escape hatch.
      mockConfig.stripe.devGrantPro = true;
      nodeEnv = 'production';

      expect(() => svc.assertBillingConfigSafe()).toThrow(/BILLING_DEV_GRANT_PRO/);
    });

    it('boots normally when the grant is off', () => {
      mockConfig.stripe.devGrantPro = false;
      nodeEnv = 'production';

      expect(() => svc.assertBillingConfigSafe()).not.toThrow();
    });
  });
});
