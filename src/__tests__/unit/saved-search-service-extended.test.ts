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

describe('Saved Search Service - Extended Coverage', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/saved-search-service.js');
  };

  describe('createSavedSearch', () => {
    it('should create saved search with notifyOnNew', async () => {
      const { createSavedSearch } = await importModule();

      const savedSearch = { id: 'ss-1', user_id: 'user-1', name: 'My Search', search_type: 'project', filters: { skills: ['React'] }, notify_on_new: true };
      mockPool.query.mockResolvedValueOnce({ rows: [savedSearch], rowCount: 1 });

      const result = await createSavedSearch('user-1', {
        name: 'My Search',
        searchType: 'project',
        filters: { skills: ['React'] },
        notifyOnNew: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.notify_on_new).toBe(true);
    });

    it('should fail when filters are empty', async () => {
      const { createSavedSearch } = await importModule();

      const result = await createSavedSearch('user-1', {
        name: 'My Search',
        searchType: 'project',
        filters: {},
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle database errors', async () => {
      const { createSavedSearch } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await createSavedSearch('user-1', {
        name: 'My Search',
        searchType: 'project',
        filters: { skills: ['React'] },
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getUserSavedSearches', () => {
    it('should return all saved searches for user', async () => {
      const { getUserSavedSearches } = await importModule();

      const searches = [
        { id: 'ss-1', user_id: 'user-1', name: 'Search 1', search_type: 'project' },
        { id: 'ss-2', user_id: 'user-1', name: 'Search 2', search_type: 'freelancer' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: searches, rowCount: 2 });

      const result = await getUserSavedSearches('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should filter by search type', async () => {
      const { getUserSavedSearches } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1', search_type: 'project' }], rowCount: 1 });

      const result = await getUserSavedSearches('user-1', 'project');

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { getUserSavedSearches } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserSavedSearches('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('updateSavedSearch', () => {
    it('should update name successfully', async () => {
      const { updateSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1', name: 'Updated' }], rowCount: 1 });

      const result = await updateSavedSearch('ss-1', 'user-1', { name: 'Updated' });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated');
    });

    it('should update filters', async () => {
      const { updateSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1', filters: { skills: ['Vue'] } }], rowCount: 1 });

      const result = await updateSavedSearch('ss-1', 'user-1', { filters: { skills: ['Vue'] } });

      expect(result.success).toBe(true);
    });

    it('should update notifyOnNew', async () => {
      const { updateSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1', notify_on_new: true }], rowCount: 1 });

      const result = await updateSavedSearch('ss-1', 'user-1', { notifyOnNew: true });

      expect(result.success).toBe(true);
    });

    it('should return existing when no updates provided', async () => {
      const { updateSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'ss-1', name: 'Existing' }], rowCount: 1 });

      const result = await updateSavedSearch('ss-1', 'user-1', {});

      expect(result.success).toBe(true);
    });

    it('should fail when search not found', async () => {
      const { updateSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await updateSavedSearch('nonexistent', 'user-1', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { updateSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }], rowCount: 1 });

      const result = await updateSavedSearch('ss-1', 'user-1', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle update returning no rows', async () => {
      const { updateSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await updateSavedSearch('ss-1', 'user-1', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const { updateSavedSearch } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await updateSavedSearch('ss-1', 'user-1', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('deleteSavedSearch', () => {
    it('should delete saved search successfully', async () => {
      const { deleteSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await deleteSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
    });

    it('should fail when search not found', async () => {
      const { deleteSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await deleteSavedSearch('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { deleteSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }], rowCount: 1 });

      const result = await deleteSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { deleteSavedSearch } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await deleteSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('executeSavedSearch', () => {
    it('should execute project search with all filters', async () => {
      const { executeSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ss-1', user_id: 'user-1', search_type: 'project',
          filters: { skills: ['React'], minBudget: 100, maxBudget: 5000, keyword: 'web' },
        }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'proj-1', title: 'Web App' }], rowCount: 1 });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.count).toBe(1);
    });

    it('should execute freelancer search with all filters', async () => {
      const { executeSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ss-1', user_id: 'user-1', search_type: 'freelancer',
          filters: { skills: ['React'], minHourlyRate: 50, maxHourlyRate: 150 },
        }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'fl-1', name: 'John' }], rowCount: 1 });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
    });

    it('should execute project search without optional filters', async () => {
      const { executeSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ss-1', user_id: 'user-1', search_type: 'project',
          filters: {},
        }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.results).toEqual([]);
    });

    it('should execute freelancer search without optional filters', async () => {
      const { executeSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ss-1', user_id: 'user-1', search_type: 'freelancer',
          filters: {},
        }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
    });

    it('should fail when search not found', async () => {
      const { executeSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await executeSavedSearch('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { executeSavedSearch } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ss-1', user_id: 'other-user', search_type: 'project', filters: {} }],
        rowCount: 1,
      });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { executeSavedSearch } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
