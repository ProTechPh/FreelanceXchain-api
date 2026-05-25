import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    security: jest.fn(),
    auth: jest.fn(),
    authzFailure: jest.fn(),
    rateLimit: jest.fn(),
    suspicious: jest.fn(),
  },
}));

describe('Admin Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/admin-service.js');
  };

  describe('getPlatformStats', () => {
    it('should return platform statistics successfully', async () => {
      const { getPlatformStats } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_users: '10',
          total_freelancers: '6',
          total_employers: '4',
          total_projects: '20',
          active_projects: '5',
          completed_projects: '10',
          avg_budget: '5000',
          total_contracts: '15',
          total_disputes: '2',
          total_volume: '100000',
        }],
        rowCount: 1,
      });

      const result = await getPlatformStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalUsers).toBe(10);
        expect(result.data.totalFreelancers).toBe(6);
        expect(result.data.totalEmployers).toBe(4);
        expect(result.data.totalProjects).toBe(20);
      }
    });

    it('should handle thrown errors gracefully', async () => {
      const { getPlatformStats } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getPlatformStats();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should handle zero counts correctly', async () => {
      const { getPlatformStats } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_users: '0',
          total_freelancers: '0',
          total_employers: '0',
          total_projects: '0',
          active_projects: '0',
          completed_projects: '0',
          avg_budget: null,
          total_contracts: '0',
          total_disputes: '0',
          total_volume: null,
        }],
        rowCount: 1,
      });

      const result = await getPlatformStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalUsers).toBe(0);
        expect(result.data.averageProjectBudget).toBe(0);
      }
    });
  });

  describe('getUserManagement', () => {
    it('should return users with default filters', async () => {
      const { getUserManagement } = await importModule();

      const mockUsers = [
        { id: 'user-1', email: 'user1@test.com', name: 'User One', role: 'freelancer' },
        { id: 'user-2', email: 'user2@test.com', name: 'User Two', role: 'employer' },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: mockUsers, rowCount: 2 })
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });

      const result = await getUserManagement();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.users).toHaveLength(2);
        expect(result.data.total).toBe(2);
      }
    });

    it('should filter users by role', async () => {
      const { getUserManagement } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', role: 'freelancer' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

      const result = await getUserManagement({ role: 'freelancer' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total).toBe(1);
      }
    });

    it('should search users by email or name', async () => {
      const { getUserManagement } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'john@test.com', name: 'John Doe' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

      const result = await getUserManagement({ search: 'john' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total).toBe(1);
      }
    });

    it('should handle database errors', async () => {
      const { getUserManagement } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await getUserManagement();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('suspendUser', () => {
    it('should suspend a user successfully', async () => {
      const { suspendUser } = await importModule();

      const mockUser = { id: 'user-1', is_suspended: true, suspension_reason: 'Violation' };
      mockPool.query.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

      const result = await suspendUser('user-1', 'Violation');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_suspended).toBe(true);
      }
    });

    it('should handle database errors', async () => {
      const { suspendUser } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('Update failed'));

      const result = await suspendUser('user-1', 'Reason');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('unsuspendUser', () => {
    it('should unsuspend a user successfully', async () => {
      const { unsuspendUser } = await importModule();

      const mockUser = { id: 'user-1', is_suspended: false, suspension_reason: null };
      mockPool.query.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

      const result = await unsuspendUser('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_suspended).toBe(false);
      }
    });
  });

  describe('verifyUser', () => {
    it('should verify a user successfully', async () => {
      const { verifyUser } = await importModule();

      const mockUser = { id: 'user-1', is_verified: true };
      mockPool.query.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

      const result = await verifyUser('user-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).is_verified).toBe(true);
      }
    });
  });

  describe('updateUser', () => {
    it('should update user name', async () => {
      const { updateUser } = await importModule();

      const mockUser = { id: 'user-1', name: 'New Name' };
      mockPool.query.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

      const result = await updateUser('user-1', { name: 'New Name' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('New Name');
      }
    });

    it('should update user role', async () => {
      const { updateUser } = await importModule();

      const mockUser = { id: 'user-1', role: 'admin' };
      mockPool.query.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

      const result = await updateUser('user-1', { role: 'admin' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('admin');
      }
    });

    it('should update user active status', async () => {
      const { updateUser } = await importModule();

      const mockUser = { id: 'user-1', is_suspended: true };
      mockPool.query.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

      const result = await updateUser('user-1', { isActive: true });

      expect(result.success).toBe(true);
    });
  });

  describe('getDisputeManagement', () => {
    it('should return disputes with default filters', async () => {
      const { getDisputeManagement } = await importModule();

      const mockDisputes = [
        { id: 'd-1', status: 'pending' },
        { id: 'd-2', status: 'resolved' },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockDisputes, rowCount: 2 });

      const result = await getDisputeManagement();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.disputes).toHaveLength(2);
        expect(result.data.total).toBe(2);
        expect(result.data.pendingCount).toBe(1);
        expect(result.data.resolvedCount).toBe(1);
      }
    });

    it('should filter disputes by status', async () => {
      const { getDisputeManagement } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'd-1', status: 'pending' }], rowCount: 1 });

      const result = await getDisputeManagement({ status: 'pending' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total).toBe(1);
      }
    });

    it('should handle empty disputes array', async () => {
      const { getDisputeManagement } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getDisputeManagement();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pendingCount).toBe(0);
        expect(result.data.resolvedCount).toBe(0);
      }
    });
  });

  describe('getSystemHealth', () => {
    it('should return healthy system status', async () => {
      const { getSystemHealth } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ result: 1 }], rowCount: 1 });

      const result = await getSystemHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.database).toBe('healthy');
        expect(result.data.storage).toBe('healthy');
        expect(result.data.uptime).toBeGreaterThan(0);
        expect(result.data.timestamp).toBeDefined();
      }
    });

    it('should detect unhealthy database', async () => {
      const { getSystemHealth } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB connection lost'));

      const result = await getSystemHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.database).toBe('unhealthy');
        expect(result.data.storage).toBe('healthy');
      }
    });

    it('should detect unhealthy storage', async () => {
      const { getSystemHealth } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ result: 1 }], rowCount: 1 });

      const result = await getSystemHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.database).toBe('healthy');
        expect(result.data.storage).toBe('healthy');
      }
    });
  });
});