// @ts-nocheck
/**
 * Analytics Service - Coverage completion tests
 * Targets uncovered lines: 395, 420-424, 430-431
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockPool = {
  query: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
  query: jest.fn(),
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { getFreelancerAnalytics, getEmployerAnalytics } = await import('../../services/analytics-service.js');

describe('Analytics Service - Coverage Completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFreelancerAnalytics - calculateTopSkills with object skills', () => {
    it('should handle skills as objects with skill_name property', async () => {
      // Contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'c1', total_amount: 1000, created_at: '2024-06-15T00:00:00Z' },
          { id: 'c2', total_amount: 2000, created_at: '2024-07-15T00:00:00Z' },
        ],
      });
      // Reviews query
      mockPool.query.mockResolvedValueOnce({ rows: [{ rating: 4.5 }] });
      // Proposals query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ status: 'accepted' }, { status: 'rejected' }],
      });
      // calculateTopSkills - contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ project_id: 'p1' }, { project_id: 'p2' }],
      });
      // calculateTopSkills - projects query with object skills
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { required_skills: [{ skill_name: 'React' }, { skill_name: 'TypeScript' }] },
          { required_skills: [{ name: 'Node.js' }, { skill_name: 'React' }] },
        ],
      });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topSkills).toBeDefined();
        expect(result.data.topSkills.length).toBeGreaterThan(0);
        expect(result.data.topSkills[0].skill).toBe('React');
        expect(result.data.topSkills[0].projectCount).toBe(2);
      }
    });

    it('should handle skills as plain strings', async () => {
      // Contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c1', total_amount: 500, created_at: '2024-03-10T00:00:00Z' }],
      });
      // Reviews query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Proposals query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // calculateTopSkills - contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ project_id: 'p1' }],
      });
      // calculateTopSkills - projects query with string skills
      mockPool.query.mockResolvedValueOnce({
        rows: [{ required_skills: ['JavaScript', 'Python', 'JavaScript'] }],
      });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topSkills).toBeDefined();
      }
    });

    it('should handle calculateTopSkills error gracefully', async () => {
      // Contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c1', total_amount: 1000, created_at: '2024-01-01T00:00:00Z' }],
      });
      // Reviews query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Proposals query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // calculateTopSkills - throw error
      mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topSkills).toEqual([]);
      }
    });

    it('should handle skills with null/undefined skill names', async () => {
      // Contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c1', total_amount: 100, created_at: '2024-05-01T00:00:00Z' }],
      });
      // Reviews query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Proposals query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // calculateTopSkills - contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ project_id: 'p1' }],
      });
      // calculateTopSkills - projects query with mixed skills (some without name)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ required_skills: [{ skill_name: null }, { other_field: 'test' }, { name: 'Valid' }] }],
      });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle null required_skills array', async () => {
      // Contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c1', total_amount: 100, created_at: '2024-05-01T00:00:00Z' }],
      });
      // Reviews query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Proposals query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // calculateTopSkills - contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ project_id: 'p1' }],
      });
      // calculateTopSkills - projects query with null skills
      mockPool.query.mockResolvedValueOnce({
        rows: [{ required_skills: null }],
      });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
    });

    it('should calculate earnings by month correctly', async () => {
      // Contracts query - multiple contracts in same month
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'c1', total_amount: 1000, created_at: '2024-06-01T00:00:00Z' },
          { id: 'c2', total_amount: 500, created_at: '2024-06-15T00:00:00Z' },
          { id: 'c3', total_amount: 2000, created_at: '2024-07-01T00:00:00Z' },
        ],
      });
      // Reviews query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Proposals query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // calculateTopSkills - no contracts
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.earningsByMonth).toBeDefined();
        const june = result.data.earningsByMonth.find(e => e.month === '2024-06');
        expect(june?.amount).toBe(1500);
      }
    });

    it('should handle contracts with null total_amount', async () => {
      // Contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'c1', total_amount: null, created_at: '2024-01-01T00:00:00Z' },
          { id: 'c2', total_amount: undefined, created_at: '2024-01-15T00:00:00Z' },
        ],
      });
      // Reviews query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Proposals query
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // calculateTopSkills - no contracts
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalEarnings).toBe(0);
      }
    });
  });

  describe('getEmployerAnalytics - calculateTopSkills with employer type', () => {
    it('should use employer_id column for top skills', async () => {
      // Contracts query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c1', total_amount: 3000, created_at: '2024-04-01T00:00:00Z' }],
      });
      // Projects query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'p1', status: 'completed' }, { id: 'p2', status: 'open' }],
      });
      // calculateTopSkills - contracts query (employer_id)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ project_id: 'p1' }],
      });
      // calculateTopSkills - projects query
      mockPool.query.mockResolvedValueOnce({
        rows: [{ required_skills: [{ skill_name: 'AWS' }, { name: 'Docker' }] }],
      });

      const result = await getEmployerAnalytics('employer-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topHiredSkills).toBeDefined();
      }
    });
  });
});
