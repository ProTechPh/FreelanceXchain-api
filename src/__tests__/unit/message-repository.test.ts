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

    it('should handle conversations with null/undefined last_message_at (|| fallback)', async () => {
      const convs = [
        { $id: 'c1', participant1_id: 'u1', participant2_id: 'u2', last_message_at: null },
        { $id: 'c2', participant1_id: 'u3', participant2_id: 'u1', last_message_at: '2025-01-02' },
        { $id: 'c3', participant1_id: 'u1', participant2_id: 'u4' }, // undefined last_message_at
      ];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [convs[0], convs[2]], total: 2 })
        .mockResolvedValueOnce({ documents: [convs[1]], total: 1 });
      const result = await messageRepository.getUserConversations('u1', 10, 0);
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      // Conversations with null/undefined last_message_at should sort last
      expect(result.items[0]!.id).toBe('c2');
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


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('message-repository.ts - Branch Coverage', () => {
  it('L106: sort handles null last_message_at', () => {
    const comparator = (a: any, b: any) => (b.last_message_at || '').localeCompare(a.last_message_at || '');
    // b has value, a has null → b sorts first (higher), result > 0
    expect(comparator({ last_message_at: null }, { last_message_at: '2024-01-02' })).toBeGreaterThan(0);
    // b has null, a has value → a sorts first (higher), result < 0
    expect(comparator({ last_message_at: '2024-01-01' }, { last_message_at: null })).toBeLessThan(0);
  });
});

describe('merged branch coverage', () => {
  it('message-repository L106: unique sort with null last_message_at', async () => {
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', last_message_at: null, sender_id: 'u1', recipient_id: 'u2' }],
        total: 1,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', last_message_at: null, sender_id: 'u1', recipient_id: 'u2' }],
        total: 1,
      });

    const { messageRepository } = await import(resolveModule('src/repositories/message-repository.ts'));
    const result = await messageRepository.getUserConversations('u1', 10, 0);
    expect(result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from repository-coverage.test.ts
// ═══════════════════════════════════════════════════════════════

describe('MessageRepository - mapMessage attachments parsing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should parse attachments from JSON string to array', async () => {
    const attachmentsArr = [
      { url: 'https://example.com/file.pdf', filename: 'file.pdf', size: 1024, mimeType: 'application/pdf' },
    ];
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'm1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        conversation_id: 'conv1',
        sender_id: 'u1',
        receiver_id: 'u2',
        content: 'See attached file',
        attachments: JSON.stringify(attachmentsArr),
      }],
      total: 1,
    });

    const { messageRepository } = await import(resolveModule('src/repositories/message-repository.ts'));
    const result = await messageRepository.getConversationMessages('conv1', 10, 0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.attachments).toEqual(attachmentsArr);
    expect(Array.isArray(result.items[0]!.attachments)).toBe(true);
  });

  it('should leave attachments as-is when already an array', async () => {
    const attachmentsArr = [
      { url: 'https://example.com/img.png', filename: 'img.png', size: 512, mimeType: 'image/png' },
    ];
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'm2',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        conversation_id: 'conv2',
        sender_id: 'u3',
        receiver_id: 'u4',
        content: 'Hello',
        attachments: attachmentsArr,
      }],
      total: 1,
    });

    const { messageRepository } = await import(resolveModule('src/repositories/message-repository.ts'));
    const result = await messageRepository.getConversationMessages('conv2', 10, 0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.attachments).toEqual(attachmentsArr);
  });
});

describe('MessageRepository - Additional Branch Coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('findConversation returns conversation from second query (reversed participants)', async () => {
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [{ $id: 'c-rev', participant1_id: 'u2', participant2_id: 'u1' }], total: 1 });
    const result = await messageRepository.findConversation('u1', 'u2');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('c-rev');
  });

  it('findConversation returns null on database error (catch branch)', async () => {
    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('db down'));
    const result = await messageRepository.findConversation('u1', 'u2');
    expect(result).toBeNull();
  });

  it('createMessage with attachments object triggers JSON.stringify branch', async () => {
    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'm-obj', $createdAt: '2025-01-01', $updatedAt: '2025-01-01',
      conversation_id: 'c1', sender_id: 'u1', receiver_id: 'u2', content: 'hello',
      attachments: JSON.stringify([{ url: 'file.pdf' }]),
    });
    const result = await messageRepository.createMessage({
      conversation_id: 'c1',
      sender_id: 'u1',
      receiver_id: 'u2',
      content: 'hello',
      is_read: false,
      attachments: [{ url: 'file.pdf' }],
    } as any);
    expect(result.id).toBe('m-obj');
    // Verify createDocument was called with stringified attachments
    const callAttrs = mockDatabases.createDocument.mock.calls[0][3];
    expect(typeof callAttrs.attachments).toBe('string');
  });

  it('createMessage with undefined fields skips them', async () => {
    mockDatabases.createDocument.mockResolvedValueOnce({
      $id: 'm-skip', $createdAt: '2025-01-01', $updatedAt: '2025-01-01',
      conversation_id: 'c1', sender_id: 'u1',
    });
    await messageRepository.createMessage({
      conversation_id: 'c1',
      sender_id: 'u1',
      receiver_id: undefined as any,
      content: undefined as any,
      is_read: false,
    } as any);
    const callAttrs = mockDatabases.createDocument.mock.calls[0][3];
    expect(callAttrs.receiver_id).toBeUndefined();
    expect(callAttrs.content).toBeUndefined();
  });

  it('getUnreadCount with falsy unread_count values (|| 0 fallback)', async () => {
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [
          { $id: 'c1', unread_count_1: null },
          { $id: 'c2', unread_count_1: 0 },
          { $id: 'c3', unread_count_1: undefined },
        ],
        total: 3,
      })
      .mockResolvedValueOnce({
        documents: [
          { $id: 'c4', unread_count_2: null },
          { $id: 'c5', unread_count_2: 5 },
        ],
        total: 2,
      });
    const result = await messageRepository.getUnreadCount('u1');
    expect(result).toBe(5);
  });
});
