// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateCheckoutSession = jest.fn<any>();
const mockCreatePortalSession = jest.fn<any>();
const mockGetPlanPrices = jest.fn<any>();
const mockGetEntitlement = jest.fn<any>();
const mockIsStripeConfigured = jest.fn<any>(() => true);

jest.unstable_mockModule(resolveModule('src/services/stripe-billing-service.ts'), () => ({
  createCheckoutSession: mockCreateCheckoutSession,
  createPortalSession: mockCreatePortalSession,
  getPlanPrices: mockGetPlanPrices,
}));

jest.unstable_mockModule(resolveModule('src/services/subscription-service.ts'), () => ({
  getEntitlement: mockGetEntitlement,
}));

jest.unstable_mockModule(resolveModule('src/config/stripe.ts'), () => ({
  isStripeConfigured: mockIsStripeConfigured,
}));

let currentUser: any = { userId: 'user-1', role: 'freelancer' };

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    if (currentUser) req.user = currentUser;
    next();
  },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  billingRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const billingRouter = (await import('../../routes/billing-routes.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/billing', billingRouter);
  return app;
}

const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message = 'nope', details?: string[]) => ({
  success: false,
  error: { code, message, ...(details ? { details } : {}) },
});

describe('Billing routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { userId: 'user-1', role: 'freelancer' };
    mockIsStripeConfigured.mockReturnValue(true);
    app = makeApp();
  });

  describe('GET /plans', () => {
    it('serves live prices without requiring auth', async () => {
      mockGetPlanPrices.mockResolvedValue([
        { interval: 'month', priceId: 'price_m', unitAmount: 2000, currency: 'usd' },
        { interval: 'year', priceId: 'price_y', unitAmount: 20000, currency: 'usd' },
      ]);
      currentUser = null;

      const res = await request(app).get('/api/billing/plans');

      expect(res.status).toBe(200);
      expect(res.body.billingEnabled).toBe(true);
      const pro = res.body.plans.find((p: any) => p.id === 'pro');
      expect(pro.prices).toHaveLength(2);
      expect(pro.prices[1]).toMatchObject({ interval: 'year', unitAmount: 20000 });
    });

    it('reports billing as disabled when Stripe is unconfigured', async () => {
      mockIsStripeConfigured.mockReturnValue(false);
      mockGetPlanPrices.mockResolvedValue([]);

      const res = await request(app).get('/api/billing/plans');

      expect(res.status).toBe(200);
      expect(res.body.billingEnabled).toBe(false);
    });
  });

  describe('GET /subscription', () => {
    it('returns the entitlement snapshot', async () => {
      mockGetEntitlement.mockResolvedValue(
        ok({ plan: 'pro', status: 'active', isPro: true, currentPeriodEnd: null, cancelAtPeriodEnd: false, manageable: true })
      );

      const res = await request(app).get('/api/billing/subscription');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ plan: 'pro', isPro: true });
    });

    it('reports an admin as entitled by role, without reading a subscription', async () => {
      currentUser = { userId: 'admin-1', role: 'admin' };

      const res = await request(app).get('/api/billing/subscription');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ plan: 'pro', isPro: true, reason: 'admin', manageable: false });
      expect(mockGetEntitlement).not.toHaveBeenCalled();
    });

    it('401s when unauthenticated', async () => {
      currentUser = null;

      const res = await request(app).get('/api/billing/subscription');

      expect(res.status).toBe(401);
    });

    it('503s when the entitlement cannot be read', async () => {
      // Never 403 — a paywall and an outage must not look the same.
      mockGetEntitlement.mockResolvedValue(fail('SUBSCRIPTION_CHECK_FAILED'));

      const res = await request(app).get('/api/billing/subscription');

      expect(res.status).toBe(503);
    });
  });

  describe('POST /checkout-session', () => {
    it('returns the Stripe checkout URL', async () => {
      mockCreateCheckoutSession.mockResolvedValue(ok({ url: 'https://checkout.stripe.com/c/pay/x', sessionId: 'cs_1' }));

      const res = await request(app).post('/api/billing/checkout-session').send({});

      expect(res.status).toBe(200);
      expect(res.body.url).toContain('checkout.stripe.com');
    });

    it('passes the requested interval through', async () => {
      mockCreateCheckoutSession.mockResolvedValue(ok({ url: 'https://checkout.stripe.com/c/pay/y', sessionId: 'cs_2' }));

      await request(app).post('/api/billing/checkout-session').send({ interval: 'year' });

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ interval: 'year' }));
    });

    it('rejects an interval that is not month or year', async () => {
      const res = await request(app).post('/api/billing/checkout-session').send({ interval: 'week' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    });

    it('401s when unauthenticated', async () => {
      currentUser = null;

      const res = await request(app).post('/api/billing/checkout-session').send({});

      expect(res.status).toBe(401);
    });

    it.each([
      ['BILLING_NOT_CONFIGURED', 503],
      ['ALREADY_SUBSCRIBED', 409],
      ['STRIPE_UNAVAILABLE', 502],
      ['STRIPE_REQUEST_INVALID', 400],
      ['STRIPE_PRICE_MISCONFIGURED', 400],
      ['INTERVAL_UNAVAILABLE', 400],
      ['STRIPE_AUTH_FAILED', 503],
      ['USER_NOT_FOUND', 404],
      ['SOMETHING_ELSE', 400],
    ])('maps %s to HTTP %i', async (code, status) => {
      // Configuration faults must not masquerade as outages, and vice versa.
      mockCreateCheckoutSession.mockResolvedValue(fail(code));

      const res = await request(app).post('/api/billing/checkout-session').send({});

      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
    });
  });

  describe('POST /portal-session', () => {
    it('returns the portal URL', async () => {
      mockCreatePortalSession.mockResolvedValue(ok({ url: 'https://billing.stripe.com/p/session/x' }));

      const res = await request(app).post('/api/billing/portal-session').send({});

      expect(res.status).toBe(200);
      expect(res.body.url).toContain('billing.stripe.com');
    });

    it('409s when the user has no billing account yet', async () => {
      mockCreatePortalSession.mockResolvedValue(fail('NO_STRIPE_CUSTOMER'));

      const res = await request(app).post('/api/billing/portal-session').send({});

      expect(res.status).toBe(409);
    });

    it('401s when unauthenticated', async () => {
      currentUser = null;

      const res = await request(app).post('/api/billing/portal-session').send({});

      expect(res.status).toBe(401);
    });

    it('forwards a returnUrl when one is given', async () => {
      mockCreatePortalSession.mockResolvedValue(ok({ url: 'https://billing.stripe.com/p/session/z' }));

      await request(app).post('/api/billing/portal-session').send({ returnUrl: '/dashboard/freelancer/billing' });

      expect(mockCreatePortalSession).toHaveBeenCalledWith(
        expect.objectContaining({ returnUrl: '/dashboard/freelancer/billing' })
      );
    });
  });
});
