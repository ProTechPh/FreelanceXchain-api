import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: mockLogger,
}));

const mockQuery = jest.fn();
(globalThis as any).mockPool = { query: mockQuery };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockQuery, connect: jest.fn(), on: jest.fn() },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: mockQuery,
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));

const {
  createSavedSearch,
  getUserSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  executeSavedSearch,
} = await import('../../services/saved-search-service.js');

const mockSavedSearchRow = {
  id: 'search-1',
  user_id: 'user-1',
  name: 'My Search',
  search_type: 'project' as const,
  filters: { skills: ['react'], minBudget: 100, maxBudget: 500 },
  notify_on_new: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('Saved Search Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
  });

  describe('createSavedSearch', () => {
    it('should create a saved search successfully', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockSavedSearchRow] });

      const result = await createSavedSearch('user-1', {
        name: 'My Search',
        searchType: 'project',
        filters: { skills: ['react'] },
      });

      expect(result.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO saved_searches'),
        expect.any(Array)
      );
    });

    it('should return VALIDATION_ERROR when filters are empty', async () => {
      const result = await createSavedSearch('user-1', {
        name: 'My Search',
        searchType: 'project',
        filters: {},
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('getUserSavedSearches', () => {
    it('should return user saved searches', async () => {
      const searches = [mockSavedSearchRow];
      mockPool.query.mockResolvedValueOnce({ rows: searches });

      const result = await getUserSavedSearches('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(searches);
      }
    });
  });

  describe('updateSavedSearch', () => {
    it('should update a saved search successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [{ ...mockSavedSearchRow, name: 'Updated' }] }); // update

      const result = await updateSavedSearch('search-1', 'user-1', { name: 'Updated' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated');
      }
    });

    it('should return UNAUTHORIZED when user does not own the search', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'other-user' }] });

      const result = await updateSavedSearch('search-1', 'user-1', { name: 'Updated' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('deleteSavedSearch', () => {
    it('should delete a saved search successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] }) // ownership check
        .mockResolvedValueOnce({ rows: [] }); // delete

      const result = await deleteSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(true);
    });
  });

  describe('executeSavedSearch', () => {
    it('should execute a project search', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockSavedSearchRow] }) // get search
        .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] }); // execute search

      const result = await executeSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(1);
      }
    });

    it('should return NOT_FOUND when search does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await executeSavedSearch('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });
});