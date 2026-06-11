// @ts-nocheck
/**
 * Analytics Service - Coverage completion tests
 * Targets uncovered lines for getFreelancerAnalytics and getEmployerAnalytics
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const { getFreelancerAnalytics, getEmployerAnalytics } = await import('../../services/analytics-service.js');

describe('Analytics Service - Coverage Completion', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    mockDatabases.listDocuments.mockReset();
    mockDatabases.getDocument.mockReset();
    mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });
    mockDatabases.getDocument.mockResolvedValue({ $id: 'doc-id' });
  });

  describe('getFreelancerAnalytics - calculateTopSkills with object skills', () => {
    it('should handle skills as objects with skill_name property', async () => {
      // Contracts query
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'c1', total_amount: 1000, created_at: '2024-06-15T00:00:00Z' },
            { $id: 'c2', total_amount: 2000, created_at: '2024-07-15T00:00:00Z' },
          ],
          total: 2,
        })
        // Reviews query
        .mockResolvedValueOnce({
          documents: [{ $id: 'r1', rating: 4.5 }],
          total: 1,
        })
        // Proposals query
        .mockResolvedValueOnce({
          documents: [{ $id: 'p1', status: 'accepted' }, { $id: 'p2', status: 'rejected' }],
          total: 2,
        })
        // calculateTopSkills - contracts query
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', project_id: 'p1' }, { $id: 'c2', project_id: 'p2' }],
          total: 2,
        });

      // calculateTopSkills - projects query with object skills
      mockDatabases.getDocument
        .mockResolvedValueOnce({ $id: 'p1', required_skills: [{ skill_name: 'React' }, { skill_name: 'TypeScript' }] })
        .mockResolvedValueOnce({ $id: 'p2', required_skills: [{ name: 'Node.js' }, { skill_name: 'React' }] });

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
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', total_amount: 500, created_at: '2024-03-10T00:00:00Z' }],
          total: 1,
        })
        // Reviews query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // Proposals query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // calculateTopSkills - contracts query
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', project_id: 'p1' }],
          total: 1,
        });

      // calculateTopSkills - projects query with string skills
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'p1',
        required_skills: ['JavaScript', 'Python', 'JavaScript'],
      });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topSkills).toBeDefined();
      }
    });

    it('should handle calculateTopSkills error gracefully', async () => {
      // Contracts query
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', total_amount: 1000, created_at: '2024-01-01T00:00:00Z' }],
          total: 1,
        })
        // Reviews query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // Proposals query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // calculateTopSkills - throw error
        .mockRejectedValueOnce(new Error('DB connection failed'));

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topSkills).toEqual([]);
      }
    });

    it('should handle skills with null/undefined skill names', async () => {
      // Contracts query
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', total_amount: 100, created_at: '2024-05-01T00:00:00Z' }],
          total: 1,
        })
        // Reviews query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // Proposals query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // calculateTopSkills - contracts query
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', project_id: 'p1' }],
          total: 1,
        });

      // calculateTopSkills - projects query with mixed skills
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'p1',
        required_skills: [{ skill_name: null }, { other_field: 'test' }, { name: 'Valid' }],
      });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
    });

    it('should handle null required_skills array', async () => {
      // Contracts query
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', total_amount: 100, created_at: '2024-05-01T00:00:00Z' }],
          total: 1,
        })
        // Reviews query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // Proposals query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // calculateTopSkills - contracts query
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', project_id: 'p1' }],
          total: 1,
        });

      // calculateTopSkills - projects query with null skills
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'p1',
        required_skills: null,
      });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
    });

    it('should calculate earnings by month correctly', async () => {
      // Contracts query - multiple contracts in same month
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'c1', total_amount: 1000, created_at: '2024-06-01T00:00:00Z' },
            { $id: 'c2', total_amount: 500, created_at: '2024-06-15T00:00:00Z' },
            { $id: 'c3', total_amount: 2000, created_at: '2024-07-01T00:00:00Z' },
          ],
          total: 3,
        })
        // Reviews query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // Proposals query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // calculateTopSkills - no contracts
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.earningsByMonth).toBeDefined();
        const june = result.data.earningsByMonth.find((e: any) => e.month === '2024-06');
        expect(june?.amount).toBe(1500);
      }
    });

    it('should handle contracts with null total_amount', async () => {
      // Contracts query
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'c1', total_amount: null, created_at: '2024-01-01T00:00:00Z' },
            { $id: 'c2', total_amount: undefined, created_at: '2024-01-15T00:00:00Z' },
          ],
          total: 2,
        })
        // Reviews query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // Proposals query
        .mockResolvedValueOnce({ documents: [], total: 0 })
        // calculateTopSkills - no contracts
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await getFreelancerAnalytics('user-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalEarnings).toBe(0);
      }
    });
  });

  describe('getEmployerAnalytics - calculateTopSkills with employer type', () => {
    it('should use employer_id column for top skills', async () => {
      // Projects query
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', total_amount: 3000, created_at: '2024-04-01T00:00:00Z' }],
          total: 1,
        })
        // Contracts query (completed)
        .mockResolvedValueOnce({
          documents: [{ $id: 'p1', status: 'completed' }, { $id: 'p2', status: 'open' }],
          total: 2,
        })
        // calculateTopSkills - contracts query (employer_id)
        .mockResolvedValueOnce({
          documents: [{ $id: 'c1', project_id: 'p1' }],
          total: 1,
        });

      // calculateTopSkills - projects query
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'p1',
        required_skills: [{ skill_name: 'AWS' }, { name: 'Docker' }],
      });

      const result = await getEmployerAnalytics('employer-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.topHiredSkills).toBeDefined();
      }
    });
  });
});
