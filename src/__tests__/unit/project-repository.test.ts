import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mocks are handled by jest.setup.ts
const { ProjectRepository } = await import('../../repositories/project-repository.js');
const { pool } = await import('../../config/database.js');

describe('ProjectRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ProjectRepository();
  });

  describe('createProject', () => {
    it('should create and return a project', async () => {
      const project = { id: 'p1', title: 'Test Project' };
      (pool.query as any).mockResolvedValueOnce({ rows: [project] });
      const result = await repo.createProject(project as any);
      expect(result).toEqual(project);
    });

    it('should throw on database error', async () => {
      (pool.query as any).mockRejectedValueOnce(new Error('insert failed'));
      await expect(repo.createProject({ id: 'p1' } as any)).rejects.toThrow('Failed to create in projects: insert failed');
    });
  });

  describe('getProjectById', () => {
    it('should return a project', async () => {
      const project = { id: 'p1' };
      (pool.query as any).mockResolvedValueOnce({ rows: [project] });
      const result = await repo.getProjectById('p1');
      expect(result).toEqual(project);
    });

    it('should return null when not found', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });
      const result = await repo.getProjectById('p1');
      expect(result).toBeNull();
    });
  });

  describe('getProjectsByEmployer', () => {
    it('should return paginated projects', async () => {
      const projects = [{ id: 'p1' }];
      (pool.query as any)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // count query
        .mockResolvedValueOnce({ rows: projects }); // data query
        
      const result = await repo.getProjectsByEmployer('e1');
      expect(result.items).toEqual(projects);
      expect(result.total).toBe(1);
    });
  });

  describe('getAllOpenProjects', () => {
    it('should return open projects', async () => {
      const projects = [{ id: 'p1', status: 'open' }];
      (pool.query as any)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: projects });
        
      const result = await repo.getAllOpenProjects();
      expect(result.items).toEqual(projects);
    });
  });

  describe('getProjectsBySkills', () => {
    it('should filter by skills', async () => {
      const projects = [{ id: 'p1' }];
      (pool.query as any)
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: projects });
        
      const result = await repo.getProjectsBySkills(['s1']);
      expect(result.items).toEqual(projects);
    });
  });
});
