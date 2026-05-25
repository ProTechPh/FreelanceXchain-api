import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSubmitTransaction = jest.fn<(...args: any[]) => Promise<any>>();
const mockConfirmTransaction = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTransaction,
  confirmTransaction: mockConfirmTransaction,
  generateWalletAddress: jest.fn(() => '0x' + 'a'.repeat(40)),
}));

describe('Agreement Contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  const importModule = async () => {
    return await import('../../services/agreement-contract.js');
  };

  describe('generateContractIdHash', () => {
    it('should generate consistent hash', async () => {
      const { generateContractIdHash } = await importModule();
      const hash1 = generateContractIdHash('contract-1');
      const hash2 = generateContractIdHash('contract-1');
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should generate different hashes for different inputs', async () => {
      const { generateContractIdHash } = await importModule();
      const hash1 = generateContractIdHash('contract-1');
      const hash2 = generateContractIdHash('contract-2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateTermsHash', () => {
    it('should generate consistent hash for same terms', async () => {
      const { generateTermsHash } = await importModule();
      const terms = {
        projectTitle: 'Test Project',
        description: 'Description',
        milestones: [{ title: 'M1', amount: 100 }],
        deadline: '2024-12-31',
      };
      const hash1 = generateTermsHash(terms);
      const hash2 = generateTermsHash(terms);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should generate different hashes for different terms', async () => {
      const { generateTermsHash } = await importModule();
      const hash1 = generateTermsHash({
        projectTitle: 'Project A',
        description: 'Desc',
        milestones: [],
        deadline: '2024-01-01',
      });
      const hash2 = generateTermsHash({
        projectTitle: 'Project B',
        description: 'Desc',
        milestones: [],
        deadline: '2024-01-01',
      });
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createAgreementOnBlockchain', () => {
    it('should create agreement successfully', async () => {
      const { createAgreementOnBlockchain } = await importModule();

      (global as any).mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-1' });
      mockConfirmTransaction.mockResolvedValueOnce({
        hash: '0xhash',
        blockNumber: 123,
        gasUsed: BigInt(21000),
      });

      const input = {
        contractId: 'contract-1',
        employerWallet: '0xEmployer',
        freelancerWallet: '0xFreelancer',
        totalAmount: 1000,
        milestoneCount: 2,
        terms: {
          projectTitle: 'Test',
          description: 'Desc',
          milestones: [{ title: 'M1', amount: 500 }],
          deadline: '2024-12-31',
        },
      };

      const result = await createAgreementOnBlockchain(input);

      expect(result.agreement.status).toBe('pending');
      expect(result.agreement.totalAmount).toBe(1000);
      expect(result.receipt.status).toBe('success');
    });

    it('should throw when agreement already exists', async () => {
      const { createAgreementOnBlockchain } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{ contract_id_hash: '0xhash' }],
        rowCount: 1,
      });

      const input = {
        contractId: 'contract-1',
        employerWallet: '0xEmployer',
        freelancerWallet: '0xFreelancer',
        totalAmount: 1000,
        milestoneCount: 1,
        terms: {
          projectTitle: 'Test',
          description: 'Desc',
          milestones: [],
          deadline: '2024-12-31',
        },
      };

      await expect(createAgreementOnBlockchain(input)).rejects.toThrow('Agreement already exists');
    });

    it('should throw when transaction confirmation fails', async () => {
      const { createAgreementOnBlockchain } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-1' });
      mockConfirmTransaction.mockResolvedValueOnce(null);

      const input = {
        contractId: 'contract-1',
        employerWallet: '0xEmployer',
        freelancerWallet: '0xFreelancer',
        totalAmount: 1000,
        milestoneCount: 1,
        terms: {
          projectTitle: 'Test',
          description: 'Desc',
          milestones: [],
          deadline: '2024-12-31',
        },
      };

      await expect(createAgreementOnBlockchain(input)).rejects.toThrow('Failed to confirm transaction');
    });
  });

  describe('signAgreement', () => {
    it('should sign agreement successfully', async () => {
      const { signAgreement } = await importModule();

      (global as any).mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            contract_id_hash: '0xhash',
            terms_hash: '0xterms',
            employer_wallet: '0xEmployer',
            freelancer_wallet: '0xFreelancer',
            total_amount: 1000,
            milestone_count: 1,
            status: 'pending',
            employer_signed_at: Date.now(),
            freelancer_signed_at: null,
            created_at_ts: Date.now(),
            transaction_hash: '0xtx',
            block_number: 123,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-2' });
      mockConfirmTransaction.mockResolvedValueOnce({
        hash: '0xhash2',
        blockNumber: 124,
        gasUsed: BigInt(21000),
      });

      const result = await signAgreement('contract-1', '0xFreelancer');

      expect(result.agreement.status).toBe('signed');
      expect(result.agreement.freelancerSignedAt).not.toBeNull();
    });

    it('should throw when agreement not found', async () => {
      const { signAgreement } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(signAgreement('contract-1', '0xWallet')).rejects.toThrow('Agreement not found');
    });

    it('should throw when agreement not pending', async () => {
      const { signAgreement } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{
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
        }],
        rowCount: 1,
      });

      await expect(signAgreement('contract-1', '0xWallet')).rejects.toThrow('Agreement not pending');
    });

    it('should throw when signer is not a party', async () => {
      const { signAgreement } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{
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
        }],
        rowCount: 1,
      });

      await expect(signAgreement('contract-1', '0xStranger')).rejects.toThrow('Not a party to this agreement');
    });
  });

  describe('completeAgreement', () => {
    it('should complete agreement successfully', async () => {
      const { completeAgreement } = await importModule();

      (global as any).mockPool.query
        .mockResolvedValueOnce({
          rows: [{
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
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-3' });
      mockConfirmTransaction.mockResolvedValueOnce({
        hash: '0xhash3',
        blockNumber: 125,
        gasUsed: BigInt(21000),
      });

      const result = await completeAgreement('contract-1', '0xEmployer');

      expect(result.agreement.status).toBe('completed');
    });

    it('should throw when agreement not active', async () => {
      const { completeAgreement } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{
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
        }],
        rowCount: 1,
      });

      await expect(completeAgreement('contract-1', '0xEmployer')).rejects.toThrow('Agreement not active');
    });
  });

  describe('disputeAgreement', () => {
    it('should dispute agreement successfully', async () => {
      const { disputeAgreement } = await importModule();

      (global as any).mockPool.query
        .mockResolvedValueOnce({
          rows: [{
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
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-4' });
      mockConfirmTransaction.mockResolvedValueOnce({
        hash: '0xhash4',
        blockNumber: 126,
        gasUsed: BigInt(21000),
      });

      const result = await disputeAgreement('contract-1', '0xEmployer');

      expect(result.agreement.status).toBe('disputed');
    });
  });

  describe('getAgreementFromBlockchain', () => {
    it('should return agreement when found', async () => {
      const { getAgreementFromBlockchain } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{
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
        }],
        rowCount: 1,
      });

      const result = await getAgreementFromBlockchain('contract-1');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('signed');
    });

    it('should return null when not found', async () => {
      const { getAgreementFromBlockchain } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getAgreementFromBlockchain('contract-1');

      expect(result).toBeNull();
    });
  });

  describe('verifyAgreementTerms', () => {
    it('should return true when terms match', async () => {
      const { verifyAgreementTerms, generateTermsHash } = await importModule();

      const terms = {
        projectTitle: 'Test',
        description: 'Desc',
        milestones: [],
        deadline: '2024-12-31',
      };
      const termsHash = generateTermsHash(terms);

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{
          contract_id_hash: '0xhash',
          terms_hash: termsHash,
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
        }],
        rowCount: 1,
      });

      const result = await verifyAgreementTerms('contract-1', terms);
      expect(result).toBe(true);
    });

    it('should return false when terms do not match', async () => {
      const { verifyAgreementTerms } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{
          contract_id_hash: '0xhash',
          terms_hash: '0xdifferent',
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
        }],
        rowCount: 1,
      });

      const result = await verifyAgreementTerms('contract-1', {
        projectTitle: 'Different',
        description: 'Desc',
        milestones: [],
        deadline: '2024-12-31',
      });
      expect(result).toBe(false);
    });

    it('should return false when agreement not found', async () => {
      const { verifyAgreementTerms } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await verifyAgreementTerms('contract-1', {
        projectTitle: 'Test',
        description: 'Desc',
        milestones: [],
        deadline: '2024-12-31',
      });
      expect(result).toBe(false);
    });
  });

  describe('isAgreementFullySigned', () => {
    it('should return true when both parties signed', async () => {
      const { isAgreementFullySigned } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{
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
        }],
        rowCount: 1,
      });

      const result = await isAgreementFullySigned('contract-1');
      expect(result).toBe(true);
    });

    it('should return false when only employer signed', async () => {
      const { isAgreementFullySigned } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{
          contract_id_hash: '0xhash',
          terms_hash: '0xterms',
          employer_wallet: '0xEmployer',
          freelancer_wallet: '0xFreelancer',
          total_amount: 1000,
          milestone_count: 1,
          status: 'pending',
          employer_signed_at: Date.now(),
          freelancer_signed_at: null,
          created_at_ts: Date.now(),
          transaction_hash: '0xtx',
          block_number: 123,
        }],
        rowCount: 1,
      });

      const result = await isAgreementFullySigned('contract-1');
      expect(result).toBe(false);
    });

    it('should return false when agreement not found', async () => {
      const { isAgreementFullySigned } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await isAgreementFullySigned('contract-1');
      expect(result).toBe(false);
    });
  });

  describe('getUserAgreements', () => {
    it('should return user agreements', async () => {
      const { getUserAgreements } = await importModule();

      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{
          contract_id_hash: '0xhash1',
          terms_hash: '0xterms1',
          employer_wallet: '0xEmployer',
          freelancer_wallet: '0xFreelancer',
          total_amount: 1000,
          milestone_count: 1,
          status: 'signed',
          employer_signed_at: Date.now(),
          freelancer_signed_at: Date.now(),
          created_at_ts: Date.now(),
          transaction_hash: '0xtx1',
          block_number: 123,
        }],
        rowCount: 1,
      });

      const result = await getUserAgreements('0xEmployer');
      expect(result).toHaveLength(1);
    });

    it('should return empty array on error', async () => {
      const { getUserAgreements } = await importModule();

      (global as any).mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserAgreements('0xWallet');
      expect(result).toHaveLength(0);
    });
  });

  describe('clearBlockchainAgreements', () => {
    it('should clear agreements in test environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { clearBlockchainAgreements } = await importModule();
      await expect(clearBlockchainAgreements()).resolves.not.toThrow();

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should not clear agreements outside test environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const { clearBlockchainAgreements } = await importModule();
      await clearBlockchainAgreements();
      expect((global as any).mockPool.query).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('getAgreementContractAddress', () => {
    it('should return a valid address', async () => {
      const { getAgreementContractAddress } = await importModule();
      const address = getAgreementContractAddress();
      expect(address).toMatch(/^0x[a-f0-9]{40}$/);
    });
  });
});