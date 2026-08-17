import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { BlockchainTransactionRepository } = await import('../../repositories/blockchain-transaction-repository.js');

describe('BlockchainTransactionRepository', () => {
  let repository: InstanceType<typeof BlockchainTransactionRepository>;
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
    repository = new BlockchainTransactionRepository();
  });

  describe('getTransactionById', () => {
    it('returns a transaction by id', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'tx-1',
        type: 'transfer',
        from_address: '0xabc',
        to_address: '0xdef',
        amount: '1.5',
        data: '0x',
        timestamp: Date.now(),
        status: 'confirmed',
        hash: '0xhash1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.getTransactionById('tx-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('tx-1');
      expect(result!.type).toBe('transfer');
      expect(result!.from_address).toBe('0xabc');
      expect(mockDatabases.getDocument).toHaveBeenCalledWith('freelancexchain', 'blockchain_transactions', 'tx-1');
    });

    it('returns null when not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.getTransactionById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createTransaction', () => {
    it('creates a transaction', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'tx-new',
        type: 'deploy',
        from_address: '0x111',
        to_address: '0x222',
        amount: '0',
        data: '0xdeploy',
        timestamp: Date.now(),
        status: 'pending',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await repository.createTransaction({
        id: 'tx-new',
        type: 'deploy',
        from_address: '0x111',
        to_address: '0x222',
        amount: '0',
        data: '0xdeploy',
        timestamp: Date.now(),
        status: 'pending',
      });
      expect(result).not.toBeNull();
      expect(result.id).toBe('tx-new');
      expect(result.type).toBe('deploy');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });
  });

  describe('updateTransaction', () => {
    it('updates a transaction', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'tx-1',
        type: 'transfer',
        status: 'confirmed',
        hash: '0xhash1',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-02',
      });
      const result = await repository.updateTransaction('tx-1', { status: 'confirmed' });
      expect(result).not.toBeNull();
      expect(result!.status).toBe('confirmed');
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    it('returns null on error', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.updateTransaction('nonexistent', { status: 'confirmed' });
      expect(result).toBeNull();
    });
  });

  describe('findByHash', () => {
    it('returns a transaction by hash', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ $id: 'tx-1', hash: '0xhash1', type: 'transfer', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' }],
        total: 1,
      });
      const result = await repository.findByHash('0xhash1');
      expect(result).not.toBeNull();
      expect(result!.hash).toBe('0xhash1');
      expect(result!.id).toBe('tx-1');
    });

    it('returns null when hash not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.findByHash('0xnonexistent');
      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('DB error'));
      const result = await repository.findByHash('0xhash1');
      expect(result).toBeNull();
    });
  });

  describe('findConfirmable', () => {
    it('returns confirm_at for an existing transaction', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'tx-1',
        confirm_at: 1000,
      });
      const result = await repository.findConfirmable('tx-1');
      expect(result).not.toBeNull();
      expect(result!.confirm_at).toBe(1000);
    });

    it('returns null when transaction not found', async () => {
      mockDatabases.getDocument.mockRejectedValueOnce(new Error('Not found'));
      const result = await repository.findConfirmable('nonexistent');
      expect(result).toBeNull();
    });

    it('returns an empty object when the transaction has no confirm_at', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({ $id: 'tx-2' });
      const result = await repository.findConfirmable('tx-2');
      expect(result).toEqual({});
    });
  });

  describe('getTransactionsByType', () => {
    it('returns paginated transactions by type', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'tx-1', type: 'transfer', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
          { $id: 'tx-2', type: 'transfer', $createdAt: '2025-01-02', $updatedAt: '2025-01-02' },
        ],
        total: 2,
      });
      const result = await repository.getTransactionsByType('transfer');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.id).toBe('tx-1');
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(2);
    });

    it('returns empty result when no transactions', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repository.getTransactionsByType('deploy');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });
  });

  describe('getTransactionsByStatus', () => {
    it('returns transactions by status', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [
          { $id: 'tx-1', status: 'pending', $createdAt: '2025-01-01', $updatedAt: '2025-01-01' },
        ],
        total: 1,
      });
      const result = await repository.getTransactionsByStatus('pending');
      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe('pending');
    });

    it('returns empty array on error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('timeout'));
      const result = await repository.getTransactionsByStatus('pending');
      expect(result).toEqual([]);
    });
  });

  describe('inherited CRUD', () => {
    it('create uses base repository create', async () => {
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        type: 'call',
        $createdAt: '2025-01-01',
        $updatedAt: '2025-01-01',
      });
      const result = await (repository as any).create({ id: 'doc-1', type: 'call' });
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });

    it('getById uses base repository getById', async () => {
      mockDatabases.getDocument.mockResolvedValueOnce({
        $id: 'doc-1',
        type: 'call',
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
        documents: [{ $id: 'doc-1', type: 'call' }],
        total: 1,
      });
      const result = await (repository as any).findOne('type', 'call');
      expect(result).not.toBeNull();
      expect(result.id).toBe('doc-1');
    });
  });
});
