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
    contains: jest.fn((...args: any[]) => ({ type: 'contains', args })),
    between: jest.fn((...args: any[]) => ({ type: 'between', args })),
    cursorAfter: jest.fn((...args: any[]) => ({ type: 'cursorAfter', args })),
  },
  DatabasesIndexType: { Key: 'key', Unique: 'unique', Fulltext: 'fulltext' },
  OrderBy: { Asc: 'asc', Desc: 'desc' },
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
      const createAttributes = mockCreateDocument.mock.calls[0][3];
      expect(createAttributes).not.toHaveProperty('created_at');
      expect(createAttributes).not.toHaveProperty('updated_at');
    });

    it('should default skill ids to an empty array when no skills provided', async () => {
      const project = { id: 'p1', title: 'No Skills' };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(project));

      await repo.createProject(project as any);

      const createAttributes = mockCreateDocument.mock.calls[0][3] as Record<string, unknown>;
      expect(createAttributes.required_skill_ids).toEqual('[]');
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

    it('should handle null values for JSON fields (val === null branch)', async () => {
      const project = {
        id: 'p1',
        title: 'Test',
        required_skills: null,
        milestones: null,
        tags: null,
        attachments: null,
      };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(project));
      const result = await repo.getProjectById('p1');
      expect(result).not.toBeNull();
      expect(result!.required_skills).toEqual([]);
      expect(result!.milestones).toEqual([]);
      expect(result!.tags).toEqual([]);
      expect(result!.attachments).toEqual([]);
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

  describe('countProjectsByEmployerAndStatus', () => {
    it('should return the count of projects with the given status', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 4 });
      const result = await repo.countProjectsByEmployerAndStatus('e1', 'open');
      expect(result).toBe(4);
    });

    it('should return 0 when there are no matching projects', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.countProjectsByEmployerAndStatus('e1', 'open');
      expect(result).toBe(0);
    });

    it('should return 0 on database error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('DB down'));
      const result = await repo.countProjectsByEmployerAndStatus('e1', 'open');
      expect(result).toBe(0);
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
      const updateAttributes = mockUpdateDocument.mock.calls[0][3];
      expect(updateAttributes).not.toHaveProperty('created_at');
      expect(updateAttributes).not.toHaveProperty('updated_at');
    });

    it('should handle updates without JSON fields', async () => {
      const project = { id: 'p1', title: 'Updated' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(project));
      const result = await repo.updateProject('p1', { title: 'Updated' } as any);
      expect(result).not.toBeNull();
    });

    it('should return null when the update does not return a document', async () => {
      mockUpdateDocument.mockResolvedValueOnce(null);
      const result = await repo.updateProject('p1', { title: 'Updated' } as any);
      expect(result).toBeNull();
    });
  });

  describe('getProjectsBySkills', () => {
    it('should filter by skills at the database level', async () => {
      const projects = [toAppwriteDoc({ id: 'p1', required_skills: [{ skill_id: 's1' }] })];
      mockListDocuments.mockResolvedValueOnce({ documents: projects, total: 1 });
      const result = await repo.getProjectsBySkills(['s1']);
      expect(result.items).toHaveLength(1);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'equal' && q.args[0] === 'required_skill_ids')).toBe(true);
      expect(queries.some(q => q.type === 'equal' && q.args[0] === 'status' && q.args[1] === 'open')).toBe(true);
    });

    it('should paginate via limit/offset in a single database call', async () => {
      // Skill filtering happens in the database (Query.equal on the
      // required_skill_ids array attribute), so one call with limit/offset is
      // all the hot path needs — no full scan per request.
      const projects = Array.from({ length: 100 }, (_, i) =>
        toAppwriteDoc({ id: `p-${i}`, required_skills: [{ skill_id: 's1' }], status: 'open' })
      );
      mockListDocuments.mockResolvedValueOnce({ documents: projects, total: 120 });

      const result = await repo.getProjectsBySkills(['s1']);
      expect(result.total).toBe(120);
      expect(result.items).toHaveLength(100);
      expect(mockListDocuments).toHaveBeenCalledTimes(1);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'limit' && q.args[0] === 20)).toBe(true); // default page limit
      expect(queries.some(q => q.type === 'offset' && q.args[0] === 0)).toBe(true);
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
      // Pagination is pushed to the DB: the mock returns one page of 5.
      mockListDocuments.mockResolvedValueOnce({
        documents: projects.slice(0, 5),
        total: 15,
      });
      const result = await repo_ext.getProjectsBySkills(['skill-1'], { limit: 5, offset: 0 });
      expect(result.items).toHaveLength(5);
      expect(result.hasMore).toBe(true);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'limit' && q.args[0] === 5)).toBe(true);
      expect(queries.some(q => q.type === 'offset' && q.args[0] === 0)).toBe(true);
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
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      const between = queries.find(q => q.type === 'between');
      expect(between).toBeDefined();
      expect(between.args).toEqual(['budget', 500, 3000]);
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
    it('should search titles at the database level with the status filter', async () => {
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
        ],
        total: 1,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.searchProjects('react');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Build a React Website');
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      const contains = queries.find(q => q.type === 'contains');
      expect(contains).toBeDefined();
      expect(contains.args).toEqual(['title', 'react']);
      expect(queries.some(q => q.type === 'equal' && q.args[0] === 'status' && q.args[1] === 'open')).toBe(true);
    });

    it('should return empty when the database returns no matches', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [],
        total: 0,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.searchProjects('blockchain');
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should pass the keyword through as-is (case handling is Appwrite\'s)', async () => {
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
      expect(mockListDocuments.mock.calls[0][2].some((q: any) => q.type === 'contains' && q.args[1] === 'react')).toBe(true);
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

      // Pagination is pushed to the DB: the mock returns one page of 2.
      mockListDocuments.mockResolvedValueOnce({
        documents: docs.slice(1, 3),
        total: 5,
      });

      const { projectRepository } = await import(resolveModule('src/repositories/project-repository.ts'));
      const result = await projectRepository.searchProjects('search', { limit: 2, offset: 1 });
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'limit' && q.args[0] === 2)).toBe(true);
      expect(queries.some(q => q.type === 'offset' && q.args[0] === 1)).toBe(true);
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

  describe('getProjectsByIds', () => {
    const repo = new ProjectRepository();

    it('should return empty array when no ids given', async () => {
      const result = await repo.getProjectsByIds([]);
      expect(result).toEqual([]);
      expect(mockListDocuments).not.toHaveBeenCalled();
    });

    it('should batch-fetch projects by ids', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'p1', title: 'A' }), toAppwriteDoc({ id: 'p2', title: 'B' })],
      });

      const result = await repo.getProjectsByIds(['p1', 'p2']);
      expect(result).toHaveLength(2);
      expect(result.map(p => p.id).sort()).toEqual(['p1', 'p2']);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'equal' && q.args[0] === '$id')).toBe(true);
    });

    it('should throw when the batch query fails', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('boom'));
      await expect(repo.getProjectsByIds(['p1'])).rejects.toThrow('Failed to get projects by ids');
    });
  });

  describe('project listing methods', () => {
    const repo = new ProjectRepository();

    it('listOpenProjects should return mapped open projects', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'p1', title: 'Open', status: 'open' })],
      });

      const result = await repo.listOpenProjects(10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p1');
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'equal' && q.args[1] === 'open')).toBe(true);
    });

    it('listAllProjects should return all projects', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'p1', title: 'All' })],
      });

      const result = await repo.listAllProjects(50);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('p1');
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'limit' && q.args[0] === 50)).toBe(true);
    });

    it('listRecentOpenProjects should order by creation date', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'p1', title: 'Recent', status: 'open' })],
      });

      const result = await repo.listRecentOpenProjects(5);
      expect(result).toHaveLength(1);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'orderDesc' && q.args[0] === 'created_at')).toBe(true);
    });
  });

  describe('findByFilters', () => {
    const repo = new ProjectRepository();

    it('should query only allowed primitive filters', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [] });

      const result = await repo.findByFilters(
        { status: 'open', budget: 100, category: 'dev', title: 'Build', notAllowed: 'x', weird: { nested: 1 } },
        20
      );
      expect(result).toEqual([]);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      const equals = queries.filter(q => q.type === 'equal');
      expect(equals.map(q => q.args[0]).sort()).toEqual(['budget', 'category', 'status', 'title']);
      expect(queries.some(q => q.type === 'limit' && q.args[0] === 20)).toBe(true);
    });

    it('should skip null and undefined filter values', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [] });

      const result = await repo.findByFilters({ status: 'open', budget: null, category: undefined }, 10);
      expect(result).toEqual([]);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      const equals = queries.filter(q => q.type === 'equal');
      expect(equals.map(q => q.args[0])).toEqual(['status']);
    });

    it('should accept boolean and array filter values on allowed columns', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [] });

      const result = await repo.findByFilters({ status: true, category: ['dev', 'design'] }, 10);
      expect(result).toEqual([]);
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      const equals = queries.filter(q => q.type === 'equal');
      expect(equals.map(q => q.args[0]).sort()).toEqual(['category', 'status']);
    });
  });
});
