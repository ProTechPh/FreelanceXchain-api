import { databases, DATABASE_ID, Query, ID } from '../config/appwrite.js';
import { fromAppwriteDoc } from './base-repository.js';
import { MessageEntity, ConversationEntity } from '../models/message.js';

const CONVERSATIONS_COLLECTION = 'conversations';
const MESSAGES_COLLECTION = 'messages';

function mapConversation(doc: Record<string, unknown>): ConversationEntity {
  return fromAppwriteDoc<ConversationEntity>(doc);
}

function mapMessage(doc: Record<string, unknown>): MessageEntity {
  const result = fromAppwriteDoc<Record<string, unknown>>(doc);
  if (typeof result.attachments === 'string') {
    result.attachments = JSON.parse(result.attachments);
  }
  return result as MessageEntity;
}

/**
 * Fetch ALL documents matching the queries using cursor-based pagination.
 * The old `Query.limit(1000)` per participant slot silently dropped every
 * conversation past the first 1000 — the limit(1000) truncation class that
 * base-repository.fetchAll replaces elsewhere.
 */
async function fetchAllConversations(queries: string[], pageSize = 100): Promise<Record<string, unknown>[]> {
  const allDocs: Record<string, unknown>[] = [];
  let lastId: string | undefined;

  while (true) {
    const pageQueries = [...queries, Query.limit(pageSize)];
    if (lastId) {
      pageQueries.push(Query.cursorAfter(lastId));
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      CONVERSATIONS_COLLECTION,
      pageQueries
    );
    allDocs.push(...response.documents);

    if (response.documents.length < pageSize) break;
    lastId = response.documents[response.documents.length - 1]?.$id;
    if (!lastId) break;
  }

  return allDocs;
}

/**
 * Fetch ALL message documents matching the queries using cursor-based
 * pagination — same pattern as fetchAllConversations, for the messages
 * collection (used by markMessagesAsRead so >1000 unread messages all get
 * marked read).
 */
async function fetchAllMessages(queries: string[], pageSize = 100): Promise<Record<string, unknown>[]> {
  const allDocs: Record<string, unknown>[] = [];
  let lastId: string | undefined;

  while (true) {
    const pageQueries = [...queries, Query.limit(pageSize)];
    if (lastId) {
      pageQueries.push(Query.cursorAfter(lastId));
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      MESSAGES_COLLECTION,
      pageQueries
    );
    allDocs.push(...response.documents);

    if (response.documents.length < pageSize) break;
    lastId = response.documents[response.documents.length - 1]?.$id;
    if (!lastId) break;
  }

  return allDocs;
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
      const [slot1, slot2] = await Promise.all([
        fetchAllConversations([
          Query.equal('participant1_id', userId),
          Query.orderDesc('last_message_at'),
        ]),
        fetchAllConversations([
          Query.equal('participant2_id', userId),
          Query.orderDesc('last_message_at'),
        ]),
      ]);
      const all = [...slot1, ...slot2].map(mapConversation);
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
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(messageData)) {
      if (value !== undefined) {
        attrs[key] = typeof value === 'object' ? JSON.stringify(value) : value;
      }
    }
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
          Query.orderDesc('$createdAt'),
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
      // fetchAllMessages (cursor pagination) instead of Query.limit(1000): with
      // more than 1000 unread messages in a conversation the rest stayed unread
      // and the unread badge never cleared (the limit(1000) truncation class).
      const unreadMessages = await fetchAllMessages([
        Query.equal('conversation_id', conversationId),
        Query.equal('receiver_id', userId),
        Query.equal('is_read', false),
      ]);
      await Promise.all(
        unreadMessages.map(doc =>
          databases.updateDocument(DATABASE_ID, MESSAGES_COLLECTION, doc.$id as string, { is_read: true })
        )
      );
    } catch {
      // ignore
    }
  },

  async updateConversation(conversationId: string, updates: Partial<ConversationEntity>): Promise<void> {
    const ALLOWED_COLUMNS = new Set([
      'last_message_at', 'last_message_preview', 'unread_count_1', 'unread_count_2',
    ]);
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at' && key !== 'updated_at' && ALLOWED_COLUMNS.has(key) && value !== undefined) {
        attrs[key] = value;
      }
    }
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

  async getUnreadMessageCountForUser(receiverId: string): Promise<number> {
    const response = await databases.listDocuments(
      DATABASE_ID,
      MESSAGES_COLLECTION,
      [
        Query.equal('receiver_id', receiverId),
        Query.equal('is_read', false),
        Query.limit(1),
      ]
    );
    return response.total;
  },

  /**
   * Unread message counts for many receivers in one query per 100-user chunk
   * (Appwrite caps `equal` at 100 values). Counts are tallied in memory from
   * the returned documents.
   */
  async getUnreadMessageCountsForUsers(receiverIds: string[]): Promise<Map<string, number>> {
    const countsByReceiver = new Map<string, number>();

    for (let i = 0; i < receiverIds.length; i += 100) {
      const chunk = receiverIds.slice(i, i + 100);
      const response = await databases.listDocuments(
        DATABASE_ID,
        MESSAGES_COLLECTION,
        [
          Query.equal('receiver_id', chunk),
          Query.equal('is_read', false),
          Query.limit(1000),
        ]
      );

      for (const doc of response.documents) {
        const receiverId = doc.receiver_id as string;
        countsByReceiver.set(receiverId, (countsByReceiver.get(receiverId) ?? 0) + 1);
      }
    }

    return countsByReceiver;
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
        total += Number(conv.unread_count_1 ?? 0);
      }
      for (const conv of response2.documents) {
        total += Number(conv.unread_count_2 ?? 0);
      }
      return total;
    } catch {
      return 0;
    }
  },
};
