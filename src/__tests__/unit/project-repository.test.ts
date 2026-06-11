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
