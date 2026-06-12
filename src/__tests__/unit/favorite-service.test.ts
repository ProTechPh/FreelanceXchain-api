// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockPoolObj = { query: jest.fn(), connect: jest.fn(), on: jest.fn() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPoolObj,
}));

describe('Favorite Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = mockPoolObj;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/favorite-service.js');
  };

  describe('addFavorite', () => {
    it('should add a project favorite successfully', async () => {
      const { addFavorite } = await importModule();

      // Check existing - none found
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Verify target exists
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'project-1' }], rowCount: 1 });
      // Insert favorite
      const favorite = { id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'project-1', created_at: '2025-01-01' };
      mockPool.query.mockResolvedValueOnce({ rows: [favorite], rowCount: 1 });

      const result = await addFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(favorite);
    });

    it('should add a freelancer favorite successfully', async () => {
      const { addFavorite } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-2' }], rowCount: 1 });
      const favorite = { id: 'fav-2', user_id: 'user-1', target_type: 'freelancer', target_id: 'user-2' };
      mockPool.query.mockResolvedValueOnce({ rows: [favorite], rowCount: 1 });

      const result = await addFavorite('user-1', 'freelancer', 'user-2');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(favorite);
    });

    it('should return ALREADY_FAVORITED when duplicate', async () => {
      const { addFavorite } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-fav' }], rowCount: 1 });

      const result = await addFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('ALREADY_FAVORITED');
    });

    it('should return TARGET_NOT_FOUND when target does not exist', async () => {
      const { addFavorite } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await addFavorite('user-1', 'project', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TARGET_NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const { addFavorite } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await addFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('removeFavorite', () => {
    it('should remove a favorite successfully', async () => {
      const { removeFavorite } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await removeFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { removeFavorite } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await removeFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getUserFavorites', () => {
    it('should return all user favorites', async () => {
      const { getUserFavorites } = await importModule();

      const favorites = [
        { id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'project-1', created_at: '2025-01-01' },
        { id: 'fav-2', user_id: 'user-1', target_type: 'freelancer', target_id: 'user-2', created_at: '2025-01-02' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: favorites, rowCount: 2 });
      // Batch fetch projects
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'project-1', title: 'Test Project' }], rowCount: 1 });
      // Batch fetch users
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-2', name: 'Freelancer' }], rowCount: 1 });

      const result = await getUserFavorites('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should filter by target type', async () => {
      const { getUserFavorites } = await importModule();

      const favorites = [
        { id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'project-1', created_at: '2025-01-01' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: favorites, rowCount: 1 });
      // Batch fetch projects
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'project-1', title: 'Test' }], rowCount: 1 });

      const result = await getUserFavorites('user-1', 'project');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should return empty array when no favorites', async () => {
      const { getUserFavorites } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getUserFavorites('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should handle database errors', async () => {
      const { getUserFavorites } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserFavorites('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('isFavorited', () => {
    it('should return true when item is favorited', async () => {
      const { isFavorited } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'fav-1' }], rowCount: 1 });

      const result = await isFavorited('user-1', 'project', 'project-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should return false when item is not favorited', async () => {
      const { isFavorited } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await isFavorited('user-1', 'project', 'project-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    it('should handle database errors', async () => {
      const { isFavorited } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await isFavorited('user-1', 'project', 'project-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
