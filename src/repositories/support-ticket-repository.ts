import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { Query } from '../config/appwrite.js';
import {
  ACTIVE_SUPPORT_TICKET_STATUSES,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketEntity,
  type SupportTicketStatus,
} from '../models/support-ticket.js';

const COLLECTION_ID = 'support_tickets';

export type SupportTicketFilters = {
  status?: string | undefined;
  category?: string | undefined;
};

/** Appwrite caps a single listDocuments page; the admin queue pages under it. */
const MAX_PAGE_SIZE = 100;

export class SupportTicketRepository extends BaseRepository<SupportTicketEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  /** Every ticket this user has filed, newest first. */
  async listByUser(userId: string): Promise<SupportTicket[]> {
    const docs = await this.listWithQueries<SupportTicketEntity>(
      [Query.equal('user_id', userId), Query.orderDesc('$createdAt'), Query.limit(MAX_PAGE_SIZE)],
      doc => fromAppwriteDoc<SupportTicketEntity>(doc)
    );
    return docs.map(mapToModel);
  }

  /** How many of this user's tickets are still waiting on an admin. */
  async countActiveByUser(userId: string): Promise<number> {
    return this.countWithQueries([
      Query.equal('user_id', userId),
      Query.equal('status', [...ACTIVE_SUPPORT_TICKET_STATUSES]),
    ]);
  }

  /**
   * Every ticket, newest first — the admin queue's single read.
   *
   * Deliberately one round trip rather than a filtered page plus four counts:
   * the queue needs per-status totals for its filter cards *and* the rows for
   * one of those statuses, and Appwrite has no aggregation, so five queries
   * were being spent on data one query already contains. Filtering and counting
   * happen in the service.
   *
   * Safe because the collection is small by construction — a user may hold only
   * MAX_OPEN_TICKETS_PER_USER unanswered tickets at a time. `fetchAll` pages at
   * 100, so this stays a single request until the archive passes that, and it
   * remains correct (if chattier) after.
   */
  async fetchAllForQueue(): Promise<SupportTicket[]> {
    const docs = await this.fetchAll([Query.orderDesc('$createdAt')]);
    return docs.map(mapToModel);
  }

  async createTicket(
    entity: Omit<SupportTicketEntity, 'id' | 'created_at' | 'updated_at'>
  ): Promise<SupportTicket> {
    const created = await this.create(entity);
    return mapToModel(created);
  }

  async getTicketById(id: string): Promise<SupportTicket | null> {
    const entity = await this.getById(id);
    return entity ? mapToModel(entity) : null;
  }

  async updateTicket(id: string, patch: Partial<SupportTicketEntity>): Promise<SupportTicket | null> {
    const updated = await this.update(id, patch);
    return updated ? mapToModel(updated) : null;
  }
}

/** Map database entity to domain model. */
function mapToModel(entity: SupportTicketEntity): SupportTicket {
  return {
    id: entity.id,
    userId: entity.user_id,
    userRole: entity.user_role,
    subject: entity.subject,
    description: entity.description,
    category: entity.category as SupportTicketCategory,
    status: entity.status as SupportTicketStatus,
    resolutionNote: entity.resolution_note,
    resolvedBy: entity.resolved_by,
    resolvedAt: entity.resolved_at,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

export const supportTicketRepository = new SupportTicketRepository();
