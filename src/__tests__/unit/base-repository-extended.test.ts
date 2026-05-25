// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

describe('Base Repository PG - Extended Coverage', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../repositories/base-repository-pg.js');
  };

  describe('getById', () => {
    it('should return null when no rows', async () => {
      const { BaseRepositoryPg } = await importModule();
      const repo = new BaseRepositoryPg('test_table');
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.getById('nonexistent');
      expect(result).toBeNull();
    });

    it('should throw on query error', async () => {
      const { BaseRepositoryPg } = await importModule();
      const repo = new BaseRepositoryPg('test_table');
      mockPool.query.mockRejectedValueOnce(new Error('Connection lost'));
      await expect(repo.getById('test-id')).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should return null when no rows affected', async () => {
      const { BaseRepositoryPg } = await importModule();
      const repo = new BaseRepositoryPg('test_table');
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.update('nonexistent', { name: 'test' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should throw when delete query fails', async () => {
      const { BaseRepositoryPg } = await importModule();
      const repo = new BaseRepositoryPg('test_table');
      // First call might be getById check, second is the actual delete
      mockPool.query.mockRejectedValue(new Error('FK constraint'));
      await expect(repo.delete('test-id')).rejects.toThrow();
      mockPool.query.mockReset();
    });
  });

  describe('create', () => {
    it('should create entity successfully', async () => {
      const { BaseRepositoryPg } = await importModule();
      const repo = new BaseRepositoryPg('test_table');
      const entity = { id: 'new-1', name: 'Test' };
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...entity, created_at: '2025-01-01', updated_at: '2025-01-01' }], rowCount: 1 });
      const result = await repo.create(entity);
      expect(result.id).toBe('new-1');
    });
  });

  describe('getPool', () => {
    it('should return pool instance', async () => {
      const { BaseRepositoryPg } = await importModule();
      const repo = new BaseRepositoryPg('test_table');
      const pool = (repo as any).getPool();
      expect(pool).toBeDefined();
      expect(pool.query).toBeDefined();
    });
  });

  describe('queryPaginated error path', () => {
    it('should throw when paginated data query fails', async () => {
      const { BaseRepositoryPg } = await importModule();
      const repo = new BaseRepositoryPg('test_table');
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      mockPool.query.mockRejectedValueOnce(new Error('Timeout'));
      await expect((repo as any).queryPaginated('SELECT * FROM test_table', [], 10, 0)).rejects.toThrow('Failed to query paginated');
    });
  });
});
