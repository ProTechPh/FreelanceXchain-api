import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { BlockchainAgreementRepository } = await import('../../repositories/blockchain-agreement-repository.js');

describe('BlockchainAgreementRepository', () => {
  let repository: InstanceType<typeof BlockchainAgreementRepository>;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repository = new BlockchainAgreementRepository();
  });

  describe('getAgreementById', () => {
    it('returns an agreement by id', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'agr-1',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xemp',
        freelancer_wallet: '0xfrl',
        total_amount: 1000,
        milestone_count: 3,
        status: 'active',
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 100,
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.getAgreementById('agr-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('agr-1');
      expect(result!.contract_id_hash).toBe('0xhash');
      expect(mockDatabases.getDocument).toHaveBeenCalledWith('freelancexchain', 'blockchain_agreements', 'agr-1');
    });

    it('returns null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.getAgreementById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createAgreement', () => {
    it('creates an agreement', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'agr-new',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xemp',
        freelancer_wallet: '0xfrl',
        total_amount: 500,
        milestone_count: 2,
        status: 'pending',
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 50,
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.createAgreement({
        id: 'agr-new',
        contract_id_hash: '0xhash',
        terms_hash: '0xterms',
        employer_wallet: '0xemp',
        freelancer_wallet: '0xfrl',
        total_amount: 500,
        milestone_count: 2,
        status: 'pending',
        created_at_ts: Date.now(),
        transaction_hash: '0xtx',
        block_number: 50,
      });
      expect(result).not.toBeNull();
      expect(result.id).toBe('agr-new');
      expect(result.total_amount).toBe(500);
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });
  });

  describe('updateAgreement', () => {
    it('updates an agreement', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'agr-1',
        status: 'completed',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-02',
      });
      const result = await repository.updateAgreement('agr-1', { status: 'completed' });
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    it('returns null on error', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.updateAgreement('nonexistent', { status: 'done' });
      expect(result).toBeNull();
    });
  });

  describe('findByContractIdHash', () => {
    it('returns an agreement by contract_id_hash', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'agr-1', contract_id_hash: '0xhash', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
        total: 1,
      });
      const result = await repository.findByContractIdHash('0xhash');
      expect(result).not.toBeNull();
      expect(result!.contract_id_hash).toBe('0xhash');
      expect(result!.id).toBe('agr-1');
    });

    it('returns null when hash not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByContractIdHash('0xnonexistent');
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repository.findByContractIdHash('0xhash');
      expect(result).toBeNull();
    });
  });

  describe('findByWallet', () => {
    it('returns agreements where wallet is employer', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'agr-1', employer_wallet: '0xwallet', created_at_ts: 200, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
          total: 1,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByWallet('0xwallet');
      expect(result).toHaveLength(1);
      expect(result[0]!.employer_wallet).toBe('0xwallet');
    });

    it('returns agreements where wallet is freelancer', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({
          documents: [{ $id: 'agr-2', freelancer_wallet: '0xwallet', created_at_ts: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
          total: 1,
        });
      const result = await repository.findByWallet('0xwallet');
      expect(result).toHaveLength(1);
      expect(result[0]!.freelancer_wallet).toBe('0xwallet');
    });

    it('deduplicates agreements appearing in both employer and freelancer queries', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [{ $id: 'agr-1', employer_wallet: '0xwallet', created_at_ts: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
          total: 1,
        })
        .mockResolvedValueOnce({
          documents: [{ $id: 'agr-1', employer_wallet: '0xwallet', freelancer_wallet: '0xwallet', created_at_ts: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
          total: 1,
        });
      const result = await repository.findByWallet('0xwallet');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('agr-1');
    });

    it('sorts results by created_at_ts descending', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({
          documents: [
            { $id: 'agr-1', employer_wallet: '0xwallet', created_at_ts: 100, $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
            { $id: 'agr-2', employer_wallet: '0xwallet', created_at_ts: 300, $createdAt: '2025-01-02', $updatedAt: '2025-01-02' },
          ],
          total: 2,
        })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByWallet('0xwallet');
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('agr-2');
      expect(result[1]!.id).toBe('agr-1');
    });

    it('returns empty array when no agreements', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByWallet('0xnowallet');
      expect(result).toEqual([]);
    });
  });

  describe('getAgreementsByStatus', () => {
    it('returns paginated agreements by status', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'agr-1', status: 'active', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
        total: 1,
      });
      const result = await repository.getAgreementsByStatus('active');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('active');
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(1);
    });

    it('returns empty result when no agreements', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.getAgreementsByStatus('pending');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('inherited CRUD', () => {
    it('create uses base repository create', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        contract_id_hash: '0xhash',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await (repository as any).create({ id: 'doc-1', contract_id_hash: '0xhash' });
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
        documents: [{ $id: 'doc-1', status: 'active' }],
        total: 1,
      });
      const result = await (repository as any).findOne('status', 'active');
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
    });
  });
});
