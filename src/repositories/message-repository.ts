import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';
import { MessageEntity, ConversationEntity } from '../models/message.js';

const CONVERSATIONS_COLLECTION = 'conversations';
const MESSAGES_COLLECTION = 'messages';

function mapConversation(doc: Record<string, any>): ConversationEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc as any;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as ConversationEntity;
}

function mapMessage(doc: Record<string, any>): MessageEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc as any;
  const result: Record<string, any> = {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  };
  if (typeof result.attachments === 'string') {
    result.attachments = JSON.parse(result.attachments);
  }
  return result as MessageEntity;
}

export const messageRepository = {
  async createConversation(participant1Id: string, participant2Id: string): Promise<ConversationEntity> {
    const now = new Date().toISOString();
    const doc = await databases.createDocument(
      DATABASE_ID,
      CONVERSATIONS_COLLECTION,
      ID.unique(),
      {
        participant1_id: participant1Id,
        participant2_id: participant2Id,
        last_message_at: now,
        unread_count_1: 0,
        unread_count_2: 0,
        created_at: now,
        updated_at: now,
      }
    );
    return mapConversation(doc);
  },

  async findConversation(user1Id: string, user2Id: string): Promise<ConversationEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        [
          Query.equal('participant1_id', user1Id),
          Query.equal('participant2_id', user2Id),
          Query.limit(1),
        ]
      );
      const firstDoc = response.documents[0];
      if (firstDoc) return mapConversation(firstDoc);

      const response2 = await databases.listDocuments(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        [
          Query.equal('participant1_id', user2Id),
          Query.equal('participant2_id', user1Id),
          Query.limit(1),
        ]
      );
      const secondDoc = response2.documents[0];
      return secondDoc ? mapConversation(secondDoc) : null;
    } catch {
      return null;
    }
  },

  async getUserConversations(userId: string, limit: number, offset: number) {
    try {
      const response1 = await databases.listDocuments(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        [
          Query.equal('participant1_id', userId),
          Query.orderDesc('last_message_at'),
          Query.limit(1000),
        ]
      );
      const response2 = await databases.listDocuments(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        [
          Query.equal('participant2_id', userId),
          Query.orderDesc('last_message_at'),
          Query.limit(1000),
        ]
      );
      const all = [
        ...response1.documents.map(mapConversation),
        ...response2.documents.map(mapConversation),
      ];
      const unique = Array.from(new Map(all.map(c => [c.id, c])).values());
      unique.sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''));
      const total = unique.length;
      const items = unique.slice(offset, offset + limit);
      return { items, total };
    } catch {
      return { items: [] as ConversationEntity[], total: 0 };
    }
  },

  async createMessage(messageData: Omit<MessageEntity, 'id' | 'created_at' | 'updated_at'>): Promise<MessageEntity> {
    const now = new Date().toISOString();
    const attrs: Record<string, any> = {};
    for (const [key, value] of Object.entries(messageData)) {
      if (value !== undefined) {
        attrs[key] = typeof value === 'object' ? JSON.stringify(value) : value;
      }
    }
    attrs.created_at = now;
    attrs.updated_at = now;

    const doc = await databases.createDocument(
      DATABASE_ID,
      MESSAGES_COLLECTION,
      ID.unique(),
      attrs
    );
    return mapMessage(doc);
  },

  async getConversationMessages(conversationId: string, limit: number, offset: number) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        MESSAGES_COLLECTION,
        [
          Query.equal('conversation_id', conversationId),
          Query.orderDesc('created_at'),
          Query.limit(limit),
          Query.offset(offset),
        ]
      );
      return {
        items: response.documents.map(mapMessage),
        total: response.total,
      };
    } catch {
      return { items: [] as MessageEntity[], total: 0 };
    }
  },

  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        MESSAGES_COLLECTION,
        [
          Query.equal('conversation_id', conversationId),
          Query.equal('receiver_id', userId),
          Query.equal('is_read', false),
          Query.limit(1000),
        ]
      );
      for (const doc of response.documents) {
        await databases.updateDocument(
          DATABASE_ID,
          MESSAGES_COLLECTION,
          doc.$id,
          { is_read: true }
        );
      }
    } catch {
      // ignore
    }
  },

  async updateConversation(conversationId: string, updates: Partial<ConversationEntity>): Promise<void> {
    const ALLOWED_COLUMNS = new Set([
      'last_message_at', 'unread_count_1', 'unread_count_2',
    ]);
    const attrs: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at' && ALLOWED_COLUMNS.has(key) && value !== undefined) {
        attrs[key] = value;
      }
    }
    attrs.updated_at = new Date().toISOString();

    try {
      await databases.updateDocument(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        conversationId,
        attrs
      );
    } catch {
      // ignore
    }
  },

  async getUnreadCount(userId: string): Promise<number> {
    try {
      const response1 = await databases.listDocuments(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        [
          Query.equal('participant1_id', userId),
          Query.limit(1000),
        ]
      );
      const response2 = await databases.listDocuments(
        DATABASE_ID,
        CONVERSATIONS_COLLECTION,
        [
          Query.equal('participant2_id', userId),
          Query.limit(1000),
        ]
      );
      let total = 0;
      for (const conv of response1.documents) {
        total += (conv as any).unread_count_1 || 0;
      }
      for (const conv of response2.documents) {
        total += (conv as any).unread_count_2 || 0;
      }
      return total;
    } catch {
      return 0;
    }
  },
};
