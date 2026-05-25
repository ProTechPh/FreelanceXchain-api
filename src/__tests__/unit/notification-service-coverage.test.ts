// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateNotification = jest.fn<any>();
const mockGetNotificationById = jest.fn<any>();
const mockMarkAsRead = jest.fn<any>();
const mockMarkAllAsRead = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();
const mockGetNotificationsByUser = jest.fn<any>();
const mockGetAllNotificationsByUser = jest.fn<any>();
const mockGetUnreadNotificationsByUser = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: {
    createNotification: mockCreateNotification,
    getNotificationById: mockGetNotificationById,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    getUnreadCount: mockGetUnreadCount,
    getNotificationsByUser: mockGetNotificationsByUser,
    getAllNotificationsByUser: mockGetAllNotificationsByUser,
    getUnreadNotificationsByUser: mockGetUnreadNotificationsByUser,
  },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'gen-id-1',
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapNotificationFromEntity: (entity: any) => ({
    id: entity.id,
    userId: entity.user_id,
    type: entity.type,
    title: entity.title,
    message: entity.message,
    data: entity.data,
    isRead: entity.is_read,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  }),
}));

const {
  createNotifications,
  notifyDisputeResolved,
  notifyRatingReceived,
  markNotificationAsRead,
} = await import('../../services/notification-service.js');

describe('Notification Service - Coverage Gaps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createNotifications (batch)', () => {
    it('should create multiple notifications at once', async () => {
      const entity1 = { id: 'gen-id-1', user_id: 'user-1', type: 'proposal_received', title: 'Title 1', message: 'Msg 1', data: {}, is_read: false, created_at: '2025-01-01', updated_at: '2025-01-01' };
      const entity2 = { id: 'gen-id-1', user_id: 'user-2', type: 'payment_released', title: 'Title 2', message: 'Msg 2', data: { amount: 100 }, is_read: false, created_at: '2025-01-01', updated_at: '2025-01-01' };

      mockCreateNotification
        .mockResolvedValueOnce(entity1)
        .mockResolvedValueOnce(entity2);

      const result = await createNotifications([
        { userId: 'user-1', type: 'proposal_received', title: 'Title 1', message: 'Msg 1' },
        { userId: 'user-2', type: 'payment_released', title: 'Title 2', message: 'Msg 2', data: { amount: 100 } },
      ]);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].userId).toBe('user-1');
      expect(result.data[1].userId).toBe('user-2');
      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    });

    it('should return empty array for empty input', async () => {
      const result = await createNotifications([]);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('notifyDisputeResolved', () => {
    it('should create a dispute_resolved notification', async () => {
      const entity = { id: 'gen-id-1', user_id: 'user-1', type: 'dispute_resolved', title: 'Dispute Resolved', message: 'The dispute for milestone "M1" in project "P1" has been resolved.', data: { disputeId: 'd-1', resolution: 'refund', milestoneId: 'm-1', milestoneTitle: 'M1', projectId: 'p-1', projectTitle: 'P1', contractId: 'c-1' }, is_read: false, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockCreateNotification.mockResolvedValue(entity);

      const result = await notifyDisputeResolved('user-1', 'd-1', 'refund', 'm-1', 'M1', 'p-1', 'P1', 'c-1');

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('dispute_resolved');
      expect(result.data.data.disputeId).toBe('d-1');
      expect(result.data.data.resolution).toBe('refund');
    });
  });

  describe('notifyRatingReceived', () => {
    it('should create a rating_received notification', async () => {
      const entity = { id: 'gen-id-1', user_id: 'user-1', type: 'rating_received', title: 'New Rating Received', message: 'You received a 5-star rating for project "P1".', data: { rating: 5, contractId: 'c-1', projectTitle: 'P1' }, is_read: false, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockCreateNotification.mockResolvedValue(entity);

      const result = await notifyRatingReceived('user-1', 5, 'c-1', 'P1');

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('rating_received');
      expect(result.data.data.rating).toBe(5);
    });
  });

  describe('markNotificationAsRead - UPDATE_FAILED', () => {
    it('should return UPDATE_FAILED when markAsRead returns null', async () => {
      mockGetNotificationById.mockResolvedValue({ id: 'n-1', user_id: 'user-1', is_read: false });
      mockMarkAsRead.mockResolvedValue(null);

      const result = await markNotificationAsRead('n-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });
});
