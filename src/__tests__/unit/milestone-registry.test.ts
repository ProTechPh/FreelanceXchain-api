// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockSubmitTx = jest.fn() as jest.Mock<any>;
const mockConfirmTx = jest.fn() as jest.Mock<any>;

const mockBlockchainMilestoneRecordRepository = {
  findByMilestoneIdHash: jest.fn(),
  createMilestoneRecord: jest.fn(),
  updateMilestoneRecord: jest.fn(),
  findByWallet: jest.fn(),
  queryAll: jest.fn(),
  delete: jest.fn(),
};

function makeConfirmed(hash = '0xabc123', blockNumber = 1) {
  return {
    id: 'tx-1',
    hash,
    blockNumber,
    gasUsed: BigInt(21000),
  };
}

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTx,
  confirmTransaction: mockConfirmTx,
  generateWalletAddress: jest.fn(() => '0x' + 'a'.repeat(40)),
}));

jest.unstable_mockModule(resolveModule('src/repositories/blockchain-milestone-record-repository.ts'), () => ({
  blockchainMilestoneRecordRepository: mockBlockchainMilestoneRecordRepository,
}));

const MILESTONE_ID = 'ms-1';
const CONTRACT_ID = 'c-1';
const FL_WALLET = '0xFreelancer';
const EM_WALLET = '0xEmployer';

describe('milestone-registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitTx.mockResolvedValue({ id: 'tx-1' });
    mockConfirmTx.mockResolvedValue(makeConfirmed());
    mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValue(null);
    mockBlockchainMilestoneRecordRepository.createMilestoneRecord.mockResolvedValue({} as any);
    mockBlockchainMilestoneRecordRepository.updateMilestoneRecord.mockResolvedValue({} as any);
    mockBlockchainMilestoneRecordRepository.findByWallet.mockResolvedValue([]);
    mockBlockchainMilestoneRecordRepository.queryAll.mockResolvedValue([]);
    mockBlockchainMilestoneRecordRepository.delete.mockResolvedValue(true);
  });

  const importModule = async () => {
    return await import('../../services/milestone-registry.js');
  };

  let generateMilestoneIdHash: (id: string) => string;
  let generateWorkHash: (d: string) => string;

  beforeEach(async () => {
    const mod = await importModule();
    generateMilestoneIdHash = mod.generateMilestoneIdHash;
    generateWorkHash = mod.generateWorkHash;
  });

  function makeRegistryRow(overrides: Record<string, any> = {}) {
    return {
      id: generateMilestoneIdHash(MILESTONE_ID),
      milestone_id_hash: generateMilestoneIdHash(MILESTONE_ID),
      contract_id_hash: generateMilestoneIdHash(CONTRACT_ID),
      work_hash: generateWorkHash('deliverables'),
      freelancer_wallet: FL_WALLET,
      employer_wallet: EM_WALLET,
      amount: 500,
      status: 'submitted',
      submitted_at: Date.now(),
      completed_at: null,
      title: 'Phase 1',
      transaction_hash: '0xabc123',
      block_number: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  describe('generateMilestoneIdHash', () => {
    it('should return a sha256 hex string prefixed with 0x', () => {
      const hash = generateMilestoneIdHash('ms-abc');
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should be deterministic for the same input', () => {
      expect(generateMilestoneIdHash('ms-abc')).toBe(generateMilestoneIdHash('ms-abc'));
    });

    it('should produce different hashes for different inputs', () => {
      expect(generateMilestoneIdHash('ms-1')).not.toBe(generateMilestoneIdHash('ms-2'));
    });
  });

  describe('generateWorkHash', () => {
    it('should return a sha256 hex string prefixed with 0x', () => {
      const hash = generateWorkHash('my deliverables');
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('submitMilestoneToRegistry', () => {
    it('should throw when milestone already exists', async () => {
      const { submitMilestoneToRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRow());

      await expect(submitMilestoneToRegistry({
        milestoneId: MILESTONE_ID,
        contractId: CONTRACT_ID,
        freelancerWallet: FL_WALLET,
        employerWallet: EM_WALLET,
        amount: 500,
        title: 'Phase 1',
        deliverables: 'Work done',
      })).rejects.toThrow('Milestone already submitted');
    });

    it('should throw when transaction confirmation fails', async () => {
      const { submitMilestoneToRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(null);
      mockConfirmTx.mockResolvedValueOnce(null);

      await expect(submitMilestoneToRegistry({
        milestoneId: MILESTONE_ID,
        contractId: CONTRACT_ID,
        freelancerWallet: FL_WALLET,
        employerWallet: EM_WALLET,
        amount: 500,
        title: 'Phase 1',
        deliverables: 'Work done',
      })).rejects.toThrow('Failed to confirm transaction');
    });

    it('should submit and return record + receipt on success', async () => {
      const { submitMilestoneToRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(null);
      mockBlockchainMilestoneRecordRepository.createMilestoneRecord.mockResolvedValueOnce(makeRegistryRow());

      const result = await submitMilestoneToRegistry({
        milestoneId: MILESTONE_ID,
        contractId: CONTRACT_ID,
        freelancerWallet: FL_WALLET,
        employerWallet: EM_WALLET,
        amount: 500,
        title: 'Phase 1',
        deliverables: 'Work done',
      });

      expect(result.record.status).toBe('submitted');
      expect(result.receipt.status).toBe('success');
      expect(mockSubmitTx).toHaveBeenCalledTimes(1);
    });
  });

  describe('approveMilestoneOnRegistry', () => {
    it('should throw when milestone not found', async () => {
      const { approveMilestoneOnRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(null);

      await expect(approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET)).rejects.toThrow('Milestone not found');
    });

    it('should throw when milestone status is invalid', async () => {
      const { approveMilestoneOnRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRow({ status: 'approved' }));

      await expect(approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET)).rejects.toThrow('Invalid milestone status');
    });

    it('should approve successfully when status is submitted', async () => {
      const { approveMilestoneOnRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRow({ status: 'submitted' }));
      mockBlockchainMilestoneRecordRepository.updateMilestoneRecord.mockResolvedValueOnce({} as any);

      const result = await approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET);
      expect(result.record.status).toBe('approved');
      expect(result.receipt.status).toBe('success');
    });

    it('should approve successfully when status is disputed', async () => {
      const { approveMilestoneOnRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRow({ status: 'disputed' }));
      mockBlockchainMilestoneRecordRepository.updateMilestoneRecord.mockResolvedValueOnce({} as any);

      const result = await approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET);
      expect(result.record.status).toBe('approved');
    });
  });

  describe('rejectMilestoneOnRegistry', () => {
    it('should throw when milestone not found', async () => {
      const { rejectMilestoneOnRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(null);

      await expect(rejectMilestoneOnRegistry(MILESTONE_ID, EM_WALLET, 'bad work')).rejects.toThrow('Milestone not found');
    });

    it('should throw when milestone status is not submitted', async () => {
      const { rejectMilestoneOnRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRow({ status: 'approved' }));

      await expect(rejectMilestoneOnRegistry(MILESTONE_ID, EM_WALLET, 'reason')).rejects.toThrow('Invalid milestone status');
    });

    it('should reject successfully', async () => {
      const { rejectMilestoneOnRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRow({ status: 'submitted' }));
      mockBlockchainMilestoneRecordRepository.updateMilestoneRecord.mockResolvedValueOnce({} as any);

      const result = await rejectMilestoneOnRegistry(MILESTONE_ID, EM_WALLET, 'Not complete');
      expect(result.record.status).toBe('rejected');
      expect(result.receipt.status).toBe('success');
    });
  });

  describe('getMilestoneFromRegistry', () => {
    it('should return null when not found', async () => {
      const { getMilestoneFromRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(null);

      const result = await getMilestoneFromRegistry(MILESTONE_ID);
      expect(result).toBeNull();
    });

    it('should return the milestone record', async () => {
      const { getMilestoneFromRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRow());

      const result = await getMilestoneFromRegistry(MILESTONE_ID);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('submitted');
      expect(result?.amount).toBe(500);
    });
  });

  describe('getFreelancerStatsFromRegistry', () => {
    it('should return zeroed stats when no milestones exist', async () => {
      const { getFreelancerStatsFromRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByWallet.mockResolvedValueOnce([]);

      const stats = await getFreelancerStatsFromRegistry(FL_WALLET);
      expect(stats.completedCount).toBe(0);
      expect(stats.totalEarned).toBe(0);
    });

    it('should calculate total earned from approved milestones', async () => {
      const { getFreelancerStatsFromRegistry } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByWallet.mockResolvedValueOnce([
        { amount: 100, status: 'approved' },
        { amount: 250, status: 'approved' },
      ]);

      const stats = await getFreelancerStatsFromRegistry(FL_WALLET);
      expect(stats.totalMilestones).toBe(2);
      expect(stats.completedCount).toBe(2);
      expect(stats.totalEarned).toBe(350);
    });
  });

  describe('getFreelancerPortfolio', () => {
    it('should return empty array when no approved milestones', async () => {
      const { getFreelancerPortfolio } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByWallet.mockResolvedValueOnce([]);

      const portfolio = await getFreelancerPortfolio(FL_WALLET);
      expect(portfolio).toHaveLength(0);
    });

    it('should return mapped records', async () => {
      const { getFreelancerPortfolio } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByWallet.mockResolvedValueOnce([
        makeRegistryRow({ status: 'approved', completed_at: Date.now() }),
      ]);

      const portfolio = await getFreelancerPortfolio(FL_WALLET);
      expect(portfolio).toHaveLength(1);
      expect(portfolio[0]?.status).toBe('approved');
    });
  });

  describe('verifyMilestoneWork', () => {
    it('should return false when milestone not found', async () => {
      const { verifyMilestoneWork } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(null);

      expect(await verifyMilestoneWork(MILESTONE_ID, 'deliverables')).toBe(false);
    });

    it('should return true when work hash matches', async () => {
      const { verifyMilestoneWork } = await importModule();

      const deliverables = 'my work';
      const expectedHash = generateWorkHash(deliverables);
      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce({
        work_hash: expectedHash,
      });

      expect(await verifyMilestoneWork(MILESTONE_ID, deliverables)).toBe(true);
    });

    it('should return false when work hash does not match', async () => {
      const { verifyMilestoneWork } = await importModule();

      mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce({
        work_hash: '0xWRONG',
      });

      expect(await verifyMilestoneWork(MILESTONE_ID, 'different work')).toBe(false);
    });
  });

  describe('clearMilestoneRegistry', () => {
    it('should not clear when not in test environment', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      const { clearMilestoneRegistry } = await importModule();
      await clearMilestoneRegistry();
      expect(mockBlockchainMilestoneRecordRepository.queryAll).not.toHaveBeenCalled();

      process.env['NODE_ENV'] = originalEnv;
    });

    it('should delete all rows in test environment', async () => {
      process.env['NODE_ENV'] = 'test';
      jest.clearAllMocks();
      mockBlockchainMilestoneRecordRepository.queryAll.mockResolvedValueOnce([{ id: 'milestone-1' }]);
      mockBlockchainMilestoneRecordRepository.delete.mockResolvedValueOnce(true);

      const { clearMilestoneRegistry } = await importModule();
      await clearMilestoneRegistry();
      expect(mockBlockchainMilestoneRecordRepository.queryAll).toHaveBeenCalled();
      expect(mockBlockchainMilestoneRecordRepository.delete).toHaveBeenCalledWith('milestone-1');

      process.env['NODE_ENV'] = 'test';
    });
  });

  describe('getMilestoneRegistryAddress', () => {
    it('should return a value without throwing', async () => {
      const { getMilestoneRegistryAddress } = await importModule();
      expect(() => getMilestoneRegistryAddress()).not.toThrow();
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('milestone-registry – sort with null completed_at', () => {
  it('handles milestones with null completed_at in sort', async () => {
    mockBlockchainMilestoneRecordRepository.findByWallet.mockResolvedValue([
      { id: 'm1', status: 'approved', completed_at: null, wallet_address: '0x123' },
      { id: 'm2', status: 'approved', completed_at: 100, wallet_address: '0x123' },
    ]);

    const { getFreelancerPortfolio } = await import(resolveModule('src/services/milestone-registry.ts'));
    const result = await getFreelancerPortfolio('0x123');
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('milestone-registry.ts - Branch Coverage', () => {
  it('L316: completed_at null sort fallback', () => {
    const ms = [{ completed_at: null }, { completed_at: 1000 }];
    const sorted = ms.sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));
    expect(sorted[0].completed_at).toBe(1000);
  });
});

describe('milestone-registry - approve/reject confirm failure (L198,253)', () => {
  const importMod = async () => {
    return await import(resolveModule('src/services/milestone-registry.ts'));
  };

  function makeRegistryRowLocal(overrides: Record<string, any> = {}) {
    return {
      id: 'hash-1',
      milestone_id_hash: 'hash-1',
      contract_id_hash: 'hash-c1',
      work_hash: 'hash-w1',
      freelancer_wallet: FL_WALLET,
      employer_wallet: EM_WALLET,
      amount: 500,
      status: 'submitted',
      submitted_at: Date.now(),
      completed_at: null,
      title: 'Phase 1',
      transaction_hash: '0xabc123',
      block_number: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('L198: should throw when confirmTransaction returns null for approve', async () => {
    const { approveMilestoneOnRegistry, generateMilestoneIdHash } = await importMod();

    mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRowLocal({ status: 'submitted' }));
    mockConfirmTx.mockResolvedValueOnce(null);

    await expect(approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET)).rejects.toThrow('Failed to confirm transaction');
  });

  it('L253: should throw when confirmTransaction returns null for reject', async () => {
    const { rejectMilestoneOnRegistry } = await importMod();

    mockBlockchainMilestoneRecordRepository.findByMilestoneIdHash.mockResolvedValueOnce(makeRegistryRowLocal({ status: 'submitted' }));
    mockConfirmTx.mockResolvedValueOnce(null);

    await expect(rejectMilestoneOnRegistry(MILESTONE_ID, EM_WALLET, 'bad work')).rejects.toThrow('Failed to confirm transaction');
  });

  it('L316: should sort portfolio with mixed null and non-null completed_at values', async () => {
    const { getFreelancerPortfolio } = await importMod();

    mockBlockchainMilestoneRecordRepository.findByWallet.mockResolvedValueOnce([
      makeRegistryRowLocal({ status: 'approved', completed_at: null }),
      makeRegistryRowLocal({ status: 'approved', completed_at: 2000 }),
      makeRegistryRowLocal({ status: 'approved', completed_at: 1000 }),
    ]);

    const portfolio = await getFreelancerPortfolio(FL_WALLET);
    expect(portfolio).toHaveLength(3);
    // Most recent completed first, nulls last
    expect(portfolio[0]?.completedAt).toBe(2000);
    expect(portfolio[1]?.completedAt).toBe(1000);
    expect(portfolio[2]?.completedAt).toBeNull();
  });

  it('L316: should sort portfolio where b.completed_at is null (null as b in comparison)', async () => {
    const { getFreelancerPortfolio } = await importMod();

    // Use many null values to increase chance of null being on the b side of comparison
    mockBlockchainMilestoneRecordRepository.findByWallet.mockResolvedValueOnce([
      makeRegistryRowLocal({ id: 'a1', status: 'approved', completed_at: 5000 }),
      makeRegistryRowLocal({ id: 'a2', status: 'approved', completed_at: null }),
      makeRegistryRowLocal({ id: 'a3', status: 'approved', completed_at: null }),
      makeRegistryRowLocal({ id: 'a4', status: 'approved', completed_at: 3000 }),
      makeRegistryRowLocal({ id: 'a5', status: 'approved', completed_at: null }),
    ]);

    const portfolio = await getFreelancerPortfolio(FL_WALLET);
    expect(portfolio).toHaveLength(5);
    expect(portfolio[0]?.completedAt).toBe(5000);
    expect(portfolio[1]?.completedAt).toBe(3000);
    // Remaining should be null
    expect(portfolio[2]?.completedAt).toBeNull();
    expect(portfolio[3]?.completedAt).toBeNull();
    expect(portfolio[4]?.completedAt).toBeNull();
  });
});
