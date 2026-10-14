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
    cursorAfter: jest.fn().mockImplementation((id: string) => ({ type: 'cursorAfter', id })),
    lessThan: jest.fn().mockImplementation((field: string, value: string) => ({ type: 'lessThan', field, value })),
    isNull: jest.fn().mockImplementation((field: string) => ({ type: 'isNull', field })),
    or: jest.fn().mockImplementation((queries: any[]) => ({ type: 'or', queries })),
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

    it('excludes archived notifications by default, including pre-migration nulls', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      await repo.getNotificationsByUser('u1');
      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries).toContainEqual({
        type: 'or',
        queries: [
          { type: 'equal', field: 'is_archived', value: false },
          { type: 'isNull', field: 'is_archived' },
        ],
      });
    });

    it('returns only archived notifications when archived=true', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      await repo.getNotificationsByUser('u1', { archived: true });
      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries).toContainEqual({ type: 'equal', field: 'is_archived', value: true });
    });

    it('honours maxItemCount and pages with a cursor after the continuation token', async () => {
      const docs = [toAppwriteDoc({ id: 'n3', user_id: 'u1' }), toAppwriteDoc({ id: 'n4', user_id: 'u1' })];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: docs, total: 10 });
      const result = await repo.getNotificationsByUser('u1', { maxItemCount: 2, continuationToken: 'n2' });
      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries).toContainEqual({ type: 'limit', value: 2 });
      expect(queries).toContainEqual({ type: 'cursorAfter', id: 'n2' });
      expect(queries.some((q: any) => q.type === 'offset')).toBe(false);
      expect(result.hasMore).toBe(true);
      expect(result.continuationToken).toBe('n4');
    });

    it('omits the continuation token on the last page', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc({ id: 'n1' })], total: 1 });
      const result = await repo.getNotificationsByUser('u1', { maxItemCount: 20 });
      expect(result.hasMore).toBe(false);
      expect(result.continuationToken).toBeUndefined();
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

    it('should return notifications beyond the first 1000 (no truncation)', async () => {
      // 250 notifications across 3 pages of 100 (fetchAll cursor pagination).
      const docs = Array.from({ length: 250 }, (_, i) => toAppwriteDoc({ id: `n${i}`, user_id: 'u1', is_read: false }));
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: docs.slice(0, 100), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(100, 200), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(200), total: 250 });

      const result = await repo.getAllNotificationsByUser('u1');
      expect(result).toHaveLength(250);
      expect(result[0]).toMatchObject({ id: 'n0' });
      expect(result[249]).toMatchObject({ id: 'n249' });
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

    it('should mark ALL unread notifications read even beyond 1000', async () => {
      // 250 unread notifications across 3 pages of 100 — the old Query.limit(1000)
      // left the last 150 unread, so the badge and read state diverged.
      const unreadDocs = Array.from({ length: 250 }, (_, i) => ({ $id: `n${i}`, user_id: 'u1', is_read: false }));
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: unreadDocs.slice(0, 100), total: 250 })
        .mockResolvedValueOnce({ documents: unreadDocs.slice(100, 200), total: 250 })
        .mockResolvedValueOnce({ documents: unreadDocs.slice(200), total: 250 });
      mockDatabases.updateDocument.mockResolvedValue({ $id: 'n' });

      const result = await repo.markAllAsRead('u1');
      expect(result).toBe(250);
      expect(mockDatabases.updateDocument).toHaveBeenCalledTimes(250);
    });

    it('should rethrow on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('update failed'));
      await expect(repo.markAllAsRead('u1')).rejects.toThrow('update failed');
    });
  });

  describe('deleteReadBefore', () => {
    it('should delete only read notifications older than the threshold', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'n1', user_id: 'u1', is_read: true },
          { $id: 'n2', user_id: 'u1', is_read: true },
        ],
        total: 2,
      });
      mockDatabases.deleteDocument.mockResolvedValue({ $id: 'n1' });
      mockDatabases.deleteDocument.mockResolvedValue({ $id: 'n2' });

      const result = await repo.deleteReadBefore(new Date('2025-01-01T00:00:00Z'));
      expect(result).toBe(2);
      expect(mockDatabases.deleteDocument).toHaveBeenCalledTimes(2);
    });

    it('should drain the backlog beyond the old 1000-cap (no truncation)', async () => {
      // 250 read notifications across 3 pages of 100 — the old Query.limit(1000)
      // deleted at most 1000 arbitrary read notifications per run, so the
      // scheduler cleanup never caught up under sustained volume.
      const docs = Array.from({ length: 250 }, (_, i) => ({ $id: `n${i}`, user_id: 'u1', is_read: true }));
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: docs.slice(0, 100), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(100, 200), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(200), total: 250 });
      mockDatabases.deleteDocument.mockResolvedValue({ $id: 'n' });

      const result = await repo.deleteReadBefore(new Date('2025-01-01T00:00:00Z'));
      expect(result).toBe(250);
      expect(mockDatabases.deleteDocument).toHaveBeenCalledTimes(250);
    });

    it('should propagate read errors to the caller (scheduler job)', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.deleteReadBefore(new Date('2025-01-01T00:00:00Z'))).rejects.toThrow('select failed');
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 5 });
      const result = await repo.getUnreadCount('u1');
      expect(result).toBe(5);
    });

    it('does not count archived notifications as unread', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      await repo.getUnreadCount('u1');
      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries.some((q: any) => q.type === 'or' && q.queries[0].field === 'is_archived')).toBe(true);
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

// ═══════════════════════════════════════════════════════════════
// Merged from repository-coverage.test.ts
// ═══════════════════════════════════════════════════════════════

describe('NotificationRepository - mapNotification data parsing', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new NotificationRepository();
  });

  it('should parse data from JSON string to object', async () => {
    const dataObj = { projectId: 'p1', milestoneId: 'm1' };
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'n1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        user_id: 'u1',
        type: 'project_update',
        title: 'Update',
        message: 'Milestone updated',
        data: JSON.stringify(dataObj),
        is_read: false,
      }],
      total: 1,
    });

    const result = await repo.getNotificationsByUser('u1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.data).toEqual(dataObj);
    expect(typeof result.items[0]!.data).toBe('object');
  });

  it('should parse data from JSON string via getAllNotificationsByUser', async () => {
    const dataObj = { contractId: 'c1' };
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'n2',
        $createdAt: '2025-02-01',
        $updatedAt: '2025-02-01',
        user_id: 'u2',
        type: 'payment',
        title: 'Payment received',
        message: 'You got paid',
        data: JSON.stringify(dataObj),
        is_read: false,
      }],
      total: 1,
    });

    const result = await repo.getAllNotificationsByUser('u2');
    expect(result).toHaveLength(1);
    expect(result[0]!.data).toEqual(dataObj);
  });

  it('should parse data from JSON string via getUnreadNotificationsByUser', async () => {
    const dataObj = { key: 'val' };
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'n3',
        $createdAt: '2025-03-01',
        $updatedAt: '2025-03-01',
        user_id: 'u3',
        type: 'system',
        title: 'Alert',
        message: 'System alert',
        data: JSON.stringify(dataObj),
        is_read: false,
      }],
      total: 1,
    });

    const result = await repo.getUnreadNotificationsByUser('u3');
    expect(result).toHaveLength(1);
    expect(result[0]!.data).toEqual(dataObj);
  });

  it('should leave data as-is when it is already an object', async () => {
    const dataObj = { already: 'object' };
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'n4',
        $createdAt: '2025-04-01',
        $updatedAt: '2025-04-01',
        user_id: 'u4',
        type: 'system',
        title: 'T',
        message: 'M',
        data: dataObj,
        is_read: true,
      }],
      total: 1,
    });

    const result = await repo.getNotificationsByUser('u4');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.data).toEqual(dataObj);
  });

  describe('setArchived', () => {
    it('updates is_archived on the document', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce(toAppwriteDoc({ id: 'n1', is_archived: true }));
      const result = await repo.setArchived('n1', true);
      expect(mockDatabases.updateDocument).toHaveBeenCalledWith('freelancexchain', 'notifications', 'n1', expect.objectContaining({ is_archived: true }));
      expect(result).toMatchObject({ id: 'n1', is_archived: true });
    });

    it('returns null when the update fails', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('update failed'));
      expect(await repo.setArchived('n1', false)).toBeNull();
    });
  });

  describe('deleteNotification', () => {
    it('deletes the document and reports success', async () => {
      mockDatabases.deleteDocument.mockResolvedValueOnce({});
      expect(await repo.deleteNotification('n1')).toBe(true);
      expect(mockDatabases.deleteDocument).toHaveBeenCalledWith('freelancexchain', 'notifications', 'n1');
    });

    it('reports failure when the delete throws', async () => {
      mockDatabases.deleteDocument.mockRejectedValueOnce(new Error('delete failed'));
      expect(await repo.deleteNotification('n1')).toBe(false);
    });
  });

  describe('getOwnedByIds', () => {
    it('scopes the lookup to the user so foreign ids are never returned', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc({ id: 'n1', user_id: 'u1' })], total: 1 });
      const result = await repo.getOwnedByIds('u1', ['n1', 'n2']);
      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries).toContainEqual({ type: 'equal', field: '$id', value: ['n1', 'n2'] });
      expect(queries).toContainEqual({ type: 'equal', field: 'user_id', value: 'u1' });
      expect(result.map((n: any) => n.id)).toEqual(['n1']);
    });

    it('skips the query for an empty id list', async () => {
      expect(await repo.getOwnedByIds('u1', [])).toEqual([]);
      expect(mockDatabases.listDocuments).not.toHaveBeenCalled();
    });

    it('returns an empty list on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('boom'));
      expect(await repo.getOwnedByIds('u1', ['n1'])).toEqual([]);
    });
  });
});
