// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHash } from 'crypto';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const hash = (val: string) => '0x' + createHash('sha256').update(val).digest('hex');

const mockSubmitTransaction = jest.fn() as any;
const mockConfirmTransaction = jest.fn() as any;
const mockGenerateWalletAddress = jest.fn().mockReturnValue('0xDisputeRegistry');

const mockBlockchainDisputeRecordRepository = {
  findByDisputeIdHash: jest.fn(),
  createDisputeRecord: jest.fn(),
  updateDisputeRecord: jest.fn(),
  findByWallet: jest.fn(),
  queryAll: jest.fn(),
  delete: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTransaction,
  confirmTransaction: mockConfirmTransaction,
  generateWalletAddress: mockGenerateWalletAddress,
}));

jest.unstable_mockModule(resolveModule('src/repositories/blockchain-dispute-record-repository.ts'), () => ({
  blockchainDisputeRecordRepository: mockBlockchainDisputeRecordRepository,
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
    id: 'dispute-id',
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Dispute Registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitTransaction.mockResolvedValue({ id: 'tx-1' });
    mockConfirmTransaction.mockResolvedValue(makeConfirmed());
    mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValue(null);
    mockBlockchainDisputeRecordRepository.createDisputeRecord.mockResolvedValue({} as any);
    mockBlockchainDisputeRecordRepository.updateDisputeRecord.mockResolvedValue({} as any);
    mockBlockchainDisputeRecordRepository.findByWallet.mockResolvedValue([]);
    mockBlockchainDisputeRecordRepository.queryAll.mockResolvedValue([]);
    mockBlockchainDisputeRecordRepository.delete.mockResolvedValue(true);
  });

  describe('createDisputeOnBlockchain', () => {
    it('creates a dispute record successfully', async () => {
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(null);
      mockBlockchainDisputeRecordRepository.createDisputeRecord.mockResolvedValueOnce(makeDisputeRow());

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
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(makeDisputeRow());

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
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(null);

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
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(row);
      mockBlockchainDisputeRecordRepository.updateDisputeRecord.mockResolvedValueOnce({ ...row, evidence_hash: '0xevidencehash' });

      const { updateDisputeEvidence } = await import('../../services/dispute-registry.js');
      const result = await updateDisputeEvidence('dispute-1', 'evidence data', '0xSubmitter');
      expect(result.record.evidenceHash).toBeTruthy();
      expect(result.receipt.status).toBe('success');
    });

    it('throws Dispute not found when row is missing', async () => {
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(null);

      const { updateDisputeEvidence } = await import('../../services/dispute-registry.js');
      await expect(
        updateDisputeEvidence('nonexistent', 'data', '0xWallet')
      ).rejects.toThrow('Dispute not found');
    });

    it('throws Dispute already resolved when outcome is not pending', async () => {
      const row = makeDisputeRow({ outcome: 'freelancer_favor' });
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(row);

      const { updateDisputeEvidence } = await import('../../services/dispute-registry.js');
      await expect(
        updateDisputeEvidence('dispute-1', 'data', '0xWallet')
      ).rejects.toThrow('Dispute already resolved');
    });

    it('throws if confirmation fails during evidence update', async () => {
      const row = makeDisputeRow();
      mockConfirmTransaction.mockResolvedValue(null);
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(row);

      const { updateDisputeEvidence } = await import('../../services/dispute-registry.js');
      await expect(
        updateDisputeEvidence('dispute-1', 'data', '0xWallet')
      ).rejects.toThrow('Failed to confirm transaction');
    });
  });

  describe('resolveDisputeOnBlockchain', () => {
    it('resolves a dispute in freelancer favor successfully', async () => {
      const row = makeDisputeRow();
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(row);
      mockBlockchainDisputeRecordRepository.updateDisputeRecord.mockResolvedValueOnce({ ...row, outcome: 'freelancer_favor', arbiter_wallet: '0xArbiter' });

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
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(null);

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
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(row);

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
      mockBlockchainDisputeRecordRepository.findByDisputeIdHash.mockResolvedValueOnce(row);

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

  describe('clearDisputeRegistry', () => {
    it('executes delete in test environment', async () => {
      process.env['NODE_ENV'] = 'test';
      mockBlockchainDisputeRecordRepository.queryAll.mockResolvedValueOnce([{ id: 'dispute-1' }]);
      mockBlockchainDisputeRecordRepository.delete.mockResolvedValueOnce(true);

      const { clearDisputeRegistry } = await import('../../services/dispute-registry.js');
      await expect(clearDisputeRegistry()).resolves.toBeUndefined();
    });

    it('does nothing outside test environment', async () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      jest.clearAllMocks();

      const { clearDisputeRegistry } = await import('../../services/dispute-registry.js');
      await clearDisputeRegistry();
      expect(mockBlockchainDisputeRecordRepository.queryAll).not.toHaveBeenCalled();

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
