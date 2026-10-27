import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';
import { fromAppwriteDoc } from './base-repository.js';
import { logger } from '../config/logger.js';
import { userRepository } from './user-repository.js';

export type AuditLogStatus = 'success' | 'failure' | 'pending';
export type AuditActorRole = 'admin' | 'freelancer' | 'employer';
/** Search filter: admins, or regular users (freelancers and employers). */
export type AuditActorRoleFilter = 'admin' | 'user';

export type BaseEntity = {
  id: string;
  created_at: string;
};

export interface AuditLogEntry extends BaseEntity {
  user_id: string | null;
  actor_id: string | null;
  /** Actor's role when the action happened; null for actor-less events and older entries. */
  actor_role: AuditActorRole | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  status: AuditLogStatus;
  error_message: string | null;
}

// actor_role is filled in by create() from actor_id, so callers don't pass it.
export type CreateAuditLogEntry = Omit<AuditLogEntry, 'id' | 'created_at' | 'actor_role'>;

export interface AuditLogSearchFilters {
  actorId?: string;
  actorRole?: AuditActorRoleFilter;
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  status?: AuditLogStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  /** Document id to start the page after (cursor-based pagination, stable under inserts). */
  cursor?: string;
}

export interface AuditLogSearchResult {
  items: AuditLogEntry[];
  total: number;
  hasMore: boolean;
  /** Document id to pass as `cursor` for the next page, or null on the last page. */
  nextCursor: string | null;
}

const COLLECTION_ID = 'audit_log_entries';

function mapAuditLog(doc: Record<string, unknown>): AuditLogEntry {
  const result = fromAppwriteDoc<Record<string, unknown>>(doc);
  if (typeof result.payload === 'string') {
    result.payload = JSON.parse(result.payload);
  }
  return result as unknown as AuditLogEntry;
}

async function lookupActorRole(actorId: string | null | undefined): Promise<AuditActorRole | null> {
  if (!actorId) return null;
  try {
    return (await userRepository.getUserById(actorId))?.role ?? null;
  } catch {
    // The role is a label for filtering; a failed lookup must not drop the entry.
    return null;
  }
}

export class AuditLogRepository {
  private collectionId: string = COLLECTION_ID;

  /**
   * Persist an audit log entry. Every actor is recorded — users, admins and
   * actor-less events like failed logins — so anomalies can be traced.
   * Returns null (never throws) when the write fails — auditing must not break
   * the primary action it records.
   */
  async create(entry: CreateAuditLogEntry): Promise<AuditLogEntry | null> {
    try {
      const actorRole = await lookupActorRole(entry.actor_id);
      const doc = await databases.createDocument(
        DATABASE_ID,
        this.collectionId,
        ID.unique(),
        {
          ...entry,
          actor_role: actorRole,
          payload: typeof entry.payload === 'string'
            ? entry.payload
            : JSON.stringify(entry.payload ?? {}),
          // No created_at: the collection has no such attribute (Appwrite rejects
          // unknown keys); the timestamp comes from $createdAt.
        }
      );
      return mapAuditLog(doc);
    } catch (error) {
      // Never throw — audit persistence is best-effort durability, not a gate —
      // but log it, or every failed write disappears without a trace.
      logger.error('Failed to persist audit log entry', { error, action: entry.action });
      return null;
    }
  }

  async getById(id: string): Promise<AuditLogEntry | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, this.collectionId, id);
      return mapAuditLog(doc);
    } catch {
      return null;
    }
  }

  async getByUserId(userId: string, limit = 100): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.equal('user_id', userId),
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
        ]
      );
      return response.documents.map(mapAuditLog);
    } catch {
      return [];
    }
  }

  async getByAction(action: string, limit = 100): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.equal('action', action),
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
        ]
      );
      return response.documents.map(mapAuditLog);
    } catch {
      return [];
    }
  }

  async getByResource(resourceType: string, resourceId: string, limit = 100): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.equal('resource_type', resourceType),
          Query.equal('resource_id', resourceId),
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
        ]
      );
      return response.documents.map(mapAuditLog);
    } catch {
      return [];
    }
  }

  async getByDateRange(startDate: Date, endDate: Date, limit = 1000): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
        ]
      );
      const start = startDate.toISOString();
      const end = endDate.toISOString();
      return response.documents.reduce<AuditLogEntry[]>((acc, doc) => {
        const entry = mapAuditLog(doc);
        if (entry.created_at >= start && entry.created_at <= end) acc.push(entry);
        return acc;
      }, []);
    } catch {
      return [];
    }
  }

  async getFailedActions(limit = 100): Promise<AuditLogEntry[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        this.collectionId,
        [
          Query.equal('status', 'failure'),
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
        ]
      );
      return response.documents.map(mapAuditLog);
    } catch {
      return [];
    }
  }

  /**
   * Combined filter + cursor-paginated search over audit entries (admin console).
   * Every filter is optional; `created_at` range filters use native Appwrite
   * greaterThanEqual/lessThanEqual on the ISO timestamp. Pagination is cursor-based
   * (`cursorAfter` on the last returned doc id) so page boundaries stay stable under
   * concurrent inserts (BLF-12.2 read side).
   */
  async search(filters: AuditLogSearchFilters = {}): Promise<AuditLogSearchResult> {
    try {
      const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);

      // Fetch limit+1 so we can detect whether another page exists without a
      // separate count round-trip.
      const queries: string[] = [];
      if (filters.actorId) queries.push(Query.equal('actor_id', filters.actorId));
      if (filters.actorRole === 'admin') queries.push(Query.equal('actor_role', 'admin'));
      if (filters.actorRole === 'user') queries.push(Query.equal('actor_role', ['freelancer', 'employer']));
      if (filters.userId) queries.push(Query.equal('user_id', filters.userId));
      // Partial, case-insensitive match: admins type "Login" or "KYC", while
      // stored values look like "auth.login" or "kyc_verification".
      if (filters.action) queries.push(Query.contains('action', filters.action.trim()));
      if (filters.resourceType) queries.push(Query.contains('resource_type', filters.resourceType.trim()));
      if (filters.resourceId) queries.push(Query.equal('resource_id', filters.resourceId));
      if (filters.status) queries.push(Query.equal('status', filters.status));
      if (filters.startDate) queries.push(Query.greaterThanEqual('$createdAt', filters.startDate.toISOString()));
      if (filters.endDate) queries.push(Query.lessThanEqual('$createdAt', filters.endDate.toISOString()));
      queries.push(Query.orderDesc('$createdAt'), Query.limit(limit + 1));
      if (filters.cursor) queries.push(Query.cursorAfter(filters.cursor));

      const response = await databases.listDocuments(DATABASE_ID, this.collectionId, queries);
      const documents = response.documents;
      const hasMore = documents.length > limit;
      const pageDocuments = hasMore ? documents.slice(0, limit) : documents;

      return {
        items: pageDocuments.map(mapAuditLog),
        total: response.total,
        hasMore,
        nextCursor: hasMore ? (pageDocuments[pageDocuments.length - 1]?.$id ?? null) : null,
      };
    } catch (error) {
      logger.error('Failed to search audit log entries', { error });
      return { items: [], total: 0, hasMore: false, nextCursor: null };
    }
  }

  /**
   * Fetch entries within a date range for aggregation (admin activity reports).
   * Server-side range filter, then paginated collection of the whole window.
   * Returns an empty array on failure — reports degrade gracefully.
   */
  async listForRange(startDate: Date, endDate: Date, pageSize = 500): Promise<AuditLogEntry[]> {
    try {
      const allDocs: Record<string, unknown>[] = [];
      let lastId: string | undefined;

      while (true) {
        const queries: string[] = [
          Query.greaterThanEqual('$createdAt', startDate.toISOString()),
          Query.lessThanEqual('$createdAt', endDate.toISOString()),
          Query.orderDesc('$createdAt'),
          Query.limit(pageSize),
        ];
        if (lastId) queries.push(Query.cursorAfter(lastId));

        const response = await databases.listDocuments(DATABASE_ID, this.collectionId, queries);
        allDocs.push(...response.documents);

        if (response.documents.length < pageSize) break;
        lastId = response.documents[response.documents.length - 1]?.$id;
        if (!lastId) break;
      }

      return allDocs.map(mapAuditLog);
    } catch {
      return [];
    }
  }
}

export const auditLogRepository = new AuditLogRepository();
