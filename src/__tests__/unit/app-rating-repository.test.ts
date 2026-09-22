import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { AppRatingRepository } = await import('../../repositories/app-rating-repository.js');

const doc = (over: Record<string, unknown> = {}) => ({
  $id: 'rating-1',
  user_id: 'user-1',
  user_role: 'freelancer',
  rating: 4,
  comment: 'Clear milestone view.',
  source: 'contract_completed',
  context_id: 'contract-1',
  $createdAt: '2026-09-20T10:00:00.000Z',
  $updatedAt: '2026-09-20T10:00:00.000Z',
  ...over,
});

describe('AppRatingRepository', () => {
  let repository: InstanceType<typeof AppRatingRepository>;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repository = new AppRatingRepository();
  });

  describe('findLatestByUser', () => {
    it('maps the newest rating to the domain model', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 1, documents: [doc()] });

      const result = await repository.findLatestByUser('user-1');

      expect(result).toMatchObject({
        id: 'rating-1',
        userId: 'user-1',
        userRole: 'freelancer',
        rating: 4,
        source: 'contract_completed',
        contextId: 'contract-1',
      });
      expect(mockDatabases.listDocuments).toHaveBeenCalledWith(
        'freelancexchain',
        'app_ratings',
        expect.any(Array),
      );
    });

    it('returns null when the user has never rated', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });

      expect(await repository.findLatestByUser('nobody')).toBeNull();
    });

    it('reports a lookup failure rather than swallowing it', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('appwrite down'));

      await expect(repository.findLatestByUser('user-1')).rejects.toThrow(/Failed to get latest app rating/);
    });
  });

  describe('hasRatedForContext', () => {
    it('is true when a row exists for that exact event', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 1, documents: [doc()] });

      expect(await repository.hasRatedForContext('user-1', 'contract_completed', 'contract-1')).toBe(true);
    });

    it('is false when nothing matches', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });

      expect(await repository.hasRatedForContext('user-1', 'contract_completed', 'contract-2')).toBe(false);
    });

    it('reports a lookup failure', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('appwrite down'));

      await expect(
        repository.hasRatedForContext('user-1', 'manual', 'x'),
      ).rejects.toThrow(/Failed to check app rating context/);
    });
  });

  describe('findAllByUser', () => {
    it('maps every row', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        total: 2,
        documents: [doc(), doc({ $id: 'rating-2', rating: 5 })],
      });

      const result = await repository.findAllByUser('user-1');

      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({ id: 'rating-2', rating: 5 });
    });
  });

  describe('listAll', () => {
    it('returns the page and its total', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 1, documents: [doc()] });

      const result = await repository.listAll();

      expect(result.total).toBe(1);
      expect(result.ratings[0]).toMatchObject({ id: 'rating-1' });
    });

    it('applies the source and rating filters', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });

      await repository.listAll({ source: 'manual', rating: 5, limit: 10, offset: 5 });

      const queries = mockDatabases.listDocuments.mock.calls[0][2];
      expect(queries.length).toBeGreaterThanOrEqual(5);
    });

    it('caps the page size', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 0, documents: [] });

      await expect(repository.listAll({ limit: 5000 })).resolves.toEqual({ ratings: [], total: 0 });
    });

    it('reports a listing failure', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('appwrite down'));

      await expect(repository.listAll()).rejects.toThrow(/Failed to list app ratings/);
    });
  });

  describe('fetchAllForSummary', () => {
    it('maps every row it pages through', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ total: 1, documents: [doc()] });

      const result = await repository.fetchAllForSummary();

      expect(result[0]).toMatchObject({ id: 'rating-1', rating: 4 });
    });
  });

  describe('createRating', () => {
    it('returns the created rating as a domain model', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce(doc({ $id: 'rating-new' }));

      const result = await repository.createRating({
        user_id: 'user-1',
        user_role: 'freelancer',
        rating: 4,
        source: 'manual',
      } as never);

      expect(result).toMatchObject({ id: 'rating-new', userId: 'user-1', rating: 4 });
    });
  });
});
