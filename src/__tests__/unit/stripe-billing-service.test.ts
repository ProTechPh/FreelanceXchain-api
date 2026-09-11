// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockConfig = {
  server: { frontendUrl: 'http://localhost:3000' },
  stripe: {
    monthlyPriceId: 'prod_WRONG',
    annualPriceId: undefined,
    publishableKey: undefined,
    baseUrl: 'https://api.stripe.com',
    devGrantPro: false,
  },
};

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: mockConfig,
  getNodeEnv: () => 'test',
  getStripeSecretKey: () => 'sk_test_x',
  getStripeWebhookSecret: () => 'whsec_x',
}));

jest.unstable_mockModule(resolveModule('src/config/stripe.ts'), () => ({
  getStripeClient: () => ({}),
  isStripeConfigured: () => true,
  INTEGRATION_IDENTIFIER: 'test',
  STRIPE_API_VERSION: '2026-08-26.dahlia',
}));

jest.unstable_mockModule(resolveModule('src/repositories/subscription-repository.ts'), () => ({
  subscriptionRepository: { getByUserId: jest.fn(async () => null) },
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: { getUserById: jest.fn(async () => null) },
}));

const { createCheckoutSession } = await import('../../services/stripe-billing-service.js');

describe('createCheckoutSession price-id validation', () => {
  beforeEach(() => {
    mockConfig.stripe.monthlyPriceId = 'prod_WRONG';
    mockConfig.stripe.annualPriceId = undefined;
  });

  it('rejects a Product id where a Price id is required, naming the fix', async () => {
    // The Dashboard shows prod_... first, so this is the single most common
    // setup mistake. It must not surface as "Stripe is unavailable".
    const result = await createCheckoutSession({ userId: 'u1', requestId: 'r1' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('STRIPE_PRICE_MISCONFIGURED');
    expect(result.error.message).toContain('STRIPE_MONTHLY_PRICE_ID');
    expect(result.error.details?.[0]).toContain('price_');
  });

  it('names the annual variable when the annual price is the broken one', async () => {
    mockConfig.stripe.annualPriceId = 'prod_ALSO_WRONG';

    const result = await createCheckoutSession({ userId: 'u1', requestId: 'r1', interval: 'year' });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('STRIPE_ANNUAL_PRICE_ID');
  });

  it('reports annual as unavailable when no annual price is configured at all', async () => {
    mockConfig.stripe.monthlyPriceId = 'price_ok';

    const result = await createCheckoutSession({ userId: 'u1', requestId: 'r1', interval: 'year' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INTERVAL_UNAVAILABLE');
  });
});
