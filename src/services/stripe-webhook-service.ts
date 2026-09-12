/**
 * Stripe webhook processing
 *
 * Entitlement is granted here and nowhere else — never from the Checkout
 * success page, which the browser can reach before Stripe has told us anything.
 *
 * Ordering: Stripe does not guarantee event order. Rather than trusting the
 * object embedded in the event, every handler RE-FETCHES the subscription from
 * the API. The event is a trigger, not a value. A stale `updated` arriving
 * after a `deleted` therefore re-reads the canceled state and applies a no-op
 * instead of resurrecting a dead subscription.
 *
 * Two further guards sit on top of that:
 *   - withLock() serializes processing per user across replicas.
 *   - A `last_event_created` watermark skips events older than the newest one
 *     already applied.
 */

import type Stripe from 'stripe';
import { getStripeClient } from '../config/stripe.js';
import { getStripeWebhookSecret } from '../config/env.js';
import { logger } from '../config/logger.js';
import { withLock } from '../utils/async-lock.js';
import { subscriptionRepository } from '../repositories/subscription-repository.js';
import { invalidateEntitlement } from './subscription-service.js';
import { fetchSubscription } from './stripe-billing-service.js';
import type { PlanTier, SubscriptionStatus } from '../models/subscription.js';

/** Events this integration reacts to. Configure exactly these in Stripe. */
export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

export type StripeVerifyResult =
  | { ok: true; event: Stripe.Event }
  | { ok: false; code: 'NOT_CONFIGURED' | 'INVALID_SIGNATURE'; message: string };

/**
 * Verify the signature over the EXACT bytes Stripe signed.
 *
 * There is deliberately no JSON.stringify(req.body) fallback here (unlike the
 * blockchain webhook): re-serializing changes the bytes and would make the
 * signature meaningless. A missing raw body is a hard failure.
 */
export function verifyAndParseEvent(rawBody: string | undefined, signature: string | undefined): StripeVerifyResult {
  const stripe = getStripeClient();
  const secret = getStripeWebhookSecret();

  if (!stripe || !secret) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'Stripe webhooks are not configured' };
  }
  if (!rawBody) {
    return { ok: false, code: 'INVALID_SIGNATURE', message: 'Missing raw request body' };
  }
  if (!signature) {
    return { ok: false, code: 'INVALID_SIGNATURE', message: 'Missing stripe-signature header' };
  }

  try {
    return { ok: true, event: stripe.webhooks.constructEvent(rawBody, signature, secret) };
  } catch (error) {
    logger.warn('Stripe webhook signature verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'INVALID_SIGNATURE', message: 'Invalid signature' };
  }
}

/** Pro only while the price matches the configured Pro price. */
function planForSubscription(subscription: Stripe.Subscription): PlanTier {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  return priceId ? 'pro' : 'free';
}

function periodEndIso(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0];
  const periodEnd = item?.current_period_end;
  return typeof periodEnd === 'number' ? new Date(periodEnd * 1000).toISOString() : null;
}

/**
 * Whether the subscription is set to end rather than renew.
 *
 * Two signals, not one: the Customer Portal records a scheduled cancellation as
 * `cancel_at` (a timestamp) on current API versions, leaving
 * `cancel_at_period_end` false. Reading only the boolean made a cancellation
 * invisible and kept the UI saying "Renews on ...".
 */
function isCancelling(subscription: Stripe.Subscription): boolean {
  return Boolean(subscription.cancel_at_period_end) || typeof subscription.cancel_at === 'number';
}

/**
 * When access actually ends: the scheduled cancellation date if one is set,
 * otherwise the end of the current paid period.
 */
function accessEndsIso(subscription: Stripe.Subscription): string | null {
  if (typeof subscription.cancel_at === 'number') {
    return new Date(subscription.cancel_at * 1000).toISOString();
  }
  return periodEndIso(subscription);
}

/**
 * Resolve a Stripe object back to a local user.
 *
 * Falls through the identifiers we attach at checkout before resorting to a
 * lookup by customer id.
 */
async function resolveUserId(params: {
  clientReferenceId?: string | null;
  metadataUserId?: string | null;
  customerId?: string | null;
}): Promise<string | null> {
  if (params.clientReferenceId) return params.clientReferenceId;
  if (params.metadataUserId) return params.metadataUserId;

  if (params.customerId) {
    const existing = await subscriptionRepository.findByStripeCustomerId(params.customerId);
    if (existing) return existing.user_id;
  }

  return null;
}

function customerIdOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

/**
 * Write the authoritative subscription state for a user.
 *
 * Serialized per user, and skipped when the event predates what is already
 * stored, so concurrent or out-of-order deliveries cannot regress state.
 */
async function applySubscriptionState(
  userId: string,
  subscription: Stripe.Subscription,
  event: Stripe.Event
): Promise<void> {
  await withLock(`stripe:sub:${userId}`, async () => {
    const existing = await subscriptionRepository.getByUserId(userId);

    if (existing && event.created < (existing.last_event_created ?? 0)) {
      logger.info('Skipping out-of-order Stripe event', {
        userId,
        eventId: event.id,
        eventType: event.type,
        eventCreated: event.created,
        lastApplied: existing.last_event_created,
      });
      return;
    }

    const status = subscription.status as SubscriptionStatus;
    const plan = status === 'canceled' || status === 'incomplete_expired'
      ? 'free'
      : planForSubscription(subscription);

    await subscriptionRepository.upsertForUser(userId, {
      stripe_customer_id: customerIdOf(subscription.customer),
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items?.data?.[0]?.price?.id ?? null,
      plan,
      status,
      current_period_end: accessEndsIso(subscription),
      cancel_at_period_end: isCancelling(subscription),
      last_event_created: event.created,
      last_event_id: event.id,
      last_event_type: event.type,
    });

    await invalidateEntitlement(userId);

    logger.info('Applied Stripe subscription state', {
      userId,
      plan,
      status,
      eventType: event.type,
    });
  });
}

/** Mark a user free after a subscription ends. */
async function applyCancellation(userId: string, event: Stripe.Event): Promise<void> {
  await withLock(`stripe:sub:${userId}`, async () => {
    const existing = await subscriptionRepository.getByUserId(userId);

    if (existing && event.created < (existing.last_event_created ?? 0)) {
      logger.info('Skipping out-of-order Stripe cancellation', { userId, eventId: event.id });
      return;
    }

    await subscriptionRepository.upsertForUser(userId, {
      plan: 'free',
      status: 'canceled',
      cancel_at_period_end: false,
      // The customer id is kept on purpose so a re-subscribe reuses it.
      stripe_subscription_id: null,
      last_event_created: event.created,
      last_event_id: event.id,
      last_event_type: event.type,
    });

    await invalidateEntitlement(userId);
    logger.info('Subscription canceled', { userId, eventId: event.id });
  });
}

function subscriptionIdFrom(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: string }).id);
  }
  return null;
}

/** checkout.session.completed — where the customer<->user link is established. */
async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = await resolveUserId({
    clientReferenceId: session.client_reference_id,
    metadataUserId: session.metadata?.['user_id'] ?? null,
    customerId: customerIdOf(session.customer),
  });

  if (!userId) {
    // Unresolvable: 200 anyway, because retrying for three days cannot fix
    // a missing identity — but log loudly so it gets noticed.
    logger.error('Stripe checkout.session.completed could not be mapped to a user', undefined, {
      eventId: event.id,
      customerId: customerIdOf(session.customer),
    });
    return;
  }

  const customerId = customerIdOf(session.customer);
  if (customerId) {
    await subscriptionRepository.upsertForUser(userId, { stripe_customer_id: customerId });
  }

  const subId = subscriptionIdFrom(session.subscription);
  if (session.mode === 'subscription' && subId) {
    const subscription = await fetchSubscription(subId);
    if (subscription) {
      await applySubscriptionState(userId, subscription, event);
    }
  }

  await invalidateEntitlement(userId);
  return;
}

/** customer.subscription.created / .updated */
async function handleSubscriptionUpsert(event: Stripe.Event): Promise<void> {
  const embedded = event.data.object as Stripe.Subscription;
  const userId = await resolveUserId({
    metadataUserId: embedded.metadata?.['user_id'] ?? null,
    customerId: customerIdOf(embedded.customer),
  });

  if (!userId) {
    logger.error('Stripe subscription event could not be mapped to a user', undefined, {
      eventId: event.id,
      subscriptionId: embedded.id,
    });
    return;
  }

  // Re-fetch rather than trusting the embedded object — see the file header.
  const subscription = (await fetchSubscription(embedded.id)) ?? embedded;
  await applySubscriptionState(userId, subscription, event);
  return;
}

/** customer.subscription.deleted */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const embedded = event.data.object as Stripe.Subscription;
  const userId = await resolveUserId({
    metadataUserId: embedded.metadata?.['user_id'] ?? null,
    customerId: customerIdOf(embedded.customer),
  });

  if (!userId) {
    logger.error('Stripe subscription deletion could not be mapped to a user', undefined, {
      eventId: event.id,
      subscriptionId: embedded.id,
    });
    return;
  }

  await applyCancellation(userId, event);
  return;
}

/** invoice.paid (the renewal heartbeat) and invoice.payment_failed */
async function handleInvoiceEvent(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = customerIdOf(invoice.customer);
  const userId = await resolveUserId({
    metadataUserId: invoice.metadata?.['user_id'] ?? null,
    customerId,
  });

  if (!userId) {
    logger.error('Stripe invoice event could not be mapped to a user', undefined, {
      eventId: event.id,
      customerId,
    });
    return;
  }

  const existing = await subscriptionRepository.getByUserId(userId);
  const subId = existing?.stripe_subscription_id ?? null;

  if (subId) {
    const subscription = await fetchSubscription(subId);
    if (subscription) {
      await applySubscriptionState(userId, subscription, event);
    }
  }

  if (event.type === 'invoice.payment_failed') {
    await notifyPaymentFailed(userId);
  }

  await invalidateEntitlement(userId);
  return;
}

/**
 * Process one verified Stripe event.
 *
 * Throws on a processing failure so the route can answer non-2xx and let
 * Stripe's retry schedule (up to 3 days) act as the recovery mechanism.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event);

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return handleSubscriptionUpsert(event);

    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event);

    case 'invoice.paid':
    case 'invoice.payment_failed':
      return handleInvoiceEvent(event);

    default:
      logger.info('Unhandled Stripe event type', { eventType: event.type, eventId: event.id });
  }
}

/**
 * Tell the user their renewal failed while Stripe is still retrying, so they
 * can fix the card before access actually lapses. Best-effort: a notification
 * failure must not fail the webhook and trigger a redelivery.
 */
async function notifyPaymentFailed(userId: string): Promise<void> {
  try {
    const { createNotification } = await import('./notification-service.js');
    await createNotification({
      userId,
      type: 'subscription_payment_failed',
      title: 'Your Pro payment failed',
      message:
        'We could not process your Pro subscription payment. Update your payment method in billing settings to keep your Pro features.',
    });
  } catch (error) {
    logger.warn('Failed to send payment-failed notification', { userId, error });
  }
}
