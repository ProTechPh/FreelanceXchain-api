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

describe('Analytics Service - Extended Tests', () => {
  let mockDatabases: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabases.getDocument.mockResolvedValue({ $id: 'doc-id' });
    // Clear analytics caches to avoid cross-test interference
    const cache = await import('../../utils/cache.js');
    cache.platformMetricsCache?.clear();
    cache.skillTrendsCache?.clear();
    cache.adminAnalyticsCache?.clear();
  });

  const importModule = async () => {
    return await import('../../services/analytics-service.js');
  };

  describe('getFreelancerAnalytics - catch block and edge cases', () => {
    it('should handle thrown errors gracefully', async () => {
      const { getFreelancerAnalytics } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getFreelancerAnalytics('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should apply both startDate and endDate filters', async () => {
      const { getFreelancerAnalytics } = await importModule();

      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'c1', total_amount: 1000, created_at: '2024-06-15T00:00:00Z' },
            { $id: 'c2', total_amount: 500, created_at: '2025-06-15T00:00:00Z' },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1', {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectsCompleted).toBe(1);
        expect(result.data.totalEarnings).toBe(1000);
      }
    });

    it('should handle null reviews', async () => {
      const { getFreelancerAnalytics } = await importModule();

      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'c-1', total_amount: 1000, created_at: '2024-01-01T00:00:00Z' }],
          total: 1,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.averageRating).toBe(0);
      }
    });

    it('should handle no proposals', async () => {
      const { getFreelancerAnalytics } = await importModule();

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({
          documents: [{ $id: 'r1', rating: 5 }],
          total: 1,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proposalAcceptanceRate).toBe(0);
      }
    });
  });

  describe('getEmployerAnalytics - catch block and edge cases', () => {
    it('should handle thrown errors gracefully', async () => {
      const { getEmployerAnalytics } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getEmployerAnalytics('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should apply date range filters', async () => {
      const { getEmployerAnalytics } = await importModule();

      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'p1', budget: 5000, created_at: '2024-06-15T00:00:00Z' },
            { $id: 'p2', budget: 3000, created_at: '2025-06-15T00:00:00Z' },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getEmployerAnalytics('user-1', {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectsPosted).toBe(1);
      }
    });

    it('should handle zero projects posted', async () => {
      const { getEmployerAnalytics } = await importModule();

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getEmployerAnalytics('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.averageProjectBudget).toBe(0);
      }
    });
  });

  describe('getSkillDemandTrends - edge cases', () => {
    it('should handle empty skill results', async () => {
      const { getSkillDemandTrends } = await importModule();
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getSkillDemandTrends();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should return skill trends from projects', async () => {
      const { getSkillDemandTrends } = await importModule();

      const now = new Date();
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'p1', required_skills: ['JavaScript', 'Python'], budget: 1000, created_at: now.toISOString() },
          { $id: 'p2', required_skills: ['JavaScript', 'CSS'], budget: 500, created_at: now.toISOString() },
          { $id: 'p3', required_skills: ['JavaScript'], budget: 800, created_at: now.toISOString() },
        ],
        total: 3,
      });

      const result = await getSkillDemandTrends();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
        const jsSkill = result.data.find((s: any) => s.skillName === 'JavaScript');
        expect(jsSkill).toBeDefined();
        expect(jsSkill!.projectCount).toBe(3);
      }
    });

    it('should handle thrown errors gracefully', async () => {
      const { getSkillDemandTrends } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

      const result = await getSkillDemandTrends();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('getAdminAnalytics - edge cases', () => {
    it('should handle user growth data with items', async () => {
      const { getAdminAnalytics } = await importModule();
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 10 })
        .mockResolvedValueOnce({ documents: [], total: 8 })
        .mockResolvedValueOnce({ documents: [{ total_amount: 500 }], total: 5 })
        .mockResolvedValueOnce({ documents: [], total: 3 })
        .mockResolvedValueOnce({
          documents: [
            { $id: 'u1', created_at: sixMonthsAgo.toISOString() },
            { $id: 'u2', created_at: now.toISOString() },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({
          documents: [
            { $id: 'p1', created_at: sixMonthsAgo.toISOString() },
            { $id: 'p2', created_at: now.toISOString() },
          ],
          total: 2,
        });

      const result = await getAdminAnalytics();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userGrowthData).toBeDefined();
        expect(result.data.projectActivityData).toBeDefined();
      }
    });

    it('should handle null counts for growth calculations', async () => {
      const { getAdminAnalytics } = await importModule();

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getAdminAnalytics();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userGrowth).toBe(0);
        expect(result.data.projectGrowth).toBe(0);
      }
    });

    it('should handle thrown errors gracefully', async () => {
      const { getAdminAnalytics } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getAdminAnalytics();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('getPlatformMetrics - edge cases', () => {
    it('should handle null counts', async () => {
      const { getPlatformMetrics } = await importModule();

      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getPlatformMetrics();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalUsers).toBe(0);
        expect(result.data.totalContracts).toBe(0);
      }
    });

    it('should handle thrown errors gracefully', async () => {
      const { getPlatformMetrics } = await importModule();
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getPlatformMetrics();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
