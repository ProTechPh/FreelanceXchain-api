// @ts-nocheck
/**
 * Coverage for message-repository.ts branches.
 * Targets: ?? fallbacks, conditional spreads, string attachments parsing
 */
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

describe('MessageRepository - branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createConversation - ?? fallbacks for created_at/updated_at', () => {
    it('should use $createdAt when created_at is not in doc', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'c1',
        $createdAt: '2025-01-01T00:00:00.000Z',
        $updatedAt: '2025-01-01T00:00:00.000Z',
        participant1_id: 'u1',
        participant2_id: 'u2',
      });
      const result = await messageRepository.createConversation('u1', 'u2');
      expect(result.id).toBe('c1');
      expect(result.created_at).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should use created_at when present in doc', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'c1',
        $createdAt: '2025-01-01T00:00:00.000Z',
        $updatedAt: '2025-01-01T00:00:00.000Z',
        participant1_id: 'u1',
        participant2_id: 'u2',
        created_at: '2025-06-15T00:00:00.000Z',
        updated_at: '2025-06-15T00:00:00.000Z',
      });
      const result = await messageRepository.createConversation('u1', 'u2');
      expect(result.created_at).toBe('2025-06-15T00:00:00.000Z');
    });
  });

  describe('createMessage - object value stringification', () => {
    it('should stringify object values', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'm1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        conversation_id: 'c1',
        content: 'hello',
        metadata: '{"key":"value"}',
      });
      const result = await messageRepository.createMessage({
        conversation_id: 'c1',
        sender_id: 'u1',
        receiver_id: 'u2',
        content: 'hello',
        metadata: { key: 'value' },
        is_read: false,
      } as any);
      expect(result.id).toBe('m1');
    });

    it('should skip undefined values', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'm1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        conversation_id: 'c1',
        content: 'hello',
      });
      const result = await messageRepository.createMessage({
        conversation_id: 'c1',
        sender_id: 'u1',
        receiver_id: 'u2',
        content: 'hello',
        attachments: undefined,
        is_read: false,
      } as any);
      expect(result.id).toBe('m1');
      const callArgs = mockDatabases.createDocument.mock.calls[0][3];
      expect(callArgs.attachments).toBeUndefined();
    });
  });

  describe('getConversationMessages - attachments string parsing', () => {
    it('should parse attachments when string', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'm1',
            $createdAt: '2025-01-01',
            $updatedAt: '2025-01-01',
            conversation_id: 'c1',
            content: 'hello',
            attachments: '["file1.png","file2.pdf"]',
          },
        ],
        total: 1,
      });
      const result = await messageRepository.getConversationMessages('c1', 10, 0);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].attachments).toEqual(['file1.png', 'file2.pdf']);
    });

    it('should not parse attachments when already array', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'm1',
            $createdAt: '2025-01-01',
            $updatedAt: '2025-01-01',
            conversation_id: 'c1',
            content: 'hello',
            attachments: ['file1.png'],
          },
        ],
        total: 1,
      });
      const result = await messageRepository.getConversationMessages('c1', 10, 0);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].attachments).toEqual(['file1.png']);
    });
  });

  describe('getUserConversations - sort with null last_message_at', () => {
    it('should handle null last_message_at in sort', async () => {
      const convs = [
        { $id: 'c1', participant1_id: 'u1', participant2_id: 'u2', last_message_at: null },
        { $id: 'c2', participant1_id: 'u3', participant2_id: 'u1', last_message_at: '2025-01-02' },
      ];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [convs[0]], total: 1 })
        .mockResolvedValueOnce({ documents: [convs[1]], total: 1 });
      const result = await messageRepository.getUserConversations('u1', 10, 0);
      expect(result.items).toHaveLength(2);
    });
  });

  describe('findConversation - second query finds match', () => {
    it('should find conversation on second query when first returns empty', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({
          documents: [{ $id: 'c2', participant1_id: 'u2', participant2_id: 'u1' }],
          total: 1,
        });
      const result = await messageRepository.findConversation('u1', 'u2');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('c2');
    });
  });

  describe('getUnreadCount - falsy unread counts', () => {
    it('should handle falsy unread_count_1', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', unread_count_1: null }], total: 1 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(0);
    });

    it('should handle falsy unread_count_2', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [{ $id: 'c1', unread_count_2: null }], total: 1 });
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(0);
    });
  });

  describe('updateConversation - filters out disallowed columns', () => {
    it('should not include id, created_at in updates but always set updated_at', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({ $id: 'c1' });
      await messageRepository.updateConversation('c1', {
        id: 'c1',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
        last_message_at: '2025-06-15',
        unread_count_1: 5,
        unread_count_2: 3,
      } as any);
      const callArgs = mockDatabases.updateDocument.mock.calls[0][3];
      expect(callArgs.id).toBeUndefined();
      expect(callArgs.created_at).toBeUndefined();
      // updated_at is always set by the function
      expect(callArgs.updated_at).toBeDefined();
      expect(callArgs.last_message_at).toBe('2025-06-15');
      expect(callArgs.unread_count_1).toBe(5);
      expect(callArgs.unread_count_2).toBe(3);
    });
  });
});
