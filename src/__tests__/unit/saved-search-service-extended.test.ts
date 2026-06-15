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

const mockSavedSearchRepository = {
  create: jest.fn<any>(),
  findByUser: jest.fn<any>(),
  findOwnerById: jest.fn<any>(),
  getById: jest.fn<any>(),
  update: jest.fn<any>(),
  delete: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/saved-search-repository.ts'), () => ({
  savedSearchRepository: mockSavedSearchRepository,
}));

const mockProjectRepository = {
  getAllOpenProjects: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockFreelancerProfileRepository = {
  getAllProfilesPaginated: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/freelancer-profile-repository.ts'), () => ({
  freelancerProfileRepository: mockFreelancerProfileRepository,
}));

describe('Saved Search Service - Extended Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const importModule = async () => {
    return await import('../../services/saved-search-service.js');
  };

  describe('createSavedSearch', () => {
    it('should create saved search with notifyOnNew', async () => {
      const { createSavedSearch } = await importModule();

      const savedSearch = { id: 'ss-1', user_id: 'user-1', name: 'My Search', search_type: 'project', filters: '{"skills":["React"]}', notify_on_new: true, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockSavedSearchRepository.create.mockResolvedValueOnce(savedSearch);

      const result = await createSavedSearch('user-1', {
        name: 'My Search',
        searchType: 'project',
        filters: { skills: ['React'] },
        notifyOnNew: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.notifyOnNew).toBe(true);
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

      mockSavedSearchRepository.create.mockRejectedValueOnce(new Error('DB error'));

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
        { id: 'ss-1', user_id: 'user-1', name: 'Search 1', search_type: 'project', filters: '{}', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-01' },
        { id: 'ss-2', user_id: 'user-1', name: 'Search 2', search_type: 'freelancer', filters: '{}', notify_on_new: false, created_at: '2025-01-02', updated_at: '2025-01-02' },
      ];
      mockSavedSearchRepository.findByUser.mockResolvedValueOnce(searches);

      const result = await getUserSavedSearches('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should filter by search type', async () => {
      const { getUserSavedSearches } = await importModule();

      mockSavedSearchRepository.findByUser.mockResolvedValueOnce([{ id: 'ss-1', search_type: 'project', filters: '{}', user_id: 'user-1', name: 'S', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-01' }]);

      const result = await getUserSavedSearches('user-1', 'project');

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { getUserSavedSearches } = await importModule();

      mockSavedSearchRepository.findByUser.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserSavedSearches('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('updateSavedSearch', () => {
    it('should update name successfully', async () => {
      const { updateSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.update.mockResolvedValueOnce({ id: 'ss-1', name: 'Updated', user_id: 'user-1', search_type: 'project', filters: '{}', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-02' });

      const result = await updateSavedSearch('ss-1', 'user-1', { name: 'Updated' });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Updated');
    });

    it('should update filters', async () => {
      const { updateSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.update.mockResolvedValueOnce({ id: 'ss-1', filters: '{"skills":["Vue"]}', user_id: 'user-1', name: 'S', search_type: 'project', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-02' });

      const result = await updateSavedSearch('ss-1', 'user-1', { filters: { skills: ['Vue'] } });

      expect(result.success).toBe(true);
    });

    it('should update notifyOnNew', async () => {
      const { updateSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.update.mockResolvedValueOnce({ id: 'ss-1', notify_on_new: true, user_id: 'user-1', name: 'S', search_type: 'project', filters: '{}', created_at: '2025-01-01', updated_at: '2025-01-02' });

      const result = await updateSavedSearch('ss-1', 'user-1', { notifyOnNew: true });

      expect(result.success).toBe(true);
    });

    it('should return existing when no updates provided', async () => {
      const { updateSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.getById.mockResolvedValueOnce({ id: 'ss-1', name: 'Existing', user_id: 'user-1', search_type: 'project', filters: '{}', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-01' });

      const result = await updateSavedSearch('ss-1', 'user-1', {});

      expect(result.success).toBe(true);
    });

    it('should fail when search not found', async () => {
      const { updateSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await updateSavedSearch('nonexistent', 'user-1', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { updateSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await updateSavedSearch('ss-1', 'user-1', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle update returning null', async () => {
      const { updateSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.update.mockResolvedValueOnce(null);

      const result = await updateSavedSearch('ss-1', 'user-1', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const { updateSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockRejectedValueOnce(new Error('DB error'));

      const result = await updateSavedSearch('ss-1', 'user-1', { name: 'New' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('deleteSavedSearch', () => {
    it('should delete saved search successfully', async () => {
      const { deleteSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.delete.mockResolvedValueOnce(true);

      const result = await deleteSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
    });

    it('should fail when search not found', async () => {
      const { deleteSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await deleteSavedSearch('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { deleteSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await deleteSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { deleteSavedSearch } = await importModule();

      mockSavedSearchRepository.findOwnerById.mockRejectedValueOnce(new Error('DB error'));

      const result = await deleteSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('executeSavedSearch', () => {
    it('should execute project search with all filters', async () => {
      const { executeSavedSearch } = await importModule();

      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'user-1', search_type: 'project',
        filters: JSON.stringify({ skills: ['React'], minBudget: 100, maxBudget: 5000, keyword: 'web' }),
        name: 'S', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [{ id: 'proj-1', title: 'Web App', description: 'A web app', budget: 300, required_skills: [{ skill_name: 'React' }], created_at: '2025-01-01' }],
        total: 1, hasMore: false,
      });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.count).toBe(1);
    });

    it('should execute freelancer search with all filters', async () => {
      const { executeSavedSearch } = await importModule();

      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'user-1', search_type: 'freelancer',
        filters: JSON.stringify({ skills: ['React'], minHourlyRate: 50, maxHourlyRate: 150 }),
        name: 'S', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockFreelancerProfileRepository.getAllProfilesPaginated.mockResolvedValueOnce({
        items: [{ user_id: 'fl-1', name: 'John', skills: [{ name: 'React' }], hourly_rate: 100, created_at: '2025-01-01' }],
        total: 1, hasMore: false,
      });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
    });

    it('should execute project search without optional filters', async () => {
      const { executeSavedSearch } = await importModule();

      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'user-1', search_type: 'project',
        filters: JSON.stringify({}),
        name: 'S', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [], total: 0, hasMore: false,
      });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.results).toEqual([]);
    });

    it('should execute freelancer search without optional filters', async () => {
      const { executeSavedSearch } = await importModule();

      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'user-1', search_type: 'freelancer',
        filters: JSON.stringify({}),
        name: 'S', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockFreelancerProfileRepository.getAllProfilesPaginated.mockResolvedValueOnce({
        items: [], total: 0, hasMore: false,
      });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(true);
    });

    it('should fail when search not found', async () => {
      const { executeSavedSearch } = await importModule();

      mockSavedSearchRepository.getById.mockResolvedValueOnce(null);

      const result = await executeSavedSearch('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the owner', async () => {
      const { executeSavedSearch } = await importModule();

      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        id: 'ss-1', user_id: 'other-user', search_type: 'project',
        filters: JSON.stringify({}),
        name: 'S', notify_on_new: false, created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { executeSavedSearch } = await importModule();

      mockSavedSearchRepository.getById.mockRejectedValueOnce(new Error('DB error'));

      const result = await executeSavedSearch('ss-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
