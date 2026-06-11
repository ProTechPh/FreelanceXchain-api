// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockDatabases = {
  listDocuments: jest.fn(),
  createDocument: jest.fn(),
  updateDocument: jest.fn(),
  getDocument: jest.fn(),
  deleteDocument: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: mockDatabases,
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn().mockImplementation((field: string, value: any) => ({ type: 'equal', field, value })),
    limit: jest.fn().mockImplementation((n: number) => ({ type: 'limit', value: n })),
    offset: jest.fn().mockImplementation((n: number) => ({ type: 'offset', value: n })),
    orderDesc: jest.fn().mockImplementation((field: string) => ({ type: 'orderDesc', field })),
  },
  ID: { unique: jest.fn(() => 'mock-unique-id') },
}));

const { messageRepository } = await import('../../repositories/message-repository.js');

describe('MessageRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createConversation', () => {
    it('should create and return a conversation', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'c1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01',
        participant1_id: 'u1', participant2_id: 'u2',
      });
      const result = await messageRepository.createConversation('u1', 'u2');
      expect(result.id).toBe('c1');
      expect(result.participant1_id).toBe('u1');
      expect(result.participant2_id).toBe('u2');
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(messageRepository.createConversation('u1', 'u2')).rejects.toThrow('insert failed');
    });
  });

  describe('findConversation', () => {
    it('should return a conversation', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', participant1_id: 'u1', participant2_id: 'u2' }],
          total: 1,
        });
      const result = await messageRepository.findConversation('u1', 'u2');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('c1');
    });

    it('should return null when not found', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await messageRepository.findConversation('u1', 'u2');
      expect(result).toBeNull();
    });

    it('should return null on database errors', async () => {
      mockDatabases.listDocuments.mockRejectedValue(new Error('db error'));
      const result = await messageRepository.findConversation('u1', 'u2');
      expect(result).toBeNull();
    });
  });

  describe('getUserConversations', () => {
    it('should return paginated conversations', async () => {
      const convs = [
        { $id: 'c1', participant1_id: 'u1', participant2_id: 'u2', last_message_at: '2025-01-01' },
        { $id: 'c2', participant1_id: 'u3', participant2_id: 'u1', last_message_at: '2025-01-02' },
      ];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [convs[0]], total: 1 })
        .mockResolvedValueOnce({ documents: [convs[1]], total: 1 });
      const result = await messageRepository.getUserConversations('u1', 10, 0);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty when no conversations', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await messageRepository.getUserConversations('u1', 10, 0);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty on database errors', async () => {
      mockDatabases.listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await messageRepository.getUserConversations('u1', 10, 0);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('createMessage', () => {
    it('should create and return a message', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'm1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01',
        conversation_id: 'c1', content: 'hello',
      });
      const result = await messageRepository.createMessage({ conversation_id: 'c1', sender_id: 'u1', receiver_id: 'u2', content: 'hello', is_read: false } as any);
      expect(result.id).toBe('m1');
      expect(result.content).toBe('hello');
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(messageRepository.createMessage({} as any)).rejects.toThrow('insert failed');
    });
  });

  describe('getConversationMessages', () => {
    it('should return paginated messages', async () => {
      const msgs = [
        { $id: 'm1', conversation_id: 'c1', content: 'hello' },
        { $id: 'm2', conversation_id: 'c1', content: 'world' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: msgs, total: 2 });
      const result = await messageRepository.getConversationMessages('c1', 10, 0);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty on database errors', async () => {
      mockDatabases.listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await messageRepository.getConversationMessages('c1', 10, 0);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('markMessagesAsRead', () => {
    it('should mark messages as read successfully', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: 'm1' }], total: 1 });
      mockDatabases.updateDocument.mockResolvedValueOnce({ $id: 'm1' });
      await expect(messageRepository.markMessagesAsRead('c1', 'u2')).resolves.toBeUndefined();
    });

    it('should not throw on database errors', async () => {
      mockDatabases.listDocuments.mockRejectedValue(new Error('update failed'));
      await expect(messageRepository.markMessagesAsRead('c1', 'u2')).resolves.toBeUndefined();
    });
  });

  describe('updateConversation', () => {
    it('should update conversation successfully', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({ $id: 'c1' });
      await expect(messageRepository.updateConversation('c1', { last_message_at: new Date().toISOString() })).resolves.toBeUndefined();
    });

    it('should not throw on database errors', async () => {
      mockDatabases.updateDocument.mockRejectedValue(new Error('update failed'));
      await expect(messageRepository.updateConversation('c1', {})).resolves.toBeUndefined();
    });
  });

  describe('getUnreadCount', () => {
    it('should sum unread counts for participant1', async () => {
      const convs1 = [
        { $id: 'c1', unread_count_1: 3 },
        { $id: 'c2', unread_count_1: 2 },
      ];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: convs1, total: 2 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(5);
    });

    it('should sum unread counts for participant2', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', unread_count_2: 4 }], total: 1 });
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(4);
    });

    it('should return 0 when no conversations', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(0);
    });

    it('should return 0 on database errors', async () => {
      mockDatabases.listDocuments.mockRejectedValue(new Error('select failed'));
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(0);
    });
  });
});
