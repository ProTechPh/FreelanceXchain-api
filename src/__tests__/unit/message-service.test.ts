// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockEmitToUser = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  notificationEmitter: { emitToUser: mockEmitToUser },
  sendNotificationToUser: jest.fn(),
}));

const mockFindConversation = jest.fn<any>();
const mockCreateConversation = jest.fn<any>();
const mockCreateMessage = jest.fn<any>();
const mockUpdateConversation = jest.fn<any>();
const mockGetUserConversations = jest.fn<any>();
const mockGetConversationMessages = jest.fn<any>();
const mockMarkMessagesAsRead = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/repositories/message-repository.ts'), () => ({
  messageRepository: {
    findConversation: mockFindConversation,
    createConversation: mockCreateConversation,
    createMessage: mockCreateMessage,
    updateConversation: mockUpdateConversation,
    getUserConversations: mockGetUserConversations,
    getConversationMessages: mockGetConversationMessages,
    markMessagesAsRead: mockMarkMessagesAsRead,
    getUnreadCount: mockGetUnreadCount,
  },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: jest.fn().mockReturnValue('generated-id'),
}));

describe('Message Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/message-service.js');
  };

  describe('sendMessage', () => {
    it('should send message to existing conversation', async () => {
      const { sendMessage } = await importModule();

      // resolveReceiverUserId - user exists
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'receiver-1' }], rowCount: 1 });
      // findConversation
      const conversation = { id: 'conv-1', participant1_id: 'sender-1', participant2_id: 'receiver-1', unread_count_2: 0 };
      mockFindConversation.mockResolvedValueOnce(conversation);
      // createMessage
      const message = { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'sender-1', receiver_id: 'receiver-1', content: 'Hello' };
      mockCreateMessage.mockResolvedValueOnce(message);
      // updateConversation
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: 'Hello',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(message);
      expect(mockEmitToUser).toHaveBeenCalledWith('receiver-1', expect.any(Object));
    });

    it('should create new conversation if none exists', async () => {
      const { sendMessage } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'receiver-1' }], rowCount: 1 });
      mockFindConversation.mockResolvedValueOnce(null);
      const newConv = { id: 'conv-new', participant1_id: 'sender-1', participant2_id: 'receiver-1', unread_count_2: 0 };
      mockCreateConversation.mockResolvedValueOnce(newConv);
      const message = { id: 'msg-1', content: 'Hi' };
      mockCreateMessage.mockResolvedValueOnce(message);
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: 'Hi',
      });

      expect(result.success).toBe(true);
      expect(mockCreateConversation).toHaveBeenCalled();
    });

    it('should increment unread_count_1 when sender is participant2', async () => {
      const { sendMessage } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'receiver-1' }], rowCount: 1 });
      const conversation = { id: 'conv-1', participant1_id: 'receiver-1', participant2_id: 'sender-1', unread_count_1: 2 };
      mockFindConversation.mockResolvedValueOnce(conversation);
      mockCreateMessage.mockResolvedValueOnce({ id: 'msg-1' });
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: 'Hello',
      });

      expect(result.success).toBe(true);
      expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', expect.objectContaining({ unread_count_1: 3 }));
    });

    it('should fail when content is empty', async () => {
      const { sendMessage } = await importModule();

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: '',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should fail when content is whitespace only', async () => {
      const { sendMessage } = await importModule();

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should fail when receiver not found', async () => {
      const { sendMessage } = await importModule();

      // User not found
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Profile tables not found
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'nonexistent',
        content: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('RECEIVER_NOT_FOUND');
    });

    it('should resolve receiver from freelancer profile', async () => {
      const { sendMessage } = await importModule();

      // User not found directly
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Found in freelancer_profiles
      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'actual-user-id' }], rowCount: 1 });
      mockFindConversation.mockResolvedValueOnce(null);
      const newConv = { id: 'conv-new', participant1_id: 'sender-1', participant2_id: 'actual-user-id', unread_count_2: 0 };
      mockCreateConversation.mockResolvedValueOnce(newConv);
      mockCreateMessage.mockResolvedValueOnce({ id: 'msg-1' });
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'profile-id',
        content: 'Hello',
      });

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { sendMessage } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: 'Hello',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('RECEIVER_NOT_FOUND');
    });
  });

  describe('getConversations', () => {
    it('should return enriched conversations', async () => {
      const { getConversations } = await importModule();

      const conversations = [
        { id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2', last_message_at: '2025-01-01' },
      ];
      mockGetUserConversations.mockResolvedValueOnce({ items: conversations, total: 1 });
      // Enrich with user details
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-2', name: 'Bob', email: 'bob@test.com' }], rowCount: 1 });

      const result = await getConversations('user-1');

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].otherUser.name).toBe('Bob');
    });

    it('should skip conversations with missing participants', async () => {
      const { getConversations } = await importModule();

      const conversations = [
        { id: 'conv-1', participant1_id: 'user-1', participant2_id: 'deleted-user' },
        { id: 'conv-2', participant1_id: 'user-1', participant2_id: 'user-2' },
      ];
      mockGetUserConversations.mockResolvedValueOnce({ items: conversations, total: 2 });
      // First user not found
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Second user found
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-2', name: 'Bob', email: 'bob@test.com' }], rowCount: 1 });

      const result = await getConversations('user-1');

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
    });

    it('should handle pagination options', async () => {
      const { getConversations } = await importModule();

      mockGetUserConversations.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await getConversations('user-1', { page: 2, limit: 10 });

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { getConversations } = await importModule();

      mockGetUserConversations.mockRejectedValueOnce(new Error('DB error'));

      const result = await getConversations('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getConversationMessages', () => {
    it('should return messages for authorized user', async () => {
      const { getConversationMessages } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ participant1_id: 'user-1', participant2_id: 'user-2' }], rowCount: 1 });
      const messages = [{ id: 'msg-1', content: 'Hello' }, { id: 'msg-2', content: 'Hi' }];
      mockGetConversationMessages.mockResolvedValueOnce({ items: messages, total: 2 });

      const result = await getConversationMessages('conv-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(2);
    });

    it('should fail when conversation not found', async () => {
      const { getConversationMessages } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getConversationMessages('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should fail when user is not a participant', async () => {
      const { getConversationMessages } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ participant1_id: 'user-1', participant2_id: 'user-2' }], rowCount: 1 });

      const result = await getConversationMessages('conv-1', 'outsider');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getConversationMessages } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getConversationMessages('conv-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('markConversationAsRead', () => {
    it('should mark conversation as read for participant1', async () => {
      const { markConversationAsRead } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ participant1_id: 'user-1', participant2_id: 'user-2' }], rowCount: 1 });
      mockMarkMessagesAsRead.mockResolvedValueOnce(undefined);
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await markConversationAsRead('conv-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { unread_count_1: 0 });
    });

    it('should mark conversation as read for participant2', async () => {
      const { markConversationAsRead } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ participant1_id: 'user-1', participant2_id: 'user-2' }], rowCount: 1 });
      mockMarkMessagesAsRead.mockResolvedValueOnce(undefined);
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await markConversationAsRead('conv-1', 'user-2');

      expect(result.success).toBe(true);
      expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { unread_count_2: 0 });
    });

    it('should fail when conversation not found', async () => {
      const { markConversationAsRead } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await markConversationAsRead('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should fail when user is not a participant', async () => {
      const { markConversationAsRead } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ participant1_id: 'user-1', participant2_id: 'user-2' }], rowCount: 1 });

      const result = await markConversationAsRead('conv-1', 'outsider');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { markConversationAsRead } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await markConversationAsRead('conv-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getUnreadMessageCount', () => {
    it('should return unread count', async () => {
      const { getUnreadMessageCount } = await importModule();

      mockGetUnreadCount.mockResolvedValueOnce(5);

      const result = await getUnreadMessageCount('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(5);
    });

    it('should handle database errors', async () => {
      const { getUnreadMessageCount } = await importModule();

      mockGetUnreadCount.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUnreadMessageCount('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('validateConversationParticipants', () => {
    it('should identify valid and orphaned conversations', async () => {
      const { validateConversationParticipants } = await importModule();

      const conversations = [
        { id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2' },
        { id: 'conv-2', participant1_id: 'user-1', participant2_id: 'deleted-user' },
      ];
      mockGetUserConversations.mockResolvedValueOnce({ items: conversations, total: 2 });
      // conv-1: both exist
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-2' }], rowCount: 1 });
      // conv-2: participant2 missing
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await validateConversationParticipants('user-1');

      expect(result.success).toBe(true);
      expect(result.data.validConversations).toHaveLength(1);
      expect(result.data.orphanedConversations).toHaveLength(1);
    });

    it('should handle database errors', async () => {
      const { validateConversationParticipants } = await importModule();

      mockGetUserConversations.mockRejectedValueOnce(new Error('DB error'));

      const result = await validateConversationParticipants('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
