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
    cursorAfter: jest.fn((...args: any[]) => ({ type: 'cursorAfter', args })),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { PortfolioRepository } = await import('../../repositories/portfolio-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('PortfolioRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PortfolioRepository();
  });

  describe('create', () => {
    it('should create and return a portfolio item', async () => {
      const item = { id: 'pi1', freelancer_id: 'f1', title: 'My Project', description: 'A great project' };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(item));
      const result = await repo.create({ id: 'pi1', freelancer_id: 'f1', title: 'My Project', description: 'A great project' } as any);
      expect(result.id).toBe('pi1');
      expect(result.freelancer_id).toBe('f1');
    });
  });

  describe('getById', () => {
    it('should return a portfolio item by id', async () => {
      const item = { id: 'pi1', freelancer_id: 'f1', title: 'My Project' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(item));
      const result = await repo.getById('pi1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('pi1');
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getById('pi1');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update and return a portfolio item', async () => {
      const item = { id: 'pi1', title: 'Updated Title' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(item));
      const result = await repo.update('pi1', { title: 'Updated Title' });
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Updated Title');
    });

    it('should return null when not found', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.update('pi1', { title: 'Updated Title' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a portfolio item', async () => {
      mockDeleteDocument.mockResolvedValueOnce({});
      const result = await repo.delete('pi1');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.delete('pi1');
      expect(result).toBe(false);
    });
  });

  describe('findOne', () => {
    it('should return a portfolio item by column', async () => {
      const item = { id: 'pi1', freelancer_id: 'f1' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(item)], total: 1 });
      const result = await repo.findOne('freelancer_id', 'f1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('pi1');
    });

    it('should return null when not found', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findOne('freelancer_id', 'f1');
      expect(result).toBeNull();
    });
  });

  describe('findByFreelancer', () => {
    it('should return portfolio items for a freelancer', async () => {
      const items = [
        toAppwriteDoc({ id: 'pi1', freelancer_id: 'f1', title: 'Project 1' }),
        toAppwriteDoc({ id: 'pi2', freelancer_id: 'f1', title: 'Project 2' }),
      ];
      mockListDocuments.mockResolvedValueOnce({ documents: items, total: 2 });
      const result = await repo.findByFreelancer('f1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('pi1');
      expect(result[1].id).toBe('pi2');
    });

    it('should return items beyond the default 25-doc page (no truncation)', async () => {
      // 250 items across 3 cursor pages — the old listWithQueries call without
      // a limit silently returned only the newest 25.
      const items = Array.from({ length: 250 }, (_, i) => toAppwriteDoc({ id: `pi${i}`, freelancer_id: 'f1', title: `P${i}` }));
      mockListDocuments
        .mockResolvedValueOnce({ documents: items.slice(0, 100), total: 250 })
        .mockResolvedValueOnce({ documents: items.slice(100, 200), total: 250 })
        .mockResolvedValueOnce({ documents: items.slice(200), total: 250 });

      const result = await repo.findByFreelancer('f1');
      expect(result).toHaveLength(250);
      expect(result[0].id).toBe('pi0');
      expect(result[249].id).toBe('pi249');
    });

    it('should return empty array on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByFreelancer('f1');
      expect(result).toEqual([]);
    });
  });

  describe('findOwnerById', () => {
    it('should return the freelancer_id for a portfolio item', async () => {
      const item = { id: 'pi1', freelancer_id: 'f1', title: 'My Project' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(item));
      const result = await repo.findOwnerById('pi1');
      expect(result).toBe('f1');
    });

    it('should return null when item not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.findOwnerById('pi1');
      expect(result).toBeNull();
    });

    it('should return null when freelancer_id is missing', async () => {
      const item = { id: 'pi1', title: 'No owner' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(item));
      const result = await repo.findOwnerById('pi1');
      expect(result).toBeNull();
    });
  });
});
