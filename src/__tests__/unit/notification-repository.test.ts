import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { NotificationRepository } = await import('../../repositories/notification-repository.js');

describe('NotificationRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new NotificationRepository();
  });

  describe('createNotification', () => {
    it('should create and return a notification', async () => {
      const notification = { id: 'n1', user_id: 'u1', title: 'Test' };
      mockAppwriteResult({ data: notification });
      const result = await repo.createNotification(notification as any);
      expect(result).toEqual(notification);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.createNotification({ id: 'n1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getNotificationById', () => {
    it('should return a notification', async () => {
      const notification = { id: 'n1' };
      mockAppwriteResult({ data: notification });
      const result = await repo.getNotificationById('n1');
      expect(result).toEqual(notification);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getNotificationById('n1');
      expect(result).toBeNull();
    });
  });

  describe('getNotificationsByUser', () => {
    it('should return paginated notifications', async () => {
      const notifications = [{ id: 'n1' }, { id: 'n2' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: notifications, rowCount: 2 });
      const result = await repo.getNotificationsByUser('u1');
      expect(result.items).toEqual(notifications);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const notifications = [{ id: 'n1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: notifications, rowCount: 1 });
      const result = await repo.getNotificationsByUser('u1', { limit: 1, offset: 0 });
      expect(result.items).toEqual(notifications);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getNotificationsByUser('u1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getNotificationsByUser('u1')).rejects.toThrow('Failed to get notifications by user');
    });
  });

  describe('getAllNotificationsByUser', () => {
    it('should return all notifications for a user', async () => {
      const notifications = [{ id: 'n1' }, { id: 'n2' }];
      mockAppwriteResult({ data: notifications });
      const result = await repo.getAllNotificationsByUser('u1');
      expect(result).toEqual(notifications);
    });

    it('should return empty array when data is null', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getAllNotificationsByUser('u1');
      expect(result).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getAllNotificationsByUser('u1')).rejects.toThrow('Failed to get all notifications by user');
    });
  });

  describe('getUnreadNotificationsByUser', () => {
    it('should return unread notifications', async () => {
      const notifications = [{ id: 'n1', is_read: false }];
      mockAppwriteResult({ data: notifications });
      const result = await repo.getUnreadNotificationsByUser('u1');
      expect(result).toEqual(notifications);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getUnreadNotificationsByUser('u1')).rejects.toThrow('Failed to get unread notifications');
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const notification = { id: 'n1', is_read: true };
      mockAppwriteResult({ data: notification });
      const result = await repo.markAsRead('n1');
      expect(result).toEqual(notification);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.markAsRead('n1');
      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('should return count of updated notifications', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }, { id: 'n2' }], rowCount: 2 });
      const result = await repo.markAllAsRead('u1');
      expect(result).toBe(2);
    });

    it('should return 0 when no notifications updated', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.markAllAsRead('u1');
      expect(result).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('update failed'));
      await expect(repo.markAllAsRead('u1')).rejects.toThrow('Failed to mark all as read');
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      const result = await repo.getUnreadCount('u1');
      expect(result).toBe(5);
    });

    it('should return 0 when no unread notifications', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      const result = await repo.getUnreadCount('u1');
      expect(result).toBe(0);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.getUnreadCount('u1')).rejects.toThrow('Failed to get unread count');
    });
  });
});