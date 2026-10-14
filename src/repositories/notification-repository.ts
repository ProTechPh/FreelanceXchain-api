import { BaseRepository, PaginatedResult, QueryOptions, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
export type { NotificationType } from '../models/notification.js';
import type { NotificationType } from '../models/notification.js';
import { logger } from '../config/logger.js';
import { getErrorMessage } from '../utils/index.js';

export type NotificationEntity = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  is_read: boolean;
  /** Absent on documents written before the attribute existed; treat as false. */
  is_archived?: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'notifications';

// Documents created before `is_archived` was added carry null, not false, so
// "active" has to match both.
function archivedFilter(archived: boolean) {
  return archived
    ? Query.equal('is_archived', true)
    : Query.or([Query.equal('is_archived', false), Query.isNull('is_archived')]);
}

export type NotificationListOptions = QueryOptions & { archived?: boolean };

function mapNotification(doc: Record<string, unknown>): NotificationEntity {
  const result = fromAppwriteDoc<Record<string, unknown>>(doc);
  if (typeof result.data === 'string') {
    result.data = JSON.parse(result.data);
  }
  return result as NotificationEntity;
}

export class NotificationRepository extends BaseRepository<NotificationEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createNotification(notification: Omit<NotificationEntity, 'created_at' | 'updated_at'>): Promise<NotificationEntity> {
    return this.create(notification);
  }

  async getNotificationById(id: string): Promise<NotificationEntity | null> {
    return this.getById(id);
  }

  async getNotificationsByUser(
    userId: string,
    options?: NotificationListOptions
  ): Promise<PaginatedResult<NotificationEntity> & { continuationToken?: string }> {
    const limit = options?.limit ?? options?.maxItemCount ?? 100;
    const offset = options?.offset ?? 0;
    // The continuation token is the id of the last item the client holds.
    // A cursor (unlike an offset) stays correct after the client archives or
    // deletes rows from the pages it has already loaded.
    const cursor = options?.continuationToken;

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('user_id', userId),
          archivedFilter(options?.archived ?? false),
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
          ...(cursor ? [Query.cursorAfter(cursor)] : [Query.offset(offset)]),
        ]
      );
      const items = response.documents.map(mapNotification);
      const hasMore = response.documents.length === limit;
      return {
        items,
        hasMore,
        total: response.total,
        ...(hasMore && items.length > 0 ? { continuationToken: items[items.length - 1]!.id } : {}),
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }

  async getAllNotificationsByUser(userId: string): Promise<NotificationEntity[]> {
    try {
      // fetchAll (cursor pagination) instead of Query.limit(1000): a cap here
      // silently dropped every notification past the first 1000 (the
      // limit(1000) truncation class fixed in base-repository).
      return await this.fetchAll([
        Query.equal('user_id', userId),
        Query.orderDesc('$createdAt'),
      ]);
    } catch {
      return [];
    }
  }

  async getUnreadNotificationsByUser(userId: string): Promise<NotificationEntity[]> {
    try {
      return await this.fetchAll([
        Query.equal('user_id', userId),
        Query.equal('is_read', false),
        Query.orderDesc('$createdAt'),
      ]);
    } catch {
      return [];
    }
  }

  async markAsRead(id: string): Promise<NotificationEntity | null> {
    return this.update(id, { is_read: true });
  }

  async markAllAsRead(userId: string): Promise<number> {
    try {
      const unread = await this.fetchAll([
        Query.equal('user_id', userId),
        Query.equal('is_read', false),
      ]);
      
      if (unread.length === 0) {
        return 0;
      }
      
      await Promise.all(
        unread.map(notification =>
          databases.updateDocument(DATABASE_ID, COLLECTION_ID, notification.id, { is_read: true })
        )
      );
      return unread.length;
    } catch (error) {
      logger.error('Failed to mark all notifications as read', { error: getErrorMessage(error), userId });
      throw error;
    }
  }

  async setArchived(id: string, archived: boolean): Promise<NotificationEntity | null> {
    return this.update(id, { is_archived: archived });
  }

  /**
   * The subset of `ids` that exist and belong to `userId`. Ownership is part of
   * the query, so ids owned by someone else are indistinguishable from missing
   * ones — a bulk request cannot probe for other users' notification ids.
   */
  async getOwnedByIds(userId: string, ids: string[]): Promise<NotificationEntity[]> {
    if (ids.length === 0) return [];
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('$id', ids),
          Query.equal('user_id', userId),
          Query.limit(ids.length),
        ]
      );
      return response.documents.map(mapNotification);
    } catch (error) {
      logger.error('Failed to load notifications for bulk action', { error: getErrorMessage(error), userId });
      return [];
    }
  }

  async deleteNotification(id: string): Promise<boolean> {
    return this.delete(id);
  }

  /** Archived notifications are out of the inbox, so they no longer count as unread. */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('user_id', userId),
          Query.equal('is_read', false),
          archivedFilter(false),
          Query.limit(1),
        ]
      );
      return response.total;
    } catch {
      return 0;
    }
  }

  /**
   * Delete read notifications created before `threshold` and report how many
   * were removed. Per-delete failures are counted as not deleted; the initial
   * read query error propagates to the caller (scheduler job).
   */
  async deleteReadBefore(threshold: Date): Promise<number> {
    // fetchAll with a created_at filter instead of Query.limit(1000) with an
    // in-memory threshold: the old cap deleted at most 1000 arbitrary read
    // notifications per run (no ordering), so the backlog never drained under
    // sustained volume. The read error still propagates to the caller
    // (scheduler job), as before.
    const oldNotifications = await this.fetchAll([
      Query.equal('is_read', true),
      Query.lessThan('$createdAt', threshold.toISOString()),
    ]);

    const deleteResults = await Promise.all(
      oldNotifications.map(async (notification) => (await this.delete(notification.id)) ? 1 : 0)
    );
    return deleteResults.reduce<number>((sum, n) => sum + n, 0);
  }
}

export const notificationRepository = new NotificationRepository();
