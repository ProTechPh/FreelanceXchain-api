import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
export type { NotificationType } from '../models/notification.js';
import type { NotificationType } from '../models/notification.js';

export type NotificationEntity = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'notifications';

function mapNotification(doc: Record<string, any>): NotificationEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc as any;
  const result: Record<string, any> = {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  };
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

  async getNotificationsByUser(userId: string, options?: QueryOptions): Promise<PaginatedResult<NotificationEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('user_id', userId),
          Query.orderDesc('created_at'),
          Query.limit(limit),
          Query.offset(offset),
        ]
      );
      return {
        items: response.documents.map(mapNotification),
        hasMore: response.documents.length === limit,
        total: response.total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }

  async getAllNotificationsByUser(userId: string): Promise<NotificationEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('user_id', userId),
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      return response.documents.map(mapNotification);
    } catch {
      return [];
    }
  }

  async getUnreadNotificationsByUser(userId: string): Promise<NotificationEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('user_id', userId),
          Query.equal('is_read', false),
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      return response.documents.map(mapNotification);
    } catch {
      return [];
    }
  }

  async markAsRead(id: string): Promise<NotificationEntity | null> {
    return this.update(id, { is_read: true } as Partial<NotificationEntity>);
  }

  async markAllAsRead(userId: string): Promise<number> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('user_id', userId),
          Query.equal('is_read', false),
          Query.limit(1000),
        ]
      );
      const now = new Date().toISOString();
      await Promise.all(
        response.documents.map(doc =>
          databases.updateDocument(DATABASE_ID, COLLECTION_ID, doc.$id, { is_read: true, updated_at: now })
        )
      );
      return response.documents.length;
    } catch {
      return 0;
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('user_id', userId),
          Query.equal('is_read', false),
          Query.limit(1),
        ]
      );
      return response.total;
    } catch {
      return 0;
    }
  }
}

export const notificationRepository = new NotificationRepository();
