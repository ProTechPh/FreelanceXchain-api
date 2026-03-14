import { getSupabaseServiceClient } from '../config/supabase.js';
import { MessageEntity, ConversationEntity } from '../models/message.js';

export const messageRepository = {
  async createConversation(participant1Id: string, participant2Id: string): Promise<ConversationEntity> {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        participant1_id: participant1Id,
        participant2_id: participant2Id,
        last_message_at: new Date().toISOString(),
        unread_count_1: 0,
        unread_count_2: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async findConversation(user1Id: string, user2Id: string): Promise<ConversationEntity | null> {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`and(participant1_id.eq.${user1Id},participant2_id.eq.${user2Id}),and(participant1_id.eq.${user2Id},participant2_id.eq.${user1Id})`)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  async getUserConversations(userId: string, limit: number, offset: number) {
    const supabase = getSupabaseServiceClient();
    const { data, error, count } = await supabase
      .from('conversations')
      .select('*', { count: 'exact' })
      .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return { items: data || [], total: count || 0 };
  },

  async createMessage(messageData: Omit<MessageEntity, 'id' | 'created_at' | 'updated_at'>): Promise<MessageEntity> {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getConversationMessages(conversationId: string, limit: number, offset: number) {
    const supabase = getSupabaseServiceClient();
    const { data, error, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return { items: data || [], total: count || 0 };
  },

  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('receiver_id', userId)
      .eq('is_read', false);

    if (error) throw error;
  },

  async updateConversation(conversationId: string, updates: Partial<ConversationEntity>): Promise<void> {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId);

    if (error) throw error;
  },

  async getUnreadCount(userId: string): Promise<number> {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('participant1_id, participant2_id, unread_count_1, unread_count_2')
      .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`);

    if (error) throw error;
    
    let total = 0;
    for (const conv of data || []) {
      if (conv.participant1_id === userId) {
        total += conv.unread_count_1;
      } else {
        total += conv.unread_count_2;
      }
    }
    return total;
  },
};
