// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

describe('Repository catch blocks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('contract-repository.ts - getContractsByFreelancer catch (line 117)', () => {
    it('should throw when pool query fails in getContractsByFreelancer', async () => {
      const { ContractRepository } = await import('../../repositories/contract-repository.js');
      const repo = new ContractRepository();
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('db error'));
      await expect(repo.getContractsByFreelancer('f-1')).rejects.toThrow('Failed to get contracts by freelancer');
    });
  });

  describe('contract-repository.ts - getContractsByEmployer catch (line 144)', () => {
    it('should throw when pool query fails in getContractsByEmployer', async () => {
      const { ContractRepository } = await import('../../repositories/contract-repository.js');
      const repo = new ContractRepository();
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('db error'));
      await expect(repo.getContractsByEmployer('e-1')).rejects.toThrow('Failed to get contracts by employer');
    });
  });

  describe('contract-repository.ts - getUserContracts catch (line 222)', () => {
    it('should throw when pool query fails in getUserContracts', async () => {
      const { ContractRepository } = await import('../../repositories/contract-repository.js');
      const repo = new ContractRepository();
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('db error'));
      await expect(repo.getUserContracts('u-1')).rejects.toThrow('Failed to get user contracts');
    });
  });

  describe('payment-repository.ts - getTotalEarnings catch (line 92)', () => {
    it('should throw when pool query fails in getTotalEarnings', async () => {
      const { PaymentRepository } = await import('../../repositories/payment-repository.js');
      mockPool.query.mockRejectedValueOnce(new Error('db error'));
      await expect(PaymentRepository.getTotalEarnings('u-1')).rejects.toThrow('Failed to get earnings');
    });
  });

  describe('payment-repository.ts - getTotalSpent catch (line 107)', () => {
    it('should throw when pool query fails in getTotalSpent', async () => {
      const { PaymentRepository } = await import('../../repositories/payment-repository.js');
      mockPool.query.mockRejectedValueOnce(new Error('db error'));
      await expect(PaymentRepository.getTotalSpent('u-1')).rejects.toThrow('Failed to get spent');
    });
  });
});
