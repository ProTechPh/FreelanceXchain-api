// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockDatabases = {
  listDocuments: jest.fn(),
  getDocument: jest.fn(),
  createDocument: jest.fn(),
  updateDocument: jest.fn(),
  deleteDocument: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: mockDatabases,
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn().mockImplementation((field: string, value: any) => ({ type: 'equal', field, value })),
    orderDesc: jest.fn().mockImplementation((field: string) => ({ type: 'orderDesc', field })),
    limit: jest.fn().mockImplementation((n: number) => ({ type: 'limit', value: n })),
    offset: jest.fn().mockImplementation((n: number) => ({ type: 'offset', value: n })),
  },
  ID: { unique: jest.fn(() => 'mock-unique-id') },
}));

const { NotificationRepository } = await import('../../repositories/notification-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id || 'mock-id',
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('NotificationRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new NotificationRepository();
  });

  describe('createNotification', () => {
    it('should create and return a notification', async () => {
      const notification = { user_id: 'u1', type: 'project_update', title: 'Test', message: 'Hello', data: { key: 'val' }, is_read: false };
      mockDatabases.createDocument.mockResolvedValueOnce(toAppwriteDoc({ id: 'n1', ...notification }));
      const result = await repo.createNotification(notification as any);
      expect(result).toMatchObject({ id: 'n1', user_id: 'u1', title: 'Test' });
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createNotification({} as any)).rejects.toThrow();
    });
  });

  describe('getNotificationById', () => {
    it('should return a notification', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce(toAppwriteDoc({ id: 'n1', title: 'Test' }));
      const result = await repo.getNotificationById('n1');
      expect(result).toMatchObject({ id: 'n1', title: 'Test' });
    });

    it('should return null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getNotificationById('n1');
      expect(result).toBeNull();
    });
  });

  describe('getNotificationsByUser', () => {
    it('should return paginated notifications', async () => {
      const docs = [
        toAppwriteDoc({ id: 'n1', user_id: 'u1', title: 'A' }),
        toAppwriteDoc({ id: 'n2', user_id: 'u1', title: 'B' }),
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await repo.getNotificationsByUser('u1');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const docs = [toAppwriteDoc({ id: 'n1', user_id: 'u1' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 5 });
      const result = await repo.getNotificationsByUser('u1', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should handle empty results', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getNotificationsByUser('u1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getNotificationsByUser('u1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getAllNotificationsByUser', () => {
    it('should return all notifications for a user', async () => {
      const docs = [
        toAppwriteDoc({ id: 'n1', user_id: 'u1' }),
        toAppwriteDoc({ id: 'n2', user_id: 'u1' }),
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 2 });
      const result = await repo.getAllNotificationsByUser('u1');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'n1' });
      expect(result[1]).toMatchObject({ id: 'n2' });
    });

    it('should return empty array when no documents', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getAllNotificationsByUser('u1');
      expect(result).toEqual([]);
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getAllNotificationsByUser('u1');
      expect(result).toEqual([]);
    });
  });

  describe('getUnreadNotificationsByUser', () => {
    it('should return unread notifications', async () => {
      const docs = [toAppwriteDoc({ id: 'n1', user_id: 'u1', is_read: false })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 1 });
      const result = await repo.getUnreadNotificationsByUser('u1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'n1', is_read: false });
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getUnreadNotificationsByUser('u1');
      expect(result).toEqual([]);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce(
        toAppwriteDoc({ id: 'n1', is_read: true, updated_at: '2025-06-01T00:00:00Z' })
      );
      const result = await repo.markAsRead('n1');
      expect(result).toMatchObject({ id: 'n1', is_read: true });
    });

    it('should return null when not found', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.markAsRead('n1');
      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('should return count of updated notifications', async () => {
      const unreadDocs = [
        { $id: 'n1', user_id: 'u1', is_read: false },
        { $id: 'n2', user_id: 'u1', is_read: false },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: unreadDocs, total: 2 });
      mockDatabases.updateDocument.mockResolvedValueOnce({ $id: 'n1' });
      mockDatabases.updateDocument.mockResolvedValueOnce({ $id: 'n2' });
      const result = await repo.markAllAsRead('u1');
      expect(result).toBe(2);
    });

    it('should return 0 when no notifications updated', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.markAllAsRead('u1');
      expect(result).toBe(0);
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('update failed'));
      const result = await repo.markAllAsRead('u1');
      expect(result).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 5 });
      const result = await repo.getUnreadCount('u1');
      expect(result).toBe(5);
    });

    it('should return 0 when no unread notifications', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.getUnreadCount('u1');
      expect(result).toBe(0);
    });

    it('should return fallback on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getUnreadCount('u1');
      expect(result).toBe(0);
    });
  });
});
