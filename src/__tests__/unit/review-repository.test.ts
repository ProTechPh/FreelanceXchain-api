import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { ReviewRepository } = await import('../../repositories/review-repository.js');

describe('ReviewRepository', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
  });

  describe('findByContractId', () => {
    it('returns reviews for a contract', async () => {
      const reviews = [
        { $id: 'r1', contract_id: 'c1', reviewer_id: 'u1', rating: 5, comment: 'Great', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        { $id: 'r2', contract_id: 'c1', reviewer_id: 'u2', rating: 4, comment: 'Good', $createdAt: '2025-01-02', $updatedAt: '2025-01-02' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 2 });
      const result = await ReviewRepository.findByContractId('c1');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('r1');
      expect(result[0]!.contract_id).toBe('c1');
    });

    it('returns empty array when no reviews', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await ReviewRepository.findByContractId('c-nope');
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB fail'));
      await expect(ReviewRepository.findByContractId('c1')).rejects.toThrow('Failed to find reviews: DB fail');
    });
  });

  describe('findByRevieweeId', () => {
    it('returns paginated results with default options', async () => {
      const reviews = [{ $id: 'r1', reviewee_id: 'u1' }];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 1 })
        .mockResolvedValueOnce({ documents: reviews, total: 1 });
      const result = await ReviewRepository.findByRevieweeId('u1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('r1');
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(1);
    });

    it('returns paginated results with custom limit and offset', async () => {
      const reviews = [{ $id: 'r1' }, { $id: 'r2' }];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 10 })
        .mockResolvedValueOnce({ documents: reviews, total: 10 });
      const result = await ReviewRepository.findByRevieweeId('u1', { limit: 2, offset: 0 });
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(10);
    });

    it('returns empty items when no results', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await ReviewRepository.findByRevieweeId('u1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('throws on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('connection lost'));
      await expect(ReviewRepository.findByRevieweeId('u1')).rejects.toThrow('Failed to find reviews: connection lost');
    });
  });

  describe('getAverageRating', () => {
    it('calculates average correctly', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ rating: 4 }, { rating: 5 }, { rating: 3 }],
        total: 3,
      });
      const result = await ReviewRepository.getAverageRating('u1');
      expect(result.average).toBe(4);
      expect(result.count).toBe(3);
    });

    it('returns 0,0 when no ratings exist', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await ReviewRepository.getAverageRating('u1');
      expect(result).toEqual({ average: 0, count: 0 });
    });

    it('returns 0,0 on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('timeout'));
      const result = await ReviewRepository.getAverageRating('u1');
      expect(result).toEqual({ average: 0, count: 0 });
    });
  });

  describe('hasReviewed', () => {
    it('returns true when a review exists', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [{ $id: 'r1' }], total: 1 });
      const result = await ReviewRepository.hasReviewed('c1', 'u1');
      expect(result).toBe(true);
    });

    it('returns false when no review exists', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await ReviewRepository.hasReviewed('c1', 'u1');
      expect(result).toBe(false);
    });

    it('throws on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('fail'));
      await expect(ReviewRepository.hasReviewed('c1', 'u1')).rejects.toThrow('Failed to check review: fail');
    });
  });

  describe('getAllReviews', () => {
    it('returns all reviews', async () => {
      const reviews = [
        { $id: 'r1', $createdAt: '2025-01-02' },
        { $id: 'r2', $createdAt: '2025-01-01' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 2 });
      const result = await ReviewRepository.getAllReviews();
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('r1');
    });

    it('returns empty array when no reviews', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await ReviewRepository.getAllReviews();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('unavailable'));
      await expect(ReviewRepository.getAllReviews()).rejects.toThrow('Failed to query reviews: unavailable');
    });
  });
});