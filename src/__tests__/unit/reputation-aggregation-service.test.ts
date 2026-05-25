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
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/reputation-aggregation-service.js');
  };

  describe('getAggregatedScore', () => {
    it('should return zero scores when no reviews exist', async () => {
      const { getAggregatedScore } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

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
        { rating: 5, work_quality: 5, communication: 4, professionalism: 5, would_work_again: true },
        { rating: 4, work_quality: 4, communication: 5, professionalism: 4, would_work_again: true },
        { rating: 3, work_quality: 3, communication: 3, professionalism: 3, would_work_again: false },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 3 });
      // Completed contracts count
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      // Milestones for on-time delivery
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { due_date: '2025-01-15', approved_at: '2025-01-14' }, // on time
          { due_date: '2025-01-20', approved_at: '2025-01-25' }, // late
        ],
        rowCount: 2,
      });

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

      const reviews = [{ rating: 5, work_quality: 5, communication: 5, professionalism: 5, would_work_again: true }];
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { due_date: null, approved_at: '2025-01-14' },
          { due_date: '2025-01-20', approved_at: null },
        ],
        rowCount: 2,
      });

      const result = await getAggregatedScore('user-1');

      expect(result.success).toBe(true);
      expect(result.data.onTimeDeliveryRate).toBe(0);
    });

    it('should handle zero milestones for on-time rate', async () => {
      const { getAggregatedScore } = await importModule();

      const reviews = [{ rating: 4, work_quality: 4, communication: 4, professionalism: 4, would_work_again: true }];
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getAggregatedScore('user-1');

      expect(result.success).toBe(true);
      expect(result.data.onTimeDeliveryRate).toBe(0);
    });

    it('should handle database errors', async () => {
      const { getAggregatedScore } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getAggregatedScore('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('AGGREGATION_FAILED');
    });
  });

  describe('getReputationBreakdown', () => {
    it('should return empty breakdown when no reviews', async () => {
      const { getReputationBreakdown } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

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
        { rating: 5, comment: 'Great', reviewer_name: 'Alice', project_title: 'Project A', created_at: '2025-01-01' },
        { rating: 5, comment: 'Excellent', reviewer_name: 'Bob', project_title: 'Project B', created_at: '2025-01-02' },
        { rating: 4, comment: 'Good', reviewer_name: 'Charlie', project_title: 'Project C', created_at: '2025-01-03' },
        { rating: 3, comment: 'OK', reviewer_name: null, project_title: null, created_at: '2025-01-04' },
        { rating: 1, comment: 'Bad', reviewer_name: 'Dave', project_title: 'Project D', created_at: '2025-01-05' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 5 });

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
        rating: 5,
        comment: `Review ${i}`,
        reviewer_name: `User ${i}`,
        project_title: `Project ${i}`,
        created_at: `2025-01-${String(i + 1).padStart(2, '0')}`,
      }));
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 15 });

      const result = await getReputationBreakdown('user-1');

      expect(result.success).toBe(true);
      expect(result.data.recentRatings).toHaveLength(10);
    });

    it('should handle database errors', async () => {
      const { getReputationBreakdown } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getReputationBreakdown('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('BREAKDOWN_FAILED');
    });
  });

  describe('getReputationHistory', () => {
    it('should return empty array when no reviews in period', async () => {
      const { getReputationHistory } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getReputationHistory('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should group reviews by month', async () => {
      const { getReputationHistory } = await importModule();

      const reviews = [
        { rating: 5, created_at: '2025-01-10' },
        { rating: 4, created_at: '2025-01-20' },
        { rating: 3, created_at: '2025-02-15' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 3 });

      const result = await getReputationHistory('user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].month).toBe('2025-01');
      expect(result.data[0].averageRating).toBe(4.5);
      expect(result.data[0].count).toBe(2);
      expect(result.data[1].month).toBe('2025-02');
      expect(result.data[1].averageRating).toBe(3);
      expect(result.data[1].count).toBe(1);
    });

    it('should accept custom months parameter', async () => {
      const { getReputationHistory } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getReputationHistory('user-1', 6);

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { getReputationHistory } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getReputationHistory('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('HISTORY_FAILED');
    });
  });

  describe('getReputationLeaderboard', () => {
    it('should return empty array when no reviews', async () => {
      const { getReputationLeaderboard } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getReputationLeaderboard();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should aggregate and sort leaderboard correctly', async () => {
      const { getReputationLeaderboard } = await importModule();

      const reviews = [
        { reviewee_id: 'user-1', rating: 5, user_name: 'Alice' },
        { reviewee_id: 'user-1', rating: 5, user_name: 'Alice' },
        { reviewee_id: 'user-1', rating: 5, user_name: 'Alice' },
        { reviewee_id: 'user-2', rating: 4, user_name: 'Bob' },
        { reviewee_id: 'user-2', rating: 4, user_name: 'Bob' },
        { reviewee_id: 'user-2', rating: 4, user_name: 'Bob' },
        { reviewee_id: 'user-3', rating: 5, user_name: 'Charlie' },
        { reviewee_id: 'user-3', rating: 5, user_name: 'Charlie' },
        { reviewee_id: 'user-3', rating: 5, user_name: 'Charlie' },
        { reviewee_id: 'user-3', rating: 5, user_name: 'Charlie' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 10 });

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
        { reviewee_id: 'user-1', rating: 5, user_name: 'Alice' },
        { reviewee_id: 'user-1', rating: 5, user_name: 'Alice' },
        { reviewee_id: 'user-1', rating: 5, user_name: 'Alice' },
        { reviewee_id: 'user-2', rating: 5, user_name: 'Bob' },
        { reviewee_id: 'user-2', rating: 5, user_name: 'Bob' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 5 });

      const result = await getReputationLeaderboard();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].userId).toBe('user-1');
    });

    it('should respect limit parameter', async () => {
      const { getReputationLeaderboard } = await importModule();

      const reviews = Array.from({ length: 30 }, (_, i) => ({
        reviewee_id: `user-${i % 5}`,
        rating: 5,
        user_name: `User ${i % 5}`,
      }));
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 30 });

      const result = await getReputationLeaderboard(3);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeLessThanOrEqual(3);
    });

    it('should handle null user_name', async () => {
      const { getReputationLeaderboard } = await importModule();

      const reviews = [
        { reviewee_id: 'user-1', rating: 5, user_name: null },
        { reviewee_id: 'user-1', rating: 5, user_name: null },
        { reviewee_id: 'user-1', rating: 5, user_name: null },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: reviews, rowCount: 3 });

      const result = await getReputationLeaderboard();

      expect(result.success).toBe(true);
      expect(result.data[0].userName).toBe('Unknown');
    });

    it('should handle database errors', async () => {
      const { getReputationLeaderboard } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getReputationLeaderboard();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('LEADERBOARD_FAILED');
    });
  });
});
