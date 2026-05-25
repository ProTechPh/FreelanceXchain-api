import { pool } from '../config/database.js';
import { MessageEntity, ConversationEntity } from '../models/message.js';

export const messageRepository = {
  async createConversation(participant1Id: string, participant2Id: string): Promise<ConversationEntity> {
    const now = new Date().toISOString();
    const query = `
      INSERT INTO conversations (participant1_id, participant2_id, last_message_at, unread_count_1, unread_count_2, created_at, updated_at)
      VALUES ($1, $2, $3, 0, 0, $3, $3)
      RETURNING *
    `;
    
    const result = await pool.query(query, [participant1Id, participant2Id, now]);
    return result.rows[0];
  },

  async findConversation(user1Id: string, user2Id: string): Promise<ConversationEntity | null> {
    const query = `
      SELECT * FROM conversations 
      WHERE (participant1_id = $1 AND participant2_id = $2) 
         OR (participant1_id = $2 AND participant2_id = $1)
      LIMIT 1
    `;
    
    const result = await pool.query(query, [user1Id, user2Id]);
    return result.rows[0] || null;
  },

  async getUserConversations(userId: string, limit: number, offset: number) {
    const query = `
      SELECT *, COUNT(*) OVER() as total_count FROM conversations 
      WHERE participant1_id = $1 OR participant2_id = $1
      ORDER BY last_message_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await pool.query(query, [userId, limit, offset]);
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    return { items: result.rows, total };
  },

  async createMessage(messageData: Omit<MessageEntity, 'id' | 'created_at' | 'updated_at'>): Promise<MessageEntity> {
    const now = new Date().toISOString();
    const keys = Object.keys(messageData);
    const values = Object.values(messageData);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const query = `
      INSERT INTO messages (${columns}, created_at, updated_at)
      VALUES (${placeholders}, $${keys.length + 1}, $${keys.length + 1})
      RETURNING *
    `;
    
    const result = await pool.query(query, [...values, now]);
    return result.rows[0];
  },

  async getConversationMessages(conversationId: string, limit: number, offset: number) {
    const query = `
      SELECT *, COUNT(*) OVER() as total_count FROM messages 
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await pool.query(query, [conversationId, limit, offset]);
    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    return { items: result.rows, total };
  },

  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    const query = `
      UPDATE messages 
      SET is_read = true 
      WHERE conversation_id = $1 AND receiver_id = $2 AND is_read = false
    `;
    
    await pool.query(query, [conversationId, userId]);
  },

  async updateConversation(conversationId: string, updates: Partial<ConversationEntity>): Promise<void> {
    const now = new Date().toISOString();
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');

    const query = `
      UPDATE conversations 
      SET ${setClause}, updated_at = $1
      WHERE id = $${keys.length + 2}
    `;
    
    await pool.query(query, [now, ...values, conversationId]);
  },

  async getUnreadCount(userId: string): Promise<number> {
    const query = `
      SELECT participant1_id, participant2_id, unread_count_1, unread_count_2 
      FROM conversations 
      WHERE participant1_id = $1 OR participant2_id = $1
    `;
    
    const result = await pool.query(query, [userId]);
      let total = 0;
      for (const conv of result.rows) {
        if (conv.participant1_id === userId) {
          total += conv.unread_count_1;
        } else {
          total += conv.unread_count_2;
        }
      }
      return total;
  },
};
