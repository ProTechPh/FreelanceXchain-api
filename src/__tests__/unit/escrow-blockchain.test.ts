import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const mockGetContract = jest.fn();
const mockGetContractWithSigner = jest.fn();
const mockGetContractWithArbiterSigner = jest.fn();
const mockIsWeb3Available = jest.fn();
const mockGetWallet = jest.fn();
const mockGetArbiterWallet = jest.fn();

jest.unstable_mockModule(path.resolve(process.cwd(), 'src/services/web3-client.ts'), () => ({
  getContract: mockGetContract,
  getContractWithSigner: mockGetContractWithSigner,
  getContractWithArbiterSigner: mockGetContractWithArbiterSigner,
  isWeb3Available: mockIsWeb3Available,
  getWallet: mockGetWallet,
  getArbiterWallet: mockGetArbiterWallet,
  getProvider: jest.fn(),
  getSigner: jest.fn(),
}));

jest.unstable_mockModule('ethers', () => ({
  ContractFactory: jest.fn(),
  Contract: jest.fn(),
  TransactionReceipt: jest.fn(),
}));

jest.unstable_mockModule(path.resolve(process.cwd(), 'src/services/contract-abis.ts'), () => ({
  FreelanceEscrowABI: [],
  FreelanceEscrowBytecode: '0x',
  FreelanceReputationABI: [],
}));

describe('Escrow Blockchain Integration - Refactored', () => {
  let mockContract: any;
  let mockWallet: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWeb3Available.mockReturnValue(true);

    mockWallet = {
      address: '0xEmployer',
    };
    mockGetWallet.mockReturnValue(mockWallet);
    mockGetArbiterWallet.mockReturnValue({ address: '0xArbiter' });

    mockContract = {
      employer: jest.fn(),
      freelancer: jest.fn(),
      arbiter: (jest.fn() as any).mockResolvedValue('0xArbiter'),
      totalAmount: jest.fn(),
      releasedAmount: jest.fn(),
      isActive: jest.fn(),
      contractId: jest.fn(),
      getBalance: jest.fn(),
      submitMilestone: jest.fn(),
      approveMilestone: jest.fn(),
      disputeMilestone: jest.fn(),
      resolveDispute: jest.fn(),
      refundMilestone: jest.fn(),
      cancelContract: jest.fn(),
      getMilestone: jest.fn(),
      getMilestoneCount: jest.fn(),
      getRemainingAmount: jest.fn(),
      pendingWithdrawals: jest.fn(),
      withdraw: jest.fn(),
      getAddress: jest.fn<any>().mockResolvedValue('0xEscrowContract'),
      deploymentTransaction: jest.fn(),
      waitForDeployment: jest.fn<any>().mockResolvedValue(undefined),
    };

    mockGetContract.mockReturnValue(mockContract);
    mockGetContractWithSigner.mockReturnValue(mockContract);
    mockGetContractWithArbiterSigner.mockReturnValue(mockContract);
  });

  describe('deployEscrowContract', () => {
    it('should throw error when Web3 is not available', async () => {
      mockIsWeb3Available.mockReturnValue(false);

      const { deployEscrowContract } = await import('../../services/escrow-blockchain.js');

      await expect(
        deployEscrowContract({
          contractId: 'contract-123',
          freelancerAddress: '0xFreelancer',
          arbiterAddress: '0xArbiter',
          milestoneAmounts: [BigInt('1000000000000000000')],
          milestoneDescriptions: ['Milestone 1'],
          totalAmount: BigInt('1000000000000000000'),
        })
      ).rejects.toThrow('Web3 is not configured');
    });
  });

  describe('getEscrowInfo', () => {
    it('should retrieve escrow information', async () => {
      mockContract.employer.mockResolvedValue('0xEmployer');
      mockContract.freelancer.mockResolvedValue('0xFreelancer');
      mockContract.arbiter.mockResolvedValue('0xArbiter');
      mockContract.totalAmount.mockResolvedValue(BigInt('3000000000000000000'));
      mockContract.releasedAmount.mockResolvedValue(BigInt('1000000000000000000'));
      mockContract.isActive.mockResolvedValue(true);
      mockContract.contractId.mockResolvedValue('contract-123');
      mockContract.getBalance.mockResolvedValue(BigInt('2000000000000000000'));

      const { getEscrowInfo } = await import('../../services/escrow-blockchain.js');
      const info = await getEscrowInfo('0xEscrowContract');

      expect(info).toEqual({
        employer: '0xEmployer',
        freelancer: '0xFreelancer',
        arbiter: '0xArbiter',
        totalAmount: BigInt('3000000000000000000'),
        releasedAmount: BigInt('1000000000000000000'),
        isActive: true,
        contractId: 'contract-123',
        balance: BigInt('2000000000000000000'),
      });
    });
  });

  describe('getMilestoneStatus', () => {
    it('should map the on-chain enum to a plain status name', async () => {
      mockContract.getMilestone.mockResolvedValue([
        BigInt('1000000000000000000'),
        BigInt(1),
        'Milestone 1',
      ]);

      const { getMilestoneStatus } = await import('../../services/escrow-blockchain.js');
      const status = await getMilestoneStatus('0xEscrowContract', 0);

      expect(status).toBe('submitted');
      expect(mockContract.getMilestone).toHaveBeenCalledWith(0);
      expect(mockGetContract).toHaveBeenCalledWith('0xEscrowContract', []);
    });

    it('should throw when web3 is not available', async () => {
      mockIsWeb3Available.mockReturnValue(false);

      const { getMilestoneStatus } = await import('../../services/escrow-blockchain.js');
      await expect(getMilestoneStatus('0xEscrowContract', 0)).rejects.toThrow('Web3 is not configured');
      expect(mockContract.getMilestone).not.toHaveBeenCalled();
    });
  });

  describe('submitMilestone', () => {
    it('should submit milestone successfully', async () => {
      const mockReceipt = {
        hash: '0xSubmitHash',
        blockNumber: 101,
      };

      mockContract.submitMilestone.mockResolvedValue({
        wait: jest.fn<any>().mockResolvedValue(mockReceipt),
      });

      const { submitMilestone } = await import('../../services/escrow-blockchain.js');
      const result = await submitMilestone('0xEscrowContract', 0);

      expect(result).toEqual({
        transactionHash: '0xSubmitHash',
        receipt: mockReceipt,
      });

      expect(mockContract.submitMilestone).toHaveBeenCalledWith(0);
    });
  });

  describe('approveMilestone', () => {
    it('should approve milestone successfully', async () => {
      const mockReceipt = {
        hash: '0xApproveHash',
        blockNumber: 102,
      };

      mockContract.approveMilestone.mockResolvedValue({
        wait: jest.fn<any>().mockResolvedValue(mockReceipt),
      });

      const { approveMilestone } = await import('../../services/escrow-blockchain.js');
      const result = await approveMilestone('0xEscrowContract', 0);

      expect(result).toEqual({
        transactionHash: '0xApproveHash',
        receipt: mockReceipt,
      });
    });
  });

  describe('getMilestone', () => {
    it('should retrieve milestone details', async () => {
      mockContract.getMilestone.mockResolvedValue([
        BigInt('1000000000000000000'),
        BigInt(1),
        'Complete design phase',
      ]);

      const { getMilestone } = await import('../../services/escrow-blockchain.js');
      const milestone = await getMilestone('0xEscrowContract', 0);

      expect(milestone).toEqual({
        amount: BigInt('1000000000000000000'),
        status: 'Submitted',
        description: 'Complete design phase',
      });
    });

    it('should handle all milestone statuses', async () => {
      const { getMilestone } = await import('../../services/escrow-blockchain.js');

      const statuses = ['Pending', 'Submitted', 'Approved', 'Disputed', 'Refunded'];

      for (let i = 0; i < statuses.length; i++) {
        mockContract.getMilestone.mockResolvedValue([
          BigInt('1000000000000000000'),
          BigInt(i),
          'Test milestone',
        ]);

        const milestone = await getMilestone('0xEscrowContract', i);
        expect(milestone.status).toBe(statuses[i]);
      }
    });
  });

  describe('getAllMilestones', () => {
    it('should retrieve all milestones', async () => {
      mockContract.getMilestoneCount.mockResolvedValue(BigInt(2));
      mockContract.getMilestone
        .mockResolvedValueOnce([BigInt('1000000000000000000'), BigInt(0), 'Milestone 1'])
        .mockResolvedValueOnce([BigInt('2000000000000000000'), BigInt(1), 'Milestone 2']);

      const { getAllMilestones } = await import('../../services/escrow-blockchain.js');
      const milestones = await getAllMilestones('0xEscrowContract');

      expect(milestones).toHaveLength(2);
      expect(milestones[0]!.description).toBe('Milestone 1');
      expect(milestones[1]!.description).toBe('Milestone 2');
    });

    it('should return empty array for contract with no milestones', async () => {
      mockContract.getMilestoneCount.mockResolvedValue(BigInt(0));

      const { getAllMilestones } = await import('../../services/escrow-blockchain.js');
      const milestones = await getAllMilestones('0xEscrowContract');

      expect(milestones).toEqual([]);
    });
  });

  describe('disputeMilestone', () => {
    it('should dispute milestone', async () => {
      const mockReceipt = {
        hash: '0xDisputeHash',
        blockNumber: 103,
      };

      mockContract.disputeMilestone.mockResolvedValue({
        wait: jest.fn<any>().mockResolvedValue(mockReceipt),
      });

      const { disputeMilestone } = await import('../../services/escrow-blockchain.js');
      const result = await disputeMilestone('0xEscrowContract', 0);

      expect(result).toEqual({
        transactionHash: '0xDisputeHash',
        receipt: mockReceipt,
      });
    });
  });

  describe('resolveDispute', () => {
    it('should resolve dispute in favor of freelancer (10000 bps) signed by the arbiter', async () => {
      const mockReceipt = {
        hash: '0xResolveHash',
        blockNumber: 104,
      };

      mockContract.resolveDispute.mockResolvedValue({
        wait: jest.fn<any>().mockResolvedValue(mockReceipt),
      });

      const { resolveDispute } = await import('../../services/escrow-blockchain.js');
      const result = await resolveDispute('0xEscrowContract', 0, 10000);

      expect(result).toEqual({
        transactionHash: '0xResolveHash',
        receipt: mockReceipt,
      });

      expect(mockContract.resolveDispute).toHaveBeenCalledWith(0, 10000);
      expect(mockGetContractWithArbiterSigner).toHaveBeenCalledWith('0xEscrowContract', []);
    });

    it('should resolve dispute in favor of employer (0 bps)', async () => {
      const mockReceipt = {
        hash: '0xResolveHashEmployer',
        blockNumber: 105,
      };

      mockContract.resolveDispute.mockResolvedValue({
        wait: jest.fn<any>().mockResolvedValue(mockReceipt),
      });

      const { resolveDispute } = await import('../../services/escrow-blockchain.js');
      const result = await resolveDispute('0xEscrowContract', 1, 0);

      expect(mockContract.resolveDispute).toHaveBeenCalledWith(1, 0);
      expect(result.transactionHash).toBe('0xResolveHashEmployer');
    });

    it('should reject bps outside the 0-10000 range', async () => {
      const { resolveDispute } = await import('../../services/escrow-blockchain.js');

      await expect(resolveDispute('0xEscrowContract', 0, 10001)).rejects.toThrow('freelancerBps must be between 0 and 10000');
      await expect(resolveDispute('0xEscrowContract', 0, -1)).rejects.toThrow('freelancerBps must be between 0 and 10000');
      expect(mockContract.resolveDispute).not.toHaveBeenCalled();
    });

    it('should throw when Web3 is not available', async () => {
      mockIsWeb3Available.mockReturnValue(false);
      const { resolveDispute } = await import('../../services/escrow-blockchain.js');
      await expect(resolveDispute('0xEscrowContract', 0, 10000)).rejects.toThrow('Web3 is not configured');
    });
  });

  describe('getPendingWithdrawals', () => {
    it('should return the pending withdrawal amount for a party', async () => {
      mockContract.pendingWithdrawals.mockResolvedValue(BigInt('1500000000000000000'));

      const { getPendingWithdrawals } = await import('../../services/escrow-blockchain.js');
      const amount = await getPendingWithdrawals('0xEscrowContract', '0xFreelancer');

      expect(amount).toBe(BigInt('1500000000000000000'));
      expect(mockContract.pendingWithdrawals).toHaveBeenCalledWith('0xFreelancer');
      expect(mockGetContract).toHaveBeenCalledWith('0xEscrowContract', []);
    });

    it('should throw when Web3 is not available', async () => {
      mockIsWeb3Available.mockReturnValue(false);
      const { getPendingWithdrawals } = await import('../../services/escrow-blockchain.js');
      await expect(getPendingWithdrawals('0xEscrowContract', '0xFreelancer')).rejects.toThrow('Web3 is not configured');
    });
  });

  describe('withdrawFromEscrow', () => {
    it('should withdraw pending funds with the server wallet', async () => {
      const mockReceipt = {
        hash: '0xWithdrawHash',
        blockNumber: 106,
      };

      mockContract.withdraw.mockResolvedValue({
        wait: jest.fn<any>().mockResolvedValue(mockReceipt),
      });

      const { withdrawFromEscrow } = await import('../../services/escrow-blockchain.js');
      const result = await withdrawFromEscrow('0xEscrowContract');

      expect(result).toEqual({
        transactionHash: '0xWithdrawHash',
        receipt: mockReceipt,
      });
      expect(mockContract.withdraw).toHaveBeenCalledTimes(1);
      expect(mockGetContractWithSigner).toHaveBeenCalledWith('0xEscrowContract', []);
    });

    it('should throw when Web3 is not available', async () => {
      mockIsWeb3Available.mockReturnValue(false);
      const { withdrawFromEscrow } = await import('../../services/escrow-blockchain.js');
      await expect(withdrawFromEscrow('0xEscrowContract')).rejects.toThrow('Web3 is not configured');
    });
  });
});