// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockVerify = jest.fn<any>();
const mockHandle = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/stripe-webhook-service.ts'), () => ({
  verifyAndParseEvent: mockVerify,
  handleStripeEvent: mockHandle,
  HANDLED_EVENTS: [],
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  webhookRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

const stripeWebhookRouter = (await import('../../routes/stripe-webhook-routes.js')).default;

function makeApp() {
  const app = express();
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }));
  app.use('/api/webhooks', stripeWebhookRouter);
  return app;
}

const event = (id: string, type = 'customer.subscription.updated') => ({ id, type, created: 1 });

describe('POST /api/webhooks/stripe', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
  });

  it('processes a verified event', async () => {
    mockVerify.mockReturnValue({ ok: true, event: event('evt_ok_1') });
    mockHandle.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'sig')
      .send({ hello: 'world' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockHandle).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a duplicate delivery without reprocessing it', async () => {
    // Stripe delivers at-least-once; event.id is its own idempotency key.
    mockVerify.mockReturnValue({ ok: true, event: event('evt_dupe_1') });
    mockHandle.mockResolvedValue(undefined);

    await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'sig').send({});
    const second = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'sig').send({});

    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(mockHandle).toHaveBeenCalledTimes(1);
  });

  it('400s on an invalid signature and never processes the event', async () => {
    mockVerify.mockReturnValue({ ok: false, code: 'INVALID_SIGNATURE', message: 'Invalid signature' });

    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'bad').send({});

    expect(res.status).toBe(400);
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it('503s when webhooks are not configured', async () => {
    mockVerify.mockReturnValue({ ok: false, code: 'NOT_CONFIGURED', message: 'not configured' });

    const res = await request(app).post('/api/webhooks/stripe').send({});

    expect(res.status).toBe(503);
  });

  it('500s on a processing failure so Stripe retries', async () => {
    // Answering 200 here would silently drop the event; Stripe's retry is the
    // recovery path for a transient datastore failure.
    mockVerify.mockReturnValue({ ok: true, event: event('evt_fail_1') });
    mockHandle.mockRejectedValue(new Error('appwrite down'));

    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'sig').send({});

    expect(res.status).toBe(500);
  });

  it('retries a previously failed event rather than treating it as a duplicate', async () => {
    mockVerify.mockReturnValue({ ok: true, event: event('evt_retry_1') });
    mockHandle.mockRejectedValueOnce(new Error('transient'));
    mockHandle.mockResolvedValueOnce(undefined);

    const first = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'sig').send({});
    const second = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'sig').send({});

    expect(first.status).toBe(500);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true });
    expect(mockHandle).toHaveBeenCalledTimes(2);
  });
});
