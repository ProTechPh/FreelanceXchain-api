// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const upsertForUser = jest.fn(async () => ({}));
const getByUserId = jest.fn(async () => null);

jest.unstable_mockModule(resolveModule('src/repositories/subscription-repository.ts'), () => ({
  subscriptionRepository: {
    upsertForUser,
    getByUserId,
    findByStripeCustomerId: jest.fn(async () => null),
    findByStripeSubscriptionId: jest.fn(async () => null),
  },
}));

jest.unstable_mockModule(resolveModule('src/services/subscription-service.ts'), () => ({
  invalidateEntitlement: jest.fn(async () => undefined),
}));

jest.unstable_mockModule(resolveModule('src/services/stripe-billing-service.ts'), () => ({
  fetchSubscription: jest.fn(async () => null),
}));

jest.unstable_mockModule(resolveModule('src/config/stripe.ts'), () => ({
  getStripeClient: () => null,
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  getStripeWebhookSecret: () => 'whsec_x',
  config: { stripe: {} },
  getNodeEnv: () => 'test',
}));

jest.unstable_mockModule(resolveModule('src/utils/async-lock.ts'), () => ({
  withLock: async (_key: string, fn: () => Promise<unknown>) => fn(),
}));

const { handleStripeEvent } = await import('../../services/stripe-webhook-service.js');

const PERIOD_END = 1791733643; // 2026-10-11T15:47:23Z

function subscriptionEvent(overrides: Record<string, unknown>) {
  return {
    id: 'evt_1',
    type: 'customer.subscription.updated',
    created: 1_700_000_000,
    data: {
      object: {
        id: 'sub_1',
        status: 'active',
        customer: 'cus_1',
        metadata: { user_id: 'user-1' },
        items: { data: [{ price: { id: 'price_1' }, current_period_end: PERIOD_END }] },
        cancel_at_period_end: false,
        cancel_at: null,
        ...overrides,
      },
    },
  } as never;
}

describe('scheduled cancellation detection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('treats a cancel_at timestamp as cancelling, even when cancel_at_period_end is false', async () => {
    // This is what the Customer Portal actually sends on current API versions.
    // Reading only the boolean made a cancellation invisible and left the UI
    // saying "Renews on ...".
    await handleStripeEvent(subscriptionEvent({ cancel_at: PERIOD_END }));

    expect(upsertForUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        cancel_at_period_end: true,
        current_period_end: new Date(PERIOD_END * 1000).toISOString(),
      }),
    );
  });

  it('still honours the legacy cancel_at_period_end boolean on its own', async () => {
    await handleStripeEvent(subscriptionEvent({ cancel_at_period_end: true }));

    expect(upsertForUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ cancel_at_period_end: true }),
    );
  });

  it('reports a plain renewing subscription as not cancelling', async () => {
    await handleStripeEvent(subscriptionEvent({}));

    expect(upsertForUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        cancel_at_period_end: false,
        current_period_end: new Date(PERIOD_END * 1000).toISOString(),
      }),
    );
  });

  it('prefers the cancellation date over the period end when they differ', async () => {
    const earlier = PERIOD_END - 86_400;
    await handleStripeEvent(subscriptionEvent({ cancel_at: earlier }));

    expect(upsertForUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ current_period_end: new Date(earlier * 1000).toISOString() }),
    );
  });
});
