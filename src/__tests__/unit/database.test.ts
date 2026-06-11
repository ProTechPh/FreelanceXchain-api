// @ts-nocheck
/**
 * Database Config Tests
 * Note: The database module is mocked globally in jest.setup.ts.
 * These tests verify the mock behavior and the module's interface.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

describe('Database Config', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
    mockPool.connect.mockReset();
  });

  const importModule = async () => {
    return await import('../../config/database.js');
  };

  describe('pool', () => {
    it('should export a pool object', async () => {
      const { pool } = await importModule();
      expect(pool).toBeDefined();
    });

    it('should have query method', async () => {
      const { pool } = await importModule();
      expect(pool.query).toBeDefined();
    });

    it('should have connect method', async () => {
      const { pool } = await importModule();
      expect(pool.connect).toBeDefined();
    });
  });

  describe('initializeDatabase', () => {
    it('should be exported as a function', async () => {
      const { initializeDatabase } = await importModule();
      expect(typeof initializeDatabase).toBe('function');
    });

    it('should resolve without error', async () => {
      const { initializeDatabase } = await importModule();
      await expect(initializeDatabase()).resolves.toBeUndefined();
    });
  });

  describe('query', () => {
    it('should be exported as a function', async () => {
      const { query } = await importModule();
      expect(typeof query).toBe('function');
    });

    it('should execute query and return rows', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: '1', name: 'test' }], rowCount: 1 });

      const { query } = await importModule();
      const result = await query('SELECT * FROM users WHERE id = $1', ['1']);

      expect(result).toEqual([{ id: '1', name: 'test' }]);
    });

    it('should return empty array when no rows', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { query } = await importModule();
      const result = await query('SELECT * FROM users');

      expect(result).toEqual([]);
    });
  });

  describe('queryOne', () => {
    it('should be exported as a function', async () => {
      const { queryOne } = await importModule();
      expect(typeof queryOne).toBe('function');
    });

    it('should return first row when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: '1', name: 'test' }], rowCount: 1 });

      const { queryOne } = await importModule();
      const result = await queryOne('SELECT * FROM users WHERE id = $1', ['1']);

      expect(result).toEqual({ id: '1', name: 'test' });
    });

    it('should return null when no rows found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { queryOne } = await importModule();
      const result = await queryOne('SELECT * FROM users WHERE id = $1', ['nonexistent']);

      expect(result).toBeNull();
    });
  });
});
