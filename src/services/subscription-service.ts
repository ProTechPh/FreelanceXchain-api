/**
 * Subscription entitlement
 *
 * This is the read path behind every Pro gate, so it runs on a large share of
 * authenticated requests. It is cached in two tiers, mirroring the pattern in
 * matching-service.ts:
 *
 *   1. A process-local LRU with a deliberately SHORT ttl. A webhook handled by
 *      replica A cannot evict replica B's in-process map, so this tier is
 *      capped at 60s to bound how long a stale plan can survive.
 *   2. Redis, which IS shared, and which the webhook explicitly invalidates.
 *
 * Negative results are cached too. Free users are the majority, and skipping
 * the negative cache would mean every free user's every gated request hits
 * Appwrite — exactly the load this cache exists to prevent.
 */

import { config } from '../config/env.js';
import { getNodeEnv } from '../config/env.js';
import { isStripeConfigured } from '../config/stripe.js';
import { logger } from '../config/logger.js';
import { redis } from '../config/redis.js';
import { LRUCache } from '../utils/cache.js';
import { subscriptionRepository, type SubscriptionEntity } from '../repositories/subscription-repository.js';
import {
  ENTITLED_STATUSES,
  FREE_ENTITLEMENT,
  type EntitlementSnapshot,
  type PlanTier,
  type SubscriptionStatus,
} from '../models/subscription.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

/** Shared (Redis) ttl. Long enough to matter, short enough to self-heal. */
const ENTITLEMENT_TTL_SECONDS = 300;
/** Local ttl. Short because it cannot be invalidated across replicas. */
const LOCAL_ENTITLEMENT_TTL_MS = 60_000;

export const localEntitlementCache = new LRUCache<EntitlementSnapshot>(5000, LOCAL_ENTITLEMENT_TTL_MS);

function cacheKey(userId: string): string {
  return `billing:entitlement:${userId}`;
}

/**
 * True when the dev escape hatch is active: Stripe unconfigured, the flag set,
 * and NOT production. The production case is rejected at boot (see
 * assertBillingConfigSafe) so this can never silently unlock a live deploy.
 */
export function isDevProGrantActive(): boolean {
  return config.stripe.devGrantPro && !isStripeConfigured() && getNodeEnv() !== 'production';
}

/**
 * Refuse to boot a production server with the dev grant enabled. Called from
 * app bootstrap, alongside the other production-only config guards.
 */
export function assertBillingConfigSafe(): void {
  if (getNodeEnv() === 'production' && config.stripe.devGrantPro) {
    throw new Error(
      'BILLING_DEV_GRANT_PRO must not be enabled in production: it grants Pro to every user.'
    );
  }
  if (isDevProGrantActive()) {
    logger.warn(
      'BILLING_DEV_GRANT_PRO is active: Stripe is unconfigured and every authenticated user is treated as Pro. Never use this outside local development.'
    );
  }
}

function toSnapshot(entity: SubscriptionEntity): EntitlementSnapshot {
  const status = (entity.status ?? 'none') as SubscriptionStatus;
  const entitled = ENTITLED_STATUSES.has(status) && entity.plan === 'pro';

  return {
    // Never trust a stored `plan: 'pro'` on a lapsed subscription — the status
    // is what Stripe actually asserts, so it decides.
    plan: (entitled ? 'pro' : 'free') as PlanTier,
    status,
    isPro: entitled,
    currentPeriodEnd: entity.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(entity.cancel_at_period_end),
    manageable: Boolean(entity.stripe_customer_id),
  };
}

async function readCache(userId: string): Promise<EntitlementSnapshot | null> {
  const key = cacheKey(userId);
  try {
    if (redis && redis.status === 'ready') {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached) as EntitlementSnapshot;
    }
  } catch (err) {
    logger.warn('Redis get failed for entitlement', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return localEntitlementCache.get(key) ?? null;
}

async function writeCache(userId: string, snapshot: EntitlementSnapshot): Promise<void> {
  const key = cacheKey(userId);
  localEntitlementCache.set(key, snapshot, LOCAL_ENTITLEMENT_TTL_MS);
  try {
    if (redis && redis.status === 'ready') {
      await redis.set(key, JSON.stringify(snapshot), 'EX', ENTITLEMENT_TTL_SECONDS);
    }
  } catch (err) {
    logger.warn('Redis set failed for entitlement', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Drop a user's cached entitlement on both tiers. Called by the webhook. */
export async function invalidateEntitlement(userId: string): Promise<void> {
  const key = cacheKey(userId);
  localEntitlementCache.delete(key);
  try {
    if (redis && redis.status === 'ready') {
      await redis.del(key);
    }
  } catch (err) {
    logger.warn('Redis del failed for entitlement', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * A user's current billing state.
 *
 * Absence of a subscription document IS the free tier — there is no backfill
 * and no document is created on read.
 */
export async function getEntitlement(userId: string): Promise<ServiceResult<EntitlementSnapshot>> {
  if (isDevProGrantActive()) {
    return successResult({ ...FREE_ENTITLEMENT, plan: 'pro', status: 'active', isPro: true });
  }

  const cached = await readCache(userId);
  if (cached) return successResult(cached);

  try {
    const entity = await subscriptionRepository.getByUserId(userId);
    const snapshot = entity ? toSnapshot(entity) : FREE_ENTITLEMENT;
    await writeCache(userId, snapshot);
    return successResult(snapshot);
  } catch (error) {
    // Serve a stale local entry rather than downgrading a paying customer
    // during a datastore blip.
    const stale = localEntitlementCache.get(cacheKey(userId));
    if (stale) {
      logger.warn('Serving stale entitlement after read failure', { userId });
      return successResult(stale);
    }

    logger.error('Failed to read entitlement', error as Error, { userId });
    return errorResult('SUBSCRIPTION_CHECK_FAILED', 'Unable to verify your subscription right now');
  }
}

/**
 * Whether a user is entitled to Pro.
 *
 * THROWS when the entitlement cannot be read, so callers can tell "not
 * entitled" apart from "couldn't tell". A gate that swallowed the error would
 * show a paying customer a paywall during an outage.
 */
export async function isPro(userId: string): Promise<boolean> {
  const result = await getEntitlement(userId);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data.isPro;
}

/**
 * Which of these users are currently Pro, for the matching ranking boost.
 *
 * Short-circuits to an empty Set when Stripe is unconfigured, which keeps the
 * existing matching tests free of any datastore access.
 */
export async function getProUserIdSet(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  if (isDevProGrantActive()) {
    // Everyone is Pro, so a boost applied to everyone is a no-op ranking-wise.
    return new Set();
  }

  if (!isStripeConfigured()) return new Set();

  try {
    return await subscriptionRepository.getProUserIds(userIds);
  } catch (error) {
    logger.warn('Pro lookup failed; ranking without the Pro boost', { error });
    return new Set();
  }
}

/** The raw subscription row, for the billing endpoints and admin tooling. */
export async function getSubscriptionForUser(
  userId: string
): Promise<SubscriptionEntity | null> {
  return subscriptionRepository.getByUserId(userId);
}
