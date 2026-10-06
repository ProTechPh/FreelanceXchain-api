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

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: jest.fn().mockReturnValue('generated-id'),
}));

const mockUserRepo = {
  getUserById: jest.fn<any>(),
};

const mockFreelancerProfileRepo = {
  getById: jest.fn<any>(),
};

const mockEmployerProfileRepo = {
  getById: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: mockEmployerProfileRepo,
}));

const mockFindConversation = jest.fn<any>();
const mockCreateConversation = jest.fn<any>();
const mockCreateMessage = jest.fn<any>();
const mockUpdateConversation = jest.fn<any>();
const mockGetUserConversations = jest.fn<any>();
const mockGetConversationMessages = jest.fn<any>();
const mockMarkMessagesAsRead = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();
const mockGetConversationById = jest.fn<any>().mockResolvedValue(null);

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
    getConversationById: mockGetConversationById,
  },
}));

const mockCreateNotification = jest.fn<any>().mockResolvedValue({});
jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: {
    createNotification: mockCreateNotification,
  },
}));

const mockEmitToUser = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  notificationEmitter: { emitToUser: mockEmitToUser },
  sendNotificationToUser: jest.fn(),
}));

// email-delivery-service (BLF-13 email wiring): mocked so the real
// email-preference-service does not consume global mockDatabases responses.
const mockSendGatedEmail = jest.fn<any>().mockImplementation(async (_userId: string, _pref: string, fn: any) => {
  if (typeof fn === 'function') {
    return await fn({ email: 'user@example.com', name: 'User' });
  }
  return true;
});
jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
  sendGatedEmail: mockSendGatedEmail,
  sendMessageReceivedEmail: jest.fn<any>().mockResolvedValue({ success: true, data: { messageId: 'x' } }),
}));

// validateStoredAttachmentOwnership reads the real storage bucket before an
// attachment may be linked to a message; patch the singleton so the fixture can
// prove ownership without network access.
const mockStorageGetFile = jest.fn<any>();
const appwriteConfig = await import('../../config/appwrite.js');
Object.assign(appwriteConfig.storage, { getFile: mockStorageGetFile });

describe('Message Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks keeps implementations and pending once-queues, which leak
    // between tests; reset the repo/email/storage mocks to a known baseline.
    mockUserRepo.getUserById.mockReset();
    mockFreelancerProfileRepo.getById.mockReset();
    mockEmployerProfileRepo.getById.mockReset();
    mockGetConversationById.mockReset().mockResolvedValue(null);
    mockCreateNotification.mockReset().mockResolvedValue({});
    mockFindConversation.mockReset();
    mockCreateConversation.mockReset();
    mockCreateMessage.mockReset();
    mockUpdateConversation.mockReset();
    mockGetUserConversations.mockReset();
    mockGetConversationMessages.mockReset();
    mockMarkMessagesAsRead.mockReset();
    mockGetUnreadCount.mockReset();
    mockSendGatedEmail.mockReset().mockImplementation(async (_userId: string, _pref: string, fn: any) => {
      if (typeof fn === 'function') {
        return await fn({ email: 'user@example.com', name: 'User' });
      }
      return true;
    });
    mockStorageGetFile.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/message-service.js');
  };

  describe('sendMessage', () => {
    it('should send message to existing conversation', async () => {
      const { sendMessage } = await importModule();

      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'receiver-1' });
      const conversation = { id: 'conv-1', participant1_id: 'sender-1', participant2_id: 'receiver-1', unread_count_2: 0 };
      mockFindConversation.mockResolvedValueOnce(conversation);
      const message = { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'sender-1', receiver_id: 'receiver-1', content: 'Hello' };
      mockCreateMessage.mockResolvedValueOnce(message);
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: 'Hello',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(message);
      expect(mockEmitToUser).toHaveBeenCalledWith('receiver-1', expect.any(Object));
      // BLF-13: the receiver gets a preference-gated message-received email
      expect(mockSendGatedEmail).toHaveBeenCalledWith(
        'receiver-1',
        'message_received',
        expect.any(Function)
      );
    });

    it('should create new conversation if none exists', async () => {
      const { sendMessage } = await importModule();

      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'receiver-1' });
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

      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'receiver-1' });
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

      // User not found directly
      mockUserRepo.getUserById.mockResolvedValueOnce(null);
      // Freelancer profile not found
      mockFreelancerProfileRepo.getById.mockResolvedValueOnce(null);
      // Employer profile not found
      mockEmployerProfileRepo.getById.mockResolvedValueOnce(null);

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
      mockUserRepo.getUserById.mockResolvedValueOnce(null);
      // Found in freelancer_profiles
      mockFreelancerProfileRepo.getById.mockResolvedValueOnce({ user_id: 'actual-user-id' });
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

      mockUserRepo.getUserById.mockRejectedValueOnce(new Error('DB error'));

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
      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-2', name: 'Bob', email: 'bob@test.com' });

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
      mockUserRepo.getUserById.mockResolvedValueOnce(null);
      // Second user found
      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-2', name: 'Bob', email: 'bob@test.com' });

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

      mockGetUserConversations.mockResolvedValueOnce({
        items: [{ id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2' }],
        total: 1,
      });
      const messages = [{ id: 'msg-1', content: 'Hello' }, { id: 'msg-2', content: 'Hi' }];
      mockGetConversationMessages.mockResolvedValueOnce({ items: messages, total: 2 });

      const result = await getConversationMessages('conv-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(2);
    });

    it('should fail when conversation not found', async () => {
      const { getConversationMessages } = await importModule();

      mockGetUserConversations.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await getConversationMessages('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should fail when user is not a participant', async () => {
      const { getConversationMessages } = await importModule();

      mockGetUserConversations.mockResolvedValueOnce({
        items: [{ id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2' }],
        total: 1,
      });

      const result = await getConversationMessages('conv-1', 'outsider');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getConversationMessages } = await importModule();

      mockGetUserConversations.mockRejectedValueOnce(new Error('DB error'));

      const result = await getConversationMessages('conv-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('markConversationAsRead', () => {
    it('should mark conversation as read for participant1', async () => {
      const { markConversationAsRead } = await importModule();

      mockGetUserConversations.mockResolvedValueOnce({
        items: [{ id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2' }],
        total: 1,
      });
      mockMarkMessagesAsRead.mockResolvedValueOnce(undefined);
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await markConversationAsRead('conv-1', 'user-1');

      expect(result.success).toBe(true);
      expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { unread_count_1: 0 });
    });

    it('should mark conversation as read for participant2', async () => {
      const { markConversationAsRead } = await importModule();

      mockGetUserConversations.mockResolvedValueOnce({
        items: [{ id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2' }],
        total: 1,
      });
      mockMarkMessagesAsRead.mockResolvedValueOnce(undefined);
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await markConversationAsRead('conv-1', 'user-2');

      expect(result.success).toBe(true);
      expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', { unread_count_2: 0 });
    });

    it('should fail when conversation not found', async () => {
      const { markConversationAsRead } = await importModule();

      mockGetUserConversations.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await markConversationAsRead('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should fail when user is not a participant', async () => {
      const { markConversationAsRead } = await importModule();

      mockGetUserConversations.mockResolvedValueOnce({
        items: [{ id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2' }],
        total: 1,
      });

      const result = await markConversationAsRead('conv-1', 'outsider');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { markConversationAsRead } = await importModule();

      mockGetUserConversations.mockRejectedValueOnce(new Error('DB error'));

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
      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-1' });
      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-2' });
      // conv-2: participant2 missing
      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-1' });
      mockUserRepo.getUserById.mockResolvedValueOnce(null);

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

// ═══════════════════════════════════════════════════════════════
// Branch coverage: message-repository.ts line 106
// last_message_at falsy/undefined in sort comparator
// ═══════════════════════════════════════════════════════════════

describe('Message Service - Branch Coverage (last_message_at)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepo.getUserById.mockReset();
    mockFreelancerProfileRepo.getById.mockReset();
    mockEmployerProfileRepo.getById.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/message-service.js');
  };

  it('should handle conversations where last_message_at is undefined (line 106)', async () => {
    const { getConversations } = await importModule();

    const conversations = [
      { id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2', last_message_at: undefined },
      { id: 'conv-2', participant1_id: 'user-1', participant2_id: 'user-3', last_message_at: '2025-06-01' },
      { id: 'conv-3', participant1_id: 'user-1', participant2_id: 'user-4', last_message_at: undefined },
    ];
    mockGetUserConversations.mockResolvedValueOnce({ items: conversations, total: 3 });
    mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-2', name: 'Bob', email: 'bob@test.com' });
    mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-3', name: 'Charlie', email: 'charlie@test.com' });
    mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-4', name: 'Dave', email: 'dave@test.com' });

    const result = await getConversations('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(3);
      expect(result.data.items.some((c: any) => c.id === 'conv-2')).toBe(true);
    }
  });

  it('should handle conversations where last_message_at is null', async () => {
    const { getConversations } = await importModule();

    const conversations = [
      { id: 'conv-1', participant1_id: 'user-1', participant2_id: 'user-2', last_message_at: null },
      { id: 'conv-2', participant1_id: 'user-1', participant2_id: 'user-3', last_message_at: '' },
    ];
    mockGetUserConversations.mockResolvedValueOnce({ items: conversations, total: 2 });
    mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-2', name: 'Bob', email: 'bob@test.com' });
    mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'user-3', name: 'Charlie', email: 'charlie@test.com' });

    const result = await getConversations('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
    }
  });
});

describe('Message Service - Attachments Branch Coverage', () => {
  const importModule = async () => {
    return await import('../../services/message-service.js');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepo.getUserById.mockReset();
    mockFreelancerProfileRepo.getById.mockReset();
    mockEmployerProfileRepo.getById.mockReset();
  });

  it('L100: sendMessage without attachments omits field via spread', async () => {
    const { sendMessage } = await importModule();

    mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'receiver-1' });
    const conversation = { id: 'conv-1', participant1_id: 'sender-1', participant2_id: 'receiver-1', unread_count_2: 0 };
    mockFindConversation.mockResolvedValueOnce(conversation);
    const message = { id: 'msg-1', conversation_id: 'conv-1', sender_id: 'sender-1', receiver_id: 'receiver-1', content: 'Hello' };
    mockCreateMessage.mockResolvedValueOnce(message);
    mockUpdateConversation.mockResolvedValueOnce(undefined);

    // Send message WITHOUT attachments property
    const result = await sendMessage({
      senderId: 'sender-1',
      receiverId: 'receiver-1',
      content: 'Hello',
    });

    expect(result.success).toBe(true);
    const callArgs = mockCreateMessage.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('attachments');
  });

  it('L100: sendMessage with attachments includes field via spread', async () => {
    const { sendMessage } = await importModule();

    mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'receiver-1' });
    const conversation = { id: 'conv-2', participant1_id: 'sender-1', participant2_id: 'receiver-1', unread_count_2: 0 };
    mockFindConversation.mockResolvedValueOnce(conversation);
    const message = { id: 'msg-2', conversation_id: 'conv-2', sender_id: 'sender-1', receiver_id: 'receiver-1', content: 'See attached' };
    mockCreateMessage.mockResolvedValueOnce(message);
    mockUpdateConversation.mockResolvedValueOnce(undefined);
    mockStorageGetFile.mockImplementation(async (_bucket: string, fileId: string) => ({
      name: `sender-1_${fileId}_file.pdf`,
      sizeOriginal: 12345,
      mimeType: 'application/pdf',
    }));

    const result = await sendMessage({
      senderId: 'sender-1',
      receiverId: 'receiver-1',
      content: 'See attached',
      attachments: [{
        url: '/api/files/access/project-attachments/msg-file-id',
        filename: 'file.pdf',
        name: 'file.pdf',
        type: 'application/pdf',
        size: 12345,
        mimeType: 'application/pdf',
      }],
    });

    expect(result.success).toBe(true);
    const callArgs = mockCreateMessage.mock.calls[0][0];
    expect(callArgs).toHaveProperty('attachments');
  });

  describe('Message Service - Additional Edge Cases', () => {
    it('should resolve receiver from employer profile when user and freelancer profile not found', async () => {
      const { sendMessage } = await importModule();

      mockUserRepo.getUserById.mockResolvedValueOnce(null);
      mockFreelancerProfileRepo.getById.mockResolvedValueOnce(null);
      mockEmployerProfileRepo.getById.mockResolvedValueOnce({ user_id: 'employer-user-id' });
      mockFindConversation.mockResolvedValueOnce(null);
      mockCreateConversation.mockResolvedValueOnce({
        id: 'conv-emp',
        participant1_id: 'sender-1',
        participant2_id: 'employer-user-id',
        unread_count_2: 0,
      });
      mockCreateMessage.mockResolvedValueOnce({ id: 'msg-emp' });
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'emp-profile-id',
        content: 'Hello Employer',
      });

      expect(result.success).toBe(true);
    });

    it('should continue successfully when persisting message notification in DB fails', async () => {
      const { sendMessage } = await importModule();

      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'receiver-1' });
      mockFindConversation.mockResolvedValueOnce({
        id: 'conv-notif',
        participant1_id: 'sender-1',
        participant2_id: 'receiver-1',
        unread_count_2: 0,
      });
      mockCreateMessage.mockResolvedValueOnce({ id: 'msg-notif' });
      mockUpdateConversation.mockResolvedValueOnce(undefined);
      mockCreateNotification.mockRejectedValueOnce(new Error('Notification DB failure'));

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: 'Hello with failing notif',
      });

      expect(result.success).toBe(true);
    });

    it('should return INTERNAL_ERROR when database throws during sendMessage', async () => {
      const { sendMessage } = await importModule();

      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'receiver-1' });
      mockFindConversation.mockRejectedValueOnce(new Error('Unexpected DB crash'));

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: 'Crash message',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });

    it('should catch error and log warning when email delivery fails in maybeSendMessageEmailNotification', async () => {
      const { sendMessage } = await importModule();

      mockUserRepo.getUserById.mockResolvedValueOnce({ id: 'receiver-1' });
      mockFindConversation.mockResolvedValueOnce({
        id: 'conv-email-err',
        participant1_id: 'sender-1',
        participant2_id: 'receiver-1',
        unread_count_2: 0,
        last_message_at: null,
      });
      mockCreateMessage.mockResolvedValueOnce({ id: 'msg-email-err' });
      mockUpdateConversation.mockResolvedValueOnce(undefined);
      mockSendGatedEmail.mockRejectedValueOnce(new Error('Email service failure'));

      const result = await sendMessage({
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        content: 'Email error test',
      });

      expect(result.success).toBe(true);
    });

    it('should skip conversation when error occurs fetching user details in getConversations', async () => {
      const { getConversations } = await importModule();

      const conversations = [
        { id: 'conv-good', participant1_id: 'user-1', participant2_id: 'user-good-fresh', last_message_at: '2025-01-01' },
        { id: 'conv-bad', participant1_id: 'user-1', participant2_id: 'user-bad-fresh', last_message_at: '2025-01-01' },
      ];
      mockGetUserConversations.mockResolvedValueOnce({ items: conversations, total: 2 });
      mockUserRepo.getUserById
        .mockResolvedValueOnce({ id: 'user-good-fresh', name: 'Bob Fresh', email: 'bob@test.com' })
        .mockRejectedValueOnce(new Error('User fetch failed'));

      const result = await getConversations('user-1');

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].id).toBe('conv-good');
    });

    it('should fetch conversation directly using getConversationById in getConversationMessages', async () => {
      const { getConversationMessages } = await importModule();

      mockGetConversationById.mockResolvedValueOnce({
        id: 'conv-direct',
        participant1_id: 'user-1',
        participant2_id: 'user-2',
      });
      mockGetConversationMessages.mockResolvedValueOnce({
        items: [{ id: 'msg-direct', content: 'Direct conv message' }],
        total: 1,
      });

      const result = await getConversationMessages('conv-direct', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
    });

    it('should fetch conversation directly using getConversationById in markConversationAsRead', async () => {
      const { markConversationAsRead } = await importModule();

      mockGetConversationById.mockResolvedValueOnce({
        id: 'conv-read-direct',
        participant1_id: 'user-1',
        participant2_id: 'user-2',
      });
      mockMarkMessagesAsRead.mockResolvedValueOnce(undefined);
      mockUpdateConversation.mockResolvedValueOnce(undefined);

      const result = await markConversationAsRead('conv-read-direct', 'user-1');

      expect(result.success).toBe(true);
      expect(mockUpdateConversation).toHaveBeenCalledWith('conv-read-direct', { unread_count_1: 0 });
    });
  });
});
