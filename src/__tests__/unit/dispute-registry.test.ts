import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHash } from 'crypto';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const hash = (val: string) => '0x' + createHash('sha256').update(val).digest('hex');

const mockSubmitTransaction = jest.fn() as any;
const mockConfirmTransaction = jest.fn() as any;
const mockGenerateWalletAddress = jest.fn().mockReturnValue('0xDisputeRegistry');

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTransaction,
  confirmTransaction: mockConfirmTransaction,
  generateWalletAddress: mockGenerateWalletAddress,
}));

function makeConfirmed() {
  return {
    id: 'tx-1',
    hash: '0xabc123',
    blockNumber: 42,
    gasUsed: BigInt(21000),
    status: 'confirmed' as const,
    timestamp: Date.now(),
  };
}

function makeDisputeRow(overrides: Record<string, any> = {}) {
  return {
    dispute_id_hash: hash('dispute-1'),
    contract_id_hash: hash('contract-1'),
    milestone_id_hash: hash('milestone-1'),
    evidence_hash: null,
    initiator_wallet: '0xInitiator',
    freelancer_wallet: '0xFreelancer',
    employer_wallet: '0xEmployer',
    arbiter_wallet: null,
    amount: 1000,
    outcome: 'pending',
    reasoning: null,
    created_at_ts: Date.now(),
    resolved_at: null,
    transaction_hash: '0xabc',
    block_number: 1,
    ...overrides,
  };
}

describe('Dispute Registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitTransaction.mockResolvedValue({ id: 'tx-1' });
    mockConfirmTransaction.mockResolvedValue(makeConfirmed());
    (global as any).mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('createDisputeOnBlockchain', () => {
    it('creates a dispute record successfully', async () => {
      (global as any).mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const { createDisputeOnBlockchain } = await import('../../services/dispute-registry.js');
      const result = await createDisputeOnBlockchain({
        disputeId: 'dispute-new',
        contractId: 'contract-1',
        milestoneId: 'milestone-1',
        initiatorWallet: '0xInitiator',
        freelancerWallet: '0xFreelancer',
        employerWallet: '0xEmployer',
        amount: 1000,
      });
      expect(result.record.outcome).toBe('pending');
      expect(result.receipt.status).toBe('success');
    });

    it('throws if dispute already exists on blockchain', async () => {
      (global as any).mockPool.query.mockResolvedValueOnce({
        rows: [{ dispute_id_hash: hash('dispute-1') }],
        rowCount: 1,
      });

      const { createDisputeOnBlockchain } = await import('../../services/dispute-registry.js');
      await expect(
        createDisputeOnBlockchain({
          disputeId: 'dispute-1',
          contractId: 'contract-1',
          milestoneId: 'milestone-1',
          initiatorWallet: '0xInitiator',
          freelancerWallet: '0xFreelancer',
          employerWallet: '0xEmployer',
          amount: 1000,
        })
      ).rejects.toThrow('Dispute already exists on blockchain');
    });

    it('throws if transaction confirmation returns null', async () => {
      mockConfirmTransaction.mockResolvedValue(null);
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { createDisputeOnBlockchain } = await import('../../services/dispute-registry.js');
      await expect(
        createDisputeOnBlockchain({
          disputeId: 'dispute-unique',
          contractId: 'c1',
          milestoneId: 'm1',
          initiatorWallet: '0xI',
          freelancerWallet: '0xF',
          employerWallet: '0xE',
          amount: 500,
        })
      ).rejects.toThrow('Failed to confirm transaction');
    });
  });

  describe('updateDisputeEvidence', () => {
    it('updates evidence hash successfully', async () => {
      const row = makeDisputeRow();
      (global as any).mockPool.query
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const { updateDisputeEvidence } = await import('../../services/dispute-registry.js');
      const result = await updateDisputeEvidence('dispute-1', 'evidence data', '0xSubmitter');
      expect(result.record.evidenceHash).toBeTruthy();
      expect(result.receipt.status).toBe('success');
    });

    it('throws Dispute not found when row is missing', async () => {
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { updateDisputeEvidence } = await import('../../services/dispute-registry.js');
      await expect(
        updateDisputeEvidence('nonexistent', 'data', '0xWallet')
      ).rejects.toThrow('Dispute not found');
    });

    it('throws Dispute already resolved when outcome is not pending', async () => {
      const row = makeDisputeRow({ outcome: 'freelancer_favor' });
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const { updateDisputeEvidence } = await import('../../services/dispute-registry.js');
      await expect(
        updateDisputeEvidence('dispute-1', 'data', '0xWallet')
      ).rejects.toThrow('Dispute already resolved');
    });

    it('throws if confirmation fails during evidence update', async () => {
      const row = makeDisputeRow();
      mockConfirmTransaction.mockResolvedValue(null);
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const { updateDisputeEvidence } = await import('../../services/dispute-registry.js');
      await expect(
        updateDisputeEvidence('dispute-1', 'data', '0xWallet')
      ).rejects.toThrow('Failed to confirm transaction');
    });
  });

  describe('resolveDisputeOnBlockchain', () => {
    it('resolves a dispute in freelancer favor successfully', async () => {
      const row = makeDisputeRow();
      (global as any).mockPool.query
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const { resolveDisputeOnBlockchain } = await import('../../services/dispute-registry.js');
      const result = await resolveDisputeOnBlockchain({
        disputeId: 'dispute-1',
        outcome: 'freelancer_favor',
        reasoning: 'Evidence supports freelancer',
        arbiterWallet: '0xArbiter',
      });
      expect(result.record.outcome).toBe('freelancer_favor');
      expect(result.record.arbiterWallet).toBe('0xArbiter');
      expect(result.receipt.status).toBe('success');
    });

    it('throws Dispute not found when row is missing', async () => {
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { resolveDisputeOnBlockchain } = await import('../../services/dispute-registry.js');
      await expect(
        resolveDisputeOnBlockchain({
          disputeId: 'nonexistent',
          outcome: 'employer_favor',
          reasoning: 'reason',
          arbiterWallet: '0xArbiter',
        })
      ).rejects.toThrow('Dispute not found');
    });

    it('throws Dispute already resolved when not pending', async () => {
      const row = makeDisputeRow({ outcome: 'employer_favor' });
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const { resolveDisputeOnBlockchain } = await import('../../services/dispute-registry.js');
      await expect(
        resolveDisputeOnBlockchain({
          disputeId: 'dispute-1',
          outcome: 'freelancer_favor',
          reasoning: 'reason',
          arbiterWallet: '0xArbiter',
        })
      ).rejects.toThrow('Dispute already resolved');
    });

    it('throws if transaction confirmation fails during resolve', async () => {
      const row = makeDisputeRow();
      mockConfirmTransaction.mockResolvedValue(null);
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const { resolveDisputeOnBlockchain } = await import('../../services/dispute-registry.js');
      await expect(
        resolveDisputeOnBlockchain({
          disputeId: 'dispute-1',
          outcome: 'split',
          reasoning: 'reason',
          arbiterWallet: '0xArbiter',
        })
      ).rejects.toThrow('Failed to confirm transaction');
    });
  });

  describe('getDisputeFromBlockchain', () => {
    it('returns dispute record when found', async () => {
      const row = makeDisputeRow();
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const { getDisputeFromBlockchain } = await import('../../services/dispute-registry.js');
      const result = await getDisputeFromBlockchain('dispute-1');
      expect(result).not.toBeNull();
      expect(result?.outcome).toBe('pending');
      expect(result?.initiatorWallet).toBe('0xInitiator');
    });

    it('returns null when not found', async () => {
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { getDisputeFromBlockchain } = await import('../../services/dispute-registry.js');
      const result = await getDisputeFromBlockchain('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getUserDisputeStats', () => {
    it('correctly counts won/lost stats for a wallet', async () => {
      const allDisputeRows = [
        { outcome: 'freelancer_favor', freelancer_wallet: '0xUser', employer_wallet: '0xOther' },
        { outcome: 'freelancer_favor', freelancer_wallet: '0xOther', employer_wallet: '0xUser' },
        { outcome: 'employer_favor', freelancer_wallet: '0xOther', employer_wallet: '0xUser' },
        { outcome: 'employer_favor', freelancer_wallet: '0xUser', employer_wallet: '0xOther' },
      ];

      (global as any).mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '4' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: allDisputeRows, rowCount: 4 });

      const { getUserDisputeStats } = await import('../../services/dispute-registry.js');
      const stats = await getUserDisputeStats('0xUser');
      expect(stats.won).toBe(2);
      expect(stats.lost).toBe(2);
      expect(stats.total).toBe(4);
    });

    it('returns zero stats when wallet has no disputes', async () => {
      (global as any).mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { getUserDisputeStats } = await import('../../services/dispute-registry.js');
      const stats = await getUserDisputeStats('0xNoDisputes');
      expect(stats.total).toBe(0);
      expect(stats.won).toBe(0);
      expect(stats.lost).toBe(0);
    });

    it('handles null resolved disputes gracefully', async () => {
      (global as any).mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { getUserDisputeStats } = await import('../../services/dispute-registry.js');
      const stats = await getUserDisputeStats('0xUser');
      expect(stats.won).toBe(0);
      expect(stats.lost).toBe(0);
      expect(stats.total).toBe(1);
    });
  });

  describe('getUserDisputes', () => {
    it('returns mapped disputes for a wallet', async () => {
      const row = makeDisputeRow();
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });

      const { getUserDisputes } = await import('../../services/dispute-registry.js');
      const disputes = await getUserDisputes('0xFreelancer');
      expect(Array.isArray(disputes)).toBe(true);
      expect(disputes[0]?.outcome).toBe('pending');
    });

    it('returns empty array when no disputes found', async () => {
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { getUserDisputes } = await import('../../services/dispute-registry.js');
      const disputes = await getUserDisputes('0xUser');
      expect(disputes).toEqual([]);
    });
  });

  describe('clearDisputeRegistry', () => {
    it('executes delete in test environment', async () => {
      process.env['NODE_ENV'] = 'test';
      (global as any).mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const { clearDisputeRegistry } = await import('../../services/dispute-registry.js');
      await expect(clearDisputeRegistry()).resolves.toBeUndefined();
    });

    it('does nothing outside test environment', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      (global as any).mockPool.query.mockClear();

      const { clearDisputeRegistry } = await import('../../services/dispute-registry.js');
      await clearDisputeRegistry();
      expect((global as any).mockPool.query).not.toHaveBeenCalled();

      process.env['NODE_ENV'] = originalEnv;
    });
  });

  describe('getDisputeRegistryAddress', () => {
    it('returns the registry wallet address string', async () => {
      const { getDisputeRegistryAddress } = await import('../../services/dispute-registry.js');
      const address = getDisputeRegistryAddress();
      expect(typeof address).toBe('string');
      expect(address.length).toBeGreaterThan(0);
    });
  });
});