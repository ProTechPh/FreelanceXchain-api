/**
 * Stripe client
 *
 * The client is built lazily and memoized, never at module scope: billing is an
 * optional subsystem, and the app must boot (with every free feature working)
 * when no Stripe keys are set. Importing this file has no side effects.
 *
 * `isStripeConfigured()` deliberately requires ALL of the secret key, the
 * webhook signing secret and the Pro price id. A partial configuration is the
 * dangerous middle: it would create Checkout Sessions that no webhook can ever
 * turn into an entitlement, so we treat it as "not configured" instead.
 */

import Stripe from 'stripe';
import { config, getStripeSecretKey, getStripeWebhookSecret } from './env.js';
import { logger } from './logger.js';

/**
 * Pinned so a server-side SDK upgrade can never silently change response
 * shapes underneath the webhook handler. Move it deliberately, with the SDK.
 */
export const STRIPE_API_VERSION = '2026-08-26.dahlia';

/**
 * Tags Checkout Sessions so this integration can be compared against others in
 * the Stripe Dashboard. The suffix is a fixed 8-letter label, not a per-request
 * random value — it identifies the integration, not the session.
 */
export const INTEGRATION_IDENTIFIER = 'fxchainpro-qwmtzkbd';

let cachedClient: Stripe | null | undefined;
let cachedForKey: string | undefined;

/** True when every Stripe secret needed for a working billing loop is present. */
export function isStripeConfigured(): boolean {
  return Boolean(getStripeSecretKey() && getStripeWebhookSecret() && config.stripe.monthlyPriceId);
}

/**
 * The memoized Stripe client, or null when billing is unconfigured.
 * Callers must handle null rather than assuming billing is available.
 */
export function getStripeClient(): Stripe | null {
  const key = getStripeSecretKey();

  if (!key) {
    cachedClient = null;
    cachedForKey = undefined;
    return null;
  }

  // Rebuild when the key changes so tests can swap credentials between cases.
  if (cachedClient !== undefined && cachedForKey === key) {
    return cachedClient;
  }

  if (key.startsWith('sk_')) {
    logger.warn(
      'STRIPE_SECRET_KEY is a full secret key (sk_). Prefer a restricted key (rk_) scoped to Checkout Sessions, Customers, Customer portal (write) and Subscriptions, Products, Prices, Invoices (read).'
    );
  }

  // STRIPE_BASE_URL is normally api.stripe.com; overriding it points the SDK at
  // a proxy or a mock, which is why the host/port/protocol are split out here.
  let apiHost: URL;
  try {
    apiHost = new URL(config.stripe.baseUrl);
  } catch {
    logger.error(
      `STRIPE_BASE_URL is not a valid URL: "${config.stripe.baseUrl}". Falling back to https://api.stripe.com.`
    );
    apiHost = new URL('https://api.stripe.com');
  }

  // A typo here (api.stripe.om) surfaces as a connection error, which reads as
  // "Stripe is down" rather than "your config is wrong". Say so at boot instead
  // of letting every checkout fail mysteriously.
  if (apiHost.hostname !== 'api.stripe.com') {
    logger.warn(
      `STRIPE_BASE_URL points at "${apiHost.hostname}", not api.stripe.com. This is correct only if you are deliberately using a proxy or a mock — otherwise check the value for a typo.`
    );
  }

  cachedClient = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    host: apiHost.hostname,
    protocol: apiHost.protocol === 'http:' ? 'http' : 'https',
    ...(apiHost.port ? { port: Number(apiHost.port) } : {}),
    // Stripe's own guidance: retry idempotently on network failure rather than
    // surfacing a transient blip to the user mid-checkout.
    maxNetworkRetries: 2,
    timeout: 15_000,
    appInfo: { name: 'FreelanceXchain', url: 'https://freelancexchain.works' },
  });
  cachedForKey = key;

  return cachedClient;
}

/** Test-only: drop the memoized client so the next call rebuilds it. */
export function resetStripeClient(): void {
  cachedClient = undefined;
  cachedForKey = undefined;
}
