import { BaseRepository } from './base-repository.js';
import { Query } from '../config/appwrite.js';
import type { EmailDeliveryFailureEntity } from '../models/email-delivery-failure.js';

const COLLECTION_ID = 'email_delivery_failures';

export class EmailDeliveryFailureRepository extends BaseRepository<EmailDeliveryFailureEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createFailure(
    failure: Omit<EmailDeliveryFailureEntity, 'created_at' | 'updated_at'> & { id?: string },
  ): Promise<EmailDeliveryFailureEntity> {
    return this.create(failure);
  }

  /**
   * Most recent delivery failures, newest first. `limit` is an intentional
   * bounded cap (this backs an admin ops widget, not a full-history listing).
   * Errors return an empty list so the widget never breaks on a read failure.
   */
  async findRecent(limit = 50): Promise<EmailDeliveryFailureEntity[]> {
    try {
      return await this.listWithQueries<EmailDeliveryFailureEntity>([
        Query.orderDesc('created_at'),
        Query.limit(limit),
      ]);
    } catch {
      return [];
    }
  }
}

export const emailDeliveryFailureRepository = new EmailDeliveryFailureRepository();
