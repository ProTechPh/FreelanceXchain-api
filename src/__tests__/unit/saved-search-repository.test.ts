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

const { SavedSearchRepository } = await import('../../repositories/saved-search-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('SavedSearchRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new SavedSearchRepository();
  });

  describe('create', () => {
    it('should create and return a saved search', async () => {
      const search = { id: 'ss1', user_id: 'u1', name: 'React Jobs', search_type: 'project', filters: '{}', notify_on_new: true };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(search));
      const result = await repo.create({ id: 'ss1', user_id: 'u1', name: 'React Jobs', search_type: 'project', filters: '{}', notify_on_new: true } as any);
      expect(result.id).toBe('ss1');
      expect(result.name).toBe('React Jobs');
    });
  });

  describe('getById', () => {
    it('should return a saved search by id', async () => {
      const search = { id: 'ss1', user_id: 'u1', name: 'React Jobs' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(search));
      const result = await repo.getById('ss1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ss1');
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getById('ss1');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update and return a saved search', async () => {
      const search = { id: 'ss1', name: 'Updated Search' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(search));
      const result = await repo.update('ss1', { name: 'Updated Search' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Search');
    });

    it('should return null when not found', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.update('ss1', { name: 'Updated Search' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a saved search', async () => {
      mockDeleteDocument.mockResolvedValueOnce({});
      const result = await repo.delete('ss1');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.delete('ss1');
      expect(result).toBe(false);
    });
  });

  describe('findOne', () => {
    it('should return a saved search by column', async () => {
      const search = { id: 'ss1', user_id: 'u1' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(search)], total: 1 });
      const result = await repo.findOne('user_id', 'u1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ss1');
    });

    it('should return null when not found', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findOne('user_id', 'u1');
      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should return saved searches for a user', async () => {
      const searches = [
        toAppwriteDoc({ id: 'ss1', user_id: 'u1', name: 'Search 1' }),
        toAppwriteDoc({ id: 'ss2', user_id: 'u1', name: 'Search 2' }),
      ];
      mockListDocuments.mockResolvedValueOnce({ documents: searches, total: 2 });
      const result = await repo.findByUser('u1');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Search 1');
    });

    it('should filter by search type when provided', async () => {
      const searches = [toAppwriteDoc({ id: 'ss1', user_id: 'u1', search_type: 'freelancer' })];
      mockListDocuments.mockResolvedValueOnce({ documents: searches, total: 1 });
      const result = await repo.findByUser('u1', 'freelancer');
      expect(result).toHaveLength(1);
      expect(result[0].search_type).toBe('freelancer');
    });

    it('should return empty array on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByUser('u1');
      expect(result).toEqual([]);
    });
  });

  describe('findOwnerById', () => {
    it('should return the user_id for a saved search', async () => {
      const search = { id: 'ss1', user_id: 'u1', name: 'React Jobs' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(search));
      const result = await repo.findOwnerById('ss1');
      expect(result).toBe('u1');
    });

    it('should return null when item not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.findOwnerById('ss1');
      expect(result).toBeNull();
    });

    it('should return null when user_id is missing', async () => {
      const search = { id: 'ss1', name: 'No Owner' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(search));
      const result = await repo.findOwnerById('ss1');
      expect(result).toBeNull();
    });
  });

  describe('findAllWithNotifyEnabled', () => {
    it('should return all saved searches with notifications enabled', async () => {
      mockListDocuments.mockResolvedValueOnce({
        documents: [toAppwriteDoc({ id: 'ss1', notify_on_new: true }), toAppwriteDoc({ id: 'ss2', notify_on_new: true })],
        total: 2,
      });

      const result = await repo.findAllWithNotifyEnabled();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('ss1');
      const queries = mockListDocuments.mock.calls[0][2] as any[];
      expect(queries.some(q => q.type === 'equal' && q.args[1] === true)).toBe(true);
    });

    it('should return saved searches beyond the first 100 (no truncation)', async () => {
      // 250 notify-enabled searches across 3 pages of 100 (fetchAll cursor pagination).
      const docs = Array.from({ length: 250 }, (_, i) => toAppwriteDoc({ id: `ss${i}`, notify_on_new: true }));
      mockListDocuments
        .mockResolvedValueOnce({ documents: docs.slice(0, 100), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(100, 200), total: 250 })
        .mockResolvedValueOnce({ documents: docs.slice(200), total: 250 });

      const result = await repo.findAllWithNotifyEnabled();
      expect(result).toHaveLength(250);
      expect(result[0].id).toBe('ss0');
      expect(result[249].id).toBe('ss249');
    });
  });
});
