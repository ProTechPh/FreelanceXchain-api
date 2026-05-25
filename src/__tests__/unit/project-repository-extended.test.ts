// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockQuery = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockQuery },
}));

// Mock the base repository to inject our mock pool
jest.unstable_mockModule(resolveModule('src/repositories/base-repository-pg.ts'), () => {
  class MockBaseRepositoryPg {
    tableName: string;
    pool = { query: mockQuery };
    constructor(tableName: string) { this.tableName = tableName; }
    async create(data: any) { return data; }
    async getById(id: string) { return null; }
    async update(id: string, data: any) { return data; }
    async delete(id: string) { return true; }
    async queryAll() { return []; }
  }
  return { BaseRepositoryPg: MockBaseRepositoryPg };
});

const { ProjectRepository } = await import('../../repositories/project-repository.js');

describe('Project Repository - Extended Coverage', () => {
  let repo: InstanceType<typeof ProjectRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ProjectRepository();
  });

  describe('getProjectsBySkills', () => {
    it('should return projects matching skills', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1', title: 'Project 1' }, { id: 'p-2', title: 'Project 2' }] });
      const result = await repo.getProjectsBySkills(['skill-1', 'skill-2']);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty results when no matches', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.getProjectsBySkills(['skill-999']);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '15' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1' }] });
      const result = await repo.getProjectsBySkills(['skill-1'], { limit: 5, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should throw on query error', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockRejectedValueOnce(new Error('DB error'));
      await expect(repo.getProjectsBySkills(['skill-1'])).rejects.toThrow('Failed to get projects by skills');
    });
  });

  describe('getProjectsByBudgetRange', () => {
    it('should return projects within budget range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1', budget: 1000 }, { id: 'p-2', budget: 2000 }] });
      const result = await repo.getProjectsByBudgetRange(500, 3000);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    it('should return empty results for no matches', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.getProjectsByBudgetRange(100000, 200000);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should throw on query error', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockRejectedValueOnce(new Error('DB error'));
      await expect(repo.getProjectsByBudgetRange(100, 500)).rejects.toThrow('Failed to get projects by budget');
    });
  });

  describe('getProjectsByCategory', () => {
    it('should return projects by category', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1', title: 'Web Project' }] });
      const result = await repo.getProjectsByCategory('cat-web');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty results for unknown category', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.getProjectsByCategory('cat-unknown');
      expect(result.items).toHaveLength(0);
    });

    it('should throw on query error', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockRejectedValueOnce(new Error('DB error'));
      await expect(repo.getProjectsByCategory('cat-1')).rejects.toThrow('Failed to get projects by category');
    });
  });

  describe('getProjectsByMultipleCategories', () => {
    it('should return projects matching any of the categories', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p-1', total_count: '2' }, { id: 'p-2', total_count: '2' }] });
      const result = await repo.getProjectsByMultipleCategories(['cat-1', 'cat-2']);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty results for no matches', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.getProjectsByMultipleCategories(['cat-unknown']);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle pagination with hasMore', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p-1', total_count: '10' }] });
      const result = await repo.getProjectsByMultipleCategories(['cat-1'], { limit: 5, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should throw on query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      await expect(repo.getProjectsByMultipleCategories(['cat-1'])).rejects.toThrow('Failed to get projects by categories');
    });
  });

  describe('getAllOpenProjects', () => {
    it('should return all open projects', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1', status: 'open' }, { id: 'p-2', status: 'open' }] });
      const result = await repo.getAllOpenProjects();
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
    });

    it('should return empty results when no open projects', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.getAllOpenProjects();
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination options', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '20' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1' }] });
      const result = await repo.getAllOpenProjects({ limit: 10, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should throw on query error', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockRejectedValueOnce(new Error('DB error'));
      await expect(repo.getAllOpenProjects()).rejects.toThrow('Failed to get open projects');
    });
  });
});
