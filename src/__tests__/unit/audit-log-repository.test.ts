// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { AuditLogRepository } = await import('../../repositories/audit-log-repository.js');

describe('AuditLogRepository', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new AuditLogRepository();
    mockDatabases = (globalThis as any).__mockDatabases;
  });

  describe('getById', () => {
    it('should return an entry', async () => {
      const entry = { $id: 'a1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' };
      mockDatabases.getDocument.mockResolvedValueOnce(entry);
      const result = await repo.getById('a1');
      expect(result).toEqual(expect.objectContaining({ id: 'a1' }));
    });

    it('should return null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getById('a1');
      expect(result).toBeNull();
    });

    it('should return null on other database errors', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getById('a1');
      expect(result).toBeNull();
    });
  });

  describe('getByUserId', () => {
    it('should return entries for a user', async () => {
      const entries = [
        { $id: 'a1', user_id: 'u1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: entries, total: 1 });
      const result = await repo.getByUserId('u1');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('a1');
    });

    it('should return empty array on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getByUserId('u1');
      expect(result).toEqual([]);
    });
  });

  describe('getByAction', () => {
    it('should return entries by action', async () => {
      const entries = [
        { $id: 'a1', action: 'login', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: entries, total: 1 });
      const result = await repo.getByAction('login');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('a1');
    });

    it('should return empty array on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getByAction('login');
      expect(result).toEqual([]);
    });
  });

  describe('getByResource', () => {
    it('should return entries by resource type and id', async () => {
      const entries = [
        { $id: 'a1', resource_type: 'project', resource_id: 'p1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: entries, total: 1 });
      const result = await repo.getByResource('project', 'p1');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('a1');
    });

    it('should return empty array on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getByResource('project', 'p1');
      expect(result).toEqual([]);
    });
  });

  describe('getByDateRange', () => {
    it('should return entries in date range', async () => {
      const entries = [
        { $id: 'a1', $createdAt: '2025-06-01', $updatedAt: '2025-06-01' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: entries, total: 1 });
      const result = await repo.getByDateRange(new Date('2025-01-01'), new Date('2025-12-31'));
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('a1');
    });

    it('should return empty array on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getByDateRange(new Date(), new Date());
      expect(result).toEqual([]);
    });
  });

  describe('getFailedActions', () => {
    it('should return failed actions', async () => {
      const entries = [
        { $id: 'a1', status: 'failure', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: entries, total: 1 });
      const result = await repo.getFailedActions();
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('a1');
    });

    it('should return empty array on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.getFailedActions();
      expect(result).toEqual([]);
    });
  });

  describe('search', () => {
    it('should return paginated results with all optional filters combined', async () => {
      const entries = [
        { $id: 'a1', actor_id: 'admin-1', user_id: 'u1', action: 'user.suspended', status: 'success', $createdAt: '2025-06-01', $updatedAt: '2025-06-01' },
        { $id: 'a2', actor_id: 'admin-1', user_id: 'u1', action: 'user.suspended', status: 'success', $createdAt: '2025-06-02', $updatedAt: '2025-06-02' },
        { $id: 'a3', actor_id: 'admin-1', user_id: 'u1', action: 'user.suspended', status: 'success', $createdAt: '2025-06-03', $updatedAt: '2025-06-03' },
      ];
      // limit=2 => fetch limit+1 = 3 => hasMore true, page = first 2, nextCursor = a2
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: entries, total: 7 });

      const result = await repo.search({
        actorId: 'admin-1',
        userId: 'u1',
        action: 'user.suspended',
        resourceType: 'user',
        resourceId: 'u1',
        status: 'success',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-30'),
        limit: 2,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.id).toBe('a1');
      expect(result.items[1]!.id).toBe('a2');
      expect(result.total).toBe(7);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('a2');
    });

    it('should return hasMore false and null cursor when fewer docs than limit', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: 'a1', $createdAt: '2025-06-01', $updatedAt: '2025-06-01' }], total: 1 });
      const result = await repo.search({ limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should pass cursorAfter and clamp limit to 100 max', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      await repo.search({ limit: 500, cursor: 'a-42' });

      const queries = mockDatabases.listDocuments.mock.calls[0]![2];
      expect(queries).toContain('limit(101)'); // limit+1 for hasMore detection
      expect(queries).toContain('cursorAfter(a-42)');
    });

    it('should return empty result on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.search({ action: 'login' });
      expect(result).toEqual({ items: [], total: 0, hasMore: false, nextCursor: null });
    });
  });

  describe('listForRange', () => {
    it('should collect all entries across pages in a date range', async () => {
      const page1 = [
        { $id: 'a1', actor_id: 'admin-1', action: 'kyc.approved', $createdAt: '2025-06-01', $updatedAt: '2025-06-01' },
        { $id: 'a2', actor_id: 'admin-1', action: 'kyc.rejected', $createdAt: '2025-06-02', $updatedAt: '2025-06-02' },
      ];
      const page2 = [
        { $id: 'a3', actor_id: 'admin-2', action: 'dispute.resolved', $createdAt: '2025-06-03', $updatedAt: '2025-06-03' },
      ];
      // pageSize=2: first call returns 2 (== pageSize, keep paging), second returns 1 (< pageSize, stop)
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: page1, total: 3 })
        .mockResolvedValueOnce({ documents: page2, total: 3 });

      const result = await repo.listForRange(new Date('2025-06-01'), new Date('2025-06-30'), 2);

      expect(result).toHaveLength(3);
      expect(result[0]!.id).toBe('a1');
      // second page request used the cursor
      const secondQueries = mockDatabases.listDocuments.mock.calls[1]![2];
      expect(secondQueries).toContain('cursorAfter(a2)');
    });

    it('should return empty array on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      const result = await repo.listForRange(new Date(), new Date());
      expect(result).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from repository-coverage.test.ts
// ═══════════════════════════════════════════════════════════════

describe('AuditLogRepository - mapAuditLog payload parsing', () => {
  let repo: any;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new AuditLogRepository();
    mockDatabases = (globalThis as any).__mockDatabases;
  });

  it('should parse payload from JSON string to object via getById', async () => {
    const payloadStr = JSON.stringify({ action: 'login', ip: '127.0.0.1' });
    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'a1',
      $createdAt: '2025-01-01T00:00:00Z',
      $updatedAt: '2025-01-01T00:00:00Z',
      user_id: 'u1',
      payload: payloadStr,
      action: 'login',
      status: 'success',
    });

    const result = await repo.getById('a1');
    expect(result).not.toBeNull();
    expect(result!.payload).toEqual({ action: 'login', ip: '127.0.0.1' });
    expect(typeof result!.payload).toBe('object');
  });

  it('should parse payload from JSON string via getByUserId', async () => {
    const payloadStr = JSON.stringify({ key: 'value' });
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'a2',
        $createdAt: '2025-02-01',
        $updatedAt: '2025-02-01',
        user_id: 'u2',
        payload: payloadStr,
        action: 'update',
        status: 'success',
      }],
      total: 1,
    });

    const result = await repo.getByUserId('u2');
    expect(result).toHaveLength(1);
    expect(result[0]!.payload).toEqual({ key: 'value' });
  });

  it('should leave payload as-is when it is already an object', async () => {
    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'a3',
      $createdAt: '2025-03-01',
      $updatedAt: '2025-03-01',
      payload: { already: 'object' },
      action: 'test',
      status: 'success',
    });

    const result = await repo.getById('a3');
    expect(result).not.toBeNull();
    expect(result!.payload).toEqual({ already: 'object' });
  });
});
