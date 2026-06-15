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

const mockUserRepo = {
  queryAll: jest.fn<any>(),
  getUserById: jest.fn<any>(),
  updateUser: jest.fn<any>(),
};

const mockProjectRepo = {
  queryAll: jest.fn<any>(),
};

const mockContractRepo = {
  queryAll: jest.fn<any>(),
};

const mockDisputeRepo = {
  queryAll: jest.fn<any>(),
  getAllDisputes: jest.fn<any>(),
};

const mockTransactionRepo = {
  queryAll: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/transaction-repository.ts'), () => ({
  transactionRepository: mockTransactionRepo,
}));

describe('Admin Service - Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepo.queryAll.mockReset();
    mockUserRepo.getUserById.mockReset();
    mockUserRepo.updateUser.mockReset();
    mockProjectRepo.queryAll.mockReset();
    mockContractRepo.queryAll.mockReset();
    mockDisputeRepo.queryAll.mockReset();
    mockDisputeRepo.getAllDisputes.mockReset();
    mockTransactionRepo.queryAll.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/admin-service.js');
  };

  describe('getPlatformStats - catch block', () => {
    it('should handle thrown errors in getPlatformStats', async () => {
      const { getPlatformStats } = await importModule();

      mockUserRepo.queryAll.mockRejectedValueOnce(new Error('Database connection lost'));

      const result = await getPlatformStats();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should handle null transaction data', async () => {
      const { getPlatformStats } = await importModule();

      mockUserRepo.queryAll.mockResolvedValueOnce([
        { id: 'u-1', role: 'freelancer' },
        { id: 'u-2', role: 'freelancer' },
        { id: 'u-3', role: 'freelancer' },
        { id: 'u-4', role: 'employer' },
        { id: 'u-5', role: 'employer' },
      ]);
      mockProjectRepo.queryAll.mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, i) => ({
          id: `p-${i}`,
          status: i < 3 ? 'open' : i < 8 ? 'completed' : 'in_progress',
          budget: null,
        }))
      );
      mockContractRepo.queryAll.mockResolvedValueOnce(Array.from({ length: 8 }, (_, i) => ({ id: `c-${i}` })));
      mockDisputeRepo.queryAll.mockResolvedValueOnce(Array.from({ length: 1 }, (_, i) => ({ id: `d-${i}` })));
      mockTransactionRepo.queryAll.mockResolvedValueOnce([
        { id: 't-1', status: 'completed', amount: null },
      ]);

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
        { id: 'user-1', email: 'user1@test.com', name: 'User One', role: 'freelancer', kyc_status: 'verified', created_at: '2025-01-01' },
        { id: 'user-2', email: 'user2@test.com', name: 'User Two', role: 'freelancer', kyc_status: 'pending', created_at: '2025-01-02' },
      ];

      mockUserRepo.queryAll.mockResolvedValueOnce(mockUsers);

      const result = await getUserManagement({ kycStatus: 'verified' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.users).toHaveLength(1);
      }
    });

    it('should handle null data from database', async () => {
      const { getUserManagement } = await importModule();

      mockUserRepo.queryAll.mockResolvedValueOnce([]);

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

      mockUserRepo.getUserById.mockRejectedValueOnce(new Error('DB error'));

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

      mockUserRepo.getUserById.mockRejectedValueOnce(new Error('DB error'));

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

      mockUserRepo.getUserById.mockRejectedValueOnce(new Error('DB error'));

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

      mockUserRepo.getUserById.mockRejectedValueOnce(new Error('DB error'));

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

      mockDisputeRepo.getAllDisputes.mockRejectedValueOnce(new Error('DB error'));

      const result = await getDisputeManagement();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should handle priority filter', async () => {
      const { getDisputeManagement } = await importModule();

      mockDisputeRepo.getAllDisputes.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await getDisputeManagement({ priority: 'high' });

      expect(result.success).toBe(true);
    });
  });

  describe('getSystemHealth - catch block', () => {
    it('should detect unhealthy database', async () => {
      const { getSystemHealth } = await importModule();

      mockUserRepo.queryAll.mockRejectedValueOnce(new Error('DB error'));

      const result = await getSystemHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.database).toBe('unhealthy');
        expect(result.data.storage).toBe('healthy');
      }
    });

    it('should mark storage as healthy when database is healthy', async () => {
      const { getSystemHealth } = await importModule();

      mockUserRepo.queryAll.mockResolvedValueOnce([{ id: 'u-1' }]);

      const result = await getSystemHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.database).toBe('healthy');
        expect(result.data.storage).toBe('healthy');
      }
    });
  });
});
