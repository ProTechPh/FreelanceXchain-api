import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { NotificationEntity, NotificationType } from '../../repositories/notification-repository.js';
import { generateId } from '../../utils/id.js';

// In-memory store for testing
let notificationStore: Map<string, NotificationEntity> = new Map();

// Mock the notification repository before importing notification-service
jest.unstable_mockModule('../../repositories/notification-repository.js', () => ({
  notificationRepository: {
    createNotification: jest.fn(async (notification: Omit<NotificationEntity, 'created_at' | 'updated_at'>) => {
      const now = new Date().toISOString();
      const entity: NotificationEntity = { ...notification, created_at: now, updated_at: now };
      notificationStore.set(notification.id, entity);
      return entity;
    }),
    getNotificationById: jest.fn(async (id: string) => {
      return notificationStore.get(id) ?? null;
    }),
    getNotificationsByUser: jest.fn(async (userId: string) => {
      const notifications = Array.from(notificationStore.values())
        .filter(n => n.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { items: notifications, hasMore: false };
    }),
    getAllNotificationsByUser: jest.fn(async (userId: string) => {
      return Array.from(notificationStore.values())
        .filter(n => n.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }),
    getUnreadNotificationsByUser: jest.fn(async (userId: string) => {
      return Array.from(notificationStore.values())
        .filter(n => n.user_id === userId && !n.is_read)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }),
    markAsRead: jest.fn(async (id: string) => {
      const notification = notificationStore.get(id);
      if (notification) {
        const updated: NotificationEntity = { ...notification, is_read: true, updated_at: new Date().toISOString() };
        notificationStore.set(id, updated);
        return updated;
      }
      return null;
    }),
    markAllAsRead: jest.fn(async (userId: string) => {
      let count = 0;
      for (const [id, notification] of notificationStore.entries()) {
        if (notification.user_id === userId && !notification.is_read) {
          notificationStore.set(id, { ...notification, is_read: true, updated_at: new Date().toISOString() });
          count++;
        }
      }
      return count;
    }),
    getUnreadCount: jest.fn(async (userId: string) => {
      return Array.from(notificationStore.values())
        .filter(n => n.user_id === userId && !n.is_read).length;
    }),
  },
  NotificationRepository: jest.fn(),
  NotificationEntity: {} as NotificationEntity,
  NotificationType: 'proposal_received' as NotificationType,
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
} = await import('../notification-service.js');


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

// Helper to create a notification directly in the store for testing
function createTestNotification(
  userId: string,
  type: NotificationType,
  createdAt: Date,
  isRead: boolean = false
): NotificationEntity {
  const now = createdAt.toISOString();
  const notification: NotificationEntity = {
    id: generateId(),
    user_id: userId,
    type,
    title: `Test ${type}`,
    message: `Test message for ${type}`,
    data: {},
    is_read: isRead,
    created_at: now,
    updated_at: now,
  };
  notificationStore.set(notification.id, notification);
  return notification;
}

describe('Notification Service - Property Tests', () => {
  beforeEach(() => {
    notificationStore.clear();
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 38: Event-driven notification creation**
   * **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
   * 
   * For any event that triggers notifications (proposal submission, status change,
   * milestone submission, payment release), the appropriate notification(s) shall be
   * created for the correct user(s).
   */
  it('Property 38: Event-driven notification creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        notificationTypeArbitrary(),
        validTitleArbitrary(),
        validMessageArbitrary(),
        validDataArbitrary(),
        async (userId, type, title, message, data) => {
          // Clear store for each test case
          notificationStore.clear();

          const input = { userId, type, title, message, data };
          const result = await createNotification(input);

          // Should succeed
          expect(result.success).toBe(true);

          if (result.success) {
            // Verify notification was created with correct data
            expect(result.data.userId).toBe(userId);
            expect(result.data.type).toBe(type);
            expect(result.data.title).toBe(title);
            expect(result.data.message).toBe(message);
            expect(result.data.data).toEqual(data);
            expect(result.data.isRead).toBe(false);
            expect(result.data.createdAt).toBeDefined();

            // Verify notification exists in store
            expect(notificationStore.has(result.data.id)).toBe(true);

            // Verify stored notification matches
            const stored = notificationStore.get(result.data.id);
            expect(stored?.user_id).toBe(userId);
            expect(stored?.type).toBe(type);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 38: Event-driven notification creation (specific events)**
   * **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
   * 
   * Tests specific event notification helpers to ensure they create notifications
   * for the correct users with appropriate types.
   */
  it('Property 38: Event-driven notification creation - specific events', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // employerId
        fc.uuid(), // freelancerId
        fc.uuid(), // proposalId
        fc.uuid(), // projectId
        fc.uuid(), // contractId
        fc.uuid(), // milestoneId
        fc.string({ minLength: 1, maxLength: 50 }), // projectTitle
        fc.string({ minLength: 1, maxLength: 50 }), // milestoneTitle
        fc.integer({ min: 100, max: 100000 }), // amount
        async (employerId, freelancerId, proposalId, projectId, contractId, milestoneId, projectTitle, milestoneTitle, amount) => {
          // Clear store for each test case
          notificationStore.clear();

          // Test proposal_received notification
          const proposalReceivedResult = await notifyProposalReceived(
            employerId, proposalId, projectId, projectTitle, freelancerId
          );
          expect(proposalReceivedResult.success).toBe(true);
          if (proposalReceivedResult.success) {
            expect(proposalReceivedResult.data.userId).toBe(employerId);
            expect(proposalReceivedResult.data.type).toBe('proposal_received');
            expect(proposalReceivedResult.data.data.proposalId).toBe(proposalId);
          }

          // Test proposal_accepted notification
          const proposalAcceptedResult = await notifyProposalAccepted(
            freelancerId, proposalId, projectId, projectTitle, contractId
          );
          expect(proposalAcceptedResult.success).toBe(true);
          if (proposalAcceptedResult.success) {
            expect(proposalAcceptedResult.data.userId).toBe(freelancerId);
            expect(proposalAcceptedResult.data.type).toBe('proposal_accepted');
            expect(proposalAcceptedResult.data.data.contractId).toBe(contractId);
          }

          // Test proposal_rejected notification
          const proposalRejectedResult = await notifyProposalRejected(
            freelancerId, proposalId, projectId, projectTitle
          );
          expect(proposalRejectedResult.success).toBe(true);
          if (proposalRejectedResult.success) {
            expect(proposalRejectedResult.data.userId).toBe(freelancerId);
            expect(proposalRejectedResult.data.type).toBe('proposal_rejected');
          }

          // Test milestone_submitted notification
          const milestoneSubmittedResult = await notifyMilestoneSubmitted(
            employerId, milestoneId, milestoneTitle, projectId, projectTitle, contractId
          );
          expect(milestoneSubmittedResult.success).toBe(true);
          if (milestoneSubmittedResult.success) {
            expect(milestoneSubmittedResult.data.userId).toBe(employerId);
            expect(milestoneSubmittedResult.data.type).toBe('milestone_submitted');
          }

          // Test payment_released notification
          const paymentReleasedResult = await notifyPaymentReleased(
            freelancerId, amount, milestoneId, milestoneTitle, projectId, projectTitle, contractId
          );
          expect(paymentReleasedResult.success).toBe(true);
          if (paymentReleasedResult.success) {
            expect(paymentReleasedResult.data.userId).toBe(freelancerId);
            expect(paymentReleasedResult.data.type).toBe('payment_released');
            expect(paymentReleasedResult.data.data.amount).toBe(amount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 39: Notification ordering**
   * **Validates: Requirements 11.5**
   * 
   * For any user's notification list, notifications shall be sorted by creation time
   * in descending order (newest first).
   */
  it('Property 39: Notification ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 2, max: 10 }), // number of notifications to create
        async (userId, count) => {
          // Clear store for each test case
          notificationStore.clear();

          // Create notifications with different timestamps
          const baseTime = Date.now();
          const createdNotifications: NotificationEntity[] = [];

          for (let i = 0; i < count; i++) {
            // Create notifications with timestamps spread out by 1 second each
            const createdAt = new Date(baseTime + i * 1000);
            const notification = createTestNotification(
              userId,
              'proposal_received',
              createdAt
            );
            createdNotifications.push(notification);
          }

          // Get all notifications for the user
          const result = await getAllNotificationsByUser(userId);

          expect(result.success).toBe(true);

          if (result.success) {
            const notifications = result.data;

            // Should have all notifications
            expect(notifications.length).toBe(count);

            // Verify notifications are sorted by createdAt in descending order (newest first)
            for (let i = 0; i < notifications.length - 1; i++) {
              const current = notifications[i];
              const next = notifications[i + 1];
              if (current && next) {
                const currentTime = new Date(current.createdAt).getTime();
                const nextTime = new Date(next.createdAt).getTime();
                expect(currentTime).toBeGreaterThanOrEqual(nextTime);
              }
            }

            // The first notification should be the newest (last created)
            const newestCreated = createdNotifications[createdNotifications.length - 1];
            const firstNotification = notifications[0];
            if (newestCreated && firstNotification) {
              expect(firstNotification.id).toBe(newestCreated.id);
            }

            // The last notification should be the oldest (first created)
            const oldestCreated = createdNotifications[0];
            const lastNotification = notifications[notifications.length - 1];
            if (oldestCreated && lastNotification) {
              expect(lastNotification.id).toBe(oldestCreated.id);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 40: Notification read status update**
   * **Validates: Requirements 11.6**
   * 
   * For any notification marked as read, retrieving that notification shall show
   * isRead as true.
   */
  it('Property 40: Notification read status update', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        notificationTypeArbitrary(),
        validTitleArbitrary(),
        validMessageArbitrary(),
        async (userId, type, title, message) => {
          // Clear store for each test case
          notificationStore.clear();

          // Create a notification
          const createResult = await createNotification({
            userId,
            type,
            title,
            message,
            data: {},
          });

          expect(createResult.success).toBe(true);
          if (!createResult.success) return;

          const notificationId = createResult.data.id;

          // Verify initial state is unread
          expect(createResult.data.isRead).toBe(false);

          // Mark as read
          const markReadResult = await markNotificationAsRead(notificationId, userId);

          expect(markReadResult.success).toBe(true);

          if (markReadResult.success) {
            // Verify the returned notification shows isRead as true
            expect(markReadResult.data.isRead).toBe(true);
            expect(markReadResult.data.id).toBe(notificationId);
            expect(markReadResult.data.userId).toBe(userId);

            // Verify the stored notification also shows is_read as true
            const stored = notificationStore.get(notificationId);
            expect(stored?.is_read).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 40: Notification read status update (mark all)**
   * **Validates: Requirements 11.6**
   * 
   * For any set of notifications marked as read via mark-all, all notifications
   * shall show isRead as true.
   */
  it('Property 40: Notification read status update - mark all', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 10 }), // number of notifications to create
        async (userId, count) => {
          // Clear store for each test case
          notificationStore.clear();

          // Create multiple unread notifications
          const baseTime = Date.now();
          for (let i = 0; i < count; i++) {
            const createdAt = new Date(baseTime + i * 1000);
            createTestNotification(userId, 'proposal_received', createdAt, false);
          }

          // Verify all are initially unread
          const unreadBefore = Array.from(notificationStore.values())
            .filter(n => n.user_id === userId && !n.is_read);
          expect(unreadBefore.length).toBe(count);

          // Mark all as read
          const markAllResult = await markAllNotificationsAsRead(userId);

          expect(markAllResult.success).toBe(true);

          if (markAllResult.success) {
            // Verify the count matches
            expect(markAllResult.data.count).toBe(count);

            // Verify all notifications in store are now read
            const allNotifications = Array.from(notificationStore.values())
              .filter(n => n.user_id === userId);

            for (const notification of allNotifications) {
              expect(notification.is_read).toBe(true);
            }

            // Verify no unread notifications remain
            const unreadAfter = Array.from(notificationStore.values())
              .filter(n => n.user_id === userId && !n.is_read);
            expect(unreadAfter.length).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
