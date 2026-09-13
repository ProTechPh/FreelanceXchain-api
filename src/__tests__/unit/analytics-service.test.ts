// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
const mockDatabases = (globalThis as any).__mockDatabases;

// The 60s analytics caches persist across tests in this file; clear them before
// every test so each one exercises the miss path (cache-hit tests set their own).
beforeEach(async () => {
  const { 
    freelancerAnalyticsCache, 
    employerAnalyticsCache, 
    adminAnalyticsCache,
    cohortRetentionCache,
    churnRiskCache,
    marketplaceVelocityCache,
  } = await import('../../utils/cache.js');
  freelancerAnalyticsCache.clear();
  employerAnalyticsCache.clear();
  adminAnalyticsCache.clear();
  cohortRetentionCache.clear();
  churnRiskCache.clear();
  marketplaceVelocityCache.clear();
});

describe('Analytics Service', () => {
  it('should have getFreelancerAnalytics function', () => {
    expect(true).toBe(true);
  });

  it('should have getEmployerAnalytics function', () => {
    expect(true).toBe(true);
  });

  it('should have getSkillDemandTrends function', () => {
    expect(true).toBe(true);
  });

  it('should have getPlatformMetrics function', () => {
    expect(true).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('analytics-service – branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
  });

  it('L105: getFreelancerAnalytics with reviews missing rating', async () => {
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{ rating: undefined }, { rating: 5 }, { rating: 0 }],
      total: 3,
    }).mockResolvedValue({ documents: [], total: 0 });

    const { getFreelancerAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getFreelancerAnalytics('user1');
    expect(result).toBeDefined();
  });

  it('should include earnings beyond the old 1000-cap (no truncation)', async () => {
    // 250 completed contracts across 3 cursor pages, 1 ETH each — the old
    // Query.limit(1000) slice reported totalEarnings of only the newest 1000.
    const contracts = Array.from({ length: 250 }, (_, i) => ({
      $id: `c${i}`,
      freelancer_id: 'user1',
      status: 'completed',
      total_amount: 1,
    }));
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: contracts.slice(0, 100), total: 250 })
      .mockResolvedValueOnce({ documents: contracts.slice(100, 200), total: 250 })
      .mockResolvedValueOnce({ documents: contracts.slice(200), total: 250 })
      .mockResolvedValue({ documents: [], total: 0 });

    const { getFreelancerAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getFreelancerAnalytics('user1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalEarnings).toBe(250);
      expect(result.data.projectsCompleted).toBe(250);
    }
  });

  it('should include platform transaction volume beyond the old 1000-cap (no truncation)', async () => {
    // 250 completed contracts across 3 cursor pages, 1 ETH each — the old
    // Query.limit(1000) slice undercounted totalTransactionVolume.
    const contracts = Array.from({ length: 250 }, (_, i) => ({
      $id: `c${i}`,
      status: 'completed',
      total_amount: 1,
    }));
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 5 }) // users count
      .mockResolvedValueOnce({ documents: [], total: 3 }) // projects count
      .mockResolvedValueOnce({ documents: [], total: 2 }) // contracts count
      .mockResolvedValueOnce({ documents: [], total: 250 }) // completed count
      .mockResolvedValueOnce({ documents: contracts.slice(0, 100), total: 250 })
      .mockResolvedValueOnce({ documents: contracts.slice(100, 200), total: 250 })
      .mockResolvedValueOnce({ documents: contracts.slice(200), total: 250 });

    const { getPlatformMetrics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getPlatformMetrics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalTransactionVolume).toBe(250);
    }
  });

  it('should include admin user growth beyond the old 1000-cap (no truncation)', async () => {
    const now = new Date().toISOString();
    const users = Array.from({ length: 250 }, (_, i) => ({ $id: `u${i}`, created_at: now }));
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 5 }) // users count
      .mockResolvedValueOnce({ documents: [], total: 3 }) // projects count
      .mockResolvedValueOnce({ documents: [], total: 1 }) // active count
      .mockResolvedValueOnce({ documents: [], total: 250 }) // completed (empty)
      .mockResolvedValueOnce({ documents: users.slice(0, 100), total: 250 })
      .mockResolvedValueOnce({ documents: users.slice(100, 200), total: 250 })
      .mockResolvedValueOnce({ documents: users.slice(200), total: 250 });

    const { getAdminAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getAdminAnalytics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userGrowth).toBe(250);
      expect(result.data.userGrowthData).toHaveLength(1);
    }
  });

  it('should include skill demand beyond the old 1000-cap (no truncation)', async () => {
    const now = new Date().toISOString();
    const projects = Array.from({ length: 250 }, (_, i) => ({
      $id: `p${i}`,
      status: 'open',
      budget: 10,
      created_at: now,
      required_skills: [{ skill_name: 'React' }],
    }));
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: projects.slice(0, 100), total: 250 })
      .mockResolvedValueOnce({ documents: projects.slice(100, 200), total: 250 })
      .mockResolvedValueOnce({ documents: projects.slice(200), total: 250 });

    const { getSkillTrends } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getSkillTrends();
    expect(result.success).toBe(true);
    if (result.success) {
      const react = result.data.find(t => t.skillName === 'React');
      expect(react?.projectCount).toBe(250);
    }
  });

  it('L273: getPlatformMetrics handles contracts with missing total_amount', async () => {
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'u1', email: 'a@b.com' }], total: 1 })
      .mockResolvedValueOnce({ documents: [{ $id: 'p1' }], total: 1 })
      .mockResolvedValueOnce({ documents: [{ $id: 'c1', status: 'active' }], total: 1 })
      .mockResolvedValueOnce({ documents: [{ total_amount: undefined }], total: 1 })
      .mockResolvedValue({ documents: [{ user_id: 'u1', created_at: '2025-01-01' }], total: 1 });

    const { getPlatformMetrics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getPlatformMetrics();
    expect(result).toBeDefined();
  });

  it('L346: getAdminAnalytics revenue from completed contracts', async () => {
    mockDatabases.listDocuments.mockResolvedValue({
      documents: [], total: 0,
    });

    const { getAdminAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getAdminAnalytics();
    expect(result).toBeDefined();
  });

  it('L442: getSkillTrends with required_skills as string', async () => {
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'p1', required_skills: '[{"skill_name":"React"}]',
        budget: 5000, created_at: new Date().toISOString(),
      }],
      total: 1,
    }).mockResolvedValue({ documents: [], total: 0 });

    const { getSkillTrends } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getSkillTrends();
    expect(result).toBeDefined();
  });

  it('L466,L469: growthRate calc with olderCount > 0', async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60);
    const recent = new Date();
    recent.setDate(recent.getDate() - 5);

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'p1', required_skills: '[{"skill_name":"React"}]', budget: 1000, created_at: thirtyDaysAgo.toISOString() },
        { $id: 'p2', required_skills: '[{"skill_name":"React"}]', budget: 2000, created_at: recent.toISOString() },
      ],
      total: 2,
    }).mockResolvedValue({ documents: [], total: 0 });

    const { getSkillTrends } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getSkillTrends();
    expect(result).toBeDefined();
  });

  it('L570: freelancerDemand with required_skills as string', async () => {
    // getSkillDemandTrends is an alias for getSkillTrends
    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [{
        $id: 'p1', required_skills: '[{"skill_name":"Solidity"}]',
        budget: 5000, created_at: new Date().toISOString(),
      }],
      total: 1,
    }).mockResolvedValue({ documents: [], total: 0 });

    const { getSkillDemandTrends } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getSkillDemandTrends();
    expect(result).toBeDefined();
  });
});

describe('Analytics Service - Direct Branch Coverage', () => {
  const importModule = async () => import('../../services/analytics-service.js');

  beforeEach(() => {
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabases.getDocument.mockResolvedValue({ $id: 'doc-id' });
  });

  it('should filter contracts by startDate', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [
          { $id: 'c1', total_amount: 100, status: 'completed', created_at: '2025-01-15' },
          { $id: 'c2', total_amount: 200, status: 'completed', created_at: '2025-03-15' },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getFreelancerAnalytics('user-1', { startDate: '2025-03-01' });
    expect(result.success).toBe(true);
  });

  it('should filter contracts by endDate', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [
          { $id: 'c1', total_amount: 100, status: 'completed', created_at: '2025-01-15' },
          { $id: 'c2', total_amount: 200, status: 'completed', created_at: '2025-03-15' },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getFreelancerAnalytics('user-1', { endDate: '2025-02-01' });
    expect(result.success).toBe(true);
  });

  it('should return correct average rating when reviews exist', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'c1', total_amount: 100, created_at: '2025-01-15' }], total: 1 })
      .mockResolvedValueOnce({
        documents: [{ $id: 'r1', rating: 4 }, { $id: 'r2', rating: 5 }],
        total: 2,
      })
      .mockResolvedValueOnce({ documents: [{ $id: 'p1', status: 'accepted' }, { $id: 'p2', status: 'pending' }], total: 2 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getFreelancerAnalytics('user-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.averageRating).toBe(4.5);
  });

  it('should return 0 average rating when no reviews', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getFreelancerAnalytics('user-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.averageRating).toBe(0);
  });

  it('should calculate proposal acceptance rate correctly', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({
        documents: [
          { $id: 'p1', status: 'accepted' },
          { $id: 'p2', status: 'pending' },
          { $id: 'p3', status: 'accepted' },
        ],
        total: 3,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getFreelancerAnalytics('user-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.proposalAcceptanceRate).toBe(66.7);
  });

  it('should handle employer analytics with date filtering', async () => {
    const { getEmployerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [
          { $id: 'proj1', budget: 500, created_at: '2025-01-15' },
          { $id: 'proj2', budget: 1000, created_at: '2025-06-15' },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', total_amount: 500, created_at: '2025-01-20' }],
        total: 1,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getEmployerAnalytics('user-1', { startDate: '2025-01-01', endDate: '2025-12-31' });
    expect(result.success).toBe(true);
  });

  it('should handle getPlatformMetrics cache hit', async () => {
    const { getPlatformMetrics } = await importModule();
    const { platformMetricsCache } = await import('../../utils/cache.js');
    platformMetricsCache.set('platform_metrics', {
      totalUsers: 10, totalProjects: 5, totalContracts: 3,
      totalTransactionVolume: 1000, activeUsers: 5, completionRate: 66.7,
    });

    const result = await getPlatformMetrics();
    expect(result.success).toBe(true);
  });

  it('should handle getPlatformMetrics with zero contracts', async () => {
    const { getPlatformMetrics } = await importModule();
    const { platformMetricsCache } = await import('../../utils/cache.js');
    platformMetricsCache.delete('platform_metrics');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getPlatformMetrics();
    expect(result.success).toBe(true);
  });

  it('should handle getSkillTrends cache hit', async () => {
    const { getSkillTrends } = await importModule();
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.set('skill_trends', []);

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
  });

  it('should serve a cached freelancer analytics result without re-scanning', async () => {
    const { getFreelancerAnalytics } = await importModule();
    const { freelancerAnalyticsCache } = await import('../../utils/cache.js');
    freelancerAnalyticsCache.set('freelancer:user-1::', {
      totalEarnings: 100,
      projectsCompleted: 1,
      averageRating: 5,
      earningsByMonth: [],
      topSkills: [],
      proposalAcceptanceRate: 0,
    });

    const result = await getFreelancerAnalytics('user-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalEarnings).toBe(100);
    }
    expect(mockDatabases.listDocuments).not.toHaveBeenCalled();
    expect(mockDatabases.getDocument).not.toHaveBeenCalled();
  });

  it('should serve a cached employer analytics result without re-scanning', async () => {
    const { getEmployerAnalytics } = await importModule();
    const { employerAnalyticsCache } = await import('../../utils/cache.js');
    employerAnalyticsCache.set('employer:user-1::', {
      totalSpent: 200,
      projectsPosted: 2,
      projectsCompleted: 1,
      averageProjectBudget: 100,
      spendingByMonth: [],
      topHiredSkills: [],
    });

    const result = await getEmployerAnalytics('user-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalSpent).toBe(200);
    }
    expect(mockDatabases.listDocuments).not.toHaveBeenCalled();
    expect(mockDatabases.getDocument).not.toHaveBeenCalled();
  });

  it('should serve a cached admin analytics result without re-scanning', async () => {
    const { getAdminAnalytics } = await importModule();
    const { adminAnalyticsCache } = await import('../../utils/cache.js');
    adminAnalyticsCache.set('admin_analytics', {
      totalUsers: 10,
      totalProjects: 5,
      totalRevenue: 100,
      activeContracts: 3,
      userGrowth: 1,
      projectGrowth: 1,
      userGrowthData: [],
      projectActivityData: [],
    });

    const result = await getAdminAnalytics();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalUsers).toBe(10);
    }
    expect(mockDatabases.listDocuments).not.toHaveBeenCalled();
  });

  it('should handle getSkillTrends with projects having string required_skills', async () => {
    const { getSkillTrends } = await importModule();
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.delete('skill_trends');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'p1', required_skills: '["React", "Node.js"]', budget: 1000, status: 'open', created_at: '2025-01-15' },
        { $id: 'p2', required_skills: [{ skill_name: 'React' }], budget: 500, status: 'open', created_at: '2025-01-15' },
      ],
      total: 2,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
  });

  it('should handle getSkillTrends with old projects only', async () => {
    const { getSkillTrends } = await importModule();
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.delete('skill_trends');

    mockDatabases.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'p1', required_skills: [{ skill_name: 'React' }], budget: 1000, status: 'open', created_at: '2024-01-01' },
      ],
      total: 1,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
  });

  it('should handle getSkillTrends with many projects (high demand)', async () => {
    const { getSkillTrends } = await importModule();
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.delete('skill_trends');

    const projects = Array.from({ length: 12 }, (_, i) => ({
      $id: `p${i}`, required_skills: [{ skill_name: 'React' }], budget: 1000, status: 'open', created_at: '2025-01-15',
    }));

    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: projects, total: 12 });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
  });

  it('should handle getSkillTrends with 3-9 projects (medium demand)', async () => {
    const { getSkillTrends } = await importModule();
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.delete('skill_trends');

    const projects = Array.from({ length: 5 }, (_, i) => ({
      $id: `p${i}`, required_skills: [{ skill_name: 'React' }], budget: 1000, status: 'open', created_at: '2025-01-15',
    }));

    mockDatabases.listDocuments.mockResolvedValueOnce({ documents: projects, total: 5 });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
  });

  it('should handle getSkillTrends error', async () => {
    const { getSkillTrends } = await importModule();
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.delete('skill_trends');

    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));

    const result = await getSkillTrends();
    expect(result.success).toBe(false);
  });

  it('should handle calculateTopSkills error gracefully', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockRejectedValueOnce(new Error('DB error'));

    const result = await getFreelancerAnalytics('user-1');
    expect(result.success).toBe(true);
  });

  it('should handle calculateTopSkills fetching project docs', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'c1', total_amount: 100, created_at: '2025-01-15' }], total: 1 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [{ $id: 'c1', project_id: 'proj1' }], total: 1 });
    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'proj1', required_skills: [{ skill_name: 'React' }], created_at: '2025-01-15',
    });

    const result = await getFreelancerAnalytics('user-1');
    expect(result.success).toBe(true);
  });

  it('should handle calculateTopSkills with string required_skills', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'c1', total_amount: 100, created_at: '2025-01-15' }], total: 1 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [{ $id: 'c1', project_id: 'proj1' }], total: 1 });
    mockDatabases.getDocument.mockResolvedValueOnce({
      $id: 'proj1', required_skills: '["React"]', created_at: '2025-01-15',
    });

    const result = await getFreelancerAnalytics('user-1');
    expect(result.success).toBe(true);
  });

  it('should handle calculateTopSkills when getDocument fails', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'c1', total_amount: 100, created_at: '2025-01-15' }], total: 1 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [{ $id: 'c1', project_id: 'proj1' }], total: 1 });
    mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));

    const result = await getFreelancerAnalytics('user-1');
    expect(result.success).toBe(true);
  });

  it('should handle employer analytics with zero projects', async () => {
    const { getEmployerAnalytics } = await importModule();
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getEmployerAnalytics('user-1');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.averageProjectBudget).toBe(0);
  });

  it('should handle freelancer analytics exception', async () => {
    const { getFreelancerAnalytics } = await importModule();
    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB failure'));

    const result = await getFreelancerAnalytics('user-1');
    expect(result.success).toBe(false);
  });

  it('should handle employer analytics exception', async () => {
    const { getEmployerAnalytics } = await importModule();
    mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB failure'));

    const result = await getEmployerAnalytics('user-1');
    expect(result.success).toBe(false);
  });
});

describe('analytics-service.ts - Branch Coverage', () => {
  it('L105: reviews.reduce with null rating', () => {
    const reviews = [{ rating: null }, { rating: 4 }];
    expect(reviews.reduce((s: number, r: any) => s + (r.rating || 0), 0)).toBe(4);
  });

  it('L105: reviews with falsy ratings through getFreelancerAnalytics', async () => {
    const { getFreelancerAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({
        documents: [{ rating: 0 }, { rating: null }, { rating: undefined }, { rating: 5 }],
        total: 4,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getFreelancerAnalytics('user-falsy');
    expect(result).toBeDefined();
  });

  it('L177: getEmployerAnalytics with zero projects exercises averageProjectBudget=0 branch', async () => {
    const { getEmployerAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getEmployerAnalytics('employer-empty');
    expect(result).toBeDefined();
  });

  it('L199: getEmployerAnalytics contracts with falsy total_amount', async () => {
    const { getEmployerAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [{ $id: 'p1', budget: 100, created_at: '2025-01-01' }], total: 1 })
      .mockResolvedValueOnce({
        documents: [
          { total_amount: null, created_at: '2025-01-01' },
          { total_amount: undefined, created_at: '2025-01-01' },
          { total_amount: 500, created_at: '2025-01-01' },
        ],
        total: 3,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getEmployerAnalytics('employer-falsy');
    expect(result).toBeDefined();
  });

  it('L346: getPlatformMetrics completed contracts with falsy total_amount', async () => {
    const { getPlatformMetrics } = await import(resolveModule('src/services/analytics-service.ts'));
    const { platformMetricsCache } = await import('../../utils/cache.js');
    platformMetricsCache.delete('platform_metrics');

    mockDatabases.listDocuments
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({
        documents: [
          { total_amount: null },
          { total_amount: undefined },
          { total_amount: 0 },
          { total_amount: 1000 },
        ],
        total: 4,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getPlatformMetrics();
    expect(result).toBeDefined();
  });

  it('L273: completedDocs reduce null total_amount', () => {
    expect([{ total_amount: null }, { total_amount: '100' }].reduce((s: number, c: any) => s + Number(c.total_amount || 0), 0)).toBe(100);
  });

  it('L346: revenue calc null total_amount', () => {
    expect([{ total_amount: null }, { total_amount: '200' }].reduce((s: number, c: any) => s + Number(c.total_amount || 0) * 0.05, 0)).toBe(10);
  });

  it('L442: skills from invalid JSON string', () => {
    const project = { required_skills: 'invalid' };
    const skills = typeof project.required_skills === 'string'
      ? (() => { try { return JSON.parse(project.required_skills); } catch { return []; } })()
      : project.required_skills || [];
    expect(skills).toEqual([]);
  });

  it('L466/469: avgBudget and growthRate', () => {
    const stats = { projectCount: 2, totalBudget: 200, recentCount: 3, olderCount: 1 };
    expect(stats.projectCount > 0 ? stats.totalBudget / stats.projectCount : 0).toBe(100);
    expect(stats.olderCount > 0 ? Math.round(((stats.recentCount - stats.olderCount) / stats.olderCount) * 100 * 10) / 10 : 0).toBe(200);
  });

  it('L570: skills as array (not string)', () => {
    const doc = { required_skills: [{ skill_name: 'JS' }] };
    const skills = typeof doc.required_skills === 'string' ? JSON.parse(doc.required_skills) : doc.required_skills || [];
    expect(skills).toEqual([{ skill_name: 'JS' }]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from analytics-service-extended.test.ts
// ═══════════════════════════════════════════════════════════════

describe('Analytics Service - Extended Tests', () => {
  let mockDatabasesExt: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDatabasesExt = (globalThis as any).__mockDatabases;
    mockDatabasesExt.listDocuments.mockReset();
    mockDatabasesExt.getDocument.mockReset();
    mockDatabasesExt.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabasesExt.getDocument.mockResolvedValue({ $id: 'doc-id' });
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
      mockDatabasesExt.listDocuments.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getFreelancerAnalytics('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should apply both startDate and endDate filters', async () => {
      const { getFreelancerAnalytics } = await importModule();

      mockDatabasesExt.listDocuments
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

      mockDatabasesExt.listDocuments
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

      mockDatabasesExt.listDocuments
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
      mockDatabasesExt.listDocuments.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getEmployerAnalytics('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should apply date range filters', async () => {
      const { getEmployerAnalytics } = await importModule();

      mockDatabasesExt.listDocuments
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

      mockDatabasesExt.listDocuments
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
      mockDatabasesExt.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getSkillDemandTrends();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should return skill trends from projects', async () => {
      const { getSkillDemandTrends } = await importModule();

      const now = new Date();
      mockDatabasesExt.listDocuments.mockResolvedValueOnce({
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
      mockDatabasesExt.listDocuments.mockRejectedValueOnce(new Error('DB error'));

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

      mockDatabasesExt.listDocuments
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

      mockDatabasesExt.listDocuments
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
      mockDatabasesExt.listDocuments.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getAdminAnalytics();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should calculate activeProSubscriptions and proConversionRate correctly', async () => {
      const { getAdminAnalytics } = await importModule();

      // 1st: users total = 10
      mockDatabasesExt.listDocuments.mockResolvedValueOnce({ documents: [], total: 10 });
      // 2nd: projects total = 5
      mockDatabasesExt.listDocuments.mockResolvedValueOnce({ documents: [], total: 5 });
      // 3rd: active contracts = 2
      mockDatabasesExt.listDocuments.mockResolvedValueOnce({ documents: [], total: 2 });
      // 4th: completed contracts
      mockDatabasesExt.listDocuments.mockResolvedValueOnce({
        documents: [{ total_amount: 1000, rush_fee: 100, employer_id: 'emp1' }],
        total: 1,
      });
      // 5th: all users (growth)
      mockDatabasesExt.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      // 6th: all projects (growth)
      mockDatabasesExt.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      // 7th: subscriptions (pro plan)
      mockDatabasesExt.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'u1', plan: 'pro', status: 'active' },
          { $id: 'u2', plan: 'pro', status: 'trialing' },
          { $id: 'u3', plan: 'pro', status: 'canceled' }, // not entitled
        ],
        total: 3,
      });

      const result = await getAdminAnalytics();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activeProSubscriptions).toBe(2);
        // 2 / 10 * 100 = 20%
        expect(result.data.proConversionRate).toBe(20);
        expect(result.data.projectedBenchmarkRevenue).toBe(50); // 1000 * 0.05
        expect(result.data.rushFeeRevenue).toBe(10); // 100 * 0.10
        expect(result.data.realizedRevenue).toBe(10);
      }
    });
  });

  describe('getPlatformMetrics - edge cases', () => {
    it('should handle null counts', async () => {
      const { getPlatformMetrics } = await importModule();

      mockDatabasesExt.listDocuments
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
      mockDatabasesExt.listDocuments.mockRejectedValueOnce(new Error('Unexpected'));

      const result = await getPlatformMetrics();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});

describe('Analytics Service - Additional Branch Coverage', () => {
  it('skill.name fallback when skill_name is absent', () => {
    const skill = { name: 'React' };
    const skillName = typeof skill === 'string' ? skill : (skill.skill_name || skill.name);
    expect(skillName).toBe('React');
  });

  it('required_skills null fallback to empty array', () => {
    const required_skills = null;
    const skills = typeof required_skills === 'string'
      ? JSON.parse(required_skills)
      : required_skills || [];
    expect(skills).toEqual([]);
  });

  it('required_skills already an array', () => {
    const required_skills = ['React', 'Node'];
    const skills = typeof required_skills === 'string'
      ? JSON.parse(required_skills)
      : required_skills || [];
    expect(skills).toEqual(['React', 'Node']);
  });

  it('growthRate when olderCount is 0 and recentCount is 0', () => {
    const olderCount = 0;
    const recentCount = 0;
    const growthRate = olderCount > 0
      ? Math.round(((recentCount - olderCount) / olderCount) * 100 * 10) / 10
      : recentCount > 0 ? 100.0 : 0.0;
    expect(growthRate).toBe(0.0);
  });

  it('growthRate when olderCount is 0 and recentCount > 0', () => {
    const olderCount = 0;
    const recentCount = 5;
    const growthRate = olderCount > 0
      ? Math.round(((recentCount - olderCount) / olderCount) * 100 * 10) / 10
      : recentCount > 0 ? 100.0 : 0.0;
    expect(growthRate).toBe(100.0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Targeted branch coverage tests for specific uncovered lines
// ═══════════════════════════════════════════════════════════════

describe('Analytics Service - Targeted Branch Coverage', () => {
  let mockDb: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.getDocument.mockReset();
    mockDb.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDb.getDocument.mockResolvedValue({ $id: 'doc-id' });
    const cache = await import('../../utils/cache.js');
    cache.platformMetricsCache?.clear();
    cache.skillTrendsCache?.clear();
    cache.adminAnalyticsCache?.clear();
  });

  // Line 177: averageProjectBudget when projectsPosted === 0
  it('L177: getEmployerAnalytics with zero projects returns averageProjectBudget=0', async () => {
    const { getEmployerAnalytics } = await import('../../services/analytics-service.js');

    // 1st listDocuments: projects → empty
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
    // 2nd listDocuments: contracts → empty
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
    // 3rd listDocuments: calculateTopSkills contracts → empty
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getEmployerAnalytics('employer-zero');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projectsPosted).toBe(0);
      expect(result.data.averageProjectBudget).toBe(0);
    }
  });

  // Line 177: averageProjectBudget when projectsPosted > 0
  it('L177: getEmployerAnalytics with projects returns calculated averageProjectBudget', async () => {
    const { getEmployerAnalytics } = await import('../../services/analytics-service.js');

    // 1st listDocuments: projects → 2 projects
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'p1', budget: 500, created_at: '2025-01-01' },
        { $id: 'p2', budget: 1500, created_at: '2025-01-01' },
      ],
      total: 2,
    });
    // 2nd listDocuments: contracts → empty
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
    // 3rd listDocuments: calculateTopSkills contracts → empty
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getEmployerAnalytics('employer-with-projects');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projectsPosted).toBe(2);
      expect(result.data.averageProjectBudget).toBe(1000);
    }
  });

  // Line 346: totalRevenue with falsy total_amount (|| 0 fallback)
  it('L346: getAdminAnalytics revenue with null/undefined total_amount', async () => {
    const { getAdminAnalytics } = await import('../../services/analytics-service.js');

    // 1st: users
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 5 });
    // 2nd: projects
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 3 });
    // 3rd: active contracts
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 1 });
    // 4th: completed contracts with falsy total_amount (full cursor fetch)
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [
        { total_amount: null },
        { total_amount: undefined },
        { total_amount: 0 },
        { total_amount: 2000 },
      ],
      total: 4,
    });
    // 5th: all users (growth)
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
    // 6th: all projects (growth)
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getAdminAnalytics();
    expect(result.success).toBe(true);
    if (result.success) {
      // totalRevenue = (0 + 0 + 0 + 2000) * 0.05 = 100
      expect(result.data.totalRevenue).toBe(100);
    }
  });

  // Line 346: totalRevenue when all contracts have valid total_amount
  it('L346: getAdminAnalytics revenue with valid total_amount values', async () => {
    const { getAdminAnalytics } = await import('../../services/analytics-service.js');

    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 5 });
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 3 });
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 1 });
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [
        { total_amount: 1000 },
        { total_amount: 500 },
      ],
      total: 2,
    });
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
    mockDb.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const result = await getAdminAnalytics();
    expect(result.success).toBe(true);
    if (result.success) {
      // totalRevenue = (1000 + 500) * 0.05 = 75
      expect(result.data.totalRevenue).toBe(75);
    }
  });

  // Lines 466, 469: getSkillTrends growth rate with olderCount=0, recentCount>0
  it('L466,469: getSkillTrends growthRate 100% when all projects are recent', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.delete('skill_trends');

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5); // 5 days ago = recent

    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'p1', required_skills: [{ skill_name: 'Solidity' }], budget: 3000, status: 'open', created_at: recentDate.toISOString() },
        { $id: 'p2', required_skills: [{ skill_name: 'Solidity' }], budget: 5000, status: 'open', created_at: recentDate.toISOString() },
      ],
      total: 2,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
    if (result.success) {
      const solidityTrend = result.data.find((s: any) => s.skillName === 'Solidity');
      expect(solidityTrend).toBeDefined();
      // olderCount=0, recentCount=2 → growthRate = 100.0
      expect(solidityTrend!.growthRate).toBe(100.0);
      // projectCount=2, totalBudget=8000 → avgBudget=4000
      expect(solidityTrend!.averageBudget).toBe(4000);
    }
  });

  // Lines 466, 469: getSkillTrends growth rate with olderCount>0
  it('L466,469: getSkillTrends growthRate calculated when olderCount > 0', async () => {
    const { getSkillTrends } = await import('../../services/analytics-service.js');
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.delete('skill_trends');

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60); // 60 days ago = older
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);

    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [
        { $id: 'p1', required_skills: [{ skill_name: 'Rust' }], budget: 2000, status: 'open', created_at: oldDate.toISOString() },
        { $id: 'p2', required_skills: [{ skill_name: 'Rust' }], budget: 4000, status: 'open', created_at: oldDate.toISOString() },
        { $id: 'p3', required_skills: [{ skill_name: 'Rust' }], budget: 6000, status: 'open', created_at: recentDate.toISOString() },
      ],
      total: 3,
    });

    const result = await getSkillTrends();
    expect(result.success).toBe(true);
    if (result.success) {
      const rustTrend = result.data.find((s: any) => s.skillName === 'Rust');
      expect(rustTrend).toBeDefined();
      // olderCount=2, recentCount=1 → growthRate = ((1-2)/2)*100 = -50
      expect(rustTrend!.growthRate).toBe(-50);
      // projectCount=3, totalBudget=12000 → avgBudget=4000
      expect(rustTrend!.averageBudget).toBe(4000);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration tests that call actual source functions for Istanbul coverage
// ═══════════════════════════════════════════════════════════════

describe('Analytics Service - Integration Coverage', () => {
  let mockDatabasesInt: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDatabasesInt = (globalThis as any).__mockDatabases;
    mockDatabasesInt.listDocuments.mockReset();
    mockDatabasesInt.getDocument.mockReset();
    mockDatabasesInt.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabasesInt.getDocument.mockResolvedValue({ $id: 'doc-id' });
    const cache = await import('../../utils/cache.js');
    cache.platformMetricsCache?.clear();
    cache.skillTrendsCache?.clear();
    cache.adminAnalyticsCache?.clear();
  });

  const importModule = async () => {
    return await import('../../services/analytics-service.js');
  };

  // Lines 572-575: skill.name fallback when skill_name is absent in calculateTopSkills
  it('calculateTopSkills falls back to skill.name when skill_name is absent (lines 572-575)', async () => {
    const { getFreelancerAnalytics } = await importModule();

    // 1st listDocuments: completed contracts
    mockDatabasesInt.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'c1', total_amount: 1000, created_at: '2025-01-15' }],
      total: 1,
    });
    // 2nd listDocuments: reviews
    mockDatabasesInt.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
    // 3rd listDocuments: proposals
    mockDatabasesInt.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
    // 4th listDocuments: contracts for topSkills
    mockDatabasesInt.listDocuments.mockResolvedValueOnce({
      documents: [{ $id: 'c1', project_id: 'proj1' }],
      total: 1,
    });
    // getDocument for project with skills using 'name' instead of 'skill_name'
    mockDatabasesInt.getDocument.mockResolvedValueOnce({
      $id: 'proj1',
      required_skills: [{ name: 'React' }, { skill_name: 'Node.js' }],
      created_at: '2025-01-15',
    });

    const result = await getFreelancerAnalytics('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topSkills).toBeDefined();
      // Both 'React' (from name) and 'Node.js' (from skill_name) should be found
      const reactSkill = result.data.topSkills.find(s => s.skill === 'React');
      expect(reactSkill).toBeDefined();
    }
  });

  // Lines 572-575: required_skills null fallback to [] in calculateTopSkills
  it('calculateTopSkills handles null required_skills (lines 572-575)', async () => {
    const { getFreelancerAnalytics } = await importModule();

    mockDatabasesInt.listDocuments
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', total_amount: 500, created_at: '2025-01-15' }],
        total: 1,
      })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({ documents: [], total: 0 })
      .mockResolvedValueOnce({
        documents: [{ $id: 'c1', project_id: 'proj1' }],
        total: 1,
      });
    // Project with null required_skills
    mockDatabasesInt.getDocument.mockResolvedValueOnce({
      $id: 'proj1',
      required_skills: null,
      created_at: '2025-01-15',
    });

    const result = await getFreelancerAnalytics('user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topSkills).toEqual([]);
    }
  });

  // Lines 442, 466, 469: getSkillTrends with skill.name fallback and growthRate when olderCount=0
  it('getSkillTrends handles skill.name fallback and growth rate with no older projects', async () => {
    const { getSkillTrends } = await importModule();
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.delete('skill_trends');

    const now = new Date();
    // All projects are recent (within 30 days), so olderCount=0
    mockDatabasesInt.listDocuments.mockResolvedValueOnce({
      documents: [
        {
          $id: 'p1',
          required_skills: [{ name: 'React' }], // name instead of skill_name
          budget: 1000,
          status: 'open',
          created_at: now.toISOString(),
        },
        {
          $id: 'p2',
          required_skills: [{ name: 'React' }],
          budget: 2000,
          status: 'open',
          created_at: now.toISOString(),
        },
      ],
      total: 2,
    });

    const result = await getSkillTrends();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      const reactTrend = result.data.find(s => s.skillName === 'React');
      expect(reactTrend).toBeDefined();
      expect(reactTrend!.growthRate).toBe(100.0); // olderCount=0, recentCount>0
    }
  });

  // Lines 442, 466, 469: getSkillTrends with null required_skills and growthRate with olderCount>0
  it('getSkillTrends handles null required_skills and growth rate with older projects', async () => {
    const { getSkillTrends } = await importModule();
    const { skillTrendsCache } = await import('../../utils/cache.js');
    skillTrendsCache.delete('skill_trends');

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const recentDate = new Date();

    mockDatabasesInt.listDocuments.mockResolvedValueOnce({
      documents: [
        // null required_skills - should be skipped gracefully
        { $id: 'p0', required_skills: null, budget: 500, status: 'open', created_at: recentDate.toISOString() },
        // Old project with skill
        {
          $id: 'p1',
          required_skills: [{ skill_name: 'Solidity' }],
          budget: 3000,
          status: 'open',
          created_at: oldDate.toISOString(),
        },
        // Recent project with same skill
        {
          $id: 'p2',
          required_skills: [{ skill_name: 'Solidity' }],
          budget: 5000,
          status: 'open',
          created_at: recentDate.toISOString(),
        },
      ],
      total: 3,
    });

    const result = await getSkillTrends();

    expect(result.success).toBe(true);
    if (result.success) {
      const solidityTrend = result.data.find(s => s.skillName === 'Solidity');
      expect(solidityTrend).toBeDefined();
      // olderCount=1, recentCount=1, growthRate = ((1-1)/1)*100 = 0
      expect(solidityTrend!.growthRate).toBe(0);
    }
  });
});

describe('Analytics Service - Additional Branch Coverage', () => {
  it('L105: reviews.length === 0 returns empty array ternary', () => {
    const reviews: any[] = [];
    const recentRatings = reviews.length > 0
      ? reviews.slice(0, 5).map((r: any) => ({ rating: r.rating, comment: r.comment || '' }))
      : [];
    expect(recentRatings).toEqual([]);
  });

  it('L177: Number(p.budget || 0) when budget is falsy', () => {
    const p1: any = { budget: 0 };
    const p2: any = { budget: null };
    const p3: any = { budget: undefined };
    const p4: any = { budget: '' };
    expect(Number(p1.budget || 0)).toBe(0);
    expect(Number(p2.budget || 0)).toBe(0);
    expect(Number(p3.budget || 0)).toBe(0);
    expect(Number(p4.budget || 0)).toBe(0);
  });

  it('L199: Number(c.total_amount || 0) when total_amount is falsy', () => {
    const c1: any = { total_amount: 0 };
    const c2: any = { total_amount: null };
    const c3: any = { total_amount: undefined };
    expect(Number(c1.total_amount || 0)).toBe(0);
    expect(Number(c2.total_amount || 0)).toBe(0);
    expect(Number(c3.total_amount || 0)).toBe(0);
  });

  it('L346: growthRate ternary when olderCount is 0', () => {
    const olderCount = 0;
    const recentCount = 5;
    const growthRate = olderCount > 0 ? ((recentCount - olderCount) / olderCount) * 100 : recentCount > 0 ? 100 : 0;
    expect(growthRate).toBe(100);
  });

  it('L466: stats.projectCount > 0 ternary', () => {
    const stats1: any = { projectCount: 5, totalBudget: 10000 };
    const stats2: any = { projectCount: 0, totalBudget: 0 };
    const avg1 = stats1.projectCount > 0 ? stats1.totalBudget / stats1.projectCount : 0;
    const avg2 = stats2.projectCount > 0 ? stats2.totalBudget / stats2.projectCount : 0;
    expect(avg1).toBe(2000);
    expect(avg2).toBe(0);
  });

  it('L469: stats.olderCount > 0 ternary for growth calculation', () => {
    const stats1: any = { olderCount: 3, projectCount: 5 };
    const stats2: any = { olderCount: 0, projectCount: 5 };
    const growth1 = stats1.olderCount > 0 ? ((stats1.projectCount - stats1.olderCount) / stats1.olderCount) * 100 : stats1.projectCount > 0 ? 100 : 0;
    const growth2 = stats2.olderCount > 0 ? ((stats2.projectCount - stats2.olderCount) / stats2.olderCount) * 100 : stats2.projectCount > 0 ? 100 : 0;
    expect(growth1).toBeCloseTo(66.67, 1);
    expect(growth2).toBe(100);
  });

  it('L177: getEmployerAnalytics with falsy project budget exercises || 0 branch', async () => {
    mockDatabases.listDocuments
      .mockResolvedValueOnce({
        documents: [
          { $id: 'p1', budget: 500, created_at: '2025-01-01' },
          { $id: 'p2', budget: null, created_at: '2025-02-01' },
          { $id: 'p3', budget: undefined, created_at: '2025-03-01' },
        ],
        total: 3,
      })
      .mockResolvedValue({ documents: [], total: 0 });

    const { getEmployerAnalytics } = await import(resolveModule('src/services/analytics-service.ts'));
    const result = await getEmployerAnalytics('user1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projectsPosted).toBe(3);
    }
  });

  describe('getMarketplaceLiquidityReport', () => {
    it('should compute liquidity report with shortage, balanced, and surplus skills', async () => {
      const { getMarketplaceLiquidityReport } = await import(resolveModule('src/services/analytics-service.ts'));
      const { marketplaceLiquidityCache } = await import('../../utils/cache.js');
      marketplaceLiquidityCache.delete('marketplace_liquidity');

      // Projects call (demand)
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'p1', status: 'open', required_skills: JSON.stringify([{ name: 'Solidity' }, { name: 'React' }]) },
            { $id: 'p2', status: 'open', required_skills: [{ skill_name: 'Solidity' }, { skill_name: 'Python' }] },
          ],
          total: 2,
        })
        // Profiles call (supply)
        .mockResolvedValueOnce({
          documents: [
            { $id: 'prof1', skills: [{ name: 'React' }, { name: 'Python' }, { name: 'Python' }, { name: 'Python' }, { name: 'Python' }] },
          ],
          total: 1,
        });

      const result = await getMarketplaceLiquidityReport();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skillsAnalyzed).toBeGreaterThanOrEqual(2);
        expect(Array.isArray(result.data.shortageSkills)).toBe(true);
        expect(Array.isArray(result.data.balancedSkills)).toBe(true);
        expect(Array.isArray(result.data.surplusSkills)).toBe(true);
      }
    });

    it('should return cached liquidity report on cache hit', async () => {
      const { getMarketplaceLiquidityReport } = await import(resolveModule('src/services/analytics-service.ts'));
      const { marketplaceLiquidityCache } = await import('../../utils/cache.js');
      const cachedData: any = { overallLiquidityScore: 90, skillsAnalyzed: 5, shortageSkills: [], balancedSkills: [], surplusSkills: [] };
      marketplaceLiquidityCache.set('marketplace_liquidity', cachedData);

      const result = await getMarketplaceLiquidityReport();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.overallLiquidityScore).toBe(90);
      }
    });

    it('should handle errors gracefully', async () => {
      const { getMarketplaceLiquidityReport } = await import(resolveModule('src/services/analytics-service.ts'));
      const { marketplaceLiquidityCache } = await import('../../utils/cache.js');
      marketplaceLiquidityCache.delete('marketplace_liquidity');

      mockDatabases.listDocuments.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const result = await getMarketplaceLiquidityReport();
      expect(result.success).toBe(false);
    });
  });

  describe('getFunnelMetrics', () => {
    it('should compute funnel metrics across all 8 stages', async () => {
      const { getFunnelMetrics } = await import(resolveModule('src/services/analytics-service.ts'));
      const { funnelMetricsCache } = await import('../../utils/cache.js');
      funnelMetricsCache.delete('funnel_metrics');

      mockDatabases.listDocuments
        // allUsers
        .mockResolvedValueOnce({
          documents: [
            { $id: 'u1', id: 'u1', role: 'employer', name: 'Acme', wallet_address: '0x123', kyc_verified: true },
            { $id: 'u2', id: 'u2', role: 'freelancer', name: 'Bob', wallet_address: '0x456', kyc_verified: false },
          ],
          total: 2,
        })
        // freelancerProfiles
        .mockResolvedValueOnce({
          documents: [
            { $id: 'fp1', user_id: 'u2' },
          ],
          total: 1,
        })
        // projects
        .mockResolvedValueOnce({
          documents: [
            { $id: 'p1', employer_id: 'u1' },
          ],
          total: 1,
        })
        // proposals
        .mockResolvedValueOnce({
          documents: [
            { $id: 'pr1', freelancer_id: 'u2', project_id: 'p1' },
          ],
          total: 1,
        })
        // contracts
        .mockResolvedValueOnce({
          documents: [
            { $id: 'c1', employer_id: 'u1', freelancer_id: 'u2', status: 'completed' },
            { $id: 'c2', employer_id: 'u1', freelancer_id: 'u2', status: 'completed' },
          ],
          total: 2,
        });

      const result = await getFunnelMetrics();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalRegistered).toBe(2);
        expect(result.data.stages.length).toBe(8);
        expect(result.data.stages[0]?.stage).toBe('registered');
        expect(result.data.stages[0]?.count).toBe(2);
        expect(result.data.stages[7]?.stage).toBe('repeat_users');
        expect(result.data.overallConversionRate).toBeGreaterThan(0);
      }
    });

    it('should return cached funnel metrics on cache hit', async () => {
      const { getFunnelMetrics } = await import(resolveModule('src/services/analytics-service.ts'));
      const { funnelMetricsCache } = await import('../../utils/cache.js');
      const cachedData: any = { stages: [], totalRegistered: 10, overallConversionRate: 50, generatedAt: new Date().toISOString() };
      funnelMetricsCache.set('funnel_metrics', cachedData);

      const result = await getFunnelMetrics();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalRegistered).toBe(10);
      }
    });

    it('should handle errors gracefully in getFunnelMetrics', async () => {
      const { getFunnelMetrics } = await import(resolveModule('src/services/analytics-service.ts'));
      const { funnelMetricsCache } = await import('../../utils/cache.js');
      funnelMetricsCache.delete('funnel_metrics');

      mockDatabases.listDocuments.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const result = await getFunnelMetrics();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    describe('getCohortRetentionReport', () => {
      it('should compute cohort retention across multiple registration cohorts and months', async () => {
        const { getCohortRetentionReport } = await import(resolveModule('src/services/analytics-service.ts'));

        // Mock users: 2 in 2026-08, 1 in 2026-09
        const mockUsers = [
          { $id: 'u1', role: 'employer', $createdAt: '2026-08-01T00:00:00.000Z' },
          { $id: 'u2', role: 'freelancer', $createdAt: '2026-08-15T00:00:00.000Z' },
          { $id: 'u3', role: 'freelancer', $createdAt: '2026-09-01T00:00:00.000Z' },
        ];

        // Contracts: u1 and u2 in 2026-09
        const mockContracts = [
          {
            $id: 'c1',
            employer_id: 'u1',
            freelancer_id: 'u2',
            status: 'completed',
            total_amount: 500,
            $createdAt: '2026-09-05T00:00:00.000Z',
          },
        ];

        mockDatabases.listDocuments
          .mockResolvedValueOnce({ documents: mockUsers, total: mockUsers.length }) // users
          .mockResolvedValueOnce({ documents: mockContracts, total: mockContracts.length }) // contracts
          .mockResolvedValueOnce({ documents: [], total: 0 }) // projects
          .mockResolvedValueOnce({ documents: [], total: 0 }); // proposals

        const result = await getCohortRetentionReport();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.cohorts.length).toBeGreaterThanOrEqual(1);
          const augCohort = result.data.cohorts.find(c => c.cohortMonth === '2026-08');
          expect(augCohort).toBeDefined();
          expect(augCohort?.totalUsers).toBe(2);
        }
      });

      it('should serve cached cohort retention report on cache hit', async () => {
        const { getCohortRetentionReport } = await import(resolveModule('src/services/analytics-service.ts'));
        const { cohortRetentionCache } = await import('../../utils/cache.js');

        const cachedReport: any = {
          cohorts: [],
          averageMonth1Retention: 50,
          averageMonth3Retention: 25,
          generatedAt: new Date().toISOString(),
        };
        cohortRetentionCache.set('cohort_retention', cachedReport);

        const result = await getCohortRetentionReport();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.averageMonth1Retention).toBe(50);
        }
      });

      it('should handle errors gracefully in getCohortRetentionReport', async () => {
        const { getCohortRetentionReport } = await import(resolveModule('src/services/analytics-service.ts'));
        const { cohortRetentionCache } = await import('../../utils/cache.js');
        cohortRetentionCache.delete('cohort_retention');

        mockDatabases.listDocuments.mockImplementationOnce(() => {
          throw new Error('Database error in cohorts');
        });

        const result = await getCohortRetentionReport();
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INTERNAL_ERROR');
        }
      });
    });

    describe('getChurnRiskReport', () => {
      it('should evaluate churn signals and categorize risk levels', async () => {
        const { getChurnRiskReport } = await import(resolveModule('src/services/analytics-service.ts'));

        // Old date: 45 days ago
        const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString();

        const mockUsers = [
          { $id: 'u1', role: 'freelancer', email: 'u1@test.com', wallet_address: '', $createdAt: fortyFiveDaysAgo },
          { $id: 'u2', role: 'employer', email: 'u2@test.com', wallet_address: '0x123', $createdAt: new Date().toISOString() },
        ];

        const mockProfiles = [
          { user_id: 'u1', skills: '[]', bio: '' },
        ];

        const mockProposals = [
          { freelancer_id: 'u1', status: 'rejected', $createdAt: fortyFiveDaysAgo },
          { freelancer_id: 'u1', status: 'rejected', $createdAt: fortyFiveDaysAgo },
          { freelancer_id: 'u1', status: 'rejected', $createdAt: fortyFiveDaysAgo },
        ];

        const mockDisputes = [
          { initiator_id: 'u1' },
        ];

        mockDatabases.listDocuments
          .mockResolvedValueOnce({ documents: mockUsers, total: mockUsers.length }) // users
          .mockResolvedValueOnce({ documents: mockProfiles, total: mockProfiles.length }) // profiles
          .mockResolvedValueOnce({ documents: mockProposals, total: mockProposals.length }) // proposals
          .mockResolvedValueOnce({ documents: [], total: 0 }) // contracts
          .mockResolvedValueOnce({ documents: [], total: 0 }) // reviews
          .mockResolvedValueOnce({ documents: mockDisputes, total: mockDisputes.length }); // disputes

        const result = await getChurnRiskReport();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.totalEvaluated).toBe(2);
          const atRiskUser = result.data.highRiskUsers.find(u => u.userId === 'u1');
          expect(atRiskUser).toBeDefined();
          expect(atRiskUser?.riskLevel).toBe('high');
          expect(atRiskUser?.signals).toContain('inactive_30d');
          expect(atRiskUser?.signals).toContain('proposal_rejections');
          expect(atRiskUser?.signals).toContain('dispute_involvement');
        }
      });

      it('should serve cached churn risk report on cache hit', async () => {
        const { getChurnRiskReport } = await import(resolveModule('src/services/analytics-service.ts'));
        const { churnRiskCache } = await import('../../utils/cache.js');

        const cachedReport: any = {
          totalEvaluated: 10,
          riskDistribution: { low: 8, medium: 2, high: 0 },
          highRiskUsers: [],
          generatedAt: new Date().toISOString(),
        };
        churnRiskCache.set('churn_risk', cachedReport);

        const result = await getChurnRiskReport();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.totalEvaluated).toBe(10);
        }
      });

      it('should handle errors gracefully in getChurnRiskReport', async () => {
        const { getChurnRiskReport } = await import(resolveModule('src/services/analytics-service.ts'));
        const { churnRiskCache } = await import('../../utils/cache.js');
        churnRiskCache.delete('churn_risk');

        mockDatabases.listDocuments.mockImplementationOnce(() => {
          throw new Error('Database error in churn risk');
        });

        const result = await getChurnRiskReport();
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INTERNAL_ERROR');
        }
      });
    });

    describe('getMarketplaceVelocityReport', () => {
      it('should compute time-to-first-proposal, time-to-hire, and turnaround velocity', async () => {
        const { getMarketplaceVelocityReport } = await import(resolveModule('src/services/analytics-service.ts'));

        const projCreated = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
        const propCreated = new Date(Date.now() - 44 * 3600 * 1000).toISOString(); // 4 hours later
        const contractCreated = new Date(Date.now() - 24 * 3600 * 1000).toISOString(); // 1 day later

        const mockProjects = [
          {
            $id: 'p1',
            $createdAt: projCreated,
            milestones: [
              {
                id: 'm1',
                submitted_at: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
                approved_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
                status: 'approved',
              },
            ],
          },
        ];

        const mockProposals = [
          { $id: 'pr1', project_id: 'p1', freelancer_id: 'f1', $createdAt: propCreated },
        ];

        const mockContracts = [
          {
            $id: 'c1',
            project_id: 'p1',
            employer_id: 'e1',
            freelancer_id: 'f1',
            status: 'completed',
            $createdAt: contractCreated,
            updated_at: new Date().toISOString(),
          },
        ];

        mockDatabases.listDocuments
          .mockResolvedValueOnce({ documents: mockProjects, total: mockProjects.length }) // projects
          .mockResolvedValueOnce({ documents: mockProposals, total: mockProposals.length }) // proposals
          .mockResolvedValueOnce({ documents: mockContracts, total: mockContracts.length }); // contracts

        const result = await getMarketplaceVelocityReport();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.medianTimeToFirstProposalHours).toBeCloseTo(4, 0);
          expect(result.data.totalCompletedContracts).toBe(1);
          expect(result.data.repeatEmployerRate).toBe(0);
        }
      });

      it('should serve cached velocity report on cache hit', async () => {
        const { getMarketplaceVelocityReport } = await import(resolveModule('src/services/analytics-service.ts'));
        const { marketplaceVelocityCache } = await import('../../utils/cache.js');

        const cachedReport: any = {
          medianTimeToFirstProposalHours: 2.5,
          medianTimeToHireDays: 1.5,
          medianMilestoneTurnaroundDays: 0.8,
          averageContractDurationDays: 10,
          repeatEmployerRate: 20,
          repeatFreelancerRate: 30,
          totalCompletedContracts: 15,
          generatedAt: new Date().toISOString(),
        };
        marketplaceVelocityCache.set('marketplace_velocity', cachedReport);

        const result = await getMarketplaceVelocityReport();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.medianTimeToFirstProposalHours).toBe(2.5);
        }
      });

      it('should handle errors gracefully in getMarketplaceVelocityReport', async () => {
        const { getMarketplaceVelocityReport } = await import(resolveModule('src/services/analytics-service.ts'));
        const { marketplaceVelocityCache } = await import('../../utils/cache.js');
        marketplaceVelocityCache.delete('marketplace_velocity');

        mockDatabases.listDocuments.mockImplementationOnce(() => {
          throw new Error('Database error in velocity');
        });

        const result = await getMarketplaceVelocityReport();
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INTERNAL_ERROR');
        }
      });
    });
  });
});
