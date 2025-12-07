import { Notification } from '../models/notification.js';
import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';

// Extend Notification with BaseEntity fields for repository
type NotificationEntity = Notification & { updatedAt: string };

export class NotificationRepository extends BaseRepository<NotificationEntity> {
  constructor() {
    super(COLLECTIONS.NOTIFICATIONS);
  }

  async createNotification(notification: Notification): Promise<Notification> {
    const entity: NotificationEntity = {
      ...notification,
      updatedAt: notification.createdAt,
    };
    const created = await this.create(entity, notification.userId);
    return this.toNotification(created);
  }

  async getNotificationById(id: string, userId: string): Promise<Notification | null> {
    const entity = await this.getById(id, userId);
    return entity ? this.toNotification(entity) : null;
  }

  async getNotificationsByUser(
    userId: string,
    options?: QueryOptions
  ): Promise<PaginatedResult<Notification>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@userId', value: userId }],
    };
    const result = await this.query(querySpec, options);
    const paginatedResult: PaginatedResult<Notification> = {
      items: result.items.map(this.toNotification),
      hasMore: result.hasMore,
    };
    if (result.continuationToken) {
      paginatedResult.continuationToken = result.continuationToken;
    }
    return paginatedResult;
  }


  async getAllNotificationsByUser(userId: string): Promise<Notification[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@userId', value: userId }],
    };
    const entities = await this.queryAll(querySpec);
    return entities.map(this.toNotification);
  }

  async getUnreadNotificationsByUser(userId: string): Promise<Notification[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.userId = @userId AND c.isRead = false ORDER BY c.createdAt DESC',
      parameters: [{ name: '@userId', value: userId }],
    };
    const entities = await this.queryAll(querySpec);
    return entities.map(this.toNotification);
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const updated = await this.update(id, userId, { isRead: true });
    return updated ? this.toNotification(updated) : null;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const unread = await this.getUnreadNotificationsByUser(userId);
    let count = 0;
    for (const notification of unread) {
      const updated = await this.update(notification.id, userId, { isRead: true });
      if (updated) count++;
    }
    return count;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const querySpec = {
      query: 'SELECT VALUE COUNT(1) FROM c WHERE c.userId = @userId AND c.isRead = false',
      parameters: [{ name: '@userId', value: userId }],
    };
    const result = await this.queryAll(querySpec);
    return (result[0] as unknown as number) ?? 0;
  }

  private toNotification(entity: NotificationEntity): Notification {
    const { updatedAt: _updatedAt, ...notification } = entity;
    return notification;
  }
}

export const notificationRepository = new NotificationRepository();
