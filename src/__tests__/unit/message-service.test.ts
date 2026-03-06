import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { createInMemoryStore, createMockContractRepository } from '../helpers/mock-repository-factory.js';
import { createTestContract } from '../helpers/test-data-factory.js';
import { createMockNotificationService } from '../helpers/mock-service-factory.js';
import { assertHasTimestamps, assertIsValidId } from '../helpers/test-assertions.js';
import { generateId } from '../../utils/id.js';

// Create stores and mocks using shared utilities
const messageStore = createInMemoryStore();
const contractStore = createInMemoryStore();
const mockContractRepo = createMockContractRepository(contractStore);
const mockNotificationService = createMockNotificationService();

// Create custom message repository mock (not in factory yet)
const mockMessageRepo = {
  create: jest.fn<any>(async (message: any) => {
    const now = new Date().toISOString();
    const entity = { ...message, created_at: now, updated_at: now };
    messageStore.set(message.id, entity);
    return entity;
  }),
  findByContractId: jest.fn<any>(async (contractId: string, options?: any) => {
    const messages = Array.from(messageStore.values())
      .filter((m: any) => m.contract_id === contractId)
      .sort((a: any, b: any) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    return {
      items: messages.slice(offset, offset + limit),
      hasMore: (offset + limit) < messages.length,
      total: messages.length,
    };
  }),
  markAsRead: jest.fn<any>(async (contractId: string, userId: string) => {
    for (const message of messageStore.values()) {
      const msg = message as any;
      if (msg.contract_id === contractId && msg.sender_id !== userId) {
        msg.is_read = true;
      }
    }
  }),
  getUnreadCount: jest.fn<any>(async (contractId: string, userId: string) => {
    return Array.from(messageStore.values())
      .filter((m: any) => m.contract_id === contractId && m.sender_id !== userId && !m.is_read)
      .length;
  }),
  getLatestMessage: jest.fn<any>(async (contractId: string) => {
    const messages = Array.from(messageStore.values())
      .filter((m: any) => m.contract_id === contractId)
      .sort((a: any, b: any) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
    return messages[0] || null;
  }),
  clear: () => messageStore.clear(),
};

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock repositories and services
jest.unstable_mockModule(resolveModule('src/repositories/message-repository.ts'), () => ({
  MessageRepository: mockMessageRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  createNotification: mockNotificationService.createNotification,
}));

// Import after mocking
const { MessageService } = await import('../../services/message-service.js');

// Helper to create test message
function createTestMessage(overrides: any = {}) {
  return {
    id: generateId(),
    contract_id: 'contract-1',
    sender_id: 'user-1',
    content: 'Test message',
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Message Service - Property-Based Tests', () => {
  beforeEach(() => {
    mockMessageRepo.clear();
    mockContractRepo.clear();
    mockNotificationService.createNotification.mockClear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 44: Message creation**
   * **Validates: Requirements 8.1**
   * 
   * For any valid message data, creating a message shall store it and
   * notify the recipient.
   */
  it('Property 44: Message creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1, maxLength: 1000 }),
        async (senderId, content) => {
          const contract = createTestContract({
            freelancer_id: senderId,
            employer_id: 'other-user',
            status: 'active', // Fix: Messages can only be sent on active or disputed contracts
          });
          contractStore.set(contract.id, contract);

          const message = await MessageService.sendMessage({
            contractId: contract.id,
            senderId,
            content,
          });

          assertIsValidId(message.id);
          expect(message.contract_id).toBe(contract.id);
          expect(message.sender_id).toBe(senderId);
          expect(message.content).toBe(content);
          expect(message.is_read).toBe(false);
          assertHasTimestamps(message);
          
          // Verify notification was sent
          expect(mockNotificationService.createNotification).toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 45: Message retrieval by contract**
   * **Validates: Requirements 8.2**
   * 
   * Retrieving messages for a contract shall return only messages for that contract
   * in reverse chronological order.
   */
  it('Property 45: Message retrieval by contract', async () => {
    const contractId = 'contract-123';
    const otherContractId = 'contract-456';
    const userId = 'user-123';

    // Fix: Create contracts so ensureContractParticipant doesn't fail
    const contract = createTestContract({
      id: contractId,
      freelancer_id: userId,
      employer_id: 'other-user',
      status: 'active',
    });
    contractStore.set(contract.id, contract);

    // Create messages for target contract
    const msg1 = createTestMessage({ 
      contract_id: contractId, 
      created_at: new Date('2024-01-01').toISOString() 
    });
    const msg2 = createTestMessage({ 
      contract_id: contractId, 
      created_at: new Date('2024-01-02').toISOString() 
    });
    
    // Create message for other contract
    const msg3 = createTestMessage({ 
      contract_id: otherContractId, 
      created_at: new Date('2024-01-03').toISOString() 
    });

    messageStore.set(msg1.id, msg1);
    messageStore.set(msg2.id, msg2);
    messageStore.set(msg3.id, msg3);

    const result = await MessageService.getMessages(contractId, userId);

    expect(result.items).toHaveLength(2);
    expect(result.items.every((m: any) => m.contract_id === contractId)).toBe(true);
    // Should be in reverse chronological order
    if (result.items[0] && result.items[1]) {
      expect(new Date(result.items[0].created_at).getTime())
        .toBeGreaterThan(new Date(result.items[1].created_at).getTime());
    }
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 46: Mark messages as read**
   * **Validates: Requirements 8.3**
   * 
   * Marking messages as read shall update only messages from other users.
   */
  it('Property 46: Mark messages as read', async () => {
    const contractId = 'contract-123';
    const userId = 'user-123';
    const otherUserId = 'other-user';

    // Fix: Create contract so ensureContractParticipant doesn't fail
    const contract = createTestContract({
      id: contractId,
      freelancer_id: userId,
      employer_id: otherUserId,
      status: 'active',
    });
    contractStore.set(contract.id, contract);

    // Create messages from other user (should be marked as read)
    const msg1 = createTestMessage({ 
      contract_id: contractId, 
      sender_id: otherUserId, 
      is_read: false 
    });
    const msg2 = createTestMessage({ 
      contract_id: contractId, 
      sender_id: otherUserId, 
      is_read: false 
    });
    
    // Create message from current user (should NOT be marked as read)
    const msg3 = createTestMessage({ 
      contract_id: contractId, 
      sender_id: userId, 
      is_read: false 
    });

    messageStore.set(msg1.id, msg1);
    messageStore.set(msg2.id, msg2);
    messageStore.set(msg3.id, msg3);

    await MessageService.markAsRead(contractId, userId);

    // Verify messages from other user are marked as read
    expect((messageStore.get(msg1.id) as any).is_read).toBe(true);
    expect((messageStore.get(msg2.id) as any).is_read).toBe(true);
    
    // Verify message from current user is NOT marked as read
    expect((messageStore.get(msg3.id) as any).is_read).toBe(false);
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 47: Unread message count**
   * **Validates: Requirements 8.4**
   * 
   * Getting unread count shall return only messages from other users that are unread.
   */
  it('Property 47: Unread message count', async () => {
    const contractId = 'contract-123';
    const userId = 'user-123';
    const otherUserId = 'other-user';

    // Fix: Create contract so ensureContractParticipant doesn't fail
    const contract = createTestContract({
      id: contractId,
      freelancer_id: userId,
      employer_id: otherUserId,
      status: 'active',
    });
    contractStore.set(contract.id, contract);

    // Create unread messages from other user (should count)
    const msg1 = createTestMessage({ 
      contract_id: contractId, 
      sender_id: otherUserId, 
      is_read: false 
    });
    const msg2 = createTestMessage({ 
      contract_id: contractId, 
      sender_id: otherUserId, 
      is_read: false 
    });
    
    // Create read message from other user (should NOT count)
    const msg3 = createTestMessage({ 
      contract_id: contractId, 
      sender_id: otherUserId, 
      is_read: true 
    });
    
    // Create unread message from current user (should NOT count)
    const msg4 = createTestMessage({ 
      contract_id: contractId, 
      sender_id: userId, 
      is_read: false 
    });

    messageStore.set(msg1.id, msg1);
    messageStore.set(msg2.id, msg2);
    messageStore.set(msg3.id, msg3);
    messageStore.set(msg4.id, msg4);

    const count = await MessageService.getUnreadCount(contractId, userId);

    expect(count).toBe(2);
  });
});

describe('Message Service - Unit Tests', () => {
  beforeEach(() => {
    mockMessageRepo.clear();
    mockContractRepo.clear();
    mockNotificationService.createNotification.mockClear();
  });

  it('should send message and create notification', async () => {
    const contract = createTestContract({
      freelancer_id: 'freelancer-123',
      employer_id: 'employer-123',
      status: 'active', // Fix: Messages can only be sent on active or disputed contracts
    });
    contractStore.set(contract.id, contract);

    const message = await MessageService.sendMessage({
      contractId: contract.id,
      senderId: 'freelancer-123',
      content: 'Hello, this is a test message',
    });

    assertIsValidId(message.id);
    expect(message.contract_id).toBe(contract.id);
    expect(message.sender_id).toBe('freelancer-123');
    expect(message.content).toBe('Hello, this is a test message');
    expect(message.is_read).toBe(false);
    
    // Verify notification was sent to the other party
    expect(mockNotificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'employer-123',
        type: 'message',
      })
    );
  });

  it('should get messages by contract with pagination', async () => {
    const contractId = 'contract-123';
    const userId = 'user-123';

    // Fix: Create contract so ensureContractParticipant doesn't fail
    const contract = createTestContract({
      id: contractId,
      freelancer_id: userId,
      employer_id: 'other-user',
      status: 'active',
    });
    contractStore.set(contract.id, contract);
    
    // Create 10 messages
    for (let i = 0; i < 10; i++) {
      const msg = createTestMessage({ 
        contract_id: contractId,
        created_at: new Date(Date.now() - i * 1000).toISOString()
      });
      messageStore.set(msg.id, msg);
    }

    const page1 = await MessageService.getMessages(contractId, userId, { limit: 5, offset: 0 });
    const page2 = await MessageService.getMessages(contractId, userId, { limit: 5, offset: 5 });

    expect(page1.items).toHaveLength(5);
    expect(page1.hasMore).toBe(true);
    expect(page1.total).toBe(10);
    
    expect(page2.items).toHaveLength(5);
    expect(page2.hasMore).toBe(false);
    expect(page2.total).toBe(10);
  });

  it('should get latest message for contract', async () => {
    const contractId = 'contract-123';
    const userId = 'user-123';
    
    const contract = createTestContract({ 
      id: contractId,
      freelancer_id: userId,
      employer_id: 'other-user'
    });
    contractStore.set(contract.id, contract);
    
    const msg1 = createTestMessage({ 
      contract_id: contractId, 
      created_at: new Date('2024-01-01').toISOString() 
    });
    const msg2 = createTestMessage({ 
      contract_id: contractId, 
      created_at: new Date('2024-01-03').toISOString() 
    });
    const msg3 = createTestMessage({ 
      contract_id: contractId, 
      created_at: new Date('2024-01-02').toISOString() 
    });

    messageStore.set(msg1.id, msg1);
    messageStore.set(msg2.id, msg2);
    messageStore.set(msg3.id, msg3);

    const summary = await MessageService.getConversationSummary(contractId, userId);

    expect(summary.lastMessage).not.toBeNull();
    expect(summary.lastMessage!.id).toBe(msg2.id); // msg2 has the latest timestamp
  });

  it('should return null for latest message when no messages exist', async () => {
    const userId = 'user-123';
    const contract = createTestContract({ 
      id: 'non-existent-contract',
      freelancer_id: userId,
      employer_id: 'other-user'
    });
    contractStore.set(contract.id, contract);
    
    const summary = await MessageService.getConversationSummary('non-existent-contract', userId);

    expect(summary.lastMessage).toBeNull();
  });
});
