import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { NotificationType } from '../../models/notification.js';
import { createInMemoryStore, createMockNotificationRepository } from '../helpers/mock-repository-factory.js';
import { createTestNotification } from '../helpers/test-data-factory.js';
import { assertHasTimestamps, assertIsValidId } from '../helpers/test-assertions.js';

// Create stores and mocks using shared utilities
const notificationStore = createInMemoryStore();
const mockNotificationRepo = createMockNotificationRepository(notificationStore);

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock the notification repository
jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepo,
  NotificationRepository: jest.fn(),
}));

// Import after mocking
const {
  createNotification,
  getAllNotificationsByUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  notifyProposalReceived,
  notifyProposalAccepted,
  notifyProposalRejected,
  notifyMilestoneSubmitted,
  notifyPaymentReleased,
} = await import('../../services/notification-service.js');

// Custom arbitraries for property-based testing
const notificationTypeArbitrary = (): fc.Arbitrary<NotificationType> =>
  fc.constantFrom(
    'proposal_received',
    'proposal_accepted',
    'proposal_rejected',
    'milestone_submitted',
    'milestone_approved',
    'payment_released',
    'dispute_created',
    'dispute_resolved',
    'rating_received'
  );

const validTitleArbitrary = () =>
  fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length >= 1);

const validMessageArbitrary = () =>
  fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length >= 1);

const validDataArbitrary = () =>
  fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
    fc.oneof(fc.string(), fc.integer(), fc.boolean())
  );

describe('Notification Service - Property-Based Tests', () => {
  beforeEach(() => {
    mockNotificationRepo.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 35: Notification creation**
   * **Validates: Requirements 10.1**
   * 
   * For any valid notification data, creating and then retrieving the notification
   * shall return equivalent data with proper timestamps.
   */
  it('Property 35: Notification creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        notificationTypeArbitrary(),
        validTitleArbitrary(),
        validMessageArbitrary(),
        validDataArbitrary(),
        async (userId, type, title, message, data) => {
          const result = await createNotification({
            userId,
            type,
            title,
            message,
            data,
          });

          expect(result.success).toBe(true);
          if (result.success) {
            const notification = result.data;
            assertIsValidId(notification.id);
            expect(notification.userId).toBe(userId);
            expect(notification.type).toBe(type);
            expect(notification.title).toBe(title);
            expect(notification.message).toBe(message);
            expect(notification.data).toEqual(data);
            expect(notification.isRead).toBe(false);
            assertHasTimestamps(notification);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 36: Mark notification as read**
   * **Validates: Requirements 10.2**
   * 
   * Marking a notification as read shall update its read status.
   */
  it('Property 36: Mark notification as read', async () => {
    const userId = 'test-user-id';
    const notification = createTestNotification({ user_id: userId, is_read: false });
    notificationStore.set(notification.id, notification);

    const result = await markNotificationAsRead(notification.id, userId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isRead).toBe(true);
    }
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 37: Get user notifications**
   * **Validates: Requirements 10.3**
   * 
   * Retrieving notifications for a user shall return only that user's notifications
   * in reverse chronological order.
   */
  it('Property 37: Get user notifications', async () => {
    const userId = 'test-user-id';
    const otherUserId = 'other-user-id';

    // Create notifications for test user
    const notif1 = createTestNotification({ 
      user_id: userId, 
      created_at: new Date('2024-01-01').toISOString() 
    });
    const notif2 = createTestNotification({ 
      user_id: userId, 
      created_at: new Date('2024-01-02').toISOString() 
    });
    
    // Create notification for other user
    const notif3 = createTestNotification({ 
      user_id: otherUserId, 
      created_at: new Date('2024-01-03').toISOString() 
    });

    notificationStore.set(notif1.id, notif1);
    notificationStore.set(notif2.id, notif2);
    notificationStore.set(notif3.id, notif3);

    const result = await getAllNotificationsByUser(userId);

    expect(result.success).toBe(true);
    if (result.success) {
      const userNotifications = result.data;
      expect(userNotifications).toHaveLength(2);
      expect(userNotifications[0]?.userId).toBe(userId);
      expect(userNotifications[1]?.userId).toBe(userId);
      // Should be in reverse chronological order
      if (userNotifications[0] && userNotifications[1]) {
        expect(new Date(userNotifications[0].createdAt).getTime())
          .toBeGreaterThan(new Date(userNotifications[1].createdAt).getTime());
      }
    }
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 38: Mark all as read**
   * **Validates: Requirements 10.4**
   * 
   * Marking all notifications as read for a user shall update only that user's
   * unread notifications.
   */
  it('Property 38: Mark all notifications as read', async () => {
    const userId = 'test-user-id';
    const otherUserId = 'other-user-id';

    // Create unread notifications for test user
    const notif1 = createTestNotification({ user_id: userId, is_read: false });
    const notif2 = createTestNotification({ user_id: userId, is_read: false });
    
    // Create unread notification for other user
    const notif3 = createTestNotification({ user_id: otherUserId, is_read: false });

    notificationStore.set(notif1.id, notif1);
    notificationStore.set(notif2.id, notif2);
    notificationStore.set(notif3.id, notif3);

    const result = await markAllNotificationsAsRead(userId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(2);
      
      // Verify test user's notifications are read
      const userNotif1 = notificationStore.get(notif1.id) as any;
      const userNotif2 = notificationStore.get(notif2.id) as any;
      expect(userNotif1?.is_read).toBe(true);
      expect(userNotif2?.is_read).toBe(true);
      
      // Verify other user's notification is still unread
      const otherNotif = notificationStore.get(notif3.id) as any;
      expect(otherNotif?.is_read).toBe(false);
    }
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 39: Proposal received notification**
   * **Validates: Requirements 10.5**
   * 
   * Notifying about a received proposal shall create a notification with correct type.
   */
  it('Property 39: Proposal received notification', async () => {
    const employerId = 'employer-id';
    const proposalId = 'proposal-id';
    const projectId = 'project-id';
    const projectTitle = 'Test Project';
    const freelancerId = 'freelancer-id';

    const result = await notifyProposalReceived(employerId, proposalId, projectId, projectTitle, freelancerId);

    expect(result.success).toBe(true);
    if (result.success) {
      const notification = result.data;
      expect(notification.type).toBe('proposal_received');
      expect(notification.userId).toBe(employerId);
      expect(notification.data).toHaveProperty('projectId', projectId);
      expect(notification.data).toHaveProperty('freelancerId', freelancerId);
    }
  });
});

describe('Notification Service - Unit Tests', () => {
  beforeEach(() => {
    mockNotificationRepo.clear();
  });

  it('should create notification with all required fields', async () => {
    const input = {
      userId: 'user-123',
      type: 'message' as NotificationType,
      title: 'Test Notification',
      message: 'This is a test message',
      data: { key: 'value' },
    };

    const result = await createNotification(input);

    expect(result.success).toBe(true);
    if (result.success) {
      const notification = result.data;
      assertIsValidId(notification.id);
      expect(notification.userId).toBe(input.userId);
      expect(notification.type).toBe(input.type);
      expect(notification.title).toBe(input.title);
      expect(notification.message).toBe(input.message);
      expect(notification.data).toEqual(input.data);
      expect(notification.isRead).toBe(false);
      assertHasTimestamps(notification);
    }
  });

  it('should notify proposal accepted with correct data', async () => {
    const freelancerId = 'freelancer-id';
    const projectId = 'project-id';
    const proposalId = 'proposal-id';
    const projectTitle = 'Test Project';
    const contractId = 'contract-id';

    const result = await notifyProposalAccepted(freelancerId, proposalId, projectId, projectTitle, contractId);

    expect(result.success).toBe(true);
    if (result.success) {
      const notification = result.data;
      expect(notification.type).toBe('proposal_accepted');
      expect(notification.userId).toBe(freelancerId);
      expect(notification.title.toLowerCase()).toContain('accepted');
      expect(notification.data).toHaveProperty('projectId', projectId);
      expect(notification.data).toHaveProperty('proposalId', proposalId);
    }
  });

  it('should notify proposal rejected with correct data', async () => {
    const freelancerId = 'freelancer-id';
    const projectId = 'project-id';
    const proposalId = 'proposal-id';
    const projectTitle = 'Test Project';

    const result = await notifyProposalRejected(freelancerId, proposalId, projectId, projectTitle);

    expect(result.success).toBe(true);
    if (result.success) {
      const notification = result.data;
      expect(notification.type).toBe('proposal_rejected');
      expect(notification.userId).toBe(freelancerId);
      expect(notification.title.toLowerCase()).toContain('rejected');
      expect(notification.data).toHaveProperty('projectId', projectId);
      expect(notification.data).toHaveProperty('proposalId', proposalId);
    }
  });

  it('should notify milestone submitted with correct data', async () => {
    const employerId = 'employer-id';
    const contractId = 'contract-id';
    const milestoneId = 'milestone-id';
    const milestoneTitle = 'Milestone 1';
    const projectId = 'project-id';
    const projectTitle = 'Test Project';

    const result = await notifyMilestoneSubmitted(employerId, milestoneId, milestoneTitle, projectId, projectTitle, contractId);

    expect(result.success).toBe(true);
    if (result.success) {
      const notification = result.data;
      expect(notification.type).toBe('milestone_submitted');
      expect(notification.userId).toBe(employerId);
      expect(notification.title.toLowerCase()).toContain('submitted');
      expect(notification.data).toHaveProperty('contractId', contractId);
      expect(notification.data).toHaveProperty('milestoneId', milestoneId);
    }
  });

  it('should notify payment released with correct data', async () => {
    const freelancerId = 'freelancer-id';
    const contractId = 'contract-id';
    const amount = 1000;
    const milestoneId = 'milestone-id';
    const milestoneTitle = 'Milestone 1';
    const projectId = 'project-id';
    const projectTitle = 'Test Project';

    const result = await notifyPaymentReleased(freelancerId, amount, milestoneId, milestoneTitle, projectId, projectTitle, contractId);

    expect(result.success).toBe(true);
    if (result.success) {
      const notification = result.data;
      expect(notification.type).toBe('payment_released');
      expect(notification.userId).toBe(freelancerId);
      expect(notification.title.toLowerCase()).toContain('released');
      expect(notification.data).toHaveProperty('contractId', contractId);
      expect(notification.data).toHaveProperty('amount', amount);
    }
  });
});
