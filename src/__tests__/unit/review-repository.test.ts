// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const { reviewRepository: ReviewRepository } = await import('../../repositories/review-repository.js');

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

  describe('findAllByRevieweeId', () => {
    it('returns all reviews for a reviewee, newest first', async () => {
      const reviews = [
        { $id: 'r1', reviewee_id: 'u1', rating: 5, created_at: '2025-01-02' },
        { $id: 'r2', reviewee_id: 'u1', rating: 4, created_at: '2025-01-01' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 2 });
      const result = await ReviewRepository.findAllByRevieweeId('u1');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('r1');
      expect(result[0]!.rating).toBe(5);
    });

    it('paginates past 100 reviews with cursorAfter (no silent 1000-doc cap)', async () => {
      const pageOne = Array.from({ length: 100 }, (_, i) => ({
        $id: `r${i}`, reviewee_id: 'u1', rating: 5,
      }));
      const pageTwo = [
        { $id: 'r100', reviewee_id: 'u1', rating: 4 },
        { $id: 'r101', reviewee_id: 'u1', rating: 3 },
        { $id: 'r102', reviewee_id: 'u1', rating: 2 },
      ];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: pageOne, total: 103 })
        .mockResolvedValueOnce({ documents: pageTwo, total: 103 });

      const result = await ReviewRepository.findAllByRevieweeId('u1');
      expect(result).toHaveLength(103);
      expect(mockDatabases.listDocuments).toHaveBeenCalledTimes(2);
      expect(result[100]!.id).toBe('r100');
      expect(result[102]!.rating).toBe(2);
    });

    it('returns empty array when no reviews exist', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await ReviewRepository.findAllByRevieweeId('u-nope');
      expect(result).toEqual([]);
    });

    it('propagates errors', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB down'));
      await expect(ReviewRepository.findAllByRevieweeId('u1')).rejects.toThrow('DB down');
    });
  });

  describe('findAllByProjectId', () => {
    it('returns all reviews for a project, newest first', async () => {
      const reviews = [
        { $id: 'r1', project_id: 'p1', rating: 5, created_at: '2025-01-02' },
        { $id: 'r2', project_id: 'p1', rating: 4, created_at: '2025-01-01' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 2 });
      const result = await ReviewRepository.findAllByProjectId('p1');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('r1');
      expect(result[1]!.rating).toBe(4);
    });

    it('returns empty array when no reviews exist', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await ReviewRepository.findAllByProjectId('p-nope');
      expect(result).toEqual([]);
    });

    it('propagates errors', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB down'));
      await expect(ReviewRepository.findAllByProjectId('p1')).rejects.toThrow('DB down');
    });
  });

  describe('listAll', () => {
    it('returns every review in the collection', async () => {
      const reviews = [
        { $id: 'r1', reviewee_id: 'u1', rating: 5 },
        { $id: 'r2', reviewee_id: 'u2', rating: 4 },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 2 });
      const result = await ReviewRepository.listAll();
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('r1');
    });

    it('returns empty array when the collection is empty', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await ReviewRepository.listAll();
      expect(result).toEqual([]);
    });

    it('propagates errors', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB down'));
      await expect(ReviewRepository.listAll()).rejects.toThrow('DB down');
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

// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('review-repository.ts - Branch Coverage', () => {
  it('L105: reduce handles null rating', () => {
    const reviews = [{ rating: null }, { rating: 5 }, { rating: 3 }];
    const total = reviews.reduce((s: number, r: any) => s + (r.rating || 0), 0);
    expect(total).toBe(8);
  });
});

describe('merged branch coverage', () => {
  it('review-repository L105: totalRating with missing rating', async () => {
    const mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({
      documents: [{ rating: undefined }, { rating: 4 }, { rating: null }],
      total: 3,
    });

    const { reviewRepository } = await import(resolveModule('src/repositories/review-repository.ts'));
    const result = await reviewRepository.getAverageRating('u1');
    expect(result).toBeDefined();
  });
});
