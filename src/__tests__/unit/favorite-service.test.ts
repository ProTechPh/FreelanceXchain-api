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

const mockFavoriteRepository = {
  findByUserAndTarget: jest.fn<any>(),
  findByUser: jest.fn<any>(),
  create: jest.fn<any>(),
  removeByUserAndTarget: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/favorites-repository.ts'), () => ({
  favoriteRepository: mockFavoriteRepository,
}));

const mockProjectRepository = {
  getById: jest.fn<any>(),
  getProjectsByIds: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockUserRepository = {
  getUserById: jest.fn<any>(),
  getUsersByIds: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
}));

describe('Favorite Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Batch fetch defaults: no targets → clean empty results unless a test overrides
    mockProjectRepository.getProjectsByIds.mockResolvedValue([]);
    mockUserRepository.getUsersByIds.mockResolvedValue([]);
  });

  const importModule = async () => {
    return await import('../../services/favorite-service.js');
  };

  describe('addFavorite', () => {
    it('should add a project favorite successfully', async () => {
      const { addFavorite } = await importModule();

      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
      mockProjectRepository.getById.mockResolvedValueOnce({ id: 'project-1' });
      const favorite = { id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'project-1', created_at: '2025-01-01' };
      mockFavoriteRepository.create.mockResolvedValueOnce(favorite);

      const result = await addFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'fav-1',
        userId: 'user-1',
        targetType: 'project',
        targetId: 'project-1',
        createdAt: '2025-01-01',
      });
    });

    it('should add a freelancer favorite successfully', async () => {
      const { addFavorite } = await importModule();

      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
      mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'user-2' });
      const favorite = { id: 'fav-2', user_id: 'user-1', target_type: 'freelancer', target_id: 'user-2', created_at: '2025-01-01' };
      mockFavoriteRepository.create.mockResolvedValueOnce(favorite);

      const result = await addFavorite('user-1', 'freelancer', 'user-2');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'fav-2',
        userId: 'user-1',
        targetType: 'freelancer',
        targetId: 'user-2',
        createdAt: '2025-01-01',
      });
    });

    it('should return ALREADY_FAVORITED when duplicate', async () => {
      const { addFavorite } = await importModule();

      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce({ id: 'existing-fav' });

      const result = await addFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('ALREADY_FAVORITED');
    });

    it('should return TARGET_NOT_FOUND when target does not exist', async () => {
      const { addFavorite } = await importModule();

      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
      mockProjectRepository.getById.mockResolvedValueOnce(null);

      const result = await addFavorite('user-1', 'project', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TARGET_NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const { addFavorite } = await importModule();

      mockFavoriteRepository.findByUserAndTarget.mockRejectedValueOnce(new Error('DB error'));

      const result = await addFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('removeFavorite', () => {
    it('should remove a favorite successfully', async () => {
      const { removeFavorite } = await importModule();

      mockFavoriteRepository.removeByUserAndTarget.mockResolvedValueOnce(true);

      const result = await removeFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { removeFavorite } = await importModule();

      mockFavoriteRepository.removeByUserAndTarget.mockRejectedValueOnce(new Error('DB error'));

      const result = await removeFavorite('user-1', 'project', 'project-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getUserFavorites', () => {
    it('should return all user favorites with batch-fetched targets', async () => {
      const { getUserFavorites } = await importModule();

      const favorites = [
        { id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'project-1', created_at: '2025-01-01' },
        { id: 'fav-2', user_id: 'user-1', target_type: 'freelancer', target_id: 'user-2', created_at: '2025-01-02' },
      ];
      mockFavoriteRepository.findByUser.mockResolvedValueOnce(favorites);
      // Batch fetch: ONE call per target type with all ids (no N+1 getById)
      mockProjectRepository.getProjectsByIds.mockResolvedValueOnce([{ id: 'project-1', title: 'Test Project' }]);
      mockUserRepository.getUsersByIds.mockResolvedValueOnce([{ id: 'user-2', name: 'Freelancer' }]);

      const result = await getUserFavorites('user-1');

      expect(result.success).toBe(true);
      expect(mockProjectRepository.getProjectsByIds).toHaveBeenCalledWith(['project-1']);
      expect(mockUserRepository.getUsersByIds).toHaveBeenCalledWith(['user-2']);
      expect(result.data).toHaveLength(2);
    });

    it('should filter by target type', async () => {
      const { getUserFavorites } = await importModule();

      const favorites = [
        { id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'project-1', created_at: '2025-01-01' },
      ];
      mockFavoriteRepository.findByUser.mockResolvedValueOnce(favorites);
      mockProjectRepository.getProjectsByIds.mockResolvedValueOnce([{ id: 'project-1', title: 'Test' }]);

      const result = await getUserFavorites('user-1', 'project');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should drop favorites whose target has been deleted', async () => {
      const { getUserFavorites } = await importModule();

      const favorites = [
        { id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'deleted-project', created_at: '2025-01-01' },
        { id: 'fav-2', user_id: 'user-1', target_type: 'project', target_id: 'existing-project', created_at: '2025-01-02' },
      ];
      mockFavoriteRepository.findByUser.mockResolvedValueOnce(favorites);
      // Batch fetch only returns the surviving target → stale favorite is filtered out
      mockProjectRepository.getProjectsByIds.mockResolvedValueOnce([{ id: 'existing-project', title: 'Alive' }]);
      mockUserRepository.getUsersByIds.mockResolvedValueOnce([]);

      const result = await getUserFavorites('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      if (result.success) {
        expect(result.data[0].targetId).toBe('existing-project');
      }
    });

    it('should return empty array when no favorites', async () => {
      const { getUserFavorites } = await importModule();

      mockFavoriteRepository.findByUser.mockResolvedValueOnce([]);
      mockProjectRepository.getProjectsByIds.mockResolvedValueOnce([]);
      mockUserRepository.getUsersByIds.mockResolvedValueOnce([]);

      const result = await getUserFavorites('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should handle database errors', async () => {
      const { getUserFavorites } = await importModule();

      mockFavoriteRepository.findByUser.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserFavorites('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('isFavorited', () => {
    it('should return true when item is favorited', async () => {
      const { isFavorited } = await importModule();

      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce({ id: 'fav-1' });

      const result = await isFavorited('user-1', 'project', 'project-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    it('should return false when item is not favorited', async () => {
      const { isFavorited } = await importModule();

      mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);

      const result = await isFavorited('user-1', 'project', 'project-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    it('should handle database errors', async () => {
      const { isFavorited } = await importModule();

      mockFavoriteRepository.findByUserAndTarget.mockRejectedValueOnce(new Error('DB error'));

      const result = await isFavorited('user-1', 'project', 'project-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('Favorite Service - Direct Branch Coverage', () => {
  const importModule = async () => import('../../services/favorite-service.js');

  it('should return error when already favorited', async () => {
    const { addFavorite } = await importModule();
    mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce({ id: 'fav-1' });

    const result = await addFavorite('user-1', 'project', 'proj-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('ALREADY_FAVORITED');
  });

  it('should return error when target not found (project)', async () => {
    const { addFavorite } = await importModule();
    mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
    mockProjectRepository.getById.mockResolvedValueOnce(null);

    const result = await addFavorite('user-1', 'project', 'proj-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('TARGET_NOT_FOUND');
  });

  it('should return error when target not found (freelancer)', async () => {
    const { addFavorite } = await importModule();
    mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
    mockUserRepository.getUserById.mockResolvedValueOnce(null);

    const result = await addFavorite('user-1', 'freelancer', 'user-2');
    expect(result.success).toBe(false);
  });

  it('should handle addFavorite exception', async () => {
    const { addFavorite } = await importModule();
    mockFavoriteRepository.findByUserAndTarget.mockRejectedValueOnce(new Error('DB error'));

    const result = await addFavorite('user-1', 'project', 'proj-1');
    expect(result.success).toBe(false);
  });

  it('should handle removeFavorite exception', async () => {
    const { removeFavorite } = await importModule();
    mockFavoriteRepository.removeByUserAndTarget.mockRejectedValueOnce(new Error('DB error'));

    const result = await removeFavorite('user-1', 'project', 'proj-1');
    expect(result.success).toBe(false);
  });

  it('should handle getUserFavorites exception', async () => {
    const { getUserFavorites } = await importModule();
    mockFavoriteRepository.findByUser.mockRejectedValueOnce(new Error('DB error'));

    const result = await getUserFavorites('user-1');
    expect(result.success).toBe(false);
  });

  it('should handle isFavorited exception', async () => {
    const { isFavorited } = await importModule();
    mockFavoriteRepository.findByUserAndTarget.mockRejectedValueOnce(new Error('DB error'));

    const result = await isFavorited('user-1', 'project', 'proj-1');
    expect(result.success).toBe(false);
  });

  it('should handle addFavorite with project target', async () => {
    const { addFavorite } = await importModule();
    mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
    mockProjectRepository.getById.mockResolvedValueOnce({ id: 'proj-1' });
    mockFavoriteRepository.create.mockResolvedValueOnce({
      id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'proj-1',
      created_at: '2025-01-01',
    });

    const result = await addFavorite('user-1', 'project', 'proj-1');
    expect(result.success).toBe(true);
  });

  it('should handle addFavorite with freelancer target', async () => {
    const { addFavorite } = await importModule();
    mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
    mockUserRepository.getUserById.mockResolvedValueOnce({ id: 'user-2' });
    mockFavoriteRepository.create.mockResolvedValueOnce({
      id: 'fav-1', user_id: 'user-1', target_type: 'freelancer', target_id: 'user-2',
      created_at: '2025-01-01',
    });

    const result = await addFavorite('user-1', 'freelancer', 'user-2');
    expect(result.success).toBe(true);
  });
});

describe('Favorite Service - Additional Branch Coverage', () => {
  const importModule = async () => {
    return await import('../../services/favorite-service.js');
  };

  it('should drop favorites whose project target is missing from the batch fetch', async () => {
    const { getUserFavorites } = await importModule();

    // Create a favorite for a project that no longer exists
    mockFavoriteRepository.findByUser.mockResolvedValueOnce([
      { id: 'fav-1', user_id: 'user-1', target_type: 'project', target_id: 'deleted-project', created_at: '2025-01-01' },
    ]);
    mockProjectRepository.getProjectsByIds.mockResolvedValueOnce([]);
    mockUserRepository.getUsersByIds.mockResolvedValueOnce([]);

    const result = await getUserFavorites('user-1', 'project');
    expect(result.success).toBe(true);
    if (result.success) {
      // Stale favorites are dropped instead of leaking `target: null` entries
      expect(result.data).toHaveLength(0);
    }
  });

  it('should drop favorites whose freelancer target is missing from the batch fetch', async () => {
    const { getUserFavorites } = await importModule();

    mockFavoriteRepository.findByUser.mockResolvedValueOnce([
      { id: 'fav-1', user_id: 'user-1', target_type: 'freelancer', target_id: 'ghost-user', created_at: '2025-01-01' },
    ]);
    mockProjectRepository.getProjectsByIds.mockResolvedValueOnce([]);
    mockUserRepository.getUsersByIds.mockResolvedValueOnce([]);

    const result = await getUserFavorites('user-1', 'freelancer');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  // BLF-fav.1: concurrent addFavorite calls that race past the duplicate check
  // must be treated as ALREADY_FAVORITED (unique-index backstop), not a generic error.
  it('should return ALREADY_FAVORITED when create races a concurrent insert', async () => {
    const { addFavorite } = await importModule();

    mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
    mockProjectRepository.getById.mockResolvedValueOnce({ id: 'proj-1' });
    mockFavoriteRepository.create.mockRejectedValueOnce(new Error('duplicate key'));
    // The re-check finds the row the concurrent request inserted
    mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce({ id: 'fav-race' });

    const result = await addFavorite('user-1', 'project', 'proj-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('ALREADY_FAVORITED');
  });

  it('should propagate other create errors that are not duplicates', async () => {
    const { addFavorite } = await importModule();

    mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);
    mockProjectRepository.getById.mockResolvedValueOnce({ id: 'proj-1' });
    mockFavoriteRepository.create.mockRejectedValueOnce(new Error('db down'));
    // Re-check finds nothing → it was a real failure, not a race
    mockFavoriteRepository.findByUserAndTarget.mockResolvedValueOnce(null);

    const result = await addFavorite('user-1', 'project', 'proj-1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});
