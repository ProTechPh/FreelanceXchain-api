// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockPool = { query: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

const mockMessageRepository = {
  findConversation: jest.fn<any>(),
  createConversation: jest.fn<any>(),
  createMessage: jest.fn<any>(),
  updateConversation: jest.fn<any>(),
  getUserConversations: jest.fn<any>(),
  getConversationMessages: jest.fn<any>(),
  markMessagesAsRead: jest.fn<any>(),
  getUnreadCount: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/message-repository.ts'), () => ({
  messageRepository: mockMessageRepository,
}));

const mockNotificationEmitter = { emitToUser: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  notificationEmitter: mockNotificationEmitter,
}));

const {
  sendMessage,
  getConversations,
  getConversationMessages,
  markConversationAsRead,
  getUnreadMessageCount,
} = await import('../../services/message-service.js');

describe('Message Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should return VALIDATION_ERROR for empty content', async () => {
      const result = await sendMessage({ senderId: 'u-1', receiverId: 'u-2', content: '' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return RECEIVER_NOT_FOUND when receiver does not exist', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await sendMessage({ senderId: 'u-1', receiverId: 'u-2', content: 'Hello' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('RECEIVER_NOT_FOUND');
    });

    it('should send message successfully with new conversation', async () => {
      // resolveReceiverUserId - user found
      mockPool.query.mockResolvedValue({ rows: [{ id: 'u-2' }] });
      mockMessageRepository.findConversation.mockResolvedValue(null);
      mockMessageRepository.createConversation.mockResolvedValue({
        id: 'conv-1', participant1_id: 'u-1', participant2_id: 'u-2',
        unread_count_1: 0, unread_count_2: 0,
      });
      mockMessageRepository.createMessage.mockResolvedValue({ id: 'msg-1', content: 'Hello' });
      mockMessageRepository.updateConversation.mockResolvedValue(undefined);

      const result = await sendMessage({ senderId: 'u-1', receiverId: 'u-2', content: 'Hello' });
      expect(result.success).toBe(true);
      expect(mockNotificationEmitter.emitToUser).toHaveBeenCalled();
    });

    it('should send message with existing conversation (participant2 sends)', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 'u-1' }] });
      mockMessageRepository.findConversation.mockResolvedValue({
        id: 'conv-1', participant1_id: 'u-1', participant2_id: 'u-2',
        unread_count_1: 0, unread_count_2: 0,
      });
      mockMessageRepository.createMessage.mockResolvedValue({ id: 'msg-1', content: 'Hi' });
      mockMessageRepository.updateConversation.mockResolvedValue(undefined);

      const result = await sendMessage({ senderId: 'u-2', receiverId: 'u-1', content: 'Hi' });
      expect(result.success).toBe(true);
    });

    it('should return RECEIVER_NOT_FOUND when receiver lookup throws', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));
      const result = await sendMessage({ senderId: 'u-1', receiverId: 'u-2', content: 'Hello' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('RECEIVER_NOT_FOUND');
    });

    it('should handle unexpected error during message creation', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 'u-2' }] });
      mockMessageRepository.findConversation.mockRejectedValue(new Error('DB error'));
      const result = await sendMessage({ senderId: 'u-1', receiverId: 'u-2', content: 'Hello' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getConversations', () => {
    it('should return enriched conversations', async () => {
      mockMessageRepository.getUserConversations.mockResolvedValue({
        items: [{ id: 'conv-1', participant1_id: 'u-1', participant2_id: 'u-2' }],
        total: 1,
      });
      mockPool.query.mockResolvedValue({ rows: [{ id: 'u-2', name: 'User 2', email: 'u2@test.com' }] });

      const result = await getConversations('u-1');
      expect(result.success).toBe(true);
    });

    it('should skip conversations with missing participants', async () => {
      mockMessageRepository.getUserConversations.mockResolvedValue({
        items: [{ id: 'conv-1', participant1_id: 'u-1', participant2_id: 'u-2' }],
        total: 1,
      });
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await getConversations('u-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.items.length).toBe(0);
    });

    it('should handle error fetching user details', async () => {
      mockMessageRepository.getUserConversations.mockResolvedValue({
        items: [{ id: 'conv-1', participant1_id: 'u-1', participant2_id: 'u-2' }],
        total: 1,
      });
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const result = await getConversations('u-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.items.length).toBe(0);
    });

    it('should handle unexpected error', async () => {
      mockMessageRepository.getUserConversations.mockRejectedValue(new Error('DB error'));
      const result = await getConversations('u-1');
      expect(result.success).toBe(false);
    });
  });

  describe('getConversationMessages', () => {
    it('should return CONVERSATION_NOT_FOUND', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await getConversationMessages('conv-1', 'u-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not participant', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ participant1_id: 'u-1', participant2_id: 'u-2' }] });
      const result = await getConversationMessages('conv-1', 'outsider');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return messages on success', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ participant1_id: 'u-1', participant2_id: 'u-2' }] });
      mockMessageRepository.getConversationMessages.mockResolvedValue({ items: [{ id: 'msg-1' }], total: 1 });
      const result = await getConversationMessages('conv-1', 'u-1');
      expect(result.success).toBe(true);
    });

    it('should handle unexpected error', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));
      const result = await getConversationMessages('conv-1', 'u-1');
      expect(result.success).toBe(false);
    });
  });

  describe('markConversationAsRead', () => {
    it('should return CONVERSATION_NOT_FOUND', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await markConversationAsRead('conv-1', 'u-1');
      expect(result.success).toBe(false);
    });

    it('should return UNAUTHORIZED when user is not participant', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ participant1_id: 'u-1', participant2_id: 'u-2' }] });
      const result = await markConversationAsRead('conv-1', 'outsider');
      expect(result.success).toBe(false);
    });

    it('should mark as read for participant1', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ participant1_id: 'u-1', participant2_id: 'u-2' }] });
      mockMessageRepository.markMessagesAsRead.mockResolvedValue(undefined);
      mockMessageRepository.updateConversation.mockResolvedValue(undefined);
      const result = await markConversationAsRead('conv-1', 'u-1');
      expect(result.success).toBe(true);
    });

    it('should mark as read for participant2', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ participant1_id: 'u-1', participant2_id: 'u-2' }] });
      mockMessageRepository.markMessagesAsRead.mockResolvedValue(undefined);
      mockMessageRepository.updateConversation.mockResolvedValue(undefined);
      const result = await markConversationAsRead('conv-1', 'u-2');
      expect(result.success).toBe(true);
    });

    it('should handle unexpected error', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));
      const result = await markConversationAsRead('conv-1', 'u-1');
      expect(result.success).toBe(false);
    });
  });

  describe('getUnreadMessageCount', () => {
    it('should return count on success', async () => {
      mockMessageRepository.getUnreadCount.mockResolvedValue(5);
      const result = await getUnreadMessageCount('u-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(5);
    });

    it('should handle unexpected error', async () => {
      mockMessageRepository.getUnreadCount.mockRejectedValue(new Error('DB error'));
      const result = await getUnreadMessageCount('u-1');
      expect(result.success).toBe(false);
    });
  });
});
