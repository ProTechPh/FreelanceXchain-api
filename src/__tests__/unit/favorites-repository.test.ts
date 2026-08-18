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

const { FavoriteRepository } = await import('../../repositories/favorites-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('FavoriteRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new FavoriteRepository();
  });

  describe('create', () => {
    it('should create and return a favorite', async () => {
      const fav = { id: 'fav1', user_id: 'u1', target_type: 'project', target_id: 't1' };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(fav));
      const result = await repo.create({ id: 'fav1', user_id: 'u1', target_type: 'project', target_id: 't1' } as any);
      expect(result.id).toBe('fav1');
      expect(result.user_id).toBe('u1');
      expect(result.target_type).toBe('project');
    });
  });

  describe('getById', () => {
    it('should return a favorite by id', async () => {
      const fav = { id: 'fav1', user_id: 'u1', target_type: 'project', target_id: 't1' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(fav));
      const result = await repo.getById('fav1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('fav1');
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getById('fav1');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update and return a favorite', async () => {
      const fav = { id: 'fav1', target_type: 'freelancer' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(fav));
      const result = await repo.update('fav1', { target_type: 'freelancer' });
      expect(result).not.toBeNull();
      expect(result!.target_type).toBe('freelancer');
    });

    it('should return null when not found', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.update('fav1', { target_type: 'freelancer' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a favorite', async () => {
      mockDeleteDocument.mockResolvedValueOnce({});
      const result = await repo.delete('fav1');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.delete('fav1');
      expect(result).toBe(false);
    });
  });

  describe('findOne', () => {
    it('should return a favorite by column', async () => {
      const fav = { id: 'fav1', user_id: 'u1' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(fav)], total: 1 });
      const result = await repo.findOne('user_id', 'u1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('fav1');
    });

    it('should return null when not found', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findOne('user_id', 'u1');
      expect(result).toBeNull();
    });
  });

  describe('findByUserAndTarget', () => {
    it('should return a favorite matching user, target type, and target id', async () => {
      const fav = { id: 'fav1', user_id: 'u1', target_type: 'project', target_id: 't1' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(fav)], total: 1 });
      const result = await repo.findByUserAndTarget('u1', 'project', 't1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('fav1');
      expect(result!.user_id).toBe('u1');
    });

    it('should return null when no match', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findByUserAndTarget('u1', 'project', 't1');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByUserAndTarget('u1', 'project', 't1');
      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should return favorites for a user', async () => {
      const favs = [
        toAppwriteDoc({ id: 'fav1', user_id: 'u1', target_type: 'project' }),
        toAppwriteDoc({ id: 'fav2', user_id: 'u1', target_type: 'freelancer' }),
      ];
      mockListDocuments.mockResolvedValueOnce({ documents: favs, total: 2 });
      const result = await repo.findByUser('u1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('fav1');
    });

    it('should filter by target type when provided', async () => {
      const favs = [toAppwriteDoc({ id: 'fav1', user_id: 'u1', target_type: 'project' })];
      mockListDocuments.mockResolvedValueOnce({ documents: favs, total: 1 });
      const result = await repo.findByUser('u1', 'project');
      expect(result).toHaveLength(1);
      expect(result[0].target_type).toBe('project');
    });

    it('should return favorites beyond the default 25-doc page (no truncation)', async () => {
      const favs = Array.from({ length: 250 }, (_, i) => toAppwriteDoc({ id: `fav${i}`, user_id: 'u1', target_type: 'project' }));
      mockListDocuments
        .mockResolvedValueOnce({ documents: favs.slice(0, 100), total: 250 })
        .mockResolvedValueOnce({ documents: favs.slice(100, 200), total: 250 })
        .mockResolvedValueOnce({ documents: favs.slice(200), total: 250 });

      const result = await repo.findByUser('u1');
      expect(result).toHaveLength(250);
      expect(result[0].id).toBe('fav0');
      expect(result[249].id).toBe('fav249');
    });

    it('should return empty array on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByUser('u1');
      expect(result).toEqual([]);
    });
  });

  describe('removeByUserAndTarget', () => {
    it('should delete the matching favorite and return true', async () => {
      const fav = { id: 'fav1', user_id: 'u1', target_type: 'project', target_id: 't1' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(fav)], total: 1 });
      mockDeleteDocument.mockResolvedValueOnce({});
      const result = await repo.removeByUserAndTarget('u1', 'project', 't1');
      expect(result).toBe(true);
      expect(mockDeleteDocument).toHaveBeenCalled();
    });

    it('should return false when no matching favorite exists', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.removeByUserAndTarget('u1', 'project', 't1');
      expect(result).toBe(false);
      expect(mockDeleteDocument).not.toHaveBeenCalled();
    });
  });
});
