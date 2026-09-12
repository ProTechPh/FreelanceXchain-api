// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockConfig = {
  server: { frontendUrl: 'http://localhost:3000' },
  stripe: {
    monthlyPriceId: 'price_m',
    annualPriceId: 'price_y',
    publishableKey: undefined,
    baseUrl: 'https://api.stripe.com',
    trialPeriodDays: 0,
    devGrantPro: false,
  },
};

const stripeApi = {
  customers: { create: jest.fn<any>(), retrieve: jest.fn<any>() },
  checkout: { sessions: { create: jest.fn<any>() } },
  billingPortal: { sessions: { create: jest.fn<any>() } },
  subscriptions: { retrieve: jest.fn<any>() },
  prices: { retrieve: jest.fn<any>() },
};

let stripeConfigured = true;
let stripeClient: any = stripeApi;

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: mockConfig,
  getNodeEnv: () => 'test',
  getStripeSecretKey: () => 'sk_test_x',
  getStripeWebhookSecret: () => 'whsec_x',
}));

jest.unstable_mockModule(resolveModule('src/config/stripe.ts'), () => ({
  getStripeClient: () => stripeClient,
  isStripeConfigured: () => stripeConfigured,
  INTEGRATION_IDENTIFIER: 'fxchainpro-qwmtzkbd',
  STRIPE_API_VERSION: '2026-08-26.dahlia',
}));

const mockGetByUserId = jest.fn<any>();
const mockUpsert = jest.fn<any>(async () => ({}));

jest.unstable_mockModule(resolveModule('src/repositories/subscription-repository.ts'), () => ({
  subscriptionRepository: { getByUserId: mockGetByUserId, upsertForUser: mockUpsert },
}));

const mockGetUserById = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: { getUserById: mockGetUserById },
}));

const mockAppwriteUsersGet = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  users: { get: mockAppwriteUsersGet },
  databases: {}, DATABASE_ID: 'db', Query: {}, ID: { unique: () => 'x' },
}));

const mockIsUserVerified = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  isUserVerified: mockIsUserVerified,
}));

const svc = await import('../../services/stripe-billing-service.js');

const stripeError = (type: string, message = 'stripe says no') => Object.assign(new Error(message), { type, message });

describe('stripe-billing-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stripeConfigured = true;
    stripeClient = stripeApi;
    mockConfig.stripe.monthlyPriceId = 'price_m';
    mockConfig.stripe.annualPriceId = 'price_y';
    mockConfig.stripe.trialPeriodDays = 0;
    // Default: a fully verified, first-time subscriber.
    mockAppwriteUsersGet.mockResolvedValue({ emailVerification: true });
    mockIsUserVerified.mockResolvedValue(true);
    svc.resetPlanPricesCache();
    mockGetByUserId.mockResolvedValue(null);
    mockGetUserById.mockResolvedValue({ id: 'u1', email: 'u1@example.com', name: 'User One' });
    stripeApi.customers.create.mockResolvedValue({ id: 'cus_1' });
    stripeApi.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/x' });
    stripeApi.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.com/p/session/x' });
  });

  describe('resolveRedirectUrl', () => {
    it('keeps a same-origin URL', () => {
      expect(svc.resolveRedirectUrl('http://localhost:3000/x', 'http://fallback')).toBe('http://localhost:3000/x');
    });

    it('rejects a different origin — Stripe sends the browser here', () => {
      expect(svc.resolveRedirectUrl('https://evil.com/x', 'http://fallback')).toBe('http://fallback');
    });

    it('falls back when no candidate is given', () => {
      expect(svc.resolveRedirectUrl(undefined, 'http://fallback')).toBe('http://fallback');
    });

    it('resolves a relative path against our own origin', () => {
      expect(svc.resolveRedirectUrl('/billing/done', 'http://fallback'))
        .toBe('http://localhost:3000/billing/done');
    });

    it('rejects a protocol-relative URL pointing elsewhere', () => {
      expect(svc.resolveRedirectUrl('//evil.com/x', 'http://fallback')).toBe('http://fallback');
    });
  });

  describe('priceIdForInterval', () => {
    it('maps each interval to its configured price', () => {
      expect(svc.priceIdForInterval('month')).toBe('price_m');
      expect(svc.priceIdForInterval('year')).toBe('price_y');
    });
  });

  describe('ensureStripeCustomer', () => {
    it('reuses an existing customer instead of creating a second one', async () => {
      mockGetByUserId.mockResolvedValue({ stripe_customer_id: 'cus_existing' });

      const result = await svc.ensureStripeCustomer('u1');

      expect(result.data).toBe('cus_existing');
      expect(stripeApi.customers.create).not.toHaveBeenCalled();
    });

    it('creates one and stores the id, tagged with the user', async () => {
      const result = await svc.ensureStripeCustomer('u1');

      expect(result.data).toBe('cus_1');
      expect(stripeApi.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { user_id: 'u1' } })
      );
      expect(mockUpsert).toHaveBeenCalledWith('u1', { stripe_customer_id: 'cus_1' });
    });

    it('reports a missing user', async () => {
      mockGetUserById.mockResolvedValue(null);

      expect((await svc.ensureStripeCustomer('ghost')).error.code).toBe('USER_NOT_FOUND');
    });

    it('reports billing as unconfigured when it is', async () => {
      stripeConfigured = false;

      expect((await svc.ensureStripeCustomer('u1')).error.code).toBe('BILLING_NOT_CONFIGURED');
    });
  });

  describe('createCheckoutSession', () => {
    const base = { userId: 'u1', requestId: 'req-1' };

    it('creates a subscription session and returns its URL', async () => {
      const result = await svc.createCheckoutSession(base);

      expect(result.success).toBe(true);
      expect(result.data.url).toContain('checkout.stripe.com');
    });

    it('never pins payment_method_types, so dynamic payment methods work', async () => {
      await svc.createCheckoutSession(base);

      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params).not.toHaveProperty('payment_method_types');
      expect(params.mode).toBe('subscription');
    });

    it('does not enable automatic_tax, which would collect nothing silently', async () => {
      await svc.createCheckoutSession(base);

      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params).not.toHaveProperty('automatic_tax');
    });

    it('carries the user id on both the session and the subscription', async () => {
      await svc.createCheckoutSession(base);

      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params.client_reference_id).toBe('u1');
      expect(params.subscription_data.metadata.user_id).toBe('u1');
    });

    it('is idempotent on the request id, so a retry cannot double-subscribe', async () => {
      await svc.createCheckoutSession(base);

      const [, options] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(options.idempotencyKey).toBe('checkout:req-1');
    });

    it('uses the annual price when year is requested', async () => {
      await svc.createCheckoutSession({ ...base, interval: 'year' });

      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params.line_items[0].price).toBe('price_y');
    });

    it('sends no trial when none is configured', async () => {
      // Stripe rejects trial_period_days: 0, so the field must be absent.
      await svc.createCheckoutSession(base);

      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params.subscription_data).not.toHaveProperty('trial_period_days');
    });

    it('applies the configured trial at checkout', async () => {
      // A trial set on the Price in the Dashboard is NOT inherited by the API
      // (verified against Stripe), so passing it here is what actually grants it.
      mockConfig.stripe.trialPeriodDays = 7;

      await svc.createCheckoutSession(base);

      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params.subscription_data.trial_period_days).toBe(7);
    });

    it('applies the trial to annual as well as monthly', async () => {
      mockConfig.stripe.trialPeriodDays = 7;

      await svc.createCheckoutSession({ ...base, interval: 'year' });

      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params.line_items[0].price).toBe('price_y');
      expect(params.subscription_data.trial_period_days).toBe(7);
    });

    it('keeps the user id alongside the trial', async () => {
      mockConfig.stripe.trialPeriodDays = 7;

      await svc.createCheckoutSession(base);

      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params.subscription_data.metadata.user_id).toBe('u1');
    });

    it('refuses a second checkout for an already-active subscriber', async () => {
      mockGetByUserId.mockResolvedValue({ plan: 'pro', status: 'active', stripe_customer_id: 'cus_1' });

      expect((await svc.createCheckoutSession(base)).error.code).toBe('ALREADY_SUBSCRIBED');
    });

    it('reports annual as unavailable when no annual price is configured', async () => {
      mockConfig.stripe.annualPriceId = undefined;

      expect((await svc.createCheckoutSession({ ...base, interval: 'year' })).error.code)
        .toBe('INTERVAL_UNAVAILABLE');
    });

    it('rejects a Product id where a Price id belongs, naming the fix', async () => {
      mockConfig.stripe.monthlyPriceId = 'prod_WRONG';

      const result = await svc.createCheckoutSession(base);

      expect(result.error.code).toBe('STRIPE_PRICE_MISCONFIGURED');
      expect(result.error.details[0]).toContain('price_');
    });

    it('surfaces a bad request as a config fault, not an outage', async () => {
      stripeApi.checkout.sessions.create.mockRejectedValue(
        stripeError('StripeInvalidRequestError', "No such price: 'price_x'")
      );

      const result = await svc.createCheckoutSession(base);

      expect(result.error.code).toBe('STRIPE_REQUEST_INVALID');
      expect(result.error.message).toContain('No such price');
    });

    it('surfaces an auth failure distinctly from an outage', async () => {
      stripeApi.checkout.sessions.create.mockRejectedValue(stripeError('StripeAuthenticationError'));

      expect((await svc.createCheckoutSession(base)).error.code).toBe('STRIPE_AUTH_FAILED');
    });

    it('surfaces a missing key permission', async () => {
      stripeApi.checkout.sessions.create.mockRejectedValue(stripeError('StripePermissionError'));

      expect((await svc.createCheckoutSession(base)).error.code).toBe('STRIPE_AUTH_FAILED');
    });

    it('treats only a connection failure as Stripe being unavailable', async () => {
      stripeApi.checkout.sessions.create.mockRejectedValue(stripeError('StripeConnectionError'));

      expect((await svc.createCheckoutSession(base)).error.code).toBe('STRIPE_UNAVAILABLE');
    });

    it('treats rate limiting as temporary', async () => {
      stripeApi.checkout.sessions.create.mockRejectedValue(stripeError('StripeRateLimitError'));

      expect((await svc.createCheckoutSession(base)).error.code).toBe('STRIPE_UNAVAILABLE');
    });

    it('errors when Stripe returns a session with no URL', async () => {
      stripeApi.checkout.sessions.create.mockResolvedValue({ id: 'cs_1' });

      expect((await svc.createCheckoutSession(base)).error.code).toBe('STRIPE_UNAVAILABLE');
    });

    it('reports billing as unconfigured when it is', async () => {
      stripeConfigured = false;

      expect((await svc.createCheckoutSession(base)).error.code).toBe('BILLING_NOT_CONFIGURED');
    });
  });

  describe('createPortalSession', () => {
    it('returns the portal URL for an existing customer', async () => {
      mockGetByUserId.mockResolvedValue({ stripe_customer_id: 'cus_1' });

      const result = await svc.createPortalSession({ userId: 'u1' });

      expect(result.data.url).toContain('billing.stripe.com');
    });

    it('refuses when the user has never checked out', async () => {
      mockGetByUserId.mockResolvedValue(null);

      expect((await svc.createPortalSession({ userId: 'u1' })).error.code).toBe('NO_STRIPE_CUSTOMER');
    });

    it('maps a Stripe failure honestly', async () => {
      mockGetByUserId.mockResolvedValue({ stripe_customer_id: 'cus_1' });
      stripeApi.billingPortal.sessions.create.mockRejectedValue(stripeError('StripeConnectionError'));

      expect((await svc.createPortalSession({ userId: 'u1' })).error.code).toBe('STRIPE_UNAVAILABLE');
    });
  });

  describe('fetchSubscription', () => {
    it('returns the subscription', async () => {
      stripeApi.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1' });

      expect((await svc.fetchSubscription('sub_1'))?.id).toBe('sub_1');
    });

    it('returns null when the retrieve fails, rather than throwing into the webhook', async () => {
      stripeApi.subscriptions.retrieve.mockRejectedValue(new Error('boom'));

      expect(await svc.fetchSubscription('sub_1')).toBeNull();
    });

    it('returns null when there is no client', async () => {
      stripeClient = null;

      expect(await svc.fetchSubscription('sub_1')).toBeNull();
    });
  });

  describe('getTrialEligibility', () => {
    beforeEach(() => { mockConfig.stripe.trialPeriodDays = 7; });

    it('grants a trial to a verified, first-time subscriber', async () => {
      const result = await svc.getTrialEligibility('u1');

      expect(result).toEqual({ eligible: true, days: 7, reason: null });
    });

    it('refuses when no trial is offered at all', async () => {
      mockConfig.stripe.trialPeriodDays = 0;

      expect(await svc.getTrialEligibility('u1')).toEqual({
        eligible: false, days: 0, reason: 'no_trial_offered',
      });
    });

    it('refuses an unverified email — a throwaway address is seconds of work', async () => {
      mockAppwriteUsersGet.mockResolvedValue({ emailVerification: false });

      expect(await svc.getTrialEligibility('u1')).toMatchObject({
        eligible: false, reason: 'email_unverified',
      });
    });

    it('refuses when identity verification has not been approved', async () => {
      mockIsUserVerified.mockResolvedValue(false);

      expect(await svc.getTrialEligibility('u1')).toMatchObject({
        eligible: false, reason: 'kyc_unverified',
      });
    });

    it('refuses a second trial on the same account', async () => {
      // Otherwise cancel-and-resubscribe is an unlimited free plan.
      mockGetByUserId.mockResolvedValue({ trial_used: true });

      expect(await svc.getTrialEligibility('u1')).toMatchObject({
        eligible: false, reason: 'trial_already_used',
      });
    });

    it('treats an unreadable verification state as ineligible, not eligible', async () => {
      mockAppwriteUsersGet.mockRejectedValue(new Error('appwrite down'));

      expect(await svc.getTrialEligibility('u1')).toMatchObject({
        eligible: false, reason: 'email_unverified',
      });
    });

    it('checks the trial flag before making any network call', async () => {
      mockGetByUserId.mockResolvedValue({ trial_used: true });

      await svc.getTrialEligibility('u1');

      expect(mockAppwriteUsersGet).not.toHaveBeenCalled();
      expect(mockIsUserVerified).not.toHaveBeenCalled();
    });
  });

  describe('trial gating at checkout', () => {
    const base = { userId: 'u1', requestId: 'req-1' };

    beforeEach(() => { mockConfig.stripe.trialPeriodDays = 7; });

    it('gives a verified user the trial and marks it used', async () => {
      await svc.createCheckoutSession(base);

      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params.subscription_data.trial_period_days).toBe(7);
      expect(mockUpsert).toHaveBeenCalledWith('u1', { trial_used: true });
    });

    it('still lets an unverified user subscribe, just without the free days', async () => {
      // Refusing the sale outright would punish someone who wants to pay us.
      mockAppwriteUsersGet.mockResolvedValue({ emailVerification: false });

      const result = await svc.createCheckoutSession(base);

      expect(result.success).toBe(true);
      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params.subscription_data).not.toHaveProperty('trial_period_days');
    });

    it('does not consume the trial when none was granted', async () => {
      mockIsUserVerified.mockResolvedValue(false);

      await svc.createCheckoutSession(base);

      expect(mockUpsert).not.toHaveBeenCalledWith('u1', { trial_used: true });
    });

    it('refuses a repeat trial but still allows the purchase', async () => {
      mockGetByUserId.mockResolvedValue({ trial_used: true });

      const result = await svc.createCheckoutSession(base);

      expect(result.success).toBe(true);
      const [params] = stripeApi.checkout.sessions.create.mock.calls[0];
      expect(params.subscription_data).not.toHaveProperty('trial_period_days');
    });
  });

  describe('getTrialPeriodDays', () => {
    it('reports no trial by default', () => {
      expect(svc.getTrialPeriodDays()).toBe(0);
    });

    it('reports the configured length', () => {
      mockConfig.stripe.trialPeriodDays = 7;
      expect(svc.getTrialPeriodDays()).toBe(7);
    });
  });

  describe('getPlanPrices', () => {
    it('reads live amounts from Stripe', async () => {
      stripeApi.prices.retrieve
        .mockResolvedValueOnce({ unit_amount: 2000, currency: 'usd' })
        .mockResolvedValueOnce({ unit_amount: 20000, currency: 'usd' });

      const prices = await svc.getPlanPrices();

      expect(prices).toHaveLength(2);
      expect(prices[0]).toMatchObject({ interval: 'month', unitAmount: 2000, currency: 'usd' });
      expect(prices[1]).toMatchObject({ interval: 'year', unitAmount: 20000 });
    });

    it('reports the interval with a null amount when a price cannot be read', async () => {
      // The page can still offer the choice; it just cannot quote a figure.
      stripeApi.prices.retrieve.mockRejectedValue(new Error('boom'));

      const prices = await svc.getPlanPrices();

      expect(prices[0].unitAmount).toBeNull();
    });

    it('reports the configured intervals with unknown amounts when there is no client', async () => {
      // The UI can still offer monthly vs annual; it just cannot quote a figure.
      stripeClient = null;

      const prices = await svc.getPlanPrices();

      expect(prices).toHaveLength(2);
      expect(prices[0]).toMatchObject({ interval: 'month', priceId: 'price_m', unitAmount: null, currency: null });
      expect(prices[1]).toMatchObject({ interval: 'year', priceId: 'price_y', unitAmount: null });
    });

    it('serves repeat reads from cache instead of re-hitting Stripe', async () => {
      // /billing/plans is public and unauthenticated; without this the pricing
      // page would call Stripe once per visitor.
      stripeApi.prices.retrieve.mockResolvedValue({ unit_amount: 2000, currency: 'usd' });

      await svc.getPlanPrices();
      await svc.getPlanPrices();

      expect(stripeApi.prices.retrieve).toHaveBeenCalledTimes(2);
    });

    it('returns nothing when no price is configured', async () => {
      mockConfig.stripe.monthlyPriceId = undefined;
      mockConfig.stripe.annualPriceId = undefined;

      expect(await svc.getPlanPrices()).toEqual([]);
    });
  });
});
