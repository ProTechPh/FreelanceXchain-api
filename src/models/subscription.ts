// Subscription / billing domain types

/** What a user is entitled to. Derived from Stripe state, never set by hand. */
export type PlanTier = 'free' | 'pro';

/**
 * Mirrors Stripe's subscription status, plus 'none' for a user who has never
 * subscribed (i.e. has no subscription document at all).
 */
export type SubscriptionStatus =
  | 'none'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

/**
 * Statuses that grant Pro access.
 *
 * `past_due` is included on purpose: Stripe retries a failed invoice for days
 * before moving the subscription to canceled/unpaid, and revoking access in the
 * middle of that dunning window hurts recovery far more than a few days of
 * grace costs. `cancel_at_period_end` needs no special case — Stripe keeps the
 * status 'active' until the paid period actually ends, then emits
 * customer.subscription.deleted.
 */
export const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
]);

export type Subscription = {
  id: string;
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  plan: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
};

/** The cached, gate-facing view of a user's billing state. */
export type EntitlementSnapshot = {
  plan: PlanTier;
  status: SubscriptionStatus;
  isPro: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** True once a Stripe customer exists, so the UI knows to offer the portal. */
  manageable: boolean;
};

/** The entitlement of a user with no subscription document. */
export const FREE_ENTITLEMENT: EntitlementSnapshot = {
  plan: 'free',
  status: 'none',
  isPro: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  manageable: false,
};
