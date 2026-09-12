// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const upsertForUser = jest.fn<any>(async () => ({}));
const getByUserId = jest.fn<any>(async () => null);
const findByStripeCustomerId = jest.fn<any>(async () => null);
const invalidateEntitlement = jest.fn<any>(async () => undefined);
const fetchSubscription = jest.fn<any>(async () => null);
const createNotification = jest.fn<any>(async () => ({}));
const constructEvent = jest.fn<any>();

let webhookSecret: string | undefined = 'whsec_x';
let stripeClient: any = { webhooks: { constructEvent } };

jest.unstable_mockModule(resolveModule('src/repositories/subscription-repository.ts'), () => ({
  subscriptionRepository: {
    upsertForUser,
    getByUserId,
    findByStripeCustomerId,
    findByStripeSubscriptionId: jest.fn(async () => null),
  },
}));

jest.unstable_mockModule(resolveModule('src/services/subscription-service.ts'), () => ({ invalidateEntitlement }));
jest.unstable_mockModule(resolveModule('src/services/stripe-billing-service.ts'), () => ({ fetchSubscription }));
jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({ createNotification }));
jest.unstable_mockModule(resolveModule('src/config/stripe.ts'), () => ({ getStripeClient: () => stripeClient }));
jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  getStripeWebhookSecret: () => webhookSecret,
  config: { stripe: {} },
  getNodeEnv: () => 'test',
}));
jest.unstable_mockModule(resolveModule('src/utils/async-lock.ts'), () => ({
  withLock: async (_key: string, fn: () => Promise<unknown>) => fn(),
}));

const { verifyAndParseEvent, handleStripeEvent, HANDLED_EVENTS } = await import(
  '../../services/stripe-webhook-service.js'
);

const PERIOD_END = 1791733643;

const subscription = (over: any = {}) => ({
  id: 'sub_1',
  status: 'active',
  customer: 'cus_1',
  metadata: { user_id: 'user-1' },
  items: { data: [{ price: { id: 'price_m' }, current_period_end: PERIOD_END }] },
  cancel_at_period_end: false,
  cancel_at: null,
  ...over,
});

const evt = (type: string, object: any, over: any = {}) => ({
  id: 'evt_1', type, created: 1_700_000_000, data: { object }, ...over,
});

describe('stripe-webhook-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    webhookSecret = 'whsec_x';
    stripeClient = { webhooks: { constructEvent } };
    getByUserId.mockResolvedValue(null);
    findByStripeCustomerId.mockResolvedValue(null);
  });

  describe('verifyAndParseEvent', () => {
    it('returns the parsed event for a valid signature', () => {
      constructEvent.mockReturnValue({ id: 'evt_1', type: 'x' });

      const result = verifyAndParseEvent('{"a":1}', 'sig');

      expect(result.ok).toBe(true);
      expect(constructEvent).toHaveBeenCalledWith('{"a":1}', 'sig', 'whsec_x');
    });

    it('reports unconfigured when there is no signing secret', () => {
      webhookSecret = undefined;

      expect(verifyAndParseEvent('{}', 'sig')).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    });

    it('reports unconfigured when there is no client', () => {
      stripeClient = null;

      expect(verifyAndParseEvent('{}', 'sig')).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    });

    it('refuses a missing raw body rather than re-serializing it', () => {
      // Re-serializing changes the bytes and makes the signature meaningless.
      expect(verifyAndParseEvent(undefined, 'sig')).toMatchObject({ ok: false, code: 'INVALID_SIGNATURE' });
    });

    it('refuses a missing signature header', () => {
      expect(verifyAndParseEvent('{}', undefined)).toMatchObject({ ok: false, code: 'INVALID_SIGNATURE' });
    });

    it('reports a signature that does not verify', () => {
      constructEvent.mockImplementation(() => { throw new Error('bad sig'); });

      expect(verifyAndParseEvent('{}', 'sig')).toMatchObject({ ok: false, code: 'INVALID_SIGNATURE' });
    });
  });

  it('declares exactly the events the handler implements', () => {
    expect([...HANDLED_EVENTS].sort()).toEqual([
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.deleted',
      'customer.subscription.updated',
      'invoice.paid',
      'invoice.payment_failed',
    ]);
  });

  describe('checkout.session.completed', () => {
    const session = (over: any = {}) => ({
      client_reference_id: 'user-1',
      customer: 'cus_1',
      mode: 'subscription',
      subscription: 'sub_1',
      metadata: {},
      ...over,
    });

    it('links the customer and applies the retrieved subscription', async () => {
      fetchSubscription.mockResolvedValue(subscription());

      await handleStripeEvent(evt('checkout.session.completed', session()));

      expect(upsertForUser).toHaveBeenCalledWith('user-1', { stripe_customer_id: 'cus_1' });
      expect(upsertForUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ plan: 'pro', status: 'active' }));
      expect(invalidateEntitlement).toHaveBeenCalledWith('user-1');
    });

    it('falls back to metadata when client_reference_id is absent', async () => {
      fetchSubscription.mockResolvedValue(subscription());

      await handleStripeEvent(evt('checkout.session.completed',
        session({ client_reference_id: null, metadata: { user_id: 'user-2' } })));

      expect(upsertForUser).toHaveBeenCalledWith('user-2', expect.any(Object));
    });

    it('falls back to a customer lookup when no identifier is attached', async () => {
      findByStripeCustomerId.mockResolvedValue({ user_id: 'user-3' });
      fetchSubscription.mockResolvedValue(subscription());

      await handleStripeEvent(evt('checkout.session.completed',
        session({ client_reference_id: null, metadata: {} })));

      expect(upsertForUser).toHaveBeenCalledWith('user-3', expect.any(Object));
    });

    it('gives up quietly on an unresolvable session rather than retrying for days', async () => {
      await handleStripeEvent(evt('checkout.session.completed',
        session({ client_reference_id: null, metadata: {}, customer: null })));

      expect(upsertForUser).not.toHaveBeenCalled();
    });

    it('skips subscription state for a non-subscription checkout', async () => {
      await handleStripeEvent(evt('checkout.session.completed',
        session({ mode: 'payment', subscription: null })));

      expect(fetchSubscription).not.toHaveBeenCalled();
      expect(invalidateEntitlement).toHaveBeenCalledWith('user-1');
    });

    it('accepts an expanded subscription object as well as an id', async () => {
      fetchSubscription.mockResolvedValue(subscription());

      await handleStripeEvent(evt('checkout.session.completed', session({ subscription: { id: 'sub_9' } })));

      expect(fetchSubscription).toHaveBeenCalledWith('sub_9');
    });
  });

  describe('customer.subscription.created / updated', () => {
    it('re-fetches from Stripe rather than trusting the event payload', async () => {
      // The event is a trigger, not a value — this is the ordering defence.
      fetchSubscription.mockResolvedValue(subscription({ status: 'past_due' }));

      await handleStripeEvent(evt('customer.subscription.updated', subscription()));

      expect(fetchSubscription).toHaveBeenCalledWith('sub_1');
      expect(upsertForUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ status: 'past_due' }));
    });

    it('falls back to the embedded object when the retrieve fails', async () => {
      fetchSubscription.mockResolvedValue(null);

      await handleStripeEvent(evt('customer.subscription.created', subscription()));

      expect(upsertForUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ status: 'active' }));
    });

    it('marks a canceled subscription as free', async () => {
      fetchSubscription.mockResolvedValue(subscription({ status: 'canceled' }));

      await handleStripeEvent(evt('customer.subscription.updated', subscription()));

      expect(upsertForUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ plan: 'free' }));
    });

    it('skips an event older than the one already applied', async () => {
      // Stripe does not guarantee ordering; the watermark stops a regression.
      getByUserId.mockResolvedValue({ last_event_created: 1_800_000_000 });
      fetchSubscription.mockResolvedValue(subscription());

      await handleStripeEvent(evt('customer.subscription.updated', subscription()));

      expect(upsertForUser).not.toHaveBeenCalled();
    });

    it('gives up quietly when the subscription maps to no user', async () => {
      await handleStripeEvent(evt('customer.subscription.updated',
        subscription({ metadata: {}, customer: null })));

      expect(upsertForUser).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.deleted', () => {
    it('drops the user to free but keeps the customer id for re-subscribing', async () => {
      await handleStripeEvent(evt('customer.subscription.deleted', subscription()));

      expect(upsertForUser).toHaveBeenCalledWith('user-1', expect.objectContaining({
        plan: 'free',
        status: 'canceled',
        stripe_subscription_id: null,
      }));
      const [, attrs] = upsertForUser.mock.calls[0];
      expect(attrs).not.toHaveProperty('stripe_customer_id');
    });

    it('skips a stale cancellation', async () => {
      getByUserId.mockResolvedValue({ last_event_created: 1_800_000_000 });

      await handleStripeEvent(evt('customer.subscription.deleted', subscription()));

      expect(upsertForUser).not.toHaveBeenCalled();
    });

    it('gives up quietly when it maps to no user', async () => {
      await handleStripeEvent(evt('customer.subscription.deleted',
        subscription({ metadata: {}, customer: null })));

      expect(upsertForUser).not.toHaveBeenCalled();
    });
  });

  describe('invoice events', () => {
    const invoice = (over: any = {}) => ({ customer: 'cus_1', metadata: { user_id: 'user-1' }, ...over });

    it('refreshes state on a paid renewal', async () => {
      getByUserId.mockResolvedValue({ stripe_subscription_id: 'sub_1', last_event_created: 0 });
      fetchSubscription.mockResolvedValue(subscription());

      await handleStripeEvent(evt('invoice.paid', invoice()));

      expect(fetchSubscription).toHaveBeenCalledWith('sub_1');
      expect(invalidateEntitlement).toHaveBeenCalledWith('user-1');
    });

    it('notifies the user when a payment fails, while access continues', async () => {
      getByUserId.mockResolvedValue({ stripe_subscription_id: 'sub_1', last_event_created: 0 });
      fetchSubscription.mockResolvedValue(subscription({ status: 'past_due' }));

      await handleStripeEvent(evt('invoice.payment_failed', invoice()));

      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', type: 'subscription_payment_failed' })
      );
    });

    it('does not fail the webhook when the notification cannot be sent', async () => {
      // A notification failure must not trigger a Stripe redelivery.
      getByUserId.mockResolvedValue({ stripe_subscription_id: 'sub_1', last_event_created: 0 });
      fetchSubscription.mockResolvedValue(subscription());
      createNotification.mockRejectedValue(new Error('notify down'));

      await expect(handleStripeEvent(evt('invoice.payment_failed', invoice()))).resolves.toBeUndefined();
    });

    it('still invalidates when there is no known subscription to refresh', async () => {
      getByUserId.mockResolvedValue({ stripe_subscription_id: null });

      await handleStripeEvent(evt('invoice.paid', invoice()));

      expect(fetchSubscription).not.toHaveBeenCalled();
      expect(invalidateEntitlement).toHaveBeenCalledWith('user-1');
    });

    it('gives up quietly when the invoice maps to no user', async () => {
      await handleStripeEvent(evt('invoice.paid', { customer: null, metadata: {} }));

      expect(invalidateEntitlement).not.toHaveBeenCalled();
    });
  });

  it('ignores an event type it does not handle', async () => {
    await expect(handleStripeEvent(evt('customer.created', {}))).resolves.toBeUndefined();
    expect(upsertForUser).not.toHaveBeenCalled();
  });
});
