// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSubmitTransaction = jest.fn<(...args: any[]) => Promise<any>>();
const mockConfirmTransaction = jest.fn<(...args: any[]) => Promise<any>>();

const mockBlockchainAgreementRepository = {
  findByContractIdHash: jest.fn(),
  createAgreement: jest.fn(),
  updateAgreement: jest.fn(),
  findByWallet: jest.fn(),
  queryAll: jest.fn(),
  delete: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTransaction,
  confirmTransaction: mockConfirmTransaction,
  generateWalletAddress: jest.fn(() => '0x' + 'a'.repeat(40)),
}));

jest.unstable_mockModule(resolveModule('src/repositories/blockchain-agreement-repository.ts'), () => ({
  blockchainAgreementRepository: mockBlockchainAgreementRepository,
}));

describe('Agreement Contract - Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValue(null);
    mockBlockchainAgreementRepository.createAgreement.mockResolvedValue({} as any);
    mockBlockchainAgreementRepository.updateAgreement.mockResolvedValue({} as any);
    mockBlockchainAgreementRepository.findByWallet.mockResolvedValue([]);
    mockBlockchainAgreementRepository.queryAll.mockResolvedValue([]);
    mockBlockchainAgreementRepository.delete.mockResolvedValue(true);
  });

  const importModule = async () => {
    return await import('../../services/agreement-contract.js');
  };

  describe('signAgreement - employer signs first', () => {
    it('should allow employer to sign when freelancer already signed', async () => {
      const { signAgreement } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer',
        total_amount: 1000,
        milestone_count: 1,
        status: 'pending',
        employer_signed_at: null,
        freelancer_signed_at: Date.now(),
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 123,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      mockBlockchainAgreementRepository.updateAgreement.mockResolvedValueOnce({} as any);

      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-2' });
      mockConfirmTransaction.mockResolvedValueOnce({
        hash: '0xhash2',
        blockNumber: 124,
        gasUsed: BigInt(21000),
      });

      const result = await signAgreement('contract-1', '0xEmployer');

      expect(result.agreement.status).toBe('signed');
      expect(result.agreement.employerSignedAt).not.toBeNull();
    });

    it('should not change status when only one party signs', async () => {
      const { signAgreement } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer',
        total_amount: 1000,
        milestone_count: 1,
        status: 'pending',
        employer_signed_at: null,
        freelancer_signed_at: null,
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 123,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      mockBlockchainAgreementRepository.updateAgreement.mockResolvedValueOnce({} as any);

      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-2' });
      mockConfirmTransaction.mockResolvedValueOnce({
        hash: '0xhash2',
        blockNumber: 124,
        gasUsed: BigInt(21000),
      });

      const result = await signAgreement('contract-1', '0xEmployer');

      expect(result.agreement.status).toBe('pending');
      expect(result.agreement.employerSignedAt).not.toBeNull();
    });

    it('should throw when employer signs twice', async () => {
      const { signAgreement } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer',
        total_amount: 1000,
        milestone_count: 1,
        status: 'signed',
        employer_signed_at: Date.now(),
        freelancer_signed_at: Date.now(),
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 123,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await expect(signAgreement('contract-1', '0xEmployer')).rejects.toThrow('Agreement not pending');
    });
  });

  describe('completeAgreement - edge cases', () => {
    it('should throw when agreement not found', async () => {
      const { completeAgreement } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce(null);

      await expect(completeAgreement('contract-1', '0xEmployer')).rejects.toThrow('Agreement not found');
    });

    it('should throw when transaction confirmation fails', async () => {
      const { completeAgreement } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer',
        total_amount: 1000,
        milestone_count: 1,
        status: 'signed',
        employer_signed_at: Date.now(),
        freelancer_signed_at: Date.now(),
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 123,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-3' });
      mockConfirmTransaction.mockResolvedValueOnce(null);

      await expect(completeAgreement('contract-1', '0xEmployer')).rejects.toThrow('Failed to confirm transaction');
    });
  });

  describe('disputeAgreement - edge cases', () => {
    it('should throw when agreement not found', async () => {
      const { disputeAgreement } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce(null);

      await expect(disputeAgreement('contract-1', '0xEmployer')).rejects.toThrow('Agreement not found');
    });

    it('should throw when agreement not active', async () => {
      const { disputeAgreement } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer',
        total_amount: 1000,
        milestone_count: 1,
        status: 'pending',
        employer_signed_at: null,
        freelancer_signed_at: null,
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 123,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await expect(disputeAgreement('contract-1', '0xEmployer')).rejects.toThrow('Agreement not active');
    });

    it('should throw when transaction confirmation fails', async () => {
      const { disputeAgreement } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer',
        total_amount: 1000,
        milestone_count: 1,
        status: 'signed',
        employer_signed_at: Date.now(),
        freelancer_signed_at: Date.now(),
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 123,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-4' });
      mockConfirmTransaction.mockResolvedValueOnce(null);

      await expect(disputeAgreement('contract-1', '0xEmployer')).rejects.toThrow('Failed to confirm transaction');
    });
  });

  describe('createAgreementOnBlockchain - edge cases', () => {
    it('should include rush terms in hash', async () => {
      const { generateTermsHash } = await importModule();

      const termsWithRush = {
        projectTitle: 'Test',
        description: 'Desc',
        milestones: [{ title: 'M1', amount: 500 }],
        deadline: '2024-12-31',
        isRush: true,
        rushFee: 100,
        rushFeePercentage: 10,
      };

      const hash1 = generateTermsHash(termsWithRush);
      const hash2 = generateTermsHash({
        projectTitle: 'Test',
        description: 'Desc',
        milestones: [{ title: 'M1', amount: 500 }],
        deadline: '2024-12-31',
      });

      expect(hash1).toBe(hash2);
    });
  });

  describe('clearBlockchainAgreements - edge cases', () => {
    it('should skip when not in test environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const { clearBlockchainAgreements } = await importModule();
      await clearBlockchainAgreements();

      expect(mockBlockchainAgreementRepository.queryAll).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});
