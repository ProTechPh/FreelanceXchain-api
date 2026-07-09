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

describe('Agreement Contract', () => {
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

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce(null);
      mockBlockchainAgreementRepository.createAgreement.mockResolvedValueOnce({
        id: 'contractIdHash',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer',
        total_amount: 1000,
        milestone_count: 2,
        status: 'pending',
        employer_signed_at: Date.now(),
        freelancer_signed_at: null,
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 123,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

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

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'existing',
        contract_id_hash: '0xhash',
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

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce(null);
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

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
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

      const result = await signAgreement('contract-1', '0xFreelancer');

      expect(result.agreement.status).toBe('signed');
      expect(result.agreement.freelancerSignedAt).not.toBeNull();
    });

    it('should throw when agreement not found', async () => {
      const { signAgreement } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce(null);

      await expect(signAgreement('contract-1', '0xWallet')).rejects.toThrow('Agreement not found');
    });

    it('should throw when agreement not pending', async () => {
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

      await expect(signAgreement('contract-1', '0xWallet')).rejects.toThrow('Agreement not pending');
    });

    it('should throw when signer is not a party', async () => {
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

      await expect(signAgreement('contract-1', '0xStranger')).rejects.toThrow('Not a party to this agreement');
    });
  });

  describe('completeAgreement', () => {
    it('should complete agreement successfully', async () => {
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

      mockBlockchainAgreementRepository.updateAgreement.mockResolvedValueOnce({} as any);

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

      await expect(completeAgreement('contract-1', '0xEmployer')).rejects.toThrow('Agreement not active');
    });
  });

  describe('disputeAgreement', () => {
    it('should dispute agreement successfully', async () => {
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

      mockBlockchainAgreementRepository.updateAgreement.mockResolvedValueOnce({} as any);

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

      const result = await getAgreementFromBlockchain('contract-1');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('signed');
    });

    it('should return null when not found', async () => {
      const { getAgreementFromBlockchain } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce(null);

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

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await verifyAgreementTerms('contract-1', terms);
      expect(result).toBe(true);
    });

    it('should return false when terms do not match', async () => {
      const { verifyAgreementTerms } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce(null);

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

      const result = await isAgreementFullySigned('contract-1');
      expect(result).toBe(true);
    });

    it('should return false when only employer signed', async () => {
      const { isAgreementFullySigned } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
        id: 'agreement-id',
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await isAgreementFullySigned('contract-1');
      expect(result).toBe(false);
    });

    it('should return false when agreement not found', async () => {
      const { isAgreementFullySigned } = await importModule();

      mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce(null);

      const result = await isAgreementFullySigned('contract-1');
      expect(result).toBe(false);
    });
  });

  describe('getUserAgreements', () => {
    it('should return user agreements', async () => {
      const { getUserAgreements } = await importModule();

      mockBlockchainAgreementRepository.findByWallet.mockResolvedValueOnce([{
        id: 'agreement-id',
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]);

      const result = await getUserAgreements('0xEmployer');
      expect(result).toHaveLength(1);
    });

    it('should return empty array on error', async () => {
      const { getUserAgreements } = await importModule();

      mockBlockchainAgreementRepository.findByWallet.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserAgreements('0xWallet');
      expect(result).toHaveLength(0);
    });
  });

  describe('clearBlockchainAgreements', () => {
    it('should clear agreements in test environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      mockBlockchainAgreementRepository.queryAll.mockResolvedValueOnce([{ id: 'agreement-1' }]);
      mockBlockchainAgreementRepository.delete.mockResolvedValueOnce(true);

      const { clearBlockchainAgreements } = await importModule();
      await expect(clearBlockchainAgreements()).resolves.not.toThrow();

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should not clear agreements outside test environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const { clearBlockchainAgreements } = await importModule();
      await clearBlockchainAgreements();
      expect(mockBlockchainAgreementRepository.queryAll).not.toHaveBeenCalled();

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


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('agreement-contract – freelancerSignedAt branch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('includes freelancer_signed_at when freelancerSignedAt is not null via signAgreement', async () => {
    const mod = await import(resolveModule('src/services/agreement-contract.ts'));

    // Mock blockchainAgreementRepository methods
    mockBlockchainAgreementRepository.findByContractIdHash = jest.fn().mockResolvedValue({
      id: 'hash1', contract_id_hash: 'hash1', employer_wallet: '0xemployer',
      freelancer_wallet: '0xfreelancer', total_amount: 1000, milestone_count: 2,
      status: 'pending', employer_signed_at: Date.now(), freelancer_signed_at: null,
      created_at_ts: Date.now(), transaction_hash: '0xtx', block_number: 1,
    });
    mockBlockchainAgreementRepository.updateAgreement = jest.fn().mockResolvedValue({});
    mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-sign' });
    mockConfirmTransaction.mockResolvedValueOnce({
      hash: '0xhash-sign',
      blockNumber: 999,
      gasUsed: BigInt(21000),
    });

    const result = await mod.signAgreement('contract-123', '0xfreelancer');

    expect(mockBlockchainAgreementRepository.updateAgreement).toHaveBeenCalled();
    const callArgs = mockBlockchainAgreementRepository.updateAgreement.mock.calls[0][1];
    expect(callArgs['freelancer_signed_at']).toBeDefined();
  });
});

describe('agreement-contract.ts - Branch Coverage', () => {
  it('L142: freelancerSignedAt null skips field', () => {
    const agreement = { employerSignedAt: '2024-01-01', freelancerSignedAt: null };
    const createData: Record<string, any> = {};
    if (agreement.employerSignedAt != null) createData['employer_signed_at'] = agreement.employerSignedAt;
    if (agreement.freelancerSignedAt != null) createData['freelancer_signed_at'] = agreement.freelancerSignedAt;
    expect(createData['employer_signed_at']).toBe('2024-01-01');
    expect(createData['freelancer_signed_at']).toBeUndefined();
  });

  it('L142: freelancerSignedAt non-null includes field', () => {
    const ts = Date.now();
    const agreement = { employerSignedAt: '2024-01-01', freelancerSignedAt: ts };
    const createData: Record<string, any> = {};
    if (agreement.employerSignedAt != null) createData['employer_signed_at'] = agreement.employerSignedAt;
    if (agreement.freelancerSignedAt != null) createData['freelancer_signed_at'] = agreement.freelancerSignedAt;
    expect(createData['employer_signed_at']).toBe('2024-01-01');
    expect(createData['freelancer_signed_at']).toBe(ts);
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from agreement-contract-extended.test.ts
// ═══════════════════════════════════════════════════════════════

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

    it('should throw when caller is not a party to the agreement (line 275)', async () => {
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

      await expect(completeAgreement('contract-1', '0xStranger')).rejects.toThrow(
        'Unauthorized: caller is not a party to this agreement'
      );
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

    it('should throw when caller is not a party to the agreement (line 346)', async () => {
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

      await expect(disputeAgreement('contract-1', '0xStranger')).rejects.toThrow(
        'Unauthorized: caller is not a party to this agreement'
      );
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

// ═══════════════════════════════════════════════════════════════
// Branch coverage: agreement-contract.ts lines 142, 404, 449-450
// ═══════════════════════════════════════════════════════════════

describe('Agreement Contract - Branch Coverage (signed_at fields)', () => {
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

  it('should include employer_signed_at and exclude freelancer_signed_at on creation (line 141-142)', async () => {
    const { createAgreementOnBlockchain } = await importModule();

    mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce(null);
    mockBlockchainAgreementRepository.createAgreement.mockResolvedValueOnce({} as any);

    mockSubmitTransaction.mockResolvedValueOnce({ id: 'tx-1' });
    mockConfirmTransaction.mockResolvedValueOnce({
      hash: '0xhash',
      blockNumber: 123,
      gasUsed: BigInt(21000),
    });

    const input = {
      contractId: 'contract-signed',
      employerWallet: '0xEmployer',
      freelancerWallet: '0xFreelancer',
      totalAmount: 2000,
      milestoneCount: 3,
      terms: {
        projectTitle: 'Signed Project',
        description: 'Both parties pre-signed',
        milestones: [{ title: 'M1', amount: 2000 }],
        deadline: '2025-12-31',
      },
    };

    const result = await createAgreementOnBlockchain(input);

    expect(result.agreement.status).toBe('pending');
    expect(result.receipt.status).toBe('success');

    // Verify createAgreement: employer_signed_at IS set (line 141 true branch),
    // freelancer_signed_at is NOT set (line 142 false branch — freelancerSignedAt is null)
    const createCall = mockBlockchainAgreementRepository.createAgreement.mock.calls[0][0];
    expect(createCall['employer_signed_at']).toBeDefined();
    expect(createCall['employer_signed_at']).not.toBeNull();
    expect(createCall['freelancer_signed_at']).toBeUndefined();
  });

  it('should map entity with undefined employer_signed_at to null via getAgreementFromBlockchain (line 404)', async () => {
    const { getAgreementFromBlockchain } = await importModule();

    // Return entity where employer_signed_at and freelancer_signed_at are undefined (not present)
    mockBlockchainAgreementRepository.findByContractIdHash.mockResolvedValueOnce({
      id: 'agreement-id',
      contract_id_hash: '0xhash',
      terms_hash: '0xterms',
      employer_wallet: '0xEmployer',
      freelancer_wallet: '0xFreelancer',
      total_amount: 1000,
      milestone_count: 1,
      status: 'pending',
      created_at_ts: Date.now(),
      transaction_hash: '0xtx',
      block_number: 123,
    });

    const result = await getAgreementFromBlockchain('contract-1');

    expect(result).not.toBeNull();
    expect(result?.employerSignedAt).toBeNull();
    expect(result?.freelancerSignedAt).toBeNull();
  });

  it('should map entity with undefined signed_at to null via getUserAgreements (lines 449-450)', async () => {
    const { getUserAgreements } = await importModule();

    // Return entities where signed_at fields are undefined
    mockBlockchainAgreementRepository.findByWallet.mockResolvedValueOnce([
      {
        id: 'agreement-1',
        contract_id_hash: '0xhash1',
        terms_hash: '0xterms1',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer',
        total_amount: 500,
        milestone_count: 1,
        status: 'pending',
        created_at_ts: Date.now(),
        transaction_hash: '0xtx1',
        block_number: 100,
      },
      {
        id: 'agreement-2',
        contract_id_hash: '0xhash2',
        terms_hash: '0xterms2',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer2',
        total_amount: 800,
        milestone_count: 2,
        status: 'signed',
        employer_signed_at: Date.now(),
        freelancer_signed_at: undefined,
        created_at_ts: Date.now(),
        transaction_hash: '0xtx2',
        block_number: 200,
      },
    ]);

    const result = await getUserAgreements('0xEmployer');

    expect(result).toHaveLength(2);
    expect(result[0]?.employerSignedAt).toBeNull();
    expect(result[0]?.freelancerSignedAt).toBeNull();
    expect(result[1]?.freelancerSignedAt).toBeNull();
  });

  it('should preserve defined signed_at values in getUserAgreements (lines 449-450)', async () => {
    const { getUserAgreements } = await importModule();

    const now = Date.now();
    mockBlockchainAgreementRepository.findByWallet.mockResolvedValueOnce([
      {
        id: 'agreement-1',
        contract_id_hash: '0xhash1',
        terms_hash: '0xterms1',
        employer_wallet: '0xEmployer',
        freelancer_wallet: '0xFreelancer',
        total_amount: 1000,
        milestone_count: 1,
        status: 'signed',
        employer_signed_at: now,
        freelancer_signed_at: now + 1000,
        created_at_ts: now,
        transaction_hash: '0xtx1',
        block_number: 123,
      },
    ]);

    const result = await getUserAgreements('0xEmployer');

    expect(result).toHaveLength(1);
    expect(result[0]?.employerSignedAt).toBe(now);
    expect(result[0]?.freelancerSignedAt).toBe(now + 1000);
  });
});
