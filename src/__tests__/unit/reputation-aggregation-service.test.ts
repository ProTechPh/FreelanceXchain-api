// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Reputation Aggregation Service', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabases.getDocument.mockResolvedValue({ $id: 'doc-id' });
  });

  const importModule = async () => {
    return await import('../../services/reputation-aggregation-service.js');
  };

  describe('getAggregatedScore', () => {
    it('should return zero scores when no reviews exist', async () => {
      const { getAggregatedScore } = await importModule();

      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getAggregatedScore('user-1');

      expect(result.success).toBe(true);
      expect(result.data.userId).toBe('user-1');
      expect(result.data.averageRating).toBe(0);
      expect(result.data.totalRatings).toBe(0);
      expect(result.data.workQuality).toBe(0);
      expect(result.data.communication).toBe(0);
      expect(result.data.professionalism).toBe(0);
      expect(result.data.wouldWorkAgainPercentage).toBe(0);
      expect(result.data.completedContracts).toBe(0);
      expect(result.data.onTimeDeliveryRate).toBe(0);
    });

    it('should calculate aggregated scores correctly', async () => {
      const { getAggregatedScore } = await importModule();

      const reviews = [
        { $id: 'r1', rating: 5, work_quality: 5, communication: 4, professionalism: 5, would_work_again: true },
        { $id: 'r2', rating: 4, work_quality: 4, communication: 5, professionalism: 4, would_work_again: true },
        { $id: 'r3', rating: 3, work_quality: 3, communication: 3, professionalism: 3, would_work_again: false },
      ];
      // 1st listDocuments: reviews
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 3 });
      // 2nd listDocuments: completed contracts count
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 5 });
      // 3rd listDocuments: all contracts
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'c1', project_id: 'p1' },
          { $id: 'c2', project_id: 'p2' },
        ],
        total: 2,
      });
      // getDocument for project milestones
      mockDatabases.getDocument
        .mockResolvedValueOnce({
          $id: 'p1',
          milestones: JSON.stringify([
            { status: 'approved', approved_at: '2025-01-14', due_date: '2025-01-15' },
            { status: 'approved', approved_at: '2025-01-25', due_date: '2025-01-20' },
          ]),
        })
        .mockResolvedValueOnce({ $id: 'p2', milestones: '[]' });

      const result = await getAggregatedScore('user-1');

      expect(result.success).toBe(true);
      expect(result.data.averageRating).toBe(4);
      expect(result.data.totalRatings).toBe(3);
      expect(result.data.workQuality).toBe(4);
      expect(result.data.communication).toBe(4);
      expect(result.data.professionalism).toBe(4);
      expect(result.data.wouldWorkAgainPercentage).toBe(67);
      expect(result.data.completedContracts).toBe(5);
      expect(result.data.onTimeDeliveryRate).toBe(50);
    });

    it('should handle milestones with null dates', async () => {
      const { getAggregatedScore } = await importModule();

      const reviews = [{ $id: 'r1', rating: 5, work_quality: 5, communication: 5, professionalism: 5, would_work_again: true }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 1 });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 1 });
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'p1' }],
        total: 1,
      });
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'p1',
        milestones: JSON.stringify([
          { status: 'approved', due_date: null, approved_at: '2025-01-14' },
          { status: 'approved', due_date: '2025-01-20', approved_at: null },
        ]),
      });

      const result = await getAggregatedScore('user-1');

      expect(result.success).toBe(true);
      expect(result.data.onTimeDeliveryRate).toBe(0);
    });

    it('should handle zero milestones for on-time rate', async () => {
      const { getAggregatedScore } = await importModule();

      const reviews = [{ $id: 'r1', rating: 4, work_quality: 4, communication: 4, professionalism: 4, would_work_again: true }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 1 });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getAggregatedScore('user-1');

      expect(result.success).toBe(true);
      expect(result.data.onTimeDeliveryRate).toBe(0);
    });

    it('should handle database errors', async () => {
      const { getAggregatedScore } = await importModule();

      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

      const result = await getAggregatedScore('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('AGGREGATION_FAILED');
    });
  });

  describe('getReputationBreakdown', () => {
    it('should return empty breakdown when no reviews', async () => {
      const { getReputationBreakdown } = await importModule();

      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getReputationBreakdown('user-1');

      expect(result.success).toBe(true);
      expect(result.data.fiveStars).toBe(0);
      expect(result.data.fourStars).toBe(0);
      expect(result.data.threeStars).toBe(0);
      expect(result.data.twoStars).toBe(0);
      expect(result.data.oneStar).toBe(0);
      expect(result.data.recentRatings).toEqual([]);
    });

    it('should calculate star breakdown correctly', async () => {
      const { getReputationBreakdown } = await importModule();

      const reviews = [
        { $id: 'r1', rating: 5, comment: 'Great', reviewer_id: 'u1', project_id: 'p1', created_at: '2025-01-01' },
        { $id: 'r2', rating: 5, comment: 'Excellent', reviewer_id: 'u2', project_id: 'p2', created_at: '2025-01-02' },
        { $id: 'r3', rating: 4, comment: 'Good', reviewer_id: 'u3', project_id: 'p3', created_at: '2025-01-03' },
        { $id: 'r4', rating: 3, comment: 'OK', reviewer_id: null, project_id: null, created_at: '2025-01-04' },
        { $id: 'r5', rating: 1, comment: 'Bad', reviewer_id: 'u5', project_id: 'p5', created_at: '2025-01-05' },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 5 });
      // getDocument for reviewers and projects
      mockDatabases.getDocument
        .mockResolvedValueOnce({ $id: 'u1', name: 'Alice' })
        .mockResolvedValueOnce({ $id: 'p1', title: 'Project A' })
        .mockResolvedValueOnce({ $id: 'u2', name: 'Bob' })
        .mockResolvedValueOnce({ $id: 'p2', title: 'Project B' })
        .mockResolvedValueOnce({ $id: 'u3', name: 'Charlie' })
        .mockResolvedValueOnce({ $id: 'p3', title: 'Project C' })
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({ $id: 'u5', name: 'Dave' })
        .mockResolvedValueOnce({ $id: 'p5', title: 'Project D' });

      const result = await getReputationBreakdown('user-1');

      expect(result.success).toBe(true);
      expect(result.data.fiveStars).toBe(2);
      expect(result.data.fourStars).toBe(1);
      expect(result.data.threeStars).toBe(1);
      expect(result.data.twoStars).toBe(0);
      expect(result.data.oneStar).toBe(1);
      expect(result.data.recentRatings).toHaveLength(5);
      // Check null handling
      expect(result.data.recentRatings[3].reviewerName).toBe('Anonymous');
      expect(result.data.recentRatings[3].projectTitle).toBe('Unknown Project');
    });

    it('should limit recent ratings to 10', async () => {
      const { getReputationBreakdown } = await importModule();

      const reviews = Array.from({ length: 15 }, (_, i) => ({
        $id: `r${i}`,
        rating: 5,
        comment: `Review ${i}`,
        reviewer_id: `u${i}`,
        project_id: `p${i}`,
        created_at: `2025-01-${String(i + 1).padStart(2, '0')}`,
      }));
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 15 });
      // getDocument for the 10 most recent reviewers + projects (20 calls)
      for (let i = 0; i < 10; i++) {
        mockDatabases.getDocument
          .mockResolvedValueOnce({ $id: `u${14 - i}`, name: `User ${14 - i}` })
          .mockResolvedValueOnce({ $id: `p${14 - i}`, title: `Project ${14 - i}` });
      }

      const result = await getReputationBreakdown('user-1');

      expect(result.success).toBe(true);
      expect(result.data.recentRatings).toHaveLength(10);
    });

    it('should handle database errors', async () => {
      const { getReputationBreakdown } = await importModule();

      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

      const result = await getReputationBreakdown('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('BREAKDOWN_FAILED');
    });
  });

  describe('getReputationHistory', () => {
    it('should return empty array when no reviews in period', async () => {
      const { getReputationHistory } = await importModule();

      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getReputationHistory('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should group reviews by month', async () => {
      const { getReputationHistory } = await importModule();

      const now = new Date();
      const d1 = new Date(now.getFullYear(), now.getMonth() - 1, 10);
      const d2 = new Date(now.getFullYear(), now.getMonth() - 1, 20);
      const d3 = new Date(now.getFullYear(), now.getMonth(), 15);

      const reviews = [
        { $id: 'r1', rating: 5, created_at: d1.toISOString() },
        { $id: 'r2', rating: 4, created_at: d2.toISOString() },
        { $id: 'r3', rating: 3, created_at: d3.toISOString() },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 3 });

      const result = await getReputationHistory('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].month).toBe(`${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}`);
      expect(result.data[0].averageRating).toBe(4.5);
      expect(result.data[0].count).toBe(2);
      expect(result.data[1].month).toBe(`${d3.getFullYear()}-${String(d3.getMonth() + 1).padStart(2, '0')}`);
      expect(result.data[1].averageRating).toBe(3);
      expect(result.data[1].count).toBe(1);
    });

    it('should accept custom months parameter', async () => {
      const { getReputationHistory } = await importModule();

      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getReputationHistory('user-1', 6);

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { getReputationHistory } = await importModule();

      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

      const result = await getReputationHistory('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('HISTORY_FAILED');
    });
  });

  describe('getReputationLeaderboard', () => {
    it('should return empty array when no reviews', async () => {
      const { getReputationLeaderboard } = await importModule();

      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getReputationLeaderboard();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should aggregate and sort leaderboard correctly', async () => {
      const { getReputationLeaderboard } = await importModule();

      const reviews = [
        { $id: 'r1', reviewee_id: 'user-1', rating: 5 },
        { $id: 'r2', reviewee_id: 'user-1', rating: 5 },
        { $id: 'r3', reviewee_id: 'user-1', rating: 5 },
        { $id: 'r4', reviewee_id: 'user-2', rating: 4 },
        { $id: 'r5', reviewee_id: 'user-2', rating: 4 },
        { $id: 'r6', reviewee_id: 'user-2', rating: 4 },
        { $id: 'r7', reviewee_id: 'user-3', rating: 5 },
        { $id: 'r8', reviewee_id: 'user-3', rating: 5 },
        { $id: 'r9', reviewee_id: 'user-3', rating: 5 },
        { $id: 'r10', reviewee_id: 'user-3', rating: 5 },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 10 });
      // getDocument for user names (3 candidates)
      mockDatabases.getDocument
        .mockResolvedValueOnce({ $id: 'user-3', name: 'Charlie' })
        .mockResolvedValueOnce({ $id: 'user-1', name: 'Alice' })
        .mockResolvedValueOnce({ $id: 'user-2', name: 'Bob' });

      const result = await getReputationLeaderboard();

      expect(result.success).toBe(true);
      // user-3 and user-1 both have 5.0 avg, but user-3 has more ratings
      expect(result.data[0].userId).toBe('user-3');
      expect(result.data[0].averageRating).toBe(5);
      expect(result.data[0].totalRatings).toBe(4);
      expect(result.data[1].userId).toBe('user-1');
      expect(result.data[2].userId).toBe('user-2');
    });

    it('should filter out users with fewer than 3 ratings', async () => {
      const { getReputationLeaderboard } = await importModule();

      const reviews = [
        { $id: 'r1', reviewee_id: 'user-1', rating: 5 },
        { $id: 'r2', reviewee_id: 'user-1', rating: 5 },
        { $id: 'r3', reviewee_id: 'user-1', rating: 5 },
        { $id: 'r4', reviewee_id: 'user-2', rating: 5 },
        { $id: 'r5', reviewee_id: 'user-2', rating: 5 },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 5 });
      mockDatabases.getDocument.mockResolvedValueOnce({ $id: 'user-1', name: 'Alice' });

      const result = await getReputationLeaderboard();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].userId).toBe('user-1');
    });

    it('should respect limit parameter', async () => {
      const { getReputationLeaderboard } = await importModule();

      const reviews = Array.from({ length: 30 }, (_, i) => ({
        $id: `r${i}`,
        reviewee_id: `user-${i % 5}`,
        rating: 5,
      }));
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 30 });
      // 3 candidates * 1 getDocument each
      for (let i = 0; i < 3; i++) {
        mockDatabases.getDocument.mockResolvedValueOnce({ $id: `user-${i}`, name: `User ${i}` });
      }

      const result = await getReputationLeaderboard(3);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeLessThanOrEqual(3);
    });

    it('should handle null user_name', async () => {
      const { getReputationLeaderboard } = await importModule();

      const reviews = [
        { $id: 'r1', reviewee_id: 'user-1', rating: 5 },
        { $id: 'r2', reviewee_id: 'user-1', rating: 5 },
        { $id: 'r3', reviewee_id: 'user-1', rating: 5 },
      ];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: reviews, total: 3 });
      mockDatabases.getDocument.mockResolvedValueOnce({ $id: 'user-1', name: null });

      const result = await getReputationLeaderboard();

      expect(result.success).toBe(true);
      expect(result.data[0].userName).toBe('Unknown');
    });

    it('should handle database errors', async () => {
      const { getReputationLeaderboard } = await importModule();

      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

      const result = await getReputationLeaderboard();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('LEADERBOARD_FAILED');
    });
  });
});
