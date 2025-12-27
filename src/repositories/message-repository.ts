import { BaseRepository, BaseEntity, PaginatedResult, QueryOptions } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

export type MessageEntity = BaseEntity & {
  contract_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
};

export type CreateMessageInput = Omit<MessageEntity, 'id' | 'created_at' | 'updated_at' | 'is_read'>;

class MessageRepositoryClass extends BaseRepository<MessageEntity> {
  constructor() {
    super(TABLES.MESSAGES);
  }

  async findByContractId(contractId: string, options?: QueryOptions): Promise<PaginatedResult<MessageEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to find messages: ${error.message}`);

    return {
      items: (data ?? []) as MessageEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getUnreadCount(contractId: string, userId: string): Promise<number> {
    const client = this.getClient();
    const { count, error } = await client
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('contract_id', contractId)
      .neq('sender_id', userId)
      .eq('is_read', false);

    if (error) throw new Error(`Failed to get unread count: ${error.message}`);
    return count ?? 0;
  }

  async markAsRead(contractId: string, userId: string): Promise<void> {
    const client = this.getClient();
    const { error } = await client
      .from(this.tableName)
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq('contract_id', contractId)
      .neq('sender_id', userId)
      .eq('is_read', false);

    if (error) throw new Error(`Failed to mark as read: ${error.message}`);
  }

  async getLatestMessage(contractId: string): Promise<MessageEntity | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get latest message: ${error.message}`);
    }
    return data as MessageEntity;
  }
}

export const MessageRepository = new MessageRepositoryClass();
