// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateNotification = jest.fn<any>();
const mockGetNotificationById = jest.fn<any>();
const mockGetNotificationsByUser = jest.fn<any>();
const mockGetAllNotificationsByUser = jest.fn<any>();
const mockGetUnreadNotificationsByUser = jest.fn<any>();
const mockMarkAsRead = jest.fn<any>();
const mockMarkAllAsRead = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: {
    createNotification: mockCreateNotification,
    getNotificationById: mockGetNotificationById,
    getNotificationsByUser: mockGetNotificationsByUser,
    getAllNotificationsByUser: mockGetAllNotificationsByUser,
    getUnreadNotificationsByUser: mockGetUnreadNotificationsByUser,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    getUnreadCount: mockGetUnreadCount,
  },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id-1',
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
  createNotification,
  getNotificationsByUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  getNotificationById,
} = await import('../../services/notification-service.js');

describe('Notification Service - Extended Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createNotification', () => {
    it('should create a notification successfully', async () => {
      const entity = { id: 'generated-id-1', user_id: 'user-1', type: 'proposal_received', title: 'New Proposal', message: 'You have a new proposal', data: {}, is_read: false, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockCreateNotification.mockResolvedValue(entity);
      const result = await createNotification({ userId: 'user-1', type: 'proposal_received', title: 'New Proposal', message: 'You have a new proposal' });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('generated-id-1');
      expect(result.data.userId).toBe('user-1');
    });

    it('should create notification with custom data', async () => {
      const entity = { id: 'generated-id-1', user_id: 'user-1', type: 'payment_released', title: 'Payment', message: 'Payment released', data: { amount: 500 }, is_read: false, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockCreateNotification.mockResolvedValue(entity);
      const result = await createNotification({ userId: 'user-1', type: 'payment_released', title: 'Payment', message: 'Payment released', data: { amount: 500 } });
      expect(result.success).toBe(true);
      expect(result.data.data.amount).toBe(500);
    });
  });

  describe('getNotificationsByUser', () => {
    it('should return paginated notifications', async () => {
      mockGetNotificationsByUser.mockResolvedValue({
        items: [{ id: 'n-1', user_id: 'user-1', type: 'proposal_received', title: 'Test', message: 'Test', data: {}, is_read: false, created_at: '2025-01-01', updated_at: '2025-01-01' }],
        hasMore: false,
        total: 1,
      });
      const result = await getNotificationsByUser('user-1', { limit: 10, offset: 0 });
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(1);
    });

    it('should return empty list when no notifications', async () => {
      mockGetNotificationsByUser.mockResolvedValue({ items: [], hasMore: false, total: 0 });
      const result = await getNotificationsByUser('user-1');
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(0);
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read', async () => {
      mockGetNotificationById.mockResolvedValue({ id: 'n-1', user_id: 'user-1', is_read: false });
      mockMarkAsRead.mockResolvedValue({ id: 'n-1', user_id: 'user-1', type: 'proposal_received', title: 'Test', message: 'Test', data: {}, is_read: true, created_at: '2025-01-01', updated_at: '2025-01-01' });
      const result = await markNotificationAsRead('n-1', 'user-1');
      expect(result.success).toBe(true);
      expect(result.data.isRead).toBe(true);
    });

    it('should return NOT_FOUND if notification does not exist', async () => {
      mockGetNotificationById.mockResolvedValue(null);
      const result = await markNotificationAsRead('n-999', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED if notification belongs to another user', async () => {
      mockGetNotificationById.mockResolvedValue({ id: 'n-1', user_id: 'user-2', is_read: false });
      const result = await markNotificationAsRead('n-1', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return UPDATE_FAILED if markAsRead returns null', async () => {
      mockGetNotificationById.mockResolvedValue({ id: 'n-1', user_id: 'user-1', is_read: false });
      mockMarkAsRead.mockResolvedValue(null);
      const result = await markNotificationAsRead('n-1', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('should mark all notifications as read', async () => {
      mockMarkAllAsRead.mockResolvedValue(5);
      const result = await markAllNotificationsAsRead('user-1');
      expect(result.success).toBe(true);
      expect(result.data.count).toBe(5);
    });

    it('should return 0 count when no unread notifications', async () => {
      mockMarkAllAsRead.mockResolvedValue(0);
      const result = await markAllNotificationsAsRead('user-1');
      expect(result.success).toBe(true);
      expect(result.data.count).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockGetUnreadCount.mockResolvedValue(3);
      const result = await getUnreadCount('user-1');
      expect(result.success).toBe(true);
      expect(result.data).toBe(3);
    });

    it('should return 0 when no unread notifications', async () => {
      mockGetUnreadCount.mockResolvedValue(0);
      const result = await getUnreadCount('user-1');
      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });
  });

  describe('getNotificationById', () => {
    it('should return notification for the correct user', async () => {
      mockGetNotificationById.mockResolvedValue({ id: 'n-1', user_id: 'user-1', type: 'proposal_received', title: 'Test', message: 'Test', data: {}, is_read: false, created_at: '2025-01-01', updated_at: '2025-01-01' });
      const result = await getNotificationById('n-1', 'user-1');
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('n-1');
    });

    it('should return NOT_FOUND if notification does not exist', async () => {
      mockGetNotificationById.mockResolvedValue(null);
      const result = await getNotificationById('n-999', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED if notification belongs to another user', async () => {
      mockGetNotificationById.mockResolvedValue({ id: 'n-1', user_id: 'user-2' });
      const result = await getNotificationById('n-1', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });
  });
});
