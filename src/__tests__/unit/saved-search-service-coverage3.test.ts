// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockLogger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };

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

describe('Saved Search Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // L42: createSavedSearch - filters returned as object (not string)
  describe('createSavedSearch - filters as object (L42)', () => {
    it('should parse filters from string when stored as string', async () => {
      const savedRow = {
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: JSON.stringify({ skills: ['react'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      };
      mockSavedSearchRepository.create.mockResolvedValue(savedRow);

      const result = await createSavedSearch('u-1', {
        name: 'Test', searchType: 'project', filters: { skills: ['react'] },
      });
      expect(result.success).toBe(true);
    });
  });

  // L77: getUserSavedSearches - filters returned as object (not string)
  describe('getUserSavedSearches - filters as string (L77)', () => {
    it('should parse filters from string', async () => {
      const rows = [{
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: JSON.stringify({ skills: ['react'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      }];
      mockSavedSearchRepository.findByUser.mockResolvedValue(rows);

      const result = await getUserSavedSearches('u-1');
      expect(result.success).toBe(true);
    });

    it('should handle filters already as object', async () => {
      const rows = [{
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: { skills: ['react'] },
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      }];
      mockSavedSearchRepository.findByUser.mockResolvedValue(rows);

      const result = await getUserSavedSearches('u-1');
      expect(result.success).toBe(true);
    });
  });

  // L136: updateSavedSearch - return existing when no update fields, filters as string
  describe('updateSavedSearch - existing filters as string (L136)', () => {
    it('should parse existing filters when no update fields provided', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValue('u-1');
      mockSavedSearchRepository.getById.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: JSON.stringify({ skills: ['react'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await updateSavedSearch('s-1', 'u-1', {});
      expect(result.success).toBe(true);
    });

    it('should handle existing filters as object', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValue('u-1');
      mockSavedSearchRepository.getById.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: { skills: ['react'] },
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await updateSavedSearch('s-1', 'u-1', {});
      expect(result.success).toBe(true);
    });
  });

  // L163: updateSavedSearch - updated filters as string
  describe('updateSavedSearch - updated filters as string (L163)', () => {
    it('should parse updated filters from string', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValue('u-1');
      mockSavedSearchRepository.update.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: JSON.stringify({ skills: ['vue'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await updateSavedSearch('s-1', 'u-1', { filters: { skills: ['vue'] } });
      expect(result.success).toBe(true);
    });

    it('should handle updated filters as object', async () => {
      mockSavedSearchRepository.findOwnerById.mockResolvedValue('u-1');
      mockSavedSearchRepository.update.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: { skills: ['vue'] },
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });

      const result = await updateSavedSearch('s-1', 'u-1', { filters: { skills: ['vue'] } });
      expect(result.success).toBe(true);
    });
  });

  // L262, L277: executeSavedSearch - project search sort and skill fallback
  describe('executeSavedSearch - project sort and skill fallbacks (L262, L277)', () => {
    it('should sort projects by created_at descending with 2+ items', async () => {
      mockSavedSearchRepository.getById.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: JSON.stringify({ skills: ['react'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValue({
        items: [
          { id: 'p-1', title: 'A', budget: 100, required_skills: [{ skill_name: 'react' }], created_at: '2025-01-01', description: 'Test' },
          { id: 'p-2', title: 'B', budget: 200, required_skills: [{ skill_name: 'react' }], created_at: '2025-01-03', description: 'Test' },
          { id: 'p-3', title: 'C', budget: 300, required_skills: [{ skill_name: 'react' }], created_at: '2025-01-02', description: 'Test' },
        ],
        total: 3, hasMore: false,
      });

      const result = await executeSavedSearch('s-1', 'u-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(3);
        // Should be sorted by created_at desc
        expect(result.data.results[0].id).toBe('p-2');
        expect(result.data.results[1].id).toBe('p-3');
        expect(result.data.results[2].id).toBe('p-1');
      }
    });

    it('should handle skills with "name" instead of "skill_name"', async () => {
      mockSavedSearchRepository.getById.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: JSON.stringify({ skills: ['react'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValue({
        items: [
          { id: 'p-1', title: 'A', budget: 100, required_skills: [{ name: 'react' }], created_at: '2025-01-01', description: 'Test' },
        ],
        total: 1, hasMore: false,
      });

      const result = await executeSavedSearch('s-1', 'u-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.count).toBe(1);
    });

    it('should handle projects with undefined required_skills', async () => {
      mockSavedSearchRepository.getById.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'project',
        filters: JSON.stringify({ skills: ['react'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockProjectRepository.getAllOpenProjects.mockResolvedValue({
        items: [
          { id: 'p-1', title: 'A', budget: 100, required_skills: undefined, created_at: '2025-01-01', description: 'Test' },
          { id: 'p-2', title: 'B', budget: 200, required_skills: [{ skill_name: 'react' }], created_at: '2025-01-02', description: 'Test' },
        ],
        total: 2, hasMore: false,
      });

      const result = await executeSavedSearch('s-1', 'u-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.count).toBe(1);
    });
  });

  // L313: executeSavedSearch - freelancer search skill fallback
  describe('executeSavedSearch - freelancer skill fallback (L313)', () => {
    it('should sort freelancer profiles with 2+ items', async () => {
      mockSavedSearchRepository.getById.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'freelancer',
        filters: JSON.stringify({ skills: ['react'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockFreelancerProfileRepository.getAllProfilesPaginated.mockResolvedValue({
        items: [
          { id: 'fp-1', skills: [{ name: 'react' }], hourly_rate: 50, created_at: '2025-01-01' },
          { id: 'fp-2', skills: [{ name: 'react' }], hourly_rate: 60, created_at: '2025-01-03' },
          { id: 'fp-3', skills: [{ name: 'react' }], hourly_rate: 70, created_at: '2025-01-02' },
        ],
        total: 3, hasMore: false,
      });

      const result = await executeSavedSearch('s-1', 'u-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(3);
        expect(result.data.results[0].id).toBe('fp-2');
        expect(result.data.results[1].id).toBe('fp-3');
        expect(result.data.results[2].id).toBe('fp-1');
      }
    });

    it('should handle freelancer profiles with undefined skills', async () => {
      mockSavedSearchRepository.getById.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'freelancer',
        filters: JSON.stringify({ skills: ['react'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockFreelancerProfileRepository.getAllProfilesPaginated.mockResolvedValue({
        items: [
          { id: 'fp-1', skills: undefined, hourly_rate: 50, created_at: '2025-01-01' },
          { id: 'fp-2', skills: [{ name: 'react' }], hourly_rate: 60, created_at: '2025-01-02' },
        ],
        total: 2, hasMore: false,
      });

      const result = await executeSavedSearch('s-1', 'u-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.count).toBe(1);
    });

    it('should handle freelancer skills with empty name', async () => {
      mockSavedSearchRepository.getById.mockResolvedValue({
        id: 's-1', user_id: 'u-1', name: 'Test', search_type: 'freelancer',
        filters: JSON.stringify({ skills: ['react'] }),
        notify_on_new: false,
        created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockFreelancerProfileRepository.getAllProfilesPaginated.mockResolvedValue({
        items: [
          { id: 'fp-1', skills: [{ name: '' }], hourly_rate: 50, created_at: '2025-01-01' },
          { id: 'fp-2', skills: [{ name: 'react' }], hourly_rate: 60, created_at: '2025-01-02' },
        ],
        total: 2, hasMore: false,
      });

      const result = await executeSavedSearch('s-1', 'u-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.count).toBe(1);
    });
  });
});
