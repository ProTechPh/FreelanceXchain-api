import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { messageRepository } = await import('../../repositories/message-repository.js');

describe('MessageRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createConversation', () => {
    it('should create and return a conversation', async () => {
      const conv = { id: 'c1', participant1_id: 'u1', participant2_id: 'u2' };
      mockAppwriteResult({ data: conv });
      const result = await messageRepository.createConversation('u1', 'u2');
      expect(result).toEqual(conv);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(messageRepository.createConversation('u1', 'u2')).rejects.toThrow('insert failed');
    });
  });

  describe('findConversation', () => {
    it('should return a conversation', async () => {
      const conv = { id: 'c1', participant1_id: 'u1', participant2_id: 'u2' };
      mockAppwriteResult({ data: conv });
      const result = await messageRepository.findConversation('u1', 'u2');
      expect(result).toEqual(conv);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await messageRepository.findConversation('u1', 'u2');
      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockAppwriteResult({ error: { message: 'db error' } });
      await expect(messageRepository.findConversation('u1', 'u2')).rejects.toThrow('db error');
    });
  });

  describe('getUserConversations', () => {
    it('should return paginated conversations', async () => {
      const convs = [{ id: 'c1', total_count: '2' }, { id: 'c2', total_count: '2' }];
      mockPool.query.mockResolvedValueOnce({ rows: convs, rowCount: 2 });
      const result = await messageRepository.getUserConversations('u1', 10, 0);
      expect(result.items).toEqual(convs);
      expect(result.total).toBe(2);
    });

    it('should return empty when no conversations', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await messageRepository.getUserConversations('u1', 10, 0);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(messageRepository.getUserConversations('u1', 10, 0)).rejects.toThrow('select failed');
    });
  });

  describe('createMessage', () => {
    it('should create and return a message', async () => {
      const msg = { id: 'm1', conversation_id: 'c1', content: 'hello' };
      mockAppwriteResult({ data: msg });
      const result = await messageRepository.createMessage({ conversation_id: 'c1', sender_id: 'u1', receiver_id: 'u2', content: 'hello', is_read: false } as any);
      expect(result).toEqual(msg);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(messageRepository.createMessage({} as any)).rejects.toThrow('insert failed');
    });
  });

  describe('getConversationMessages', () => {
    it('should return paginated messages', async () => {
      const msgs = [{ id: 'm1', total_count: '2' }, { id: 'm2', total_count: '2' }];
      mockPool.query.mockResolvedValueOnce({ rows: msgs, rowCount: 2 });
      const result = await messageRepository.getConversationMessages('c1', 10, 0);
      expect(result.items).toEqual(msgs);
      expect(result.total).toBe(2);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(messageRepository.getConversationMessages('c1', 10, 0)).rejects.toThrow('select failed');
    });
  });

  describe('markMessagesAsRead', () => {
    it('should mark messages as read successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(messageRepository.markMessagesAsRead('c1', 'u2')).resolves.toBeUndefined();
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('update failed'));
      await expect(messageRepository.markMessagesAsRead('c1', 'u2')).rejects.toThrow('update failed');
    });
  });

  describe('updateConversation', () => {
    it('should update conversation successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(messageRepository.updateConversation('c1', { last_message_at: new Date().toISOString() })).resolves.toBeUndefined();
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('update failed'));
      await expect(messageRepository.updateConversation('c1', {})).rejects.toThrow('update failed');
    });
  });

  describe('getUnreadCount', () => {
    it('should sum unread counts for participant1', async () => {
      const convs = [
        { participant1_id: 'u1', participant2_id: 'u2', unread_count_1: 3, unread_count_2: 0 },
        { participant1_id: 'u1', participant2_id: 'u3', unread_count_1: 2, unread_count_2: 1 },
      ];
      mockAppwriteResult({ data: convs });
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(5);
    });

    it('should sum unread counts for participant2', async () => {
      const convs = [
        { participant1_id: 'u2', participant2_id: 'u1', unread_count_1: 3, unread_count_2: 4 },
      ];
      mockAppwriteResult({ data: convs });
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(4);
    });

    it('should return 0 when no conversations', async () => {
      mockAppwriteResult({ data: [] });
      const result = await messageRepository.getUnreadCount('u1');
      expect(result).toBe(0);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(messageRepository.getUnreadCount('u1')).rejects.toThrow('select failed');
    });
  });
});