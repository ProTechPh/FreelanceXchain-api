import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { BlockchainMilestoneRecordRepository } = await import('../../repositories/blockchain-milestone-record-repository.js');

describe('BlockchainMilestoneRecordRepository', () => {
  let repository: InstanceType<typeof BlockchainMilestoneRecordRepository>;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repository = new BlockchainMilestoneRecordRepository();
  });

  describe('getMilestoneRecordById', () => {
    it('returns a milestone record by id', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'ms-1',
        milestone_id_hash: '0xms',
        contract_id_hash: '0xcontract',
        work_hash: '0xwork',
        freelancer_wallet: '0xfrl',
        employer_wallet: '0xemp',
        amount: 300,
        status: 'completed',
        submitted_at: Date.now(),
        title: 'Design Phase',
        transaction_hash: '0xtx',
        block_number: 300,
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.getMilestoneRecordById('ms-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ms-1');
      expect(result!.milestone_id_hash).toBe('0xms');
      expect(result!.title).toBe('Design Phase');
      expect(mockDatabases.getDocument).toHaveBeenCalledWith('freelancexchain', 'blockchain_milestones', 'ms-1');
    });

    it('returns null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.getMilestoneRecordById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createMilestoneRecord', () => {
    it('creates a milestone record', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'ms-new',
        milestone_id_hash: '0xms',
        contract_id_hash: '0xcontract',
        work_hash: '0xwork',
        freelancer_wallet: '0xfrl',
        employer_wallet: '0xemp',
        amount: 500,
        status: 'pending',
        submitted_at: Date.now(),
        title: 'Development Phase',
        transaction_hash: '0xtx',
        block_number: 250,
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.createMilestoneRecord({
        id: 'ms-new',
        milestone_id_hash: '0xms',
        contract_id_hash: '0xcontract',
        work_hash: '0xwork',
        freelancer_wallet: '0xfrl',
        employer_wallet: '0xemp',
        amount: 500,
        status: 'pending',
        submitted_at: Date.now(),
        title: 'Development Phase',
        transaction_hash: '0xtx',
        block_number: 250,
      });
      expect(result).not.toBeNull();
      expect(result.id).toBe('ms-new');
      expect(result.title).toBe('Development Phase');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });
  });

  describe('updateMilestoneRecord', () => {
    it('updates a milestone record', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'ms-1',
        status: 'approved',
        completed_at: Date.now(),
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-02',
      });
      const result = await repository.updateMilestoneRecord('ms-1', { status: 'approved' });
      expect(result).not.toBeNull();
      expect(result!.status).toBe('approved');
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    it('returns null on error', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.updateMilestoneRecord('nonexistent', { status: 'done' });
      expect(result).toBeNull();
    });
  });

  describe('findByMilestoneIdHash', () => {
    it('returns a milestone record by milestone_id_hash', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'ms-1', milestone_id_hash: '0xms', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
        total: 1,
      });
      const result = await repository.findByMilestoneIdHash('0xms');
      expect(result).not.toBeNull();
      expect(result!.milestone_id_hash).toBe('0xms');
      expect(result!.id).toBe('ms-1');
    });

    it('returns null when hash not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByMilestoneIdHash('0xnonexistent');
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repository.findByMilestoneIdHash('0xms');
      expect(result).toBeNull();
    });
  });

  describe('findByWallet', () => {
    it('returns milestone records by freelancer wallet', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'ms-1', freelancer_wallet: '0xwallet', submitted_at: 200, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
          { $id: 'ms-2', freelancer_wallet: '0xwallet', submitted_at: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
        total: 2,
      });
      const result = await repository.findByWallet('0xwallet');
      expect(result).toHaveLength(2);
      expect(result[0]!.freelancer_wallet).toBe('0xwallet');
    });

    it('returns empty array when no milestones', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByWallet('0xnowallet');
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('timeout'));
      const result = await repository.findByWallet('0xwallet');
      expect(result).toEqual([]);
    });
  });

  describe('getMilestonesByStatus', () => {
    it('returns paginated milestones by status', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'ms-1', status: 'completed', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
        total: 1,
      });
      const result = await repository.getMilestonesByStatus('completed');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('completed');
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(1);
    });

    it('returns empty result when no milestones', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.getMilestonesByStatus('pending');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getMilestonesByContract', () => {
    it('returns milestones by contract_id_hash', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'ms-1', contract_id_hash: '0xcontract', submitted_at: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
          { $id: 'ms-2', contract_id_hash: '0xcontract', submitted_at: 200, $createdAt: '2025-01-02', $updatedAt: '2025-01-02' },
        ],
        total: 2,
      });
      const result = await repository.getMilestonesByContract('0xcontract');
      expect(result).toHaveLength(2);
      expect(result[0]!.contract_id_hash).toBe('0xcontract');
    });

    it('returns empty array when no milestones', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.getMilestonesByContract('0xnocontract');
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('timeout'));
      const result = await repository.getMilestonesByContract('0xcontract');
      expect(result).toEqual([]);
    });
  });

  describe('inherited CRUD', () => {
    it('create uses base repository create', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        title: 'Test',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await (repository as any).create({ id: 'doc-1', title: 'Test' });
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
        documents: [{ $id: 'doc-1', status: 'completed' }],
        total: 1,
      });
      const result = await (repository as any).findOne('status', 'completed');
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
    });
  });
});
