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
  filters: JSON.stringify({ skills: ['react'], minBudget: 100, maxBudget: 500 }),
  notify_on_new: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('Saved Search Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSavedSearch', () => {
    it('should create a saved search successfully', async () => {
      mockSavedSearchRepository.create.mockResolvedValueOnce(mockSavedSearchRow);

      const result = await createSavedSearch('user-1', {
        name: 'My Search',
        searchType: 'project',
        filters: { skills: ['react'] },
      });

      expect(result.success).toBe(true);
      expect(mockSavedSearchRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', name: 'My Search' })
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

    it('should handle database errors', async () => {
      mockSavedSearchRepository.create.mockRejectedValueOnce(new Error('DB error'));

      const result = await createSavedSearch('user-1', {
        name: 'My Search',
        searchType: 'project',
        filters: { skills: ['react'] },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('getUserSavedSearches', () => {
    it('should return user saved searches', async () => {
      const searches = [mockSavedSearchRow];
      mockSavedSearchRepository.findByUser.mockResolvedValueOnce(searches);

      const result = await getUserSavedSearches('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
      }
    });

    it('should filter by searchType', async () => {
      mockSavedSearchRepository.findByUser.mockResolvedValueOnce([]);

      const result = await getUserSavedSearches('user-1', 'freelancer');

      expect(result.success).toBe(true);
      expect(mockSavedSearchRepository.findByUser).toHaveBeenCalledWith('user-1', 'freelancer');
    });

    it('should handle database errors', async () => {
      mockSavedSearchRepository.findByUser.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserSavedSearches('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('updateSavedSearch', () => {
    it('should update a saved search successfully', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.update.mockResolvedValueOnce({ ...mockSavedSearchRow, name: 'Updated' });

      const result = await updateSavedSearch('search-1', 'user-1', { name: 'Updated' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated');
      }
    });

    it('should return NOT_FOUND when search does not exist', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await updateSavedSearch('nonexistent', 'user-1', { name: 'Updated' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return UNAUTHORIZED when user does not own the search', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await updateSavedSearch('search-1', 'user-1', { name: 'Updated' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should return existing search when no update fields provided', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.getById.mockResolvedValueOnce(mockSavedSearchRow);

      const result = await updateSavedSearch('search-1', 'user-1', {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('My Search');
      }
    });

    it('should update filters', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      const updated = { ...mockSavedSearchRow, filters: JSON.stringify({ skills: ['vue'] }) };
      mockSavedSearchRepository.update.mockResolvedValueOnce(updated);

      const result = await updateSavedSearch('search-1', 'user-1', { filters: { skills: ['vue'] } });

      expect(result.success).toBe(true);
    });

    it('should update notifyOnNew', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      const updated = { ...mockSavedSearchRow, notify_on_new: true };
      mockSavedSearchRepository.update.mockResolvedValueOnce(updated);

      const result = await updateSavedSearch('search-1', 'user-1', { notifyOnNew: true });

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      mockSavedSearchRepository.findOwnerById.mockRejectedValueOnce(new Error('DB error'));

      const result = await updateSavedSearch('search-1', 'user-1', { name: 'Updated' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('deleteSavedSearch', () => {
    it('should delete a saved search successfully', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('user-1');
      mockSavedSearchRepository.delete.mockResolvedValueOnce(true);

      const result = await deleteSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(true);
    });

    it('should return NOT_FOUND when search does not exist', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce(null);

      const result = await deleteSavedSearch('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return UNAUTHORIZED when user does not own the search', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValueOnce('other-user');

      const result = await deleteSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should handle database errors', async () => {
      mockSavedSearchRepository.findOwnerById.mockRejectedValueOnce(new Error('DB error'));

      const result = await deleteSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('executeSavedSearch', () => {
    it('should execute a project search', async () => {
      mockSavedSearchRepository.getById.mockResolvedValueOnce(mockSavedSearchRow);
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [{ id: 'proj-1', title: 'Web App', budget: 300, required_skills: [{ skill_name: 'react' }], created_at: '2025-01-01', description: 'Test' }],
        total: 1,
        hasMore: false,
      });

      const result = await executeSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(1);
      }
    });

    it('should return NOT_FOUND when search does not exist', async () => {
      mockSavedSearchRepository.getById.mockResolvedValueOnce(null);

      const result = await executeSavedSearch('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return UNAUTHORIZED when user does not own the search', async () => {
      mockSavedSearchRepository.getById.mockResolvedValueOnce({
        ...mockSavedSearchRow,
        user_id: 'other-user',
      });

      const result = await executeSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should filter projects by skills', async () => {
      const searchWithSkills = {
        ...mockSavedSearchRow,
        filters: JSON.stringify({ skills: ['react', 'node'] }),
      };
      mockSavedSearchRepository.getById.mockResolvedValueOnce(searchWithSkills);
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [
          { id: 'proj-1', title: 'Web App', budget: 300, required_skills: [{ skill_name: 'react' }], created_at: '2025-01-01', description: 'Test' },
          { id: 'proj-2', title: 'Python App', budget: 400, required_skills: [{ skill_name: 'python' }], created_at: '2025-01-02', description: 'Test 2' },
        ],
        total: 2,
        hasMore: false,
      });

      const result = await executeSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(1);
        expect(result.data.results[0].id).toBe('proj-1');
      }
    });

    it('should filter projects by budget range', async () => {
      const searchWithBudget = {
        ...mockSavedSearchRow,
        filters: JSON.stringify({ minBudget: 200, maxBudget: 500 }),
      };
      mockSavedSearchRepository.getById.mockResolvedValueOnce(searchWithBudget);
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [
          { id: 'proj-1', title: 'Cheap', budget: 100, required_skills: [], created_at: '2025-01-01', description: 'Test' },
          { id: 'proj-2', title: 'Mid', budget: 300, required_skills: [], created_at: '2025-01-02', description: 'Test 2' },
          { id: 'proj-3', title: 'Expensive', budget: 600, required_skills: [], created_at: '2025-01-03', description: 'Test 3' },
        ],
        total: 3,
        hasMore: false,
      });

      const result = await executeSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(1);
        expect(result.data.results[0].id).toBe('proj-2');
      }
    });

    it('should filter projects by keyword in title or description', async () => {
      const searchWithKeyword = {
        ...mockSavedSearchRow,
        filters: JSON.stringify({ keyword: 'mobile' }),
      };
      mockSavedSearchRepository.getById.mockResolvedValueOnce(searchWithKeyword);
      mockProjectRepository.getAllOpenProjects.mockResolvedValueOnce({
        items: [
          { id: 'proj-1', title: 'Mobile App', budget: 300, required_skills: [], created_at: '2025-01-01', description: 'Build a mobile app' },
          { id: 'proj-2', title: 'Web App', budget: 400, required_skills: [], created_at: '2025-01-02', description: 'Build a web app' },
        ],
        total: 2,
        hasMore: false,
      });

      const result = await executeSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(1);
        expect(result.data.results[0].id).toBe('proj-1');
      }
    });

    it('should execute freelancer search', async () => {
      const freelancerSearch = {
        ...mockSavedSearchRow,
        search_type: 'freelancer',
        filters: JSON.stringify({ skills: ['react'] }),
      };
      mockSavedSearchRepository.getById.mockResolvedValueOnce(freelancerSearch);
      mockFreelancerProfileRepository.getAllProfilesPaginated.mockResolvedValueOnce({
        items: [
          { id: 'fp-1', skills: [{ name: 'react' }], hourly_rate: 50, created_at: '2025-01-01' },
          { id: 'fp-2', skills: [{ name: 'python' }], hourly_rate: 60, created_at: '2025-01-02' },
        ],
        total: 2,
        hasMore: false,
      });

      const result = await executeSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(1);
        expect(result.data.results[0].id).toBe('fp-1');
      }
    });

    it('should filter freelancers by hourly rate', async () => {
      const freelancerSearch = {
        ...mockSavedSearchRow,
        search_type: 'freelancer',
        filters: JSON.stringify({ minHourlyRate: 40, maxHourlyRate: 55 }),
      };
      mockSavedSearchRepository.getById.mockResolvedValueOnce(freelancerSearch);
      mockFreelancerProfileRepository.getAllProfilesPaginated.mockResolvedValueOnce({
        items: [
          { id: 'fp-1', skills: [], hourly_rate: 30, created_at: '2025-01-01' },
          { id: 'fp-2', skills: [], hourly_rate: 50, created_at: '2025-01-02' },
          { id: 'fp-3', skills: [], hourly_rate: 70, created_at: '2025-01-03' },
        ],
        total: 3,
        hasMore: false,
      });

      const result = await executeSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(1);
        expect(result.data.results[0].id).toBe('fp-2');
      }
    });

    it('should handle database errors', async () => {
      mockSavedSearchRepository.getById.mockRejectedValueOnce(new Error('DB error'));

      const result = await executeSavedSearch('search-1', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
