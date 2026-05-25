import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { ReviewRepository } = await import('../../repositories/review-repository.js');

describe('ReviewRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findByContractId', () => {
    it('returns reviews for a contract', async () => {
      const reviews = [
        { id: 'r1', contract_id: 'c1', reviewer_id: 'u1', rating: 5, comment: 'Great', created_at: '2025-01-01', updated_at: '2025-01-01' },
        { id: 'r2', contract_id: 'c1', reviewer_id: 'u2', rating: 4, comment: 'Good', created_at: '2025-01-02', updated_at: '2025-01-02' },
      ];
      mockAppwriteResult({ data: reviews });
      const result = await ReviewRepository.findByContractId('c1');
      expect(result).toEqual(reviews);
    });

    it('returns empty array when data is null', async () => {
      mockAppwriteResult({ data: null });
      const result = await ReviewRepository.findByContractId('c-nope');
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      mockAppwriteResult({ error: { message: 'DB fail' } });
      await expect(ReviewRepository.findByContractId('c1')).rejects.toThrow('Failed to find reviews: DB fail');
    });
  });

  describe('findByRevieweeId', () => {
    it('returns paginated results with default options', async () => {
      const reviews = [{ id: 'r1', reviewee_id: 'u1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 1 });
      const result = await ReviewRepository.findByRevieweeId('u1');
      expect(result.items).toEqual(reviews);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(1);
    });

    it('returns paginated results with custom limit and offset', async () => {
      const reviews = [{ id: 'r1' }, { id: 'r2' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 2 });
      const result = await ReviewRepository.findByRevieweeId('u1', { limit: 2, offset: 0 });
      expect(result.items).toEqual(reviews);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(10);
    });

    it('returns empty items when no results', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await ReviewRepository.findByRevieweeId('u1');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    it('throws on error', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('connection lost'));
      await expect(ReviewRepository.findByRevieweeId('u1')).rejects.toThrow('Failed to find reviews: connection lost');
    });
  });

  describe('getAverageRating', () => {
    it('calculates average correctly', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ average: '4', count: '3' }], rowCount: 1 });
      const result = await ReviewRepository.getAverageRating('u1');
      expect(result).toEqual({ average: 4, count: 3 });
    });

    it('returns 0,0 when no ratings exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ average: null, count: '0' }], rowCount: 1 });
      const result = await ReviewRepository.getAverageRating('u1');
      expect(result).toEqual({ average: 0, count: 0 });
    });

    it('throws on error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('timeout'));
      await expect(ReviewRepository.getAverageRating('u1')).rejects.toThrow('Failed to get average rating: timeout');
    });
  });

  describe('hasReviewed', () => {
    it('returns true when a review exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 });
      const result = await ReviewRepository.hasReviewed('c1', 'u1');
      expect(result).toBe(true);
    });

    it('returns false when no review exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 });
      const result = await ReviewRepository.hasReviewed('c1', 'u1');
      expect(result).toBe(false);
    });

    it('throws on error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('fail'));
      await expect(ReviewRepository.hasReviewed('c1', 'u1')).rejects.toThrow('Failed to check review: fail');
    });
  });

  describe('getAllReviews', () => {
    it('returns all reviews', async () => {
      const reviews = [
        { id: 'r1', created_at: '2025-01-02' },
        { id: 'r2', created_at: '2025-01-01' },
      ];
      mockAppwriteResult({ data: reviews });
      const result = await ReviewRepository.getAllReviews();
      expect(result).toEqual(reviews);
    });

    it('returns empty array when data is null', async () => {
      mockAppwriteResult({ data: null });
      const result = await ReviewRepository.getAllReviews();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      mockAppwriteResult({ error: { message: 'unavailable' } });
      await expect(ReviewRepository.getAllReviews()).rejects.toThrow('Failed to query reviews: unavailable');
    });
  });
});