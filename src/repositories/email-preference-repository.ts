import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type EmailPreferenceEntity = {
  id: string;
  user_id: string;
  proposal_received: boolean;
  proposal_accepted: boolean;
  milestone_updates: boolean;
  payment_notifications: boolean;
  dispute_notifications: boolean;
  marketing_emails: boolean;
  weekly_digest: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'email_preferences';

export class EmailPreferenceRepository extends BaseRepository<EmailPreferenceEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  /**
   * Preferences for one user, or null when they have none yet.
   * Errors propagate so the service can surface them.
   */
  async findByUserId(userId: string): Promise<EmailPreferenceEntity | null> {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [
        Query.equal('user_id', userId),
        Query.limit(1),
      ]
    );
    const doc = response.documents[0];
    return doc ? fromAppwriteDoc<EmailPreferenceEntity>(doc) : null;
  }

  /**
   * Default preferences for a user who has none yet.
   */
  async createDefault(userId: string): Promise<EmailPreferenceEntity> {
    return this.create({
      user_id: userId,
      proposal_received: true,
      proposal_accepted: true,
      milestone_updates: true,
      payment_notifications: true,
      dispute_notifications: true,
      marketing_emails: false,
      weekly_digest: true,
    });
  }

  /**
   * Users who opted into the weekly digest. Errors propagate to the caller
   * (the scheduler job owns the error handling).
   */
  async findAllWithWeeklyDigestEnabled(): Promise<EmailPreferenceEntity[]> {
    return this.fetchAll([Query.equal('weekly_digest', true)]);
  }
}

export const emailPreferenceRepository = new EmailPreferenceRepository();
