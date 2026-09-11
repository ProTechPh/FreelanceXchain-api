/**
 * Outbound Stripe calls for the Pro subscription.
 *
 * Everything that talks TO Stripe lives here; everything Stripe tells US lives
 * in stripe-webhook-service.ts. Entitlement is never granted from this file —
 * only a webhook can do that.
 */

import type Stripe from 'stripe';
import { config } from '../config/env.js';
import { getStripeClient, isStripeConfigured, INTEGRATION_IDENTIFIER } from '../config/stripe.js';
import { logger } from '../config/logger.js';
import { subscriptionRepository } from '../repositories/subscription-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { ENTITLED_STATUSES, type SubscriptionStatus } from '../models/subscription.js';
import type { ServiceResult, ServiceError } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

const NOT_CONFIGURED = errorResult(
  'BILLING_NOT_CONFIGURED',
  'Billing is not configured on this server'
);

/**
 * Turn a thrown Stripe error into a result that says what actually went wrong.
 *
 * Collapsing everything into "Stripe is unavailable" was actively misleading:
 * a mistyped price id or a wrong-mode key is a configuration fault that no
 * amount of retrying fixes, and reporting it as an outage sends people looking
 * at Stripe's status page instead of their own .env.
 */
function mapStripeError(error: unknown, action: string): { success: false; error: ServiceError } {
  const err = error as { type?: string; code?: string; statusCode?: number; message?: string };
  const detail = err?.message ?? 'Unknown Stripe error';

  switch (err?.type) {
    case 'StripeInvalidRequestError':
      // Bad parameters — almost always a wrong id or a test/live mismatch.
      return errorResult('STRIPE_REQUEST_INVALID', detail, [
        'Check STRIPE_MONTHLY_PRICE_ID / STRIPE_ANNUAL_PRICE_ID are Price ids (price_...), not Product ids (prod_...), and that they belong to the same mode as your API key.',
      ]);

    case 'StripeAuthenticationError':
      return errorResult('STRIPE_AUTH_FAILED', 'Stripe rejected the API key', [
        'Check STRIPE_API_KEY is valid and is for the same mode (test or live) as your price ids.',
      ]);

    case 'StripePermissionError':
      return errorResult('STRIPE_AUTH_FAILED', 'The Stripe key lacks permission for this operation', [
        'A restricted key needs write access to Checkout Sessions, Customers and Customer portal.',
      ]);

    case 'StripeRateLimitError':
      return errorResult('STRIPE_UNAVAILABLE', 'Stripe is rate limiting us. Please try again in a moment.');

    default:
      // Connection/API errors are the only genuine "unavailable" cases.
      logger.error(`Stripe call failed during ${action}`, error as Error);
      return errorResult('STRIPE_UNAVAILABLE', 'Could not reach Stripe. Please try again.');
  }
}

/**
 * Only allow redirect targets on the configured frontend origin.
 *
 * Stripe sends the user's browser to these URLs, so an unvalidated value from
 * the request body would be an open redirect with Stripe as the hop.
 */
export function resolveRedirectUrl(candidate: string | undefined, fallback: string): string {
  if (!candidate) return fallback;

  try {
    const target = new URL(candidate, config.server.frontendUrl);
    const allowed = new URL(config.server.frontendUrl);
    if (target.origin !== allowed.origin) return fallback;
    return target.toString();
  } catch {
    return fallback;
  }
}

function frontendUrl(path: string): string {
  return new URL(path, config.server.frontendUrl).toString();
}

/** Monthly and annual are Prices on the SAME Pro Product, not separate tiers. */
export type BillingInterval = 'month' | 'year';

export function priceIdForInterval(interval: BillingInterval): string | undefined {
  return interval === 'year' ? config.stripe.annualPriceId : config.stripe.monthlyPriceId;
}

/**
 * The Stripe customer for a user, created on first use.
 *
 * The user id is written to customer metadata as a last-resort way back from a
 * Stripe object to a local account.
 */
export async function ensureStripeCustomer(userId: string): Promise<ServiceResult<string>> {
  const stripe = getStripeClient();
  if (!stripe || !isStripeConfigured()) return NOT_CONFIGURED;

  const existing = await subscriptionRepository.getByUserId(userId);
  if (existing?.stripe_customer_id) {
    return successResult(existing.stripe_customer_id);
  }

  const user = await userRepository.getUserById(userId);
  if (!user) {
    return errorResult('USER_NOT_FOUND', 'User not found');
  }

  try {
    const customer = await stripe.customers.create({
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
      metadata: { user_id: userId },
    });

    await subscriptionRepository.upsertForUser(userId, { stripe_customer_id: customer.id });
    return successResult(customer.id);
  } catch (error) {
    logger.error('Failed to create Stripe customer', error as Error, { userId });
    return mapStripeError(error, 'customer creation');
  }
}

export type CheckoutSessionResult = { url: string; sessionId: string };

/**
 * A hosted Checkout Session for the Pro plan.
 *
 * `idempotencyKey` is the request id, so a retried POST (ours or the client's)
 * can never create two sessions — and therefore never two subscriptions.
 */
export async function createCheckoutSession(params: {
  userId: string;
  requestId: string;
  interval?: BillingInterval | undefined;
  successUrl?: string | undefined;
  cancelUrl?: string | undefined;
}): Promise<ServiceResult<CheckoutSessionResult>> {
  const stripe = getStripeClient();
  if (!stripe || !isStripeConfigured()) return NOT_CONFIGURED;

  const interval = params.interval ?? 'month';
  const priceId = priceIdForInterval(interval);

  // A Product id where a Price id belongs is by far the most common setup
  // mistake here (the Dashboard shows prod_... first). Catch it locally with a
  // message that names the fix, rather than shipping it to Stripe and getting
  // back a generic "No such price".
  if (priceId?.startsWith('prod_')) {
    return errorResult(
      'STRIPE_PRICE_MISCONFIGURED',
      `STRIPE_${interval === 'year' ? 'ANNUAL' : 'MONTHLY'}_PRICE_ID is a Product id, not a Price id`,
      ['Open the Product in Stripe, find its Pricing section, and copy the id that starts with "price_".']
    );
  }

  if (!priceId) {
    // Asking for annual when no annual Price is configured is a request error,
    // not a server misconfiguration — monthly still works.
    return interval === 'year'
      ? errorResult('INTERVAL_UNAVAILABLE', 'Annual billing is not available yet')
      : NOT_CONFIGURED;
  }

  const existing = await subscriptionRepository.getByUserId(params.userId);
  if (existing && ENTITLED_STATUSES.has(existing.status as SubscriptionStatus) && existing.plan === 'pro') {
    return errorResult(
      'ALREADY_SUBSCRIBED',
      'You already have an active Pro subscription. Use billing settings to manage it.'
    );
  }

  const customerResult = await ensureStripeCustomer(params.userId);
  if (!customerResult.success) return customerResult;

  // Derived from STRIPE_BASE_URL (falling back to FRONTEND_URL) rather than
  // configured per-URL: three more env vars to keep in sync bought nothing.
  const successUrl = resolveRedirectUrl(
    params.successUrl,
    frontendUrl('/billing/checkout/success?session_id={CHECKOUT_SESSION_ID}')
  );
  const cancelUrl = resolveRedirectUrl(
    params.cancelUrl,
    frontendUrl('/billing/checkout/cancelled')
  );

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerResult.data,
        // Both, so every downstream object can be traced back to a user:
        // client_reference_id rides on the session, metadata on the subscription.
        client_reference_id: params.userId,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: { metadata: { user_id: params.userId } },
        metadata: { user_id: params.userId, billing_interval: interval },
        success_url: successUrl,
        cancel_url: cancelUrl,
        integration_identifier: INTEGRATION_IDENTIFIER,
        // NOTE: payment_method_types is intentionally omitted so Stripe serves
        // dynamic payment methods configured in the Dashboard. Hardcoding it
        // would lock out methods that improve conversion.
        // NOTE: automatic_tax is intentionally NOT enabled. Stripe Tax
        // calculates nothing — and returns no error — until the account has an
        // active tax registration, which would look like compliance while
        // collecting zero tax. Enabling it is a separate, deliberate change.
      } as Stripe.Checkout.SessionCreateParams,
      { idempotencyKey: `checkout:${params.requestId}` }
    );

    if (!session.url) {
      return errorResult('STRIPE_UNAVAILABLE', 'Stripe did not return a checkout URL');
    }

    return successResult({ url: session.url, sessionId: session.id });
  } catch (error) {
    logger.error('Failed to create Stripe checkout session', error as Error, { userId: params.userId });
    return mapStripeError(error, 'checkout session creation');
  }
}

/**
 * A Customer Portal session, where Stripe handles cancel/resume, card updates
 * and invoice history. No custom subscription-management UI is needed.
 */
export async function createPortalSession(params: {
  userId: string;
  returnUrl?: string | undefined;
}): Promise<ServiceResult<{ url: string }>> {
  const stripe = getStripeClient();
  if (!stripe || !isStripeConfigured()) return NOT_CONFIGURED;

  const existing = await subscriptionRepository.getByUserId(params.userId);
  if (!existing?.stripe_customer_id) {
    return errorResult('NO_STRIPE_CUSTOMER', 'You do not have a billing account yet');
  }

  const returnUrl = resolveRedirectUrl(params.returnUrl, frontendUrl('/dashboard'));

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: existing.stripe_customer_id,
      return_url: returnUrl,
    });
    return successResult({ url: session.url });
  } catch (error) {
    logger.error('Failed to create Stripe portal session', error as Error, { userId: params.userId });
    return mapStripeError(error, 'portal session creation');
  }
}

export type PlanPrice = {
  interval: BillingInterval;
  priceId: string;
  /** Minor units (cents), as Stripe stores it. Null if Stripe was unreachable. */
  unitAmount: number | null;
  currency: string | null;
};

/**
 * The live Pro prices, read from Stripe rather than hardcoded.
 *
 * The pricing page renders these, so an amount changed in the Dashboard is
 * reflected without a deploy — and the page can never quote a figure the
 * checkout will not honour.
 *
 * Cached because /billing/plans is public and unauthenticated: without it, the
 * pricing page would hit the Stripe API once per visitor.
 */
let cachedPrices: { at: number; value: PlanPrice[] } | null = null;
const PRICE_CACHE_MS = 5 * 60_000;

export async function getPlanPrices(): Promise<PlanPrice[]> {
  const configured: Array<{ interval: BillingInterval; priceId: string | undefined }> = [
    { interval: 'month', priceId: config.stripe.monthlyPriceId },
    { interval: 'year', priceId: config.stripe.annualPriceId },
  ];
  const present = configured.filter(
    (entry): entry is { interval: BillingInterval; priceId: string } => Boolean(entry.priceId)
  );

  if (present.length === 0) return [];

  if (cachedPrices && Date.now() - cachedPrices.at < PRICE_CACHE_MS) {
    return cachedPrices.value;
  }

  const stripe = getStripeClient();
  if (!stripe) {
    // Still report which intervals exist so the UI can offer them; the amount
    // is simply unknown.
    return present.map((entry) => ({ ...entry, unitAmount: null, currency: null }));
  }

  const value = await Promise.all(
    present.map(async (entry) => {
      try {
        const price = await stripe.prices.retrieve(entry.priceId);
        return {
          interval: entry.interval,
          priceId: entry.priceId,
          unitAmount: price.unit_amount ?? null,
          currency: price.currency ?? null,
        };
      } catch (error) {
        logger.warn('Could not read Stripe price', { priceId: entry.priceId, error });
        return { interval: entry.interval, priceId: entry.priceId, unitAmount: null, currency: null };
      }
    })
  );

  cachedPrices = { at: Date.now(), value };
  return value;
}

/** The authoritative subscription object, re-fetched from Stripe. */
export async function fetchSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    logger.error('Failed to retrieve Stripe subscription', error as Error, { subscriptionId });
    return null;
  }
}
