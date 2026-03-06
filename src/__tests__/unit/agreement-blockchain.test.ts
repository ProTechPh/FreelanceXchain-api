/**
 * Agreement Blockchain Integration Tests - Refactored
 * Tests for contract agreement blockchain functionality
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

// Mock web3-client
const mockGetContract = jest.fn();
const mockGetContractWithSigner = jest.fn();
const mockIsWeb3Available = jest.fn();
const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  getContract: mockGetContract,
  getContractWithSigner: mockGetContractWithSigner,
  isWeb3Available: mockIsWeb3Available,
}));

// Mock contracts config
jest.unstable_mockModule(resolveModule('src/config/contracts.ts'), () => ({
  getContractAddress: jest.fn().mockReturnValue('0xAgreementContract'),
}));

describe('Agreement Blockchain Integration - Refactored', () => {
  let mockContract: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWeb3Available.mockReturnValue(true);

    // Setup mock contract
    mockContract = {
      createAgreement: jest.fn(),
      signAgreement: jest.fn(),
      getAgreement: jest.fn(),
      completeAgreement: jest.fn(),
      cancelAgreement: jest.fn(),
      disputeAgreement: jest.fn(),
      interface: {
        parseLog: jest.fn(),
      },
    };

    mockGetContract.mockReturnValue(mockContract);
    mockGetContractWithSigner.mockReturnValue(mockContract);
  });

  describe('createAgreementOnBlockchain', () => {
    it('should create agreement successfully', async () => {
      const mockReceipt = {
        hash: '0xCreateHash',
        blockNumber: 100,
        logs: [{ topics: ['0xAgreementCreated'] }],
      };

      const mockAgreement = {
        contractIdHash: '0xHash123',
        termsHash: '0xTermsHash',
        employerWallet: '0xEmployer',
        freelancerWallet: '0xFreelancer',
        totalAmount: '3000000000000000000',
        milestoneCount: '3',
        status: 0,
        employerSignedAt: '0',
        freelancerSignedAt: '0',
        createdAt: '1640000000',
      };

      mockContract.createAgreement.mockResolvedValue({
        wait: (jest.fn() as any).mockResolvedValue(mockReceipt),
      } as any);

      mockContract.getAgreement.mockResolvedValue([
        mockAgreement.contractIdHash,
        mockAgreement.termsHash,
        mockAgreement.employerWallet,
        mockAgreement.freelancerWallet,
        BigInt(mockAgreement.totalAmount),
        BigInt(mockAgreement.milestoneCount),
        BigInt(mockAgreement.status),
        BigInt(mockAgreement.employerSignedAt),
        BigInt(mockAgreement.freelancerSignedAt),
        BigInt(mockAgreement.createdAt),
      ]);

      const { createAgreementOnBlockchain } = await import('../../services/agreement-blockchain.js');

      const result = await createAgreementOnBlockchain({
        contractId: 'contract-123',
        employerWallet: '0xEmployer',
        freelancerWallet: '0xFreelancer',
        totalAmount: BigInt('3000000000000000000'),
        milestoneCount: 3,
        terms: {
          projectTitle: 'Test Project',
          description: 'Test Description',
          milestones: [{ title: 'M1', amount: 1000 }],
          deadline: '2024-12-31',
        },
      });

      expect(result.transactionHash).toBe('0xCreateHash');
      expect(result.receipt).toEqual(mockReceipt);
      expect(result.agreement).toBeDefined();
      expect(result.agreement.employerWallet).toBe('0xEmployer');
      expect(result.agreement.freelancerWallet).toBe('0xFreelancer');
    });

    it('should throw error when Web3 is not available', async () => {
      mockIsWeb3Available.mockReturnValue(false);

      const { createAgreementOnBlockchain } = await import('../../services/agreement-blockchain.js');

      await expect(
        createAgreementOnBlockchain({
          contractId: 'contract-123',
          employerWallet: '0xEmployer',
          freelancerWallet: '0xFreelancer',
          totalAmount: BigInt('1000000000000000000'),
          milestoneCount: 1,
          terms: {
            projectTitle: 'Test',
            description: 'Test',
            milestones: [{ title: 'M1', amount: 1000 }],
            deadline: '2024-12-31',
          },
        })
      ).rejects.toThrow('Web3 is not configured');
    });
  });

  describe('signAgreement', () => {
    it('should sign agreement successfully', async () => {
      const mockReceipt = {
        hash: '0xSignHash',
        blockNumber: 101,
      };

      mockContract.signAgreement.mockResolvedValue({
        wait: (jest.fn() as any).mockResolvedValue(mockReceipt),
      } as any);

      mockContract.getAgreement.mockResolvedValue([
        '0xHash123',
        '0xTermsHash',
        '0xEmployer',
        '0xFreelancer',
        BigInt('3000000000000000000'),
        BigInt('3'),
        BigInt(1),
        BigInt(1640000000),
        BigInt(1640000000),
        BigInt(1640000000),
      ]);

      const { signAgreement } = await import('../../services/agreement-blockchain.js');

      const result = await signAgreement('contract-123');

      expect(result.transactionHash).toBe('0xSignHash');
      expect(result.receipt).toEqual(mockReceipt);
      expect(result.agreement).toBeDefined();
    });
  });

  describe('getAgreementFromBlockchain', () => {
    it('should retrieve agreement details', async () => {
      mockContract.getAgreement.mockResolvedValue([
        '0xHash123',
        '0xTermsHash',
        '0xEmployer',
        '0xFreelancer',
        BigInt('3000000000000000000'),
        BigInt(3),
        BigInt(1), // Status: Signed
        BigInt(1640000000),
        BigInt(1640000000),
        BigInt(1640000000),
      ]);

      const { getAgreementFromBlockchain } = await import('../../services/agreement-blockchain.js');

      const agreement = await getAgreementFromBlockchain('contract-123');

      expect(agreement).toBeDefined();
      expect(agreement?.employerWallet).toBe('0xEmployer');
      expect(agreement?.freelancerWallet).toBe('0xFreelancer');
      expect(agreement?.termsHash).toBe('0xTermsHash');
      expect(agreement?.status).toBe(1);
    });

    it('should handle all agreement statuses', async () => {
      const { getAgreementFromBlockchain } = await import('../../services/agreement-blockchain.js');

      const statuses = [0, 1, 2, 3, 4]; // pending, signed, completed, disputed, cancelled

      for (let i = 0; i < statuses.length; i++) {
        mockContract.getAgreement.mockResolvedValue([
          '0xHash123',
          '0xTermsHash',
          '0xEmployer',
          '0xFreelancer',
          BigInt('1000000000000000000'),
          BigInt(3),
          BigInt(i),
          BigInt(1640000000),
          BigInt(1640000000),
          BigInt(1640000000),
        ]);

        const agreement = await getAgreementFromBlockchain('contract-123');
        expect(agreement).not.toBeNull();
        if (agreement) {
          expect(agreement.status).toBe(i);
        }
      }
    });
  });

  describe('completeAgreement', () => {
    it('should complete agreement successfully', async () => {
      const mockReceipt = {
        hash: '0xCompleteHash',
        blockNumber: 102,
      };

      mockContract.completeAgreement.mockResolvedValue({
        wait: (jest.fn() as any).mockResolvedValue(mockReceipt),
      } as any);

      mockContract.getAgreement.mockResolvedValue([
        '0xHash123',
        '0xTermsHash',
        '0xEmployer',
        '0xFreelancer',
        BigInt('3000000000000000000'),
        BigInt('3'),
        BigInt(2), // Status: Completed
        BigInt(1640000000),
        BigInt(1640000000),
        BigInt(1640000000),
      ]);

      const { completeAgreement } = await import('../../services/agreement-blockchain.js');

      const result = await completeAgreement('contract-123');

      expect(result.transactionHash).toBe('0xCompleteHash');
      expect(result.receipt).toEqual(mockReceipt);
      expect(result.agreement).toBeDefined();
    });
  });

  describe('cancelAgreement', () => {
    it('should cancel agreement successfully', async () => {
      const mockReceipt = {
        hash: '0xCancelHash',
        blockNumber: 103,
      };

      mockContract.cancelAgreement.mockResolvedValue({
        wait: (jest.fn() as any).mockResolvedValue(mockReceipt),
      } as any);

      mockContract.getAgreement.mockResolvedValue([
        '0xHash123',
        '0xTermsHash',
        '0xEmployer',
        '0xFreelancer',
        BigInt('3000000000000000000'),
        BigInt('3'),
        BigInt(4), // Status: Cancelled
        BigInt(1640000000),
        BigInt(1640000000),
        BigInt(1640000000),
      ]);

      const { cancelAgreement } = await import('../../services/agreement-blockchain.js');

      const result = await cancelAgreement('contract-123');

      expect(result.transactionHash).toBe('0xCancelHash');
      expect(result.receipt).toEqual(mockReceipt);
      expect(result.agreement).toBeDefined();
    });
  });

  describe('disputeAgreement', () => {
    it('should dispute agreement successfully', async () => {
      const mockReceipt = {
        hash: '0xDisputeHash',
        blockNumber: 104,
      };

      mockContract.disputeAgreement.mockResolvedValue({
        wait: (jest.fn() as any).mockResolvedValue(mockReceipt),
      } as any);

      mockContract.getAgreement.mockResolvedValue([
        '0xHash123',
        '0xTermsHash',
        '0xEmployer',
        '0xFreelancer',
        BigInt('3000000000000000000'),
        BigInt('3'),
        BigInt(3), // Status: Disputed
        BigInt(1640000000),
        BigInt(1640000000),
        BigInt(1640000000),
      ]);

      const { disputeAgreement } = await import('../../services/agreement-blockchain.js');

      const result = await disputeAgreement('contract-123');

      expect(result.transactionHash).toBe('0xDisputeHash');
      expect(result.receipt).toEqual(mockReceipt);
      expect(result.agreement).toBeDefined();
    });
  });

  describe('Hash generation utilities', () => {
    it('should generate consistent contract ID hash', async () => {
      const { generateContractIdHash } = await import('../../services/agreement-blockchain.js');

      const contractId = 'test-contract-123';
      const hash1 = generateContractIdHash(contractId);
      const hash2 = generateContractIdHash(contractId);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should generate different hashes for different contract IDs', async () => {
      const { generateContractIdHash } = await import('../../services/agreement-blockchain.js');

      const hash1 = generateContractIdHash('contract-123');
      const hash2 = generateContractIdHash('contract-456');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate terms hash from object', async () => {
      const { generateTermsHash } = await import('../../services/agreement-blockchain.js');

      const terms = {
        projectTitle: 'Test Project',
        description: 'Test description',
        milestones: [
          { title: 'Milestone 1', amount: 1000 },
          { title: 'Milestone 2', amount: 2000 }
        ],
        deadline: '2024-12-31',
      };

      const hash = generateTermsHash(terms);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });
});
