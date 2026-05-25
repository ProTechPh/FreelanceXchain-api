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

describe('Admin Service - Extended Tests', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/admin-service.js');
  };

  describe('getPlatformStats - catch block', () => {
    it('should handle thrown errors in getPlatformStats', async () => {
      const { getPlatformStats } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('Database connection lost'));

      const result = await getPlatformStats();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should handle null transaction data', async () => {
      const { getPlatformStats } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_users: '5',
          total_freelancers: '3',
          total_employers: '2',
          total_projects: '10',
          active_projects: '3',
          completed_projects: '5',
          avg_budget: null,
          total_contracts: '8',
          total_disputes: '1',
          total_volume: null,
        }],
        rowCount: 1,
      });

      const result = await getPlatformStats();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalTransactionVolume).toBe(0);
      }
    });
  });

  describe('getUserManagement - kycStatus filter', () => {
    it('should handle kycStatus filter', async () => {
      const { getUserManagement } = await importModule();

      const mockUsers = [
        { id: 'user-1', email: 'user1@test.com', name: 'User One', role: 'freelancer', kyc_status: 'verified' },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: mockUsers, rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

      const result = await getUserManagement({ kycStatus: 'verified' });

      expect(result.success).toBe(true);
    });

    it('should handle null data from database', async () => {
      const { getUserManagement } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const result = await getUserManagement();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.users).toHaveLength(0);
        expect(result.data.total).toBe(0);
      }
    });
  });

  describe('suspendUser - catch block', () => {
    it('should handle thrown errors in suspendUser', async () => {
      const { suspendUser } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await suspendUser('user-1', 'Violation');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('unsuspendUser - catch block', () => {
    it('should handle thrown errors in unsuspendUser', async () => {
      const { unsuspendUser } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await unsuspendUser('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('verifyUser - catch block', () => {
    it('should handle thrown errors in verifyUser', async () => {
      const { verifyUser } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await verifyUser('user-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('updateUser - catch block', () => {
    it('should handle thrown errors in updateUser', async () => {
      const { updateUser } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await updateUser('user-1', { name: 'New Name' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('getDisputeManagement - catch block', () => {
    it('should handle thrown errors in getDisputeManagement', async () => {
      const { getDisputeManagement } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getDisputeManagement();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should handle priority filter', async () => {
      const { getDisputeManagement } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getDisputeManagement({ priority: 'high' });

      expect(result.success).toBe(true);
    });
  });

  describe('getSystemHealth - catch block', () => {
    it('should detect unhealthy database', async () => {
      const { getSystemHealth } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getSystemHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.database).toBe('unhealthy');
        expect(result.data.storage).toBe('healthy');
      }
    });

    it('should mark storage as healthy when database is healthy', async () => {
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