import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository';
import { TABLES } from '../config/supabase';

export type NotificationType =
  | 'proposal_received'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'payment_released'
  | 'dispute_created'
  | 'dispute_resolved'
  | 'rating_received'
  | 'message';

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

export class NotificationRepository extends BaseRepository<NotificationEntity> {
  constructor() {
    super(TABLES.NOTIFICATIONS);
  }

  async createNotification(notification: Omit<NotificationEntity, 'created_at' | 'updated_at'>): Promise<NotificationEntity> {
    return this.create(notification);
  }

  async getNotificationById(id: string): Promise<NotificationEntity | null> {
    return this.getById(id);
  }

  async getNotificationsByUser(userId: string, options?: QueryOptions): Promise<PaginatedResult<NotificationEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get notifications by user: ${error.message}`);
    
    return {
      items: (data ?? []) as NotificationEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getAllNotificationsByUser(userId: string): Promise<NotificationEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get all notifications by user: ${error.message}`);
    return (data ?? []) as NotificationEntity[];
  }

  async getUnreadNotificationsByUser(userId: string): Promise<NotificationEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get unread notifications: ${error.message}`);
    return (data ?? []) as NotificationEntity[];
  }

  async markAsRead(id: string): Promise<NotificationEntity | null> {
    return this.update(id, { is_read: true });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false)
      .select();
    
    if (error) throw new Error(`Failed to mark all as read: ${error.message}`);
    return data?.length ?? 0;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const client = this.getClient();
    const { count, error } = await client
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    
    if (error) throw new Error(`Failed to get unread count: ${error.message}`);
    return count ?? 0;
  }
}

export const notificationRepository = new NotificationRepository();
