// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: new Proxy({}, { get: () => { throw new Error('Database not available'); } }),
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: jest.fn().mockRejectedValue(new Error('Database not available')),
  queryOne: jest.fn().mockRejectedValue(new Error('Database not available')),
  initializeDatabase: jest.fn(),
}));

const { ProjectRepository } = await import('../../repositories/project-repository.js');

describe('Project Repository - Extended Coverage', () => {
  let repo: InstanceType<typeof ProjectRepository>;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ProjectRepository();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
  });

  describe('getProjectsBySkills', () => {
    it('should return projects matching skills', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Project 1', status: 'open', required_skills: JSON.stringify([{ skill_id: 'skill-1', skill_name: 'React', category_id: 'cat-1', years_of_experience: 2 }]), milestones: '[]', tags: '[]', attachments: '[]' },
          { $id: 'p-2', title: 'Project 2', status: 'open', required_skills: JSON.stringify([{ skill_id: 'skill-2', skill_name: 'Node.js', category_id: 'cat-2', years_of_experience: 3 }]), milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 2,
      });
      const result = await repo.getProjectsBySkills(['skill-1', 'skill-2']);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty results when no matches', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo.getProjectsBySkills(['skill-999']);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination', async () => {
      const projects = [];
      for (let i = 0; i < 15; i++) {
        projects.push({
          $id: `p-${i}`, title: `Project ${i}`, status: 'open',
          required_skills: JSON.stringify([{ skill_id: 'skill-1', skill_name: 'React', category_id: 'cat-1', years_of_experience: 2 }]),
          milestones: '[]', tags: '[]', attachments: '[]',
        });
      }
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: projects,
        total: 15,
      });
      const result = await repo.getProjectsBySkills(['skill-1'], { limit: 5, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should return empty results on query error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo.getProjectsBySkills(['skill-1']);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getProjectsByBudgetRange', () => {
    it('should return projects within budget range', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Project 1', status: 'open', budget: 1000, required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
          { $id: 'p-2', title: 'Project 2', status: 'open', budget: 2000, required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 2,
      });
      const result = await repo.getProjectsByBudgetRange(500, 3000);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty results for no matches', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo.getProjectsByBudgetRange(100000, 200000);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should return empty results on query error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo.getProjectsByBudgetRange(100, 500);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getProjectsByCategory', () => {
    it('should return projects by category', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Web Project', status: 'open', required_skills: JSON.stringify([{ skill_id: 's-1', skill_name: 'React', category_id: 'cat-web', years_of_experience: 2 }]), milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 1,
      });
      const result = await repo.getProjectsByCategory('cat-web');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty results for unknown category', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo.getProjectsByCategory('cat-unknown');
      expect(result.items).toHaveLength(0);
    });

    it('should return empty results on query error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo.getProjectsByCategory('cat-1');
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getProjectsByMultipleCategories', () => {
    it('should return projects matching any of the categories', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Project 1', status: 'open', required_skills: JSON.stringify([{ skill_id: 's-1', skill_name: 'React', category_id: 'cat-1', years_of_experience: 2 }]), milestones: '[]', tags: '[]', attachments: '[]' },
          { $id: 'p-2', title: 'Project 2', status: 'open', required_skills: JSON.stringify([{ skill_id: 's-2', skill_name: 'Node.js', category_id: 'cat-2', years_of_experience: 3 }]), milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 2,
      });
      const result = await repo.getProjectsByMultipleCategories(['cat-1', 'cat-2']);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty results for no matches', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo.getProjectsByMultipleCategories(['cat-unknown']);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle pagination with hasMore', async () => {
      const projects = [];
      for (let i = 0; i < 10; i++) {
        projects.push({
          $id: `p-${i}`, title: `Project ${i}`, status: 'open',
          required_skills: JSON.stringify([{ skill_id: 's-1', skill_name: 'React', category_id: 'cat-1', years_of_experience: 2 }]),
          milestones: '[]', tags: '[]', attachments: '[]',
        });
      }
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: projects,
        total: 10,
      });
      const result = await repo.getProjectsByMultipleCategories(['cat-1'], { limit: 5, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should return empty results on query error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo.getProjectsByMultipleCategories(['cat-1']);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getAllOpenProjects', () => {
    it('should return all open projects', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Project 1', status: 'open', required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
          { $id: 'p-2', title: 'Project 2', status: 'open', required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 5,
      });
      const result = await repo.getAllOpenProjects();
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
    });

    it('should return empty results when no open projects', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo.getAllOpenProjects();
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination options', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Project 1', status: 'open', required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 20,
      });
      const result = await repo.getAllOpenProjects({ limit: 10, offset: 0 });
      expect(result.hasMore).toBe(false);
    });

    it('should return empty results on query error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo.getAllOpenProjects();
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
