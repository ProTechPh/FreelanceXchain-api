import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { COLLECTIONS } from '../config/collections.js';
import { logger } from '../config/logger.js';
import { ENTITLED_STATUSES, type PlanTier, type SubscriptionStatus } from '../models/subscription.js';

export type SubscriptionEntity = {
  id: string;
  user_id: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  plan: PlanTier;
  status: SubscriptionStatus;
  current_period_end?: string | null;
  cancel_at_period_end: boolean;
  /**
   * Stripe `event.created` (unix seconds) of the newest event already applied.
   * Webhooks are not ordered, so an event older than this watermark is skipped
   * rather than allowed to overwrite newer state.
   */
  last_event_created: number;
  last_event_id?: string | null;
  last_event_type?: string | null;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = COLLECTIONS.SUBSCRIPTIONS;

export class SubscriptionRepository extends BaseRepository<SubscriptionEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  /**
   * The Appwrite document id IS the user id, so the entitlement read — which
   * runs on every gated request — is a point read rather than an index scan.
   * The unique `user_id` index still guards against a stray duplicate.
   */
  async getByUserId(userId: string): Promise<SubscriptionEntity | null> {
    return this.getById(userId);
  }

  async findByStripeCustomerId(customerId: string): Promise<SubscriptionEntity | null> {
    return this.findOne('stripe_customer_id', customerId);
  }

  async findByStripeSubscriptionId(subscriptionId: string): Promise<SubscriptionEntity | null> {
    return this.findOne('stripe_subscription_id', subscriptionId);
  }

  /**
   * Create-or-update keyed on the user id. `BaseRepository.update` returns null
   * when the document does not exist yet, which is the signal to create it.
   */
  async upsertForUser(
    userId: string,
    updates: Partial<Omit<SubscriptionEntity, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<SubscriptionEntity | null> {
    const existing = await this.getById(userId);

    if (existing) {
      return this.update(userId, updates as Partial<SubscriptionEntity>);
    }

    try {
      return await this.create({
        id: userId,
        user_id: userId,
        plan: 'free',
        status: 'none',
        cancel_at_period_end: false,
        last_event_created: 0,
        ...updates,
      } as Omit<SubscriptionEntity, 'created_at' | 'updated_at' | 'id'> & { id?: string });
    } catch (error) {
      // A concurrent webhook may have created it between the read and the
      // write; fall back to an update rather than losing the event.
      logger.warn('Subscription create raced, retrying as update', { userId, error });
      return this.update(userId, updates as Partial<SubscriptionEntity>);
    }
  }

  /**
   * Which of these users are currently entitled to Pro.
   *
   * Used by the matching ranking boost, where the candidate pool is already
   * narrowed, so this stays a bounded batch. Appwrite caps `equal` at 100
   * values per query, so ids are chunked the same way UserRepository does it.
   * Failures degrade to "nobody is Pro" rather than breaking recommendations.
   */
  async getProUserIds(userIds: string[]): Promise<Set<string>> {
    const pro = new Set<string>();
    if (userIds.length === 0) return pro;

    const unique = [...new Set(userIds)];

    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      try {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
          Query.equal('$id', chunk),
          Query.equal('plan', 'pro'),
          Query.limit(chunk.length),
        ]);

        for (const doc of response.documents) {
          const entity = fromAppwriteDoc<SubscriptionEntity>(doc);
          if (ENTITLED_STATUSES.has(entity.status)) {
            pro.add(entity.user_id);
          }
        }
      } catch (error) {
        logger.error('Failed to batch-read Pro subscriptions', { error });
      }
    }

    return pro;
  }
}

export const subscriptionRepository = new SubscriptionRepository();
