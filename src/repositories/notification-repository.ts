import { BaseRepositoryPg, PaginatedResult, QueryOptions } from './base-repository-pg.js';
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

export class NotificationRepository extends BaseRepositoryPg<NotificationEntity> {
  constructor() {
    super('notifications');
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

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE user_id = $1`;
    const countResult = await this.pool.query(countQuery, [userId]);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated data
    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [userId, limit, offset]);
      
      return {
        items: result.rows as NotificationEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get notifications by user: ${error.message}`);
    }
  }

  async getAllNotificationsByUser(userId: string): Promise<NotificationEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query, [userId]);
      return result.rows as NotificationEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get all notifications by user: ${error.message}`);
    }
  }

  async getUnreadNotificationsByUser(userId: string): Promise<NotificationEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE user_id = $1 AND is_read = false
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query, [userId]);
      return result.rows as NotificationEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get unread notifications: ${error.message}`);
    }
  }

  async markAsRead(id: string): Promise<NotificationEntity | null> {
    return this.update(id, { is_read: true } as Partial<NotificationEntity>);
  }

  async markAllAsRead(userId: string): Promise<number> {
    const query = `
      UPDATE ${this.tableName}
      SET is_read = true, updated_at = $1
      WHERE user_id = $2 AND is_read = false
      RETURNING id
    `;
    
    try {
      const result = await this.pool.query(query, [new Date().toISOString(), userId]);
      return result.rowCount ?? 0;
    } catch (error: any) {
      throw new Error(`Failed to mark all as read: ${error.message}`);
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM ${this.tableName}
      WHERE user_id = $1 AND is_read = false
    `;
    
    try {
      const result = await this.pool.query(query, [userId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error: any) {
      throw new Error(`Failed to get unread count: ${error.message}`);
    }
  }
}

export const notificationRepository = new NotificationRepository();
