import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockSubmitTx = jest.fn() as jest.Mock<any>;
const mockConfirmTx = jest.fn() as jest.Mock<any>;
const mockPoolQuery = jest.fn() as jest.Mock<any>;

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

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockPoolQuery, connect: jest.fn(), on: jest.fn() },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: mockPoolQuery,
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
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
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
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

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ milestone_id_hash: 'existing' }],
        rowCount: 1,
      });

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

      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
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

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

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

      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET)).rejects.toThrow('Milestone not found');
    });

    it('should throw when milestone status is invalid', async () => {
      const { approveMilestoneOnRegistry } = await importModule();

      mockPoolQuery.mockResolvedValueOnce({
        rows: [makeRegistryRow({ status: 'approved' })],
        rowCount: 1,
      });

      await expect(approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET)).rejects.toThrow('Invalid milestone status');
    });

    it('should approve successfully when status is submitted', async () => {
      const { approveMilestoneOnRegistry } = await importModule();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeRegistryRow({ status: 'submitted' })], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET);
      expect(result.record.status).toBe('approved');
      expect(result.receipt.status).toBe('success');
    });

    it('should approve successfully when status is disputed', async () => {
      const { approveMilestoneOnRegistry } = await importModule();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeRegistryRow({ status: 'disputed' })], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await approveMilestoneOnRegistry(MILESTONE_ID, EM_WALLET);
      expect(result.record.status).toBe('approved');
    });
  });

  describe('rejectMilestoneOnRegistry', () => {
    it('should throw when milestone not found', async () => {
      const { rejectMilestoneOnRegistry } = await importModule();

      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(rejectMilestoneOnRegistry(MILESTONE_ID, EM_WALLET, 'bad work')).rejects.toThrow('Milestone not found');
    });

    it('should throw when milestone status is not submitted', async () => {
      const { rejectMilestoneOnRegistry } = await importModule();

      mockPoolQuery.mockResolvedValueOnce({
        rows: [makeRegistryRow({ status: 'approved' })],
        rowCount: 1,
      });

      await expect(rejectMilestoneOnRegistry(MILESTONE_ID, EM_WALLET, 'reason')).rejects.toThrow('Invalid milestone status');
    });

    it('should reject successfully', async () => {
      const { rejectMilestoneOnRegistry } = await importModule();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeRegistryRow({ status: 'submitted' })], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await rejectMilestoneOnRegistry(MILESTONE_ID, EM_WALLET, 'Not complete');
      expect(result.record.status).toBe('rejected');
      expect(result.receipt.status).toBe('success');
    });
  });

  describe('getMilestoneFromRegistry', () => {
    it('should return null when not found', async () => {
      const { getMilestoneFromRegistry } = await importModule();

      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getMilestoneFromRegistry(MILESTONE_ID);
      expect(result).toBeNull();
    });

    it('should return the milestone record', async () => {
      const { getMilestoneFromRegistry } = await importModule();

      mockPoolQuery.mockResolvedValueOnce({
        rows: [makeRegistryRow()],
        rowCount: 1,
      });

      const result = await getMilestoneFromRegistry(MILESTONE_ID);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('submitted');
      expect(result?.amount).toBe(500);
    });
  });

  describe('getFreelancerStatsFromRegistry', () => {
    it('should return zeroed stats when no milestones exist', async () => {
      const { getFreelancerStatsFromRegistry } = await importModule();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const stats = await getFreelancerStatsFromRegistry(FL_WALLET);
      expect(stats.completedCount).toBe(0);
      expect(stats.totalEarned).toBe(0);
    });

    it('should calculate total earned from approved milestones', async () => {
      const { getFreelancerStatsFromRegistry } = await importModule();

      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ amount: 100 }, { amount: 250 }], rowCount: 2 });

      const stats = await getFreelancerStatsFromRegistry(FL_WALLET);
      expect(stats.totalMilestones).toBe(5);
      expect(stats.completedCount).toBe(2);
      expect(stats.totalEarned).toBe(350);
    });
  });

  describe('getFreelancerPortfolio', () => {
    it('should return empty array when no approved milestones', async () => {
      const { getFreelancerPortfolio } = await importModule();

      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const portfolio = await getFreelancerPortfolio(FL_WALLET);
      expect(portfolio).toHaveLength(0);
    });

    it('should return mapped records', async () => {
      const { getFreelancerPortfolio } = await importModule();

      mockPoolQuery.mockResolvedValueOnce({
        rows: [makeRegistryRow({ status: 'approved', completed_at: Date.now() })],
        rowCount: 1,
      });

      const portfolio = await getFreelancerPortfolio(FL_WALLET);
      expect(portfolio).toHaveLength(1);
      expect(portfolio[0]?.status).toBe('approved');
    });
  });

  describe('verifyMilestoneWork', () => {
    it('should return false when milestone not found', async () => {
      const { verifyMilestoneWork } = await importModule();

      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      expect(await verifyMilestoneWork(MILESTONE_ID, 'deliverables')).toBe(false);
    });

    it('should return true when work hash matches', async () => {
      const { verifyMilestoneWork } = await importModule();

      const deliverables = 'my work';
      const expectedHash = generateWorkHash(deliverables);
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ work_hash: expectedHash }],
        rowCount: 1,
      });

      expect(await verifyMilestoneWork(MILESTONE_ID, deliverables)).toBe(true);
    });

    it('should return false when work hash does not match', async () => {
      const { verifyMilestoneWork } = await importModule();

      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ work_hash: '0xWRONG' }],
        rowCount: 1,
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
      expect(mockPoolQuery).not.toHaveBeenCalled();

      process.env['NODE_ENV'] = originalEnv;
    });

    it('should delete all rows in test environment', async () => {
      process.env['NODE_ENV'] = 'test';
      mockPoolQuery.mockClear();
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { clearMilestoneRegistry } = await importModule();
      await clearMilestoneRegistry();
      expect(mockPoolQuery).toHaveBeenCalledWith(
        "DELETE FROM blockchain_milestones WHERE milestone_id_hash != ''"
      );

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