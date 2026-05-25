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
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool ?? { query: jest.fn() };
    // Use the global mockPool from jest.setup.ts
    const globalMock = (globalThis as any);
    if (globalMock.mockAppwriteClient) {
      // reset appwrite mock if present
    }
  });

  const importModule = async () => {
    return await import('../../services/analytics-service.js');
  };

  const getMockPool = () => {
    // Access the pool mock set up in jest.setup.ts via the database module mock
    return (jest as any)._mockPool || (globalThis as any)._mockPool;
  };

  // Helper to get the mocked pool.query from the database module
  const getPoolQuery = async () => {
    const db = await import('../../config/database.js');
    return (db.pool as any).query as jest.MockedFunction<any>;
  };

  describe('getFreelancerAnalytics - catch block and edge cases', () => {
    it('should handle thrown errors gracefully', async () => {
      const { getFreelancerAnalytics } = await importModule();
      const poolQuery = await getPoolQuery();
      poolQuery.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getFreelancerAnalytics('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should apply both startDate and endDate filters', async () => {
      const { getFreelancerAnalytics } = await importModule();
      const poolQuery = await getPoolQuery();

      poolQuery.mockResolvedValue({ rows: [] });

      await getFreelancerAnalytics('user-1', {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      const calls = poolQuery.mock.calls as any[][];
      const contractCall = calls.find((c) => c[0].includes('contracts'));
      expect(contractCall).toBeDefined();
      expect(contractCall![0]).toContain('created_at >=');
      expect(contractCall![0]).toContain('created_at <=');
      expect(contractCall![1]).toContain('2024-01-01');
      expect(contractCall![1]).toContain('2024-12-31');
    });

    it('should handle null reviews', async () => {
      const { getFreelancerAnalytics } = await importModule();
      const poolQuery = await getPoolQuery();

      poolQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('contracts') && sql.includes('freelancer_id')) return { rows: [{ id: 'c-1', total_amount: 1000, created_at: '2024-01-01T00:00:00Z' }] };
        if (sql.includes('reviews')) return { rows: [] };
        if (sql.includes('proposals')) return { rows: [] };
        return { rows: [] };
      });

      const result = await getFreelancerAnalytics('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.averageRating).toBe(0);
      }
    });

    it('should handle no proposals', async () => {
      const { getFreelancerAnalytics } = await importModule();
      const poolQuery = await getPoolQuery();

      poolQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('contracts') && sql.includes('freelancer_id')) return { rows: [] };
        if (sql.includes('reviews')) return { rows: [{ rating: 5 }] };
        if (sql.includes('proposals')) return { rows: [] };
        return { rows: [] };
      });

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
      const poolQuery = await getPoolQuery();
      poolQuery.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getEmployerAnalytics('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should apply date range filters', async () => {
      const { getEmployerAnalytics } = await importModule();
      const poolQuery = await getPoolQuery();

      poolQuery.mockResolvedValue({ rows: [] });

      await getEmployerAnalytics('user-1', {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      const calls = poolQuery.mock.calls as any[][];
      const projectCall = calls.find((c) => c[0].includes('projects') && c[0].includes('employer_id'));
      expect(projectCall).toBeDefined();
      expect(projectCall![0]).toContain('created_at >=');
      expect(projectCall![0]).toContain('created_at <=');
      expect(projectCall![1]).toContain('2024-01-01');
      expect(projectCall![1]).toContain('2024-12-31');
    });

    it('should handle zero projects posted', async () => {
      const { getEmployerAnalytics } = await importModule();
      const poolQuery = await getPoolQuery();

      poolQuery.mockResolvedValue({ rows: [] });

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
      const poolQuery = await getPoolQuery();

      poolQuery.mockResolvedValue({ rows: [] });

      const result = await getSkillDemandTrends();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should return skill trends from pool query', async () => {
      const { getSkillDemandTrends } = await importModule();
      const poolQuery = await getPoolQuery();

      poolQuery.mockResolvedValue({
        rows: [
          { skillName: 'JavaScript', projectCount: '11', averageBudget: '1000', demandLevel: 'high', growthRate: '10.5' },
          { skillName: 'Python', projectCount: '5', averageBudget: '800', demandLevel: 'high', growthRate: '10.5' },
          { skillName: 'CSS', projectCount: '1', averageBudget: '500', demandLevel: 'high', growthRate: '10.5' },
        ],
      });

      const result = await getSkillDemandTrends();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('should handle thrown errors gracefully', async () => {
      const { getSkillDemandTrends } = await importModule();
      const poolQuery = await getPoolQuery();

      poolQuery.mockRejectedValueOnce(new Error('DB error'));

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
      const poolQuery = await getPoolQuery();

      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      const monthKey = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

      poolQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('TO_CHAR') && sql.includes('users')) return { rows: [{ month: monthKey, count: '3' }] };
        if (sql.includes('TO_CHAR') && sql.includes('projects')) return { rows: [{ month: monthKey, count: '2' }] };
        if (sql.includes('COUNT') && sql.includes('users')) return { rows: [{ count: '10' }] };
        if (sql.includes('COUNT') && sql.includes('projects')) return { rows: [{ count: '8' }] };
        if (sql.includes('SUM') && sql.includes('revenue')) return { rows: [{ revenue: '500' }] };
        if (sql.includes('COUNT') && sql.includes('contracts')) return { rows: [{ count: '5' }] };
        return { rows: [{ count: '0' }] };
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
      const poolQuery = await getPoolQuery();

      poolQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('TO_CHAR')) return { rows: [] };
        return { rows: [{ count: '0', revenue: null, sum: null }] };
      });

      const result = await getAdminAnalytics();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userGrowth).toBe(0);
        expect(result.data.projectGrowth).toBe(0);
      }
    });

    it('should handle thrown errors gracefully', async () => {
      const { getAdminAnalytics } = await importModule();
      const poolQuery = await getPoolQuery();

      poolQuery.mockRejectedValueOnce(new Error('Unexpected'));

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
      const poolQuery = await getPoolQuery();

      poolQuery.mockResolvedValue({ rows: [{ count: '0', sum: null }] });

      const result = await getPlatformMetrics();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalUsers).toBe(0);
        expect(result.data.totalContracts).toBe(0);
      }
    });

    it('should handle thrown errors gracefully', async () => {
      const { getPlatformMetrics } = await importModule();
      const poolQuery = await getPoolQuery();

      poolQuery.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getPlatformMetrics();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
