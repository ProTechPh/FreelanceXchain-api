import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { BlockchainDisputeRecordRepository } = await import('../../repositories/blockchain-dispute-record-repository.js');

describe('BlockchainDisputeRecordRepository', () => {
  let repository: InstanceType<typeof BlockchainDisputeRecordRepository>;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repository = new BlockchainDisputeRecordRepository();
  });

  describe('getDisputeRecordById', () => {
    it('returns a dispute record by id', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'dr-1',
        dispute_id_hash: '0xdisp',
        contract_id_hash: '0xcontract',
        milestone_id_hash: '0xmilestone',
        initiator_wallet: '0xinit',
        freelancer_wallet: '0xfrl',
        employer_wallet: '0xemp',
        amount: 500,
        outcome: 'resolved',
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 200,
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.getDisputeRecordById('dr-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('dr-1');
      expect(result!.dispute_id_hash).toBe('0xdisp');
      expect(mockDatabases.getDocument).toHaveBeenCalledWith('freelancexchain', 'blockchain_dispute_records', 'dr-1');
    });

    it('returns null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.getDisputeRecordById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createDisputeRecord', () => {
    it('creates a dispute record', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'dr-new',
        dispute_id_hash: '0xdisp',
        contract_id_hash: '0xcontract',
        milestone_id_hash: '0xmilestone',
        initiator_wallet: '0xinit',
        freelancer_wallet: '0xfrl',
        employer_wallet: '0xemp',
        amount: 200,
        outcome: 'pending',
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 150,
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.createDisputeRecord({
        id: 'dr-new',
        dispute_id_hash: '0xdisp',
        contract_id_hash: '0xcontract',
        milestone_id_hash: '0xmilestone',
        initiator_wallet: '0xinit',
        freelancer_wallet: '0xfrl',
        employer_wallet: '0xemp',
        amount: 200,
        outcome: 'pending',
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 150,
      });
      expect(result).not.toBeNull();
      expect(result.id).toBe('dr-new');
      expect(result.outcome).toBe('pending');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });
  });

  describe('updateDisputeRecord', () => {
    it('updates a dispute record', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'dr-1',
        outcome: 'resolved',
        resolved_at: Date.now(),
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-02',
      });
      const result = await repository.updateDisputeRecord('dr-1', { outcome: 'resolved' });
      expect(result).not.toBeNull();
      expect(result!.outcome).toBe('resolved');
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    it('returns null on error', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.updateDisputeRecord('nonexistent', { outcome: 'closed' });
      expect(result).toBeNull();
    });
  });

  describe('findByDisputeIdHash', () => {
    it('returns a dispute record by dispute_id_hash', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'dr-1', dispute_id_hash: '0xdisp', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
        total: 1,
      });
      const result = await repository.findByDisputeIdHash('0xdisp');
      expect(result).not.toBeNull();
      expect(result!.dispute_id_hash).toBe('0xdisp');
      expect(result!.id).toBe('dr-1');
    });

    it('returns null when hash not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByDisputeIdHash('0xnonexistent');
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repository.findByDisputeIdHash('0xdisp');
      expect(result).toBeNull();
    });
  });

  describe('findByWallet', () => {
    it('returns dispute records where wallet is freelancer', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'dr-1', freelancer_wallet: '0xwallet', created_at_ts: 200, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
          total: 1,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByWallet('0xwallet');
      expect(result).toHaveLength(1);
      expect(result[0]!.freelancer_wallet).toBe('0xwallet');
    });

    it('returns dispute records where wallet is employer', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({
          documents: [{ $id: 'dr-2', employer_wallet: '0xwallet', created_at_ts: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
          total: 1,
        });
      const result = await repository.findByWallet('0xwallet');
      expect(result).toHaveLength(1);
      expect(result[0]!.employer_wallet).toBe('0xwallet');
    });

    it('deduplicates dispute records appearing in both queries', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'dr-1', freelancer_wallet: '0xwallet', created_at_ts: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
          total: 1,
        })
        .mockResolvedValueOnce({
          documents: [{ $id: 'dr-1', freelancer_wallet: '0xwallet', employer_wallet: '0xwallet', created_at_ts: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
          total: 1,
        });
      const result = await repository.findByWallet('0xwallet');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('dr-1');
    });

    it('sorts results by created_at_ts descending', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'dr-1', freelancer_wallet: '0xwallet', created_at_ts: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
            { $id: 'dr-2', freelancer_wallet: '0xwallet', created_at_ts: 300, $createdAt: '2025-01-02', $updatedAt: '2025-01-02' },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByWallet('0xwallet');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('dr-2');
      expect(result[1]!.id).toBe('dr-1');
    });

    it('returns empty array when no dispute records', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByWallet('0xnowallet');
      expect(result).toEqual([]);
    });
  });

  describe('getDisputesByOutcome', () => {
    it('returns paginated disputes by outcome', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'dr-1', outcome: 'resolved', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
        total: 1,
      });
      const result = await repository.getDisputesByOutcome('resolved');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.outcome).toBe('resolved');
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(1);
    });

    it('returns empty result when no disputes', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.getDisputesByOutcome('pending');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('inherited CRUD', () => {
    it('create uses base repository create', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        dispute_id_hash: '0xdisp',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await (repository as any).create({ id: 'doc-1', dispute_id_hash: '0xdisp' });
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });

    it('getById uses base repository getById', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await (repository as any).getById('doc-1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
    });

    it('delete uses base repository delete', async () => {
      mockDatabases.deleteDocument.mockResolvedValueOnce({});
      const result = await (repository as any).delete('doc-1');
      expect(result).toBe(true);
      expect(mockDatabases.deleteDocument).toHaveBeenCalled();
    });

    it('findOne uses base repository findOne', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'doc-1', outcome: 'resolved' }],
        total: 1,
      });
      const result = await (repository as any).findOne('outcome', 'resolved');
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
    });
  });
});
