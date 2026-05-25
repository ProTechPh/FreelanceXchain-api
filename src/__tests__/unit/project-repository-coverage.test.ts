// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

describe('Project Repository - Coverage', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../repositories/project-repository.js');
  };

  describe('getProjectsByEmployer', () => {
    it('should return projects for employer', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1' }, { id: 'p-2' }] });
      const result = await projectRepository.getProjectsByEmployer('emp-1');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should handle pagination', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1' }] });
      const result = await projectRepository.getProjectsByEmployer('emp-1', { limit: 5, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should throw on database error', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockRejectedValueOnce(new Error('DB error'));
      await expect(projectRepository.getProjectsByEmployer('emp-1')).rejects.toThrow('Failed to get projects by employer');
    });
  });

  describe('getAllOpenProjects', () => {
    it('should return open projects', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1', status: 'open' }] });
      const result = await projectRepository.getAllOpenProjects();
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(3);
    });

    it('should throw on database error', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockRejectedValueOnce(new Error('DB error'));
      await expect(projectRepository.getAllOpenProjects()).rejects.toThrow('Failed to get open projects');
    });
  });

  describe('getProjectsByStatus', () => {
    it('should return projects by status', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1', status: 'completed' }] });
      const result = await projectRepository.getProjectsByStatus('completed');
      expect(result.items).toHaveLength(1);
    });

    it('should throw on database error', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockRejectedValueOnce(new Error('DB error'));
      await expect(projectRepository.getProjectsByStatus('open')).rejects.toThrow('Failed to get projects by status');
    });
  });

  describe('getProjectById', () => {
    it('should return project when found', async () => {
      const { projectRepository } = await importModule();
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'p-1', title: 'Test' }] });
      const result = await projectRepository.getProjectById('p-1');
      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const { projectRepository } = await importModule();
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await projectRepository.getProjectById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateProject', () => {
    it('should update project', async () => {
      const { projectRepository } = await importModule();
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'p-1', title: 'Updated' }], rowCount: 1 });
      const result = await projectRepository.updateProject('p-1', { title: 'Updated' });
      expect(result).not.toBeNull();
    });
  });

  describe('findProjectById', () => {
    it('should find project by id', async () => {
      const { projectRepository } = await importModule();
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'p-1', title: 'Found' }] });
      const result = await projectRepository.findProjectById('p-1');
      expect(result).not.toBeNull();
      expect(result.title).toBe('Found');
    });

    it('should return null when not found', async () => {
      const { projectRepository } = await importModule();
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await projectRepository.findProjectById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getAllProjects', () => {
    it('should return all projects', async () => {
      const { projectRepository } = await importModule();
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'p-1' }, { id: 'p-2' }] });
      const result = await projectRepository.getAllProjects();
      expect(result).toHaveLength(2);
    });
  });

  describe('deleteProject', () => {
    it('should delete project successfully', async () => {
      const { projectRepository } = await importModule();
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'p-1' }], rowCount: 1 });
      const result = await projectRepository.deleteProject('p-1');
      expect(result).toBe(true);
    });

    it('should throw when delete fails', async () => {
      const { projectRepository } = await importModule();
      mockPool.query.mockRejectedValue(new Error('FK constraint'));
      await expect(projectRepository.deleteProject('p-1')).rejects.toThrow();
      mockPool.query.mockReset();
    });
  });

  describe('searchProjects', () => {
    it('should search projects by keyword', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1', title: 'React App' }] });
      const result = await projectRepository.searchProjects('React');
      expect(result.items).toHaveLength(1);
    });

    it('should throw when search query fails', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockRejectedValueOnce(new Error('Search timeout'));
      await expect(projectRepository.searchProjects('test')).rejects.toThrow('Failed to search projects');
    });
  });

  describe('getProjectsByCategory', () => {
    it('should return projects by category', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p-1' }] });
      const result = await projectRepository.getProjectsByCategory('cat-1');
      expect(result.items).toHaveLength(1);
    });

    it('should throw when category query fails', async () => {
      const { projectRepository } = await importModule();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockRejectedValueOnce(new Error('DB error'));
      await expect(projectRepository.getProjectsByCategory('cat-1')).rejects.toThrow('Failed to get projects by category');
    });
  });
});
