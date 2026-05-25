import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockDeployEscrow = jest.fn() as jest.Mock<any>;
const mockDepositToEscrow = jest.fn() as jest.Mock<any>;
const mockReleaseMilestone = jest.fn() as jest.Mock<any>;
const mockRefundMilestone = jest.fn() as jest.Mock<any>;
const mockGetEscrowBalance = jest.fn() as jest.Mock<any>;
const mockGetEscrowState = jest.fn() as jest.Mock<any>;

jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  deployEscrow: mockDeployEscrow,
  depositToEscrow: mockDepositToEscrow,
  releaseMilestone: mockReleaseMilestone,
  refundMilestone: mockRefundMilestone,
  getEscrowBalance: mockGetEscrowBalance,
  getEscrowState: mockGetEscrowState,
}));

const { SimulatedBlockchainAdapter } = await import('../../services/blockchain/simulated-adapter.js');

const ESCROW_ADDR = '0xSimulatedEscrow';

function makeEscrowState(overrides: Record<string, any> = {}) {
  return {
    contractId: 'contract-1',
    employerAddress: '0xEmployer',
    freelancerAddress: '0xFreelancer',
    totalAmount: BigInt(1000),
    balance: BigInt(1000),
    milestones: [
      { id: 'ms-0', amount: BigInt(500), status: 'pending' },
      { id: 'ms-1', amount: BigInt(500), status: 'released' },
    ],
    ...overrides,
  };
}

function makeTxReceipt(hash = 'tx-hash-123') {
  return { transactionHash: hash, blockNumber: 1, status: 'success', gasUsed: BigInt(50000) };
}

describe('SimulatedBlockchainAdapter', () => {
  let adapter: InstanceType<typeof SimulatedBlockchainAdapter>;

  beforeEach(() => {
    adapter = new SimulatedBlockchainAdapter();
    jest.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('should always return true', () => {
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('deployEscrowContract', () => {
    it('should deploy and deposit, then return result', async () => {
      const deployResult = {
        escrowAddress: ESCROW_ADDR,
        transactionHash: 'deploy-tx',
        blockNumber: 100,
        deployedAt: Date.now(),
      };
      mockDeployEscrow.mockResolvedValue(deployResult);
      mockDepositToEscrow.mockResolvedValue(undefined);

      const params = {
        contractId: 'c-1',
        employerAddress: '0xEmployer',
        freelancerAddress: '0xFreelancer',
        arbiterAddress: '0xArbiter',
        milestoneAmounts: [BigInt(500), BigInt(500)],
        milestoneDescriptions: ['Phase 1', 'Phase 2'],
        totalAmount: BigInt(1000),
      };

      const result = await adapter.deployEscrowContract(params);

      expect(mockDeployEscrow).toHaveBeenCalledTimes(1);
      expect(mockDepositToEscrow).toHaveBeenCalledWith(ESCROW_ADDR, BigInt(1000), '0xEmployer');
      expect(result.escrowAddress).toBe(ESCROW_ADDR);
      expect(result.transactionHash).toBe('deploy-tx');
      expect(result.receipt.status).toBe('success');
    });
  });

  describe('getEscrowInfo', () => {
    it('should return escrow info from state', async () => {
      mockGetEscrowState.mockResolvedValue(makeEscrowState());

      const info = await adapter.getEscrowInfo(ESCROW_ADDR);
      expect(info.employer).toBe('0xEmployer');
      expect(info.freelancer).toBe('0xFreelancer');
      expect(info.isActive).toBe(true);
      expect(info.releasedAmount).toBe(BigInt(500));
    });

    it('should throw when escrow not found', async () => {
      mockGetEscrowState.mockResolvedValue(null);
      await expect(adapter.getEscrowInfo(ESCROW_ADDR)).rejects.toThrow('Escrow not found');
    });
  });

  describe('submitMilestone', () => {
    it('should return simulated transaction hash', async () => {
      const result = await adapter.submitMilestone(ESCROW_ADDR, 0);
      expect(typeof result.transactionHash).toBe('string');
      expect(result.transactionHash).toContain('sim-submit');
      expect(result.receipt.status).toBe('success');
    });
  });

  describe('approveMilestone', () => {
    it('should release the milestone and return receipt', async () => {
      mockGetEscrowState.mockResolvedValue(makeEscrowState());
      mockReleaseMilestone.mockResolvedValue(makeTxReceipt('approve-tx'));

      const result = await adapter.approveMilestone(ESCROW_ADDR, 0);
      expect(result.transactionHash).toBe('approve-tx');
    });

    it('should throw when escrow not found', async () => {
      mockGetEscrowState.mockResolvedValue(null);
      await expect(adapter.approveMilestone(ESCROW_ADDR, 0)).rejects.toThrow('Escrow not found');
    });

    it('should throw when milestone index is out of bounds', async () => {
      mockGetEscrowState.mockResolvedValue(makeEscrowState());
      await expect(adapter.approveMilestone(ESCROW_ADDR, 99)).rejects.toThrow('Milestone index out of bounds');
    });
  });

  describe('disputeMilestone', () => {
    it('should return simulated dispute transaction', async () => {
      const result = await adapter.disputeMilestone(ESCROW_ADDR, 0);
      expect(result.transactionHash).toContain('sim-dispute');
      expect(result.receipt.status).toBe('success');
    });
  });

  describe('resolveDispute', () => {
    it('should release milestone in favor of freelancer', async () => {
      mockGetEscrowState.mockResolvedValue(makeEscrowState());
      mockReleaseMilestone.mockResolvedValue(makeTxReceipt('resolve-release-tx'));

      const result = await adapter.resolveDispute(ESCROW_ADDR, 0, true);
      expect(result.transactionHash).toBe('resolve-release-tx');
      expect(mockReleaseMilestone).toHaveBeenCalled();
    });

    it('should refund milestone in favor of employer', async () => {
      mockGetEscrowState.mockResolvedValue(makeEscrowState());
      mockRefundMilestone.mockResolvedValue(makeTxReceipt('resolve-refund-tx'));

      const result = await adapter.resolveDispute(ESCROW_ADDR, 0, false);
      expect(result.transactionHash).toBe('resolve-refund-tx');
      expect(mockRefundMilestone).toHaveBeenCalled();
    });

    it('should throw when escrow not found', async () => {
      mockGetEscrowState.mockResolvedValue(null);
      await expect(adapter.resolveDispute(ESCROW_ADDR, 0, true)).rejects.toThrow('Escrow not found');
    });

    it('should throw when milestone index out of bounds', async () => {
      mockGetEscrowState.mockResolvedValue(makeEscrowState());
      await expect(adapter.resolveDispute(ESCROW_ADDR, 99, true)).rejects.toThrow('Milestone index out of bounds');
    });
  });

  describe('refundEscrow', () => {
    it('should refund all pending milestones', async () => {
      mockGetEscrowState.mockResolvedValue(makeEscrowState());
      mockRefundMilestone.mockResolvedValue(makeTxReceipt('refund-tx'));

      const result = await adapter.refundEscrow(ESCROW_ADDR);
      expect(mockRefundMilestone).toHaveBeenCalledTimes(1);
      expect(result.transactionHash).toBe('refund-tx');
    });

    it('should return simulated hash when no pending milestones', async () => {
      mockGetEscrowState.mockResolvedValue(
        makeEscrowState({ milestones: [{ id: 'ms-0', amount: BigInt(500), status: 'released' }] })
      );

      const result = await adapter.refundEscrow(ESCROW_ADDR);
      expect(result.transactionHash).toContain('sim-refund');
    });

    it('should throw when escrow not found', async () => {
      mockGetEscrowState.mockResolvedValue(null);
      await expect(adapter.refundEscrow(ESCROW_ADDR)).rejects.toThrow('Escrow not found');
    });
  });

  describe('getMilestone', () => {
    it('should return milestone info by index', async () => {
      mockGetEscrowState.mockResolvedValue(makeEscrowState());

      const ms = await adapter.getMilestone(ESCROW_ADDR, 0);
      expect(ms.amount).toBe(BigInt(500));
      expect(ms.status).toBe('pending');
      expect(ms.description).toBe('Milestone 1');
    });

    it('should throw when escrow not found', async () => {
      mockGetEscrowState.mockResolvedValue(null);
      await expect(adapter.getMilestone(ESCROW_ADDR, 0)).rejects.toThrow('Escrow not found');
    });

    it('should throw when milestone index out of bounds', async () => {
      mockGetEscrowState.mockResolvedValue(makeEscrowState());
      await expect(adapter.getMilestone(ESCROW_ADDR, 99)).rejects.toThrow('Milestone index out of bounds');
    });
  });

  describe('getEscrowBalance', () => {
    it('should return the escrow balance', async () => {
      mockGetEscrowBalance.mockResolvedValue(BigInt(750));
      const balance = await adapter.getEscrowBalance(ESCROW_ADDR);
      expect(balance).toBe(BigInt(750));
    });
  });
});
