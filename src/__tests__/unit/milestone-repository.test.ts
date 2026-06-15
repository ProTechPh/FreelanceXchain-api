// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateDocument = jest.fn();
const mockGetDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn();
const mockListDocuments = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    createDocument: mockCreateDocument,
    getDocument: mockGetDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: mockDeleteDocument,
    listDocuments: mockListDocuments,
  },
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn((...args: any[]) => ({ type: 'equal', args })),
    limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
    offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
    orderAsc: jest.fn((...args: any[]) => ({ type: 'orderAsc', args })),
    orderDesc: jest.fn((...args: any[]) => ({ type: 'orderDesc', args })),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { MilestoneRepository } = await import('../../repositories/milestone-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('MilestoneRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new MilestoneRepository();
  });

  describe('create', () => {
    it('should create and return a milestone', async () => {
      const milestone = { id: 'm1', contract_id: 'c1', project_id: 'p1', title: 'Design Phase', amount: 500 };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(milestone));
      const result = await repo.create({ id: 'm1', contract_id: 'c1', project_id: 'p1', title: 'Design Phase', amount: 500 } as any);
      expect(result.id).toBe('m1');
      expect(result.title).toBe('Design Phase');
    });
  });

  describe('getById', () => {
    it('should return a milestone by id', async () => {
      const milestone = { id: 'm1', contract_id: 'c1', title: 'Design Phase' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(milestone));
      const result = await repo.getById('m1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('m1');
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getById('m1');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update and return a milestone', async () => {
      const milestone = { id: 'm1', status: 'completed' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(milestone));
      const result = await repo.update('m1', { status: 'completed' });
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
    });

    it('should return null when not found', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.update('m1', { status: 'completed' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a milestone', async () => {
      mockDeleteDocument.mockResolvedValueOnce({});
      const result = await repo.delete('m1');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.delete('m1');
      expect(result).toBe(false);
    });
  });

  describe('findOne', () => {
    it('should return a milestone by column', async () => {
      const milestone = { id: 'm1', contract_id: 'c1' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(milestone)], total: 1 });
      const result = await repo.findOne('contract_id', 'c1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('m1');
    });

    it('should return null when not found', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findOne('contract_id', 'c1');
      expect(result).toBeNull();
    });
  });

  describe('findByContract', () => {
    it('should return milestones for a contract sorted by due_date', async () => {
      const milestones = [
        toAppwriteDoc({ id: 'm1', contract_id: 'c1', due_date: '2025-02-01T00:00:00Z', title: 'Phase 1' }),
        toAppwriteDoc({ id: 'm2', contract_id: 'c1', due_date: '2025-03-01T00:00:00Z', title: 'Phase 2' }),
      ];
      mockListDocuments.mockResolvedValueOnce({ documents: milestones, total: 2 });
      const result = await repo.findByContract('c1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('m1');
      expect(result[1].id).toBe('m2');
    });

    it('should return empty array on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByContract('c1');
      expect(result).toEqual([]);
    });
  });

  describe('findByProjectAndMilestoneId', () => {
    it('should return a milestone matching project_id and $id', async () => {
      const milestone = { id: 'm1', project_id: 'p1', title: 'Design Phase' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(milestone)], total: 1 });
      const result = await repo.findByProjectAndMilestoneId('p1', 'm1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('m1');
      expect(result!.project_id).toBe('p1');
    });

    it('should return null when no match', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findByProjectAndMilestoneId('p1', 'm1');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByProjectAndMilestoneId('p1', 'm1');
      expect(result).toBeNull();
    });
  });
});
