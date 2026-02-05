import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { MessageEntity } from '../../repositories/message-repository';
import { ContractEntity } from '../../repositories/contract-repository';
import { generateId } from '../../utils/id';

// In-memory stores for testing
let messageStore: Map<string, MessageEntity> = new Map();
let contractStore: Map<string, ContractEntity> = new Map();
let notificationStore: Array<any> = [];

// Mock the message repository
jest.unstable_mockModule('../../repositories/message-repository.js', () => ({
  MessageRepository: {
    create: jest.fn(async (message: MessageEntity) => {
      messageStore.set(message.id, message);
      return message;
    }),
    findByContractId: jest.fn(async (contractId: string, options?: any) => {
      const messages = Array.from(messageStore.values())
        .filter(m => m.contract_id === contractId)
        .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
      
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;
      
      return {
        items: messages.slice(offset, offset + limit),
        hasMore: (offset + limit) < messages.length,
        total: messages.length,
      };
    }),
    markAsRead: jest.fn(async (contractId: string, userId: string) => {
      for (const message of messageStore.values()) {
        if (message.contract_id === contractId && message.sender_id !== userId) {
          message.is_read = true;
        }
      }
    }),
    getUnreadCount: jest.fn(async (contractId: string, userId: string) => {
      return Array.from(messageStore.values())
        .filter(m => m.contract_id === contractId && m.sender_id !== userId && !m.is_read)
        .length;
    }),
    getLatestMessage: jest.fn(async (contractId: string) => {
      const messages = Array.from(messageStore.values())
        .filter(m => m.contract_id === contractId)
        .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
      return messages[0] || null;
    }),
  },
  MessageEntity: {} as MessageEntity,
  CreateMessageInput: {},
}));

// Mock the contract repository
jest.unstable_mockModule('../../repositories/contract-repository.js', () => ({
  contractRepository: {
    getContractById: jest.fn(async (id: string) => {
      return contractStore.get(id) || null;
    }),
  },
  ContractRepository: jest.fn(),
  ContractEntity: {} as ContractEntity,
}));

// Mock the notification service
jest.unstable_mockModule('../notification-service.js', () => ({
  createNotification: jest.fn(async (input: any) => {
    notificationStore.push(input);
    return { id: generateId(), ...input };
  }),
}));

// Import after mocking
const { MessageService } = await import('../message-service.js');

// Helper to create test contract
function createTestContract(overrides: Partial<ContractEntity> = {}): ContractEntity {
  const now = new Date().toISOString();
  const contract: ContractEntity = {
    id: generateId(),
    project_id: generateId(),
    freelancer_id: 'freelancer-1',
    employer_id: 'employer-1',
    proposal_id: generateId(),
    escrow_address: '0x' + '0'.repeat(40),
    total_amount: 1000,
    status: 'active',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  contractStore.set(contract.id, contract);
  return contract;
}

// Helper to create test message
function createTestMessage(overrides: Partial<MessageEntity> = {}): MessageEntity {
  const now = new Date().toISOString();
  const message: MessageEntity = {
    id: generateId(),
    contract_id: 'contract-1',
    sender_id: 'user-1',
    content: 'Test message',
    is_read: false,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  messageStore.set(message.id, message);
  return message;
}

// Custom arbitraries for property-based testing
const validMessageContentArbitrary = () =>
  fc.string({ minLength: 1, maxLength: 5000 }).filter(s => s.trim().length >= 1);

describe('Message Service', () => {
  beforeEach(() => {
    // Clear stores before each test
    messageStore.clear();
    contractStore.clear();
    notificationStore = [];
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      const contract = createTestContract();
      const input = {
        contractId: contract.id,
        senderId: contract.freelancer_id,
        content: 'Hello, this is a test message',
      };

      const result = await MessageService.sendMessage(input);

      expect(result).toBeDefined();
      expect(result.contract_id).toBe(input.contractId);
      expect(result.sender_id).toBe(input.senderId);
      expect(result.content).toBe(input.content);
      expect(result.is_read).toBe(false);
    });

    it('should create notification for recipient', async () => {
      const contract = createTestContract();
      const input = {
        contractId: contract.id,
        senderId: contract.freelancer_id,
        content: 'Hello employer',
      };

      await MessageService.sendMessage(input);

      expect(notificationStore.length).toBe(1);
      expect(notificationStore[0].userId).toBe(contract.employer_id);
      expect(notificationStore[0].type).toBe('message');
      expect(notificationStore[0].title).toBe('New Message');
    });

    it('should truncate long messages in notification', async () => {
      const contract = createTestContract();
      const longContent = 'A'.repeat(150);
      const input = {
        contractId: contract.id,
        senderId: contract.freelancer_id,
        content: longContent,
      };

      await MessageService.sendMessage(input);

      expect(notificationStore[0].message).toHaveLength(103); // 100 chars + '...'
      expect(notificationStore[0].message).toContain('...');
    });

    it('should fail when contract does not exist', async () => {
      const input = {
        contractId: 'non-existent-contract',
        senderId: 'user-1',
        content: 'Test message',
      };

      await expect(MessageService.sendMessage(input)).rejects.toThrow('Contract not found');
    });

    it('should fail when user is not part of contract', async () => {
      const contract = createTestContract();
      const input = {
        contractId: contract.id,
        senderId: 'unauthorized-user',
        content: 'Test message',
      };

      await expect(MessageService.sendMessage(input)).rejects.toThrow('User is not part of this contract');
    });

    it('should allow employer to send message', async () => {
      const contract = createTestContract();
      const input = {
        contractId: contract.id,
        senderId: contract.employer_id,
        content: 'Message from employer',
      };

      const result = await MessageService.sendMessage(input);

      expect(result.sender_id).toBe(contract.employer_id);
      expect(notificationStore[0].userId).toBe(contract.freelancer_id);
    });

    it('should allow freelancer to send message', async () => {
      const contract = createTestContract();
      const input = {
        contractId: contract.id,
        senderId: contract.freelancer_id,
        content: 'Message from freelancer',
      };

      const result = await MessageService.sendMessage(input);

      expect(result.sender_id).toBe(contract.freelancer_id);
      expect(notificationStore[0].userId).toBe(contract.employer_id);
    });

    it('should handle various message contents (property-based)', async () => {
      await fc.assert(
        fc.asyncProperty(validMessageContentArbitrary(), async (content) => {
          messageStore.clear();
          contractStore.clear();
          notificationStore = [];

          const contract = createTestContract();
          const input = {
            contractId: contract.id,
            senderId: contract.freelancer_id,
            content,
          };

          const result = await MessageService.sendMessage(input);

          expect(result.content).toBe(content);
        }),
        { numRuns: 20 }
      );
    });

    it('should handle special characters in message content', async () => {
      const contract = createTestContract();
      const input = {
        contractId: contract.id,
        senderId: contract.freelancer_id,
        content: 'Hello! 👋 How are you? 😊 Let\'s discuss the project @ 3pm.',
      };

      const result = await MessageService.sendMessage(input);

      expect(result.content).toBe(input.content);
    });

    it('should handle multiline messages', async () => {
      const contract = createTestContract();
      const input = {
        contractId: contract.id,
        senderId: contract.freelancer_id,
        content: 'Line 1\nLine 2\nLine 3',
      };

      const result = await MessageService.sendMessage(input);

      expect(result.content).toBe(input.content);
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages for a contract', async () => {
      const contract = createTestContract();
      
      // Create some messages
      createTestMessage({ contract_id: contract.id, sender_id: contract.freelancer_id, content: 'Message 1' });
      createTestMessage({ contract_id: contract.id, sender_id: contract.employer_id, content: 'Message 2' });
      createTestMessage({ contract_id: contract.id, sender_id: contract.freelancer_id, content: 'Message 3' });

      const result = await MessageService.getMessages(contract.id, contract.freelancer_id);

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should fail when contract does not exist', async () => {
      await expect(
        MessageService.getMessages('non-existent-contract', 'user-1')
      ).rejects.toThrow('Contract not found');
    });

    it('should fail when user is not part of contract', async () => {
      const contract = createTestContract();

      await expect(
        MessageService.getMessages(contract.id, 'unauthorized-user')
      ).rejects.toThrow('User is not part of this contract');
    });

    it('should support pagination', async () => {
      const contract = createTestContract();
      
      // Create 10 messages
      for (let i = 0; i < 10; i++) {
        createTestMessage({ contract_id: contract.id, sender_id: contract.freelancer_id, content: `Message ${i}` });
      }

      const result = await MessageService.getMessages(contract.id, contract.freelancer_id, { limit: 5, offset: 0 });

      expect(result.items).toHaveLength(5);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should return empty array when no messages exist', async () => {
      const contract = createTestContract();

      const result = await MessageService.getMessages(contract.id, contract.freelancer_id);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should only return messages for specified contract', async () => {
      const contract1 = createTestContract();
      const contract2 = createTestContract();
      
      createTestMessage({ contract_id: contract1.id, content: 'Contract 1 message' });
      createTestMessage({ contract_id: contract2.id, content: 'Contract 2 message' });

      const result = await MessageService.getMessages(contract1.id, contract1.freelancer_id);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].contract_id).toBe(contract1.id);
    });
  });

  describe('markAsRead', () => {
    it('should mark messages as read', async () => {
      const contract = createTestContract();
      
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        is_read: false 
      });

      await MessageService.markAsRead(contract.id, contract.freelancer_id);

      const unreadCount = await MessageService.getUnreadCount(contract.id, contract.freelancer_id);
      expect(unreadCount).toBe(0);
    });

    it('should not mark own messages as read', async () => {
      const contract = createTestContract();
      
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.freelancer_id, 
        is_read: false 
      });

      await MessageService.markAsRead(contract.id, contract.freelancer_id);

      // Own messages should remain unread (they're already "read" by sender)
      const messages = Array.from(messageStore.values());
      const ownMessage = messages.find(m => m.sender_id === contract.freelancer_id);
      expect(ownMessage?.is_read).toBe(false);
    });

    it('should only mark messages for specific contract', async () => {
      const contract1 = createTestContract();
      const contract2 = createTestContract({ freelancer_id: contract1.freelancer_id });
      
      createTestMessage({ 
        contract_id: contract1.id, 
        sender_id: contract1.employer_id, 
        is_read: false 
      });
      createTestMessage({ 
        contract_id: contract2.id, 
        sender_id: contract2.employer_id, 
        is_read: false 
      });

      await MessageService.markAsRead(contract1.id, contract1.freelancer_id);

      const unreadCount1 = await MessageService.getUnreadCount(contract1.id, contract1.freelancer_id);
      const unreadCount2 = await MessageService.getUnreadCount(contract2.id, contract1.freelancer_id);
      
      expect(unreadCount1).toBe(0);
      expect(unreadCount2).toBe(1);
    });
  });

  describe('getUnreadCount', () => {
    it('should return correct unread count', async () => {
      const contract = createTestContract();
      
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        is_read: false 
      });
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        is_read: false 
      });
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        is_read: true 
      });

      const count = await MessageService.getUnreadCount(contract.id, contract.freelancer_id);

      expect(count).toBe(2);
    });

    it('should return 0 when no unread messages', async () => {
      const contract = createTestContract();
      
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        is_read: true 
      });

      const count = await MessageService.getUnreadCount(contract.id, contract.freelancer_id);

      expect(count).toBe(0);
    });

    it('should not count own messages as unread', async () => {
      const contract = createTestContract();
      
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.freelancer_id, 
        is_read: false 
      });

      const count = await MessageService.getUnreadCount(contract.id, contract.freelancer_id);

      expect(count).toBe(0);
    });
  });

  describe('getConversationSummary', () => {
    it('should return conversation summary with last message and unread count', async () => {
      const contract = createTestContract();
      
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        content: 'First message',
        is_read: true,
        created_at: '2024-01-01T10:00:00Z'
      });
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        content: 'Latest message',
        is_read: false,
        created_at: '2024-01-01T11:00:00Z'
      });

      const summary = await MessageService.getConversationSummary(contract.id, contract.freelancer_id);

      expect(summary.contractId).toBe(contract.id);
      expect(summary.lastMessage).toBeDefined();
      expect(summary.lastMessage?.content).toBe('Latest message');
      expect(summary.unreadCount).toBe(1);
    });

    it('should return null for last message when no messages exist', async () => {
      const contract = createTestContract();

      const summary = await MessageService.getConversationSummary(contract.id, contract.freelancer_id);

      expect(summary.contractId).toBe(contract.id);
      expect(summary.lastMessage).toBeNull();
      expect(summary.unreadCount).toBe(0);
    });

    it('should return correct unread count in summary', async () => {
      const contract = createTestContract();
      
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        is_read: false 
      });
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        is_read: false 
      });
      createTestMessage({ 
        contract_id: contract.id, 
        sender_id: contract.employer_id, 
        is_read: false 
      });

      const summary = await MessageService.getConversationSummary(contract.id, contract.freelancer_id);

      expect(summary.unreadCount).toBe(3);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle very long messages', async () => {
      const contract = createTestContract();
      const longContent = 'A'.repeat(5000);
      const input = {
        contractId: contract.id,
        senderId: contract.freelancer_id,
        content: longContent,
      };

      const result = await MessageService.sendMessage(input);

      expect(result.content).toBe(longContent);
    });

    it('should handle unicode and emoji in messages', async () => {
      const contract = createTestContract();
      const input = {
        contractId: contract.id,
        senderId: contract.freelancer_id,
        content: '你好 🌍 مرحبا 🚀 Привет',
      };

      const result = await MessageService.sendMessage(input);

      expect(result.content).toBe(input.content);
    });

    it('should handle rapid message sending', async () => {
      const contract = createTestContract();
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(MessageService.sendMessage({
          contractId: contract.id,
          senderId: contract.freelancer_id,
          content: `Message ${i}`,
        }));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(messageStore.size).toBe(10);
    });

    it('should handle messages with only whitespace content', async () => {
      const contract = createTestContract();
      const input = {
        contractId: contract.id,
        senderId: contract.freelancer_id,
        content: '   ',
      };

      const result = await MessageService.sendMessage(input);

      expect(result.content).toBe('   ');
    });
  });
});
