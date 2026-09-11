/**
 * Reconcile local subscription state from Stripe.
 *
 * Webhooks are the normal path, but they can be lost: the endpoint was down,
 * the collection did not exist yet, or the signing secret was wrong while the
 * events were delivered. Stripe retries for up to 3 days, and this script is
 * the manual equivalent — it treats Stripe as the source of truth and rewrites
 * whatever the local store says.
 *
 * Safe to re-run. Reads every subscription Stripe knows about, resolves the
 * user, and upserts. Nothing is deleted.
 *
 * Run: pnpm reconcile:subscriptions [--dry-run]
 */

import 'dotenv/config';
import Stripe from 'stripe';
import { Client, Databases, Query } from 'node-appwrite';

const DRY_RUN = process.argv.includes('--dry-run');

const STRIPE_KEY = process.env['STRIPE_API_KEY'] ?? process.env['STRIPE_SECRET_KEY'];
if (!STRIPE_KEY) {
  console.error('STRIPE_API_KEY is not set — nothing to reconcile against.');
  process.exit(1);
}

const DATABASE_ID = process.env['APPWRITE_DATABASE_ID'] || 'freelancexchain';
const COLLECTION_ID = 'subscriptions';

const client = new Client()
  .setEndpoint(process.env['APPWRITE_ENDPOINT']!)
  .setProject(process.env['APPWRITE_PROJECT_ID']!)
  .setKey(process.env['APPWRITE_API_KEY']!);
const db = new Databases(client);

const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2026-08-26.dahlia' as Stripe.LatestApiVersion });

/** Mirrors ENTITLED_STATUSES in src/models/subscription.ts. */
const ENTITLED = new Set(['active', 'trialing', 'past_due']);

function customerIdOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

/**
 * Same fallback chain as the webhook: metadata first (we set it at checkout),
 * then the customer's own metadata, then an existing local row.
 */
async function resolveUserId(subscription: Stripe.Subscription): Promise<string | null> {
  const fromSub = subscription.metadata?.['user_id'];
  if (fromSub) return fromSub;

  const customerId = customerIdOf(subscription.customer);
  if (!customerId) return null;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted && customer.metadata?.['user_id']) {
      return customer.metadata['user_id'];
    }
  } catch {
    // fall through to the local lookup
  }

  try {
    const existing = await db.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Query.equal('stripe_customer_id', customerId),
      Query.limit(1),
    ]);
    return existing.documents[0]?.['user_id'] ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`Reconciling subscriptions from Stripe${DRY_RUN ? ' (dry run)' : ''}…\n`);

  let synced = 0;
  let skipped = 0;

  for await (const subscription of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    const userId = await resolveUserId(subscription);

    if (!userId) {
      console.warn(`  ⊘ ${subscription.id}: could not resolve a user — skipped`);
      skipped += 1;
      continue;
    }

    const status = subscription.status;
    const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
    const plan = ENTITLED.has(status) ? 'pro' : 'free';

    // Mirrors isCancelling/accessEndsIso in src/services/stripe-webhook-service.ts:
    // the portal records a scheduled cancellation as `cancel_at`, which can be
    // set while `cancel_at_period_end` stays false.
    const cancelling =
      Boolean(subscription.cancel_at_period_end) || typeof subscription.cancel_at === 'number';
    const endsUnix =
      typeof subscription.cancel_at === 'number'
        ? subscription.cancel_at
        : subscription.items?.data?.[0]?.current_period_end;

    const attrs = {
      user_id: userId,
      stripe_customer_id: customerIdOf(subscription.customer),
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan,
      status,
      current_period_end:
        typeof endsUnix === 'number' ? new Date(endsUnix * 1000).toISOString() : null,
      cancel_at_period_end: cancelling,
      // Left at 0 so a genuine webhook always wins over this reconciliation.
      last_event_created: 0,
      last_event_id: null,
      last_event_type: 'reconcile',
    };

    console.log(
      `  ✓ ${userId} → plan=${plan} status=${status}${cancelling ? ' (cancelling)' : ''} (${subscription.id})`
    );

    if (!DRY_RUN) {
      try {
        await db.updateDocument(DATABASE_ID, COLLECTION_ID, userId, attrs);
      } catch {
        // The document id IS the user id, so a missing document means create.
        await db.createDocument(DATABASE_ID, COLLECTION_ID, userId, attrs);
      }
    }

    synced += 1;
  }

  console.log(`\nDone. ${synced} synced, ${skipped} skipped.`);
  if (!DRY_RUN && synced > 0) {
    console.log('Entitlement caches expire within 60s, or restart the API to clear them immediately.');
  }
}

main().catch((error: unknown) => {
  console.error('Reconciliation failed', error);
  process.exit(1);
});
