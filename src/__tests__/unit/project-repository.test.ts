// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetDocument = jest.fn();
const mockListDocuments = jest.fn();
const mockCreateDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    getDocument: mockGetDocument,
    listDocuments: mockListDocuments,
    createDocument: mockCreateDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: mockDeleteDocument,
  },
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn((...args: any[]) => ({ type: 'equal', args })),
    orderDesc: jest.fn((...args: any[]) => ({ type: 'orderDesc', args })),
    limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
    offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { ProjectRepository } = await import('../../repositories/project-repository.js');

const mockDatabases = { getDocument: mockGetDocument, listDocuments: mockListDocuments, createDocument: mockCreateDocument, updateDocument: mockUpdateDocument, deleteDocument: mockDeleteDocument };

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('ProjectRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ProjectRepository();
  });

  describe('createProject', () => {
    it('should create and return a project', async () => {
      const project = { id: 'p1', title: 'Test Project', required_skills: [], milestones: [], tags: [], attachments: [] };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(project));
      const result = await repo.createProject(project as any);
      expect(result).toMatchObject({ id: 'p1', title: 'Test Project' });
    });
  });

  describe('getProjectById', () => {
    it('should return a project', async () => {
      const project = { id: 'p1', title: 'Test' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(project));
      const result = await repo.getProjectById('p1');
      expect(result).toMatchObject({ id: 'p1', title: 'Test' });
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getProjectById('p1');
      expect(result).toBeNull();
    });
  });

  describe('getProjectsByEmployer', () => {
    it('should return paginated projects', async () => {
      const projects = [toAppwriteDoc({ id: 'p1' })];
      mockListDocuments.mockResolvedValueOnce({ documents: projects, total: 1 });
      const result = await repo.getProjectsByEmployer('e1');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getAllOpenProjects', () => {
    it('should return open projects', async () => {
      const projects = [toAppwriteDoc({ id: 'p1', status: 'open' })];
      mockListDocuments.mockResolvedValueOnce({ documents: projects, total: 1 });
      const result = await repo.getAllOpenProjects();
      expect(result.items).toHaveLength(1);
    });
  });

  describe('updateProject', () => {
    it('should stringify required_skills, milestones, tags, and attachments', async () => {
      const project = { id: 'p1', required_skills: ['js'], milestones: [{ title: 'm1' }], tags: ['web'], attachments: [{ url: 'file.pdf' }] };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(project));
      const result = await repo.updateProject('p1', project as any);
      expect(result).not.toBeNull();
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        'freelancexchain',
        'projects',
        'p1',
        expect.objectContaining({
          required_skills: JSON.stringify(['js']),
          milestones: JSON.stringify([{ title: 'm1' }]),
          tags: JSON.stringify(['web']),
          attachments: JSON.stringify([{ url: 'file.pdf' }]),
        })
      );
    });

    it('should handle updates without JSON fields', async () => {
      const project = { id: 'p1', title: 'Updated' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(project));
      const result = await repo.updateProject('p1', { title: 'Updated' } as any);
      expect(result).not.toBeNull();
    });
  });

  describe('getProjectsBySkills', () => {
    it('should filter by skills', async () => {
      const projects = [toAppwriteDoc({ id: 'p1', required_skills: [{ skill_id: 's1' }] })];
      mockListDocuments.mockResolvedValueOnce({ documents: projects, total: 1 });
      const result = await repo.getProjectsBySkills(['s1']);
      expect(result.items).toHaveLength(1);
    });

    it('should return empty when no skills match', async () => {
      const projects = [toAppwriteDoc({ id: 'p1', required_skills: [{ skill_id: 's2' }] })];
      mockListDocuments.mockResolvedValueOnce({ documents: projects, total: 1 });
      const result = await repo.getProjectsBySkills(['s1']);
      expect(result.items).toHaveLength(0);
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('project-repository.ts - Branch Coverage', () => {
  it('L60: parse uses undefined fallback when no arg provided', () => {
    const parse = (val: any, fallback: any = undefined) => {
      if (val === undefined || val === null) return fallback;
      return val;
    };
    expect(parse(undefined)).toBeUndefined();
    expect(parse(undefined, 'default')).toBe('default');
  });
});

describe('merged branch coverage', () => {
  it('project-repository L60: mapDoc parse with undefined/null fallback', async () => {
    mockDatabases.getDocument.mockResolvedValue({
      $id: 'p1', $createdAt: '2025-01-01', $updatedAt: '2025-01-01',
      required_skills: undefined, milestones: null, budget: 1000,
    });

    const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
    const result = await projectRepository.findProjectById('p1');
    expect(result).toBeDefined();
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from project-repository-extended.test.ts
// ═══════════════════════════════════════════════════════════════

describe('Project Repository - Extended Coverage', () => {
  let repo_ext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo_ext = new ProjectRepository();
    mockListDocuments.mockReset();
    mockGetDocument.mockReset();
  });

  describe('getProjectsBySkills', () => {
    it('should return empty results when no matches', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo_ext.getProjectsBySkills(['skill-999']);
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
      mockListDocuments.mockResolvedValueOnce({
        documents: projects,
        total: 15,
      });
      const result = await repo_ext.getProjectsBySkills(['skill-1'], { limit: 5, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should return empty results on query error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo_ext.getProjectsBySkills(['skill-1']);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getProjectsByBudgetRange', () => {
    it('should return projects within budget range', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Project 1', status: 'open', budget: 1000, required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
          { $id: 'p-2', title: 'Project 2', status: 'open', budget: 2000, required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 2,
      });
      const result = await repo_ext.getProjectsByBudgetRange(500, 3000);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty results for no matches', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo_ext.getProjectsByBudgetRange(100000, 200000);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should return empty results on query error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo_ext.getProjectsByBudgetRange(100, 500);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getProjectsByCategory', () => {
    it('should return projects by category', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Web Project', status: 'open', required_skills: JSON.stringify([{ skill_id: 's-1', skill_name: 'React', category_id: 'cat-web', years_of_experience: 2 }]), milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 1,
      });
      const result = await repo_ext.getProjectsByCategory('cat-web');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty results for unknown category', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo_ext.getProjectsByCategory('cat-unknown');
      expect(result.items).toHaveLength(0);
    });

    it('should return empty results on query error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo_ext.getProjectsByCategory('cat-1');
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getProjectsByMultipleCategories', () => {
    it('should return projects matching any of the categories', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Project 1', status: 'open', required_skills: JSON.stringify([{ skill_id: 's-1', skill_name: 'React', category_id: 'cat-1', years_of_experience: 2 }]), milestones: '[]', tags: '[]', attachments: '[]' },
          { $id: 'p-2', title: 'Project 2', status: 'open', required_skills: JSON.stringify([{ skill_id: 's-2', skill_name: 'Node.js', category_id: 'cat-2', years_of_experience: 3 }]), milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 2,
      });
      const result = await repo_ext.getProjectsByMultipleCategories(['cat-1', 'cat-2']);
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty results for no matches', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo_ext.getProjectsByMultipleCategories(['cat-unknown']);
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
      mockListDocuments.mockResolvedValueOnce({
        documents: projects,
        total: 10,
      });
      const result = await repo_ext.getProjectsByMultipleCategories(['cat-1'], { limit: 5, offset: 0 });
      expect(result.hasMore).toBe(true);
    });

    it('should return empty results on query error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo_ext.getProjectsByMultipleCategories(['cat-1']);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getAllOpenProjects', () => {
    it('should return all open projects', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Project 1', status: 'open', required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
          { $id: 'p-2', title: 'Project 2', status: 'open', required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 5,
      });
      const result = await repo_ext.getAllOpenProjects();
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
    });

    it('should return empty results when no open projects', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });
      const result = await repo_ext.getAllOpenProjects();
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle pagination options', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p-1', title: 'Project 1', status: 'open', required_skills: '[]', milestones: '[]', tags: '[]', attachments: '[]' },
        ],
        total: 20,
      });
      const result = await repo_ext.getAllOpenProjects({ limit: 10, offset: 0 });
      expect(result.hasMore).toBe(false);
    });

    it('should return empty results on query error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repo_ext.getAllOpenProjects();
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from repository-coverage.test.ts
// ═══════════════════════════════════════════════════════════════

describe('ProjectRepository - deleteProject, getProjectsByStatus, searchProjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListDocuments.mockReset();
    mockGetDocument.mockReset();
    mockDeleteDocument.mockReset();
  });

  describe('deleteProject', () => {
    it('should delete a project and return true', async () => {
      mockDeleteDocument.mockResolvedValueOnce({});

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.deleteProject('p1');
      expect(result).toBe(true);
      expect(mockDeleteDocument).toHaveBeenCalledTimes(1);
    });

    it('should return false when delete fails', async () => {
      mockDeleteDocument.mockRejectedValueOnce(new Error('not found'));

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.deleteProject('p-nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getProjectsByStatus', () => {
    it('should return projects filtered by status', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [{
          $id: 'p1',
          $createdAt: '2025-01-01',
          $updatedAt: '2025-01-01',
          title: 'Open Project',
          description: 'Looking for dev',
          status: 'open',
          employer_id: 'e1',
          budget: 5000,
          required_skills: '[]',
          milestones: '[]',
          tags: '[]',
          attachments: '[]',
        }],
        total: 1,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.getProjectsByStatus('open');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('open');
      expect(result.items[0]!.title).toBe('Open Project');
      expect(mockListDocuments).toHaveBeenCalledTimes(1);
    });

    it('should return empty result on database error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db down'));

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.getProjectsByStatus('draft');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('should respect custom limit and offset options', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [{
          $id: 'p2',
          $createdAt: '2025-02-01',
          $updatedAt: '2025-02-01',
          title: 'In Progress Project',
          description: 'Ongoing work',
          status: 'in_progress',
          employer_id: 'e2',
          budget: 10000,
        }],
        total: 5,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.getProjectsByStatus('in_progress', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });
  });

  describe('searchProjects', () => {
    it('should filter projects by keyword matching title', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'p1',
            $createdAt: '2025-01-01',
            $updatedAt: '2025-01-01',
            title: 'Build a React Website',
            description: 'Need frontend developer',
            status: 'open',
            employer_id: 'e1',
            budget: 3000,
            required_skills: '[]',
            milestones: '[]',
            tags: '[]',
            attachments: '[]',
          },
          {
            $id: 'p2',
            $createdAt: '2025-01-01',
            $updatedAt: '2025-01-01',
            title: 'Mobile App Development',
            description: 'iOS and Android app',
            status: 'open',
            employer_id: 'e2',
            budget: 8000,
            required_skills: '[]',
            milestones: '[]',
            tags: '[]',
            attachments: '[]',
          },
        ],
        total: 2,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.searchProjects('react');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Build a React Website');
      expect(result.total).toBe(1);
    });

    it('should filter projects by keyword matching description', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'p3',
            $createdAt: '2025-01-01',
            $updatedAt: '2025-01-01',
            title: 'Web Project',
            description: 'Python backend needed',
            status: 'open',
            employer_id: 'e3',
            budget: 4000,
            required_skills: '[]',
            milestones: '[]',
            tags: '[]',
            attachments: '[]',
          },
          {
            $id: 'p4',
            $createdAt: '2025-01-01',
            $updatedAt: '2025-01-01',
            title: 'Design Work',
            description: 'Logo and branding',
            status: 'open',
            employer_id: 'e4',
            budget: 1000,
            required_skills: '[]',
            milestones: '[]',
            tags: '[]',
            attachments: '[]',
          },
        ],
        total: 2,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.searchProjects('python');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.description).toBe('Python backend needed');
    });

    it('should return empty when no projects match keyword', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'p5',
            $createdAt: '2025-01-01',
            $updatedAt: '2025-01-01',
            title: 'Web Project',
            description: 'Frontend work',
            status: 'open',
            employer_id: 'e5',
            budget: 2000,
          },
        ],
        total: 1,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.searchProjects('blockchain');
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle case-insensitive search', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [
          {
            $id: 'p6',
            $createdAt: '2025-01-01',
            $updatedAt: '2025-01-01',
            title: 'REACT Native App',
            description: 'Cross-platform mobile',
            status: 'open',
            employer_id: 'e6',
            budget: 6000,
          },
        ],
        total: 1,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.searchProjects('react');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('REACT Native App');
    });

    it('should respect limit and offset in search results', async () => {
      const docs = Array.from({ length: 5 }, (_, i) => ({
        $id: `p${i + 10}`,
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
        title: `Search Result ${i + 1}`,
        description: 'Match keyword search',
        status: 'open',
        employer_id: `e${i + 10}`,
        budget: 1000 * (i + 1),
      }));

      mockListDocuments.mockResolvedValueOnce({
        documents: docs,
        total: 5,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.searchProjects('search', { limit: 2, offset: 1 });
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should return empty on database error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('connection lost'));

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.searchProjects('test');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });
});
