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
});
