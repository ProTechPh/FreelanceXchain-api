// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateDocument = jest.fn();
const mockGetDocument = jest.fn();
const mockUpdateDocument = jest.fn();
const mockDeleteDocument = jest.fn();
const mockListDocuments = jest.fn();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: {
    createDocument: mockCreateDocument,
    getDocument: mockGetDocument,
    updateDocument: mockUpdateDocument,
    deleteDocument: mockDeleteDocument,
    listDocuments: mockListDocuments,
  },
  DATABASE_ID: 'freelancexchain',
  Query: {
    equal: jest.fn((...args: any[]) => ({ type: 'equal', args })),
    limit: jest.fn((...args: any[]) => ({ type: 'limit', args })),
    offset: jest.fn((...args: any[]) => ({ type: 'offset', args })),
    orderAsc: jest.fn((...args: any[]) => ({ type: 'orderAsc', args })),
    orderDesc: jest.fn((...args: any[]) => ({ type: 'orderDesc', args })),
  },
  ID: { unique: jest.fn(() => 'unique-id') },
}));

const { TransactionRepository } = await import('../../repositories/transaction-repository.js');

function toAppwriteDoc(data: Record<string, any>) {
  const { id, created_at, updated_at, ...rest } = data;
  return {
    $id: id,
    $createdAt: created_at || '2025-01-01T00:00:00Z',
    $updatedAt: updated_at || '2025-01-01T00:00:00Z',
    ...rest,
  };
}

describe('TransactionRepository', () => {
  let repo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new TransactionRepository();
  });

  describe('create', () => {
    it('should create and return a transaction', async () => {
      const tx = { id: 'tx1', from_user_id: 'u1', to_user_id: 'u2', amount: 100, type: 'payment', status: 'completed' };
      mockCreateDocument.mockResolvedValueOnce(toAppwriteDoc(tx));
      const result = await repo.create({ id: 'tx1', from_user_id: 'u1', to_user_id: 'u2', amount: 100, type: 'payment', status: 'completed' } as any);
      expect(result.id).toBe('tx1');
      expect(result.amount).toBe(100);
    });
  });

  describe('getById', () => {
    it('should return a transaction by id', async () => {
      const tx = { id: 'tx1', amount: 100, type: 'payment' };
      mockGetDocument.mockResolvedValueOnce(toAppwriteDoc(tx));
      const result = await repo.getById('tx1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('tx1');
    });

    it('should return null when not found', async () => {
      mockGetDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.getById('tx1');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update and return a transaction', async () => {
      const tx = { id: 'tx1', status: 'refunded' };
      mockUpdateDocument.mockResolvedValueOnce(toAppwriteDoc(tx));
      const result = await repo.update('tx1', { status: 'refunded' });
      expect(result).not.toBeNull();
      expect(result!.status).toBe('refunded');
    });

    it('should return null when not found', async () => {
      mockUpdateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.update('tx1', { status: 'refunded' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a transaction', async () => {
      mockDeleteDocument.mockResolvedValueOnce({});
      const result = await repo.delete('tx1');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockDeleteDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await repo.delete('tx1');
      expect(result).toBe(false);
    });
  });

  describe('findOne', () => {
    it('should return a transaction by column', async () => {
      const tx = { id: 'tx1', contract_id: 'c1' };
      mockListDocuments.mockResolvedValueOnce({ documents: [toAppwriteDoc(tx)], total: 1 });
      const result = await repo.findOne('contract_id', 'c1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('tx1');
    });

    it('should return null when not found', async () => {
      mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findOne('contract_id', 'c1');
      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should return merged and sorted transactions from both from_user and to_user', async () => {
      const fromTx = [toAppwriteDoc({ id: 'tx1', from_user_id: 'u1', created_at: '2025-01-01T00:00:00Z' })];
      const toTx = [toAppwriteDoc({ id: 'tx2', to_user_id: 'u1', created_at: '2025-06-01T00:00:00Z' })];
      mockListDocuments
        .mockResolvedValueOnce({ documents: fromTx, total: 1 })
        .mockResolvedValueOnce({ documents: toTx, total: 1 });

      const result = await repo.findByUser('u1');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.items[0].id).toBe('tx2');
      expect(result.items[1].id).toBe('tx1');
    });

    it('should apply limit and offset', async () => {
      const txs = [
        toAppwriteDoc({ id: 'tx1', from_user_id: 'u1', created_at: '2025-01-01T00:00:00Z' }),
        toAppwriteDoc({ id: 'tx2', from_user_id: 'u1', created_at: '2025-02-01T00:00:00Z' }),
        toAppwriteDoc({ id: 'tx3', from_user_id: 'u1', created_at: '2025-03-01T00:00:00Z' }),
        toAppwriteDoc({ id: 'tx4', from_user_id: 'u1', created_at: '2025-04-01T00:00:00Z' }),
      ];
      mockListDocuments
        .mockResolvedValueOnce({ documents: txs, total: 4 })
        .mockResolvedValueOnce({ documents: [], total: 0 });

      const result = await repo.findByUser('u1', { limit: 2, offset: 1 });
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it('should return empty result on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByUser('u1');
      expect(result.items).toEqual([]);
    });
  });

  describe('findByContract', () => {
    it('should return transactions for a contract', async () => {
      const txs = [
        toAppwriteDoc({ id: 'tx1', contract_id: 'c1' }),
        toAppwriteDoc({ id: 'tx2', contract_id: 'c1' }),
      ];
      mockListDocuments.mockResolvedValueOnce({ documents: txs, total: 2 });
      const result = await repo.findByContract('c1');
      expect(result).toHaveLength(2);
      expect(result[0].contract_id).toBe('c1');
    });

    it('should return empty array on error', async () => {
      mockListDocuments.mockRejectedValueOnce(new Error('db error'));
      const result = await repo.findByContract('c1');
      expect(result).toEqual([]);
    });
  });

  describe('findByUserCount', () => {
    it('should return the total count of transactions for a user', async () => {
      mockListDocuments
        .mockResolvedValueOnce({ documents: [], total: 5 })
        .mockResolvedValueOnce({ documents: [], total: 3 });
      const result = await repo.findByUserCount('u1');
      expect(result).toBe(8);
    });

    it('should return 0 when no transactions exist', async () => {
      mockListDocuments
        .mockResolvedValueOnce({ documents: [], total: 0 })
        .mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await repo.findByUserCount('u1');
      expect(result).toBe(0);
    });
  });
});
