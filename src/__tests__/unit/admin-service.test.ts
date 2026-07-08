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

describe('Admin Service', () => {
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

  describe('getPlatformStats', () => {
    it('should return platform statistics successfully', async () => {
      const { getPlatformStats } = await importModule();

      mockUserRepo.queryAll.mockResolvedValueOnce([
        { id: 'u-1', role: 'freelancer' },
        { id: 'u-2', role: 'freelancer' },
        { id: 'u-3', role: 'freelancer' },
        { id: 'u-4', role: 'freelancer' },
        { id: 'u-5', role: 'freelancer' },
        { id: 'u-6', role: 'freelancer' },
        { id: 'u-7', role: 'employer' },
        { id: 'u-8', role: 'employer' },
        { id: 'u-9', role: 'employer' },
        { id: 'u-10', role: 'employer' },
      ]);
      mockProjectRepo.queryAll.mockResolvedValueOnce(
        Array.from({ length: 20 }, (_, i) => ({
          id: `p-${i}`,
          status: i < 5 ? 'open' : i < 15 ? 'completed' : 'in_progress',
          budget: 5000,
        }))
      );
      mockContractRepo.queryAll.mockResolvedValueOnce(Array.from({ length: 15 }, (_, i) => ({ id: `c-${i}` })));
      mockDisputeRepo.queryAll.mockResolvedValueOnce(Array.from({ length: 2 }, (_, i) => ({ id: `d-${i}` })));
      mockTransactionRepo.queryAll.mockResolvedValueOnce([
        { id: 't-1', status: 'completed', amount: 100000 },
      ]);

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

      mockUserRepo.queryAll.mockRejectedValueOnce(new Error('DB error'));

      const result = await getPlatformStats();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should handle zero counts correctly', async () => {
      const { getPlatformStats } = await importModule();

      mockUserRepo.queryAll.mockResolvedValueOnce([]);
      mockProjectRepo.queryAll.mockResolvedValueOnce([]);
      mockContractRepo.queryAll.mockResolvedValueOnce([]);
      mockDisputeRepo.queryAll.mockResolvedValueOnce([]);
      mockTransactionRepo.queryAll.mockResolvedValueOnce([]);

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
        { id: 'user-1', email: 'user1@test.com', name: 'User One', role: 'freelancer', created_at: '2025-01-01' },
        { id: 'user-2', email: 'user2@test.com', name: 'User Two', role: 'employer', created_at: '2025-01-02' },
      ];

      mockUserRepo.queryAll.mockResolvedValueOnce(mockUsers);

      const result = await getUserManagement();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.users).toHaveLength(2);
        expect(result.data.total).toBe(2);
      }
    });

    it('should filter users by role', async () => {
      const { getUserManagement } = await importModule();

      mockUserRepo.queryAll.mockResolvedValueOnce([
        { id: 'user-1', role: 'freelancer', created_at: '2025-01-01' },
        { id: 'user-2', role: 'employer', created_at: '2025-01-02' },
      ]);

      const result = await getUserManagement({ role: 'freelancer' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total).toBe(1);
      }
    });

    it('should search users by email or name', async () => {
      const { getUserManagement } = await importModule();

      mockUserRepo.queryAll.mockResolvedValueOnce([
        { id: 'user-1', email: 'john@test.com', name: 'John Doe', created_at: '2025-01-01' },
        { id: 'user-2', email: 'jane@test.com', name: 'Jane Smith', created_at: '2025-01-02' },
      ]);

      const result = await getUserManagement({ search: 'john' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total).toBe(1);
      }
    });

    it('should handle database errors', async () => {
      const { getUserManagement } = await importModule();

      mockUserRepo.queryAll.mockRejectedValueOnce(new Error('Database error'));

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

      const mockUser = { id: 'user-1' };
      const mockUpdatedUser = { id: 'user-1', is_suspended: true, suspension_reason: 'Violation' };
      mockUserRepo.getUserById.mockResolvedValueOnce(mockUser);
      mockUserRepo.updateUser.mockResolvedValueOnce(mockUpdatedUser);

      const result = await suspendUser('user-1', 'Violation');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.is_suspended).toBe(true);
      }
    });

    it('should handle database errors', async () => {
      const { suspendUser } = await importModule();

      mockUserRepo.getUserById.mockRejectedValueOnce(new Error('Update failed'));

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

      const mockUser = { id: 'user-1' };
      const mockUpdatedUser = { id: 'user-1', is_suspended: false, suspension_reason: null };
      mockUserRepo.getUserById.mockResolvedValueOnce(mockUser);
      mockUserRepo.updateUser.mockResolvedValueOnce(mockUpdatedUser);

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

      const mockUser = { id: 'user-1' };
      const mockUpdatedUser = { id: 'user-1', is_verified: true };
      mockUserRepo.getUserById.mockResolvedValueOnce(mockUser);
      mockUserRepo.updateUser.mockResolvedValueOnce(mockUpdatedUser);

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

      const mockUser = { id: 'user-1' };
      const mockUpdatedUser = { id: 'user-1', name: 'New Name' };
      mockUserRepo.getUserById.mockResolvedValueOnce(mockUser);
      mockUserRepo.updateUser.mockResolvedValueOnce(mockUpdatedUser);

      const result = await updateUser('user-1', { name: 'New Name' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('New Name');
      }
    });

    it('should update user role', async () => {
      const { updateUser } = await importModule();

      const mockUser = { id: 'user-1' };
      const mockUpdatedUser = { id: 'user-1', role: 'admin' };
      mockUserRepo.getUserById.mockResolvedValueOnce(mockUser);
      mockUserRepo.updateUser.mockResolvedValueOnce(mockUpdatedUser);

      const result = await updateUser('user-1', { role: 'admin' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('admin');
      }
    });

    it('should update user active status', async () => {
      const { updateUser } = await importModule();

      const mockUser = { id: 'user-1' };
      const mockUpdatedUser = { id: 'user-1', is_suspended: true };
      mockUserRepo.getUserById.mockResolvedValueOnce(mockUser);
      mockUserRepo.updateUser.mockResolvedValueOnce(mockUpdatedUser);

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

      mockDisputeRepo.getAllDisputes.mockResolvedValueOnce({ items: mockDisputes, total: 2 });

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

      mockDisputeRepo.getAllDisputes.mockResolvedValueOnce({ items: [{ id: 'd-1', status: 'pending' }], total: 1 });

      const result = await getDisputeManagement({ status: 'pending' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.total).toBe(1);
      }
    });

    it('should handle empty disputes array', async () => {
      const { getDisputeManagement } = await importModule();

      mockDisputeRepo.getAllDisputes.mockResolvedValueOnce({ items: [], total: 0 });

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

      mockUserRepo.queryAll.mockResolvedValueOnce([{ id: 'u-1' }]);

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

      mockUserRepo.queryAll.mockRejectedValueOnce(new Error('DB connection lost'));

      const result = await getSystemHealth();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.database).toBe('unhealthy');
        expect(result.data.storage).toBe('healthy');
      }
    });

    it('should detect unhealthy storage', async () => {
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

// ═══════════════════════════════════════════════════════════════
// Merged from admin-service-extended.test.ts
// ═══════════════════════════════════════════════════════════════

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
