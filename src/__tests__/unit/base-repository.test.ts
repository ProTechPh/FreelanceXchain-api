import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const { BaseRepository } = await import('../../repositories/base-repository-pg.js');

interface TestEntity {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

describe('BaseRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new BaseRepository('test_table' as any);
  });

  describe('create', () => {
    it('should create and return entity with timestamps', async () => {
      const entity = { id: 'e1', name: 'Test', created_at: '2024-01-01', updated_at: '2024-01-01' };
      mockAppwriteResult({ data: entity });
      const result = await repo.create({ id: 'e1', name: 'Test' } as any);
      expect(result).toEqual(entity);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(repo.create({ id: 'e1' } as any)).rejects.toThrow('Failed to create');
    });
  });

  describe('getById', () => {
    it('should return an entity', async () => {
      const entity = { id: 'e1', name: 'Test' };
      mockAppwriteResult({ data: entity });
      const result = await repo.getById('e1');
      expect(result).toEqual(entity);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.getById('e1');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.getById('e1')).rejects.toThrow('Failed to get by id');
    });
  });

  describe('update', () => {
    it('should update and return entity', async () => {
      const entity = { id: 'e1', name: 'Updated' };
      mockAppwriteResult({ data: entity });
      const result = await repo.update('e1', { name: 'Updated' });
      expect(result).toEqual(entity);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.update('e1', { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'update failed' } });
      await expect(repo.update('e1', { name: 'Updated' })).rejects.toThrow('Failed to update');
    });
  });

  describe('delete', () => {
    it('should delete and return true when entity exists', async () => {
      mockAppwriteResult({ data: { id: 'e1' } });
      const result = await repo.delete('e1');
      expect(result).toBe(true);
    });

    it('should return false when entity not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.delete('e1');
      expect(result).toBe(false);
    });

    it('should throw when getById fails during delete', async () => {
      mockAppwriteResult({ error: { message: 'delete failed' } });
      await expect(repo.delete('e1')).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('should return entity matching column and value', async () => {
      const entity = { id: 'e1', name: 'Test' };
      mockAppwriteResult({ data: entity });
      const result = await repo.findOne('name', 'Test');
      expect(result).toEqual(entity);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await repo.findOne('name', 'Test');
      expect(result).toBeNull();
    });

    it('should throw on other database errors', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.findOne('name', 'Test')).rejects.toThrow('Failed to find');
    });
  });

  describe('queryAll', () => {
    it('should return all entities ordered', async () => {
      const entities = [{ id: 'e1' }, { id: 'e2' }];
      mockAppwriteResult({ data: entities });
      const result = await repo.queryAll('created_at', false);
      expect(result).toEqual(entities);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(repo.queryAll()).rejects.toThrow('Failed to query');
    });
  });

  describe('queryPaginated', () => {
    it('should return paginated results', async () => {
      const entities = [{ id: 'e1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: entities, rowCount: 1 });
      const result = await repo.queryPaginated();
      expect(result.items).toEqual(entities);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should calculate hasMore correctly', async () => {
      const entities = [{ id: 'e1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: entities, rowCount: 1 });
      const result = await repo.queryPaginated({ limit: 1, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(repo.queryPaginated()).rejects.toThrow();
    });
  });
});