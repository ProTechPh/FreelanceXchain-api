import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockRealDeploy = jest.fn() as jest.Mock<any>;
const mockRealGetEscrowInfo = jest.fn() as jest.Mock<any>;
const mockRealSubmitMilestone = jest.fn() as jest.Mock<any>;
const mockRealApproveMilestone = jest.fn() as jest.Mock<any>;
const mockRealDisputeMilestone = jest.fn() as jest.Mock<any>;
const mockRealResolveDispute = jest.fn() as jest.Mock<any>;
const mockRealCancelContract = jest.fn() as jest.Mock<any>;
const mockRealGetMilestone = jest.fn() as jest.Mock<any>;
const mockRealGetEscrowBalance = jest.fn() as jest.Mock<any>;
const mockIsWeb3Available = jest.fn(() => true);

jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  deployEscrowContract: mockRealDeploy,
  getEscrowInfo: mockRealGetEscrowInfo,
  submitMilestone: mockRealSubmitMilestone,
  approveMilestone: mockRealApproveMilestone,
  disputeMilestone: mockRealDisputeMilestone,
  resolveDispute: mockRealResolveDispute,
  cancelContract: mockRealCancelContract,
  getMilestone: mockRealGetMilestone,
  getEscrowBalance: mockRealGetEscrowBalance,
  getAllMilestones: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  isWeb3Available: mockIsWeb3Available,
  isValidAddress: jest.fn(),
  formatEther: jest.fn(),
  parseEther: jest.fn(),
}));

const { RealBlockchainAdapter } = await import('../../services/blockchain/real-adapter.js');

const ESCROW_ADDR = '0xRealEscrow';

function makeTxReceipt(hash = 'real-tx') {
  return { transactionHash: hash, receipt: { status: 'success', blockNumber: 1 } };
}

describe('RealBlockchainAdapter', () => {
  let adapter: InstanceType<typeof RealBlockchainAdapter>;

  beforeEach(() => {
    adapter = new RealBlockchainAdapter();
    jest.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('should delegate to isWeb3Available', () => {
      mockIsWeb3Available.mockReturnValue(true);
      expect(adapter.isAvailable()).toBe(true);

      mockIsWeb3Available.mockReturnValue(false);
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('deployEscrowContract', () => {
    it('should delegate to realDeployEscrow and return result', async () => {
      mockRealDeploy.mockResolvedValue({
        escrowAddress: ESCROW_ADDR,
        transactionHash: 'deploy-tx',
        receipt: { status: 'success' },
      });

      const params = {
        contractId: 'c-1',
        employerAddress: '0xEmployer',
        freelancerAddress: '0xFreelancer',
        arbiterAddress: '0xArbiter',
        milestoneAmounts: [BigInt(1000)],
        milestoneDescriptions: ['Phase 1'],
        totalAmount: BigInt(1000),
      };
      const result = await adapter.deployEscrowContract(params);
      expect(result.escrowAddress).toBe(ESCROW_ADDR);
      expect(result.transactionHash).toBe('deploy-tx');
      expect(mockRealDeploy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getEscrowInfo', () => {
    it('should delegate to realGetEscrowInfo', async () => {
      const info = {
        employer: '0xA', freelancer: '0xB', arbiter: '0xC',
        totalAmount: BigInt(1000), releasedAmount: BigInt(0),
        isActive: true, contractId: 'c-1', balance: BigInt(1000),
      };
      mockRealGetEscrowInfo.mockResolvedValue(info);
      const result = await adapter.getEscrowInfo(ESCROW_ADDR);
      expect(result.employer).toBe('0xA');
    });
  });

  describe('submitMilestone', () => {
    it('should delegate to realSubmitMilestone', async () => {
      mockRealSubmitMilestone.mockResolvedValue(makeTxReceipt('submit-tx'));
      const result = await adapter.submitMilestone(ESCROW_ADDR, 0);
      expect(result.transactionHash).toBe('submit-tx');
    });
  });

  describe('approveMilestone', () => {
    it('should delegate to realApproveMilestone', async () => {
      mockRealApproveMilestone.mockResolvedValue(makeTxReceipt('approve-tx'));
      const result = await adapter.approveMilestone(ESCROW_ADDR, 1);
      expect(result.transactionHash).toBe('approve-tx');
    });
  });

  describe('disputeMilestone', () => {
    it('should delegate to realDisputeMilestone', async () => {
      mockRealDisputeMilestone.mockResolvedValue(makeTxReceipt('dispute-tx'));
      const result = await adapter.disputeMilestone(ESCROW_ADDR, 0);
      expect(result.transactionHash).toBe('dispute-tx');
    });
  });

  describe('resolveDispute', () => {
    it('should delegate to realResolveDispute', async () => {
      mockRealResolveDispute.mockResolvedValue(makeTxReceipt('resolve-tx'));
      const result = await adapter.resolveDispute(ESCROW_ADDR, 0, true);
      expect(result.transactionHash).toBe('resolve-tx');
      expect(mockRealResolveDispute).toHaveBeenCalledWith(ESCROW_ADDR, 0, true);
    });
  });

  describe('refundEscrow', () => {
    it('should delegate to realCancelContract', async () => {
      mockRealCancelContract.mockResolvedValue(makeTxReceipt('refund-tx'));
      const result = await adapter.refundEscrow(ESCROW_ADDR);
      expect(result.transactionHash).toBe('refund-tx');
    });
  });

  describe('getMilestone', () => {
    it('should delegate to realGetMilestone', async () => {
      const milestoneData = { amount: BigInt(500), status: 'pending' as const, description: 'Phase 1' };
      mockRealGetMilestone.mockResolvedValue(milestoneData);
      const result = await adapter.getMilestone(ESCROW_ADDR, 0);
      expect(result.amount).toBe(BigInt(500));
      expect(result.description).toBe('Phase 1');
    });
  });

  describe('getEscrowBalance', () => {
    it('should delegate to realGetEscrowBalance', async () => {
      mockRealGetEscrowBalance.mockResolvedValue(BigInt(800));
      const balance = await adapter.getEscrowBalance(ESCROW_ADDR);
      expect(balance).toBe(BigInt(800));
    });
  });
});
