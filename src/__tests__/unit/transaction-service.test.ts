// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Transaction Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/transaction-service.js');
  };

  describe('getUserTransactions', () => {
    it('should return paginated transactions for user', async () => {
      const { getUserTransactions } = await importModule();

      const transactions = [
        { id: 'tx-1', from_user_id: 'user-1', to_user_id: 'user-2', amount: 100, type: 'payment', status: 'completed', created_at: '2025-01-01' },
        { id: 'tx-2', from_user_id: 'user-2', to_user_id: 'user-1', amount: 50, type: 'refund', status: 'completed', created_at: '2025-01-02' },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: transactions, rowCount: 2 })
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });

      const result = await getUserTransactions('user-1');

      expect(result.success).toBe(true);
      expect(result.data.items).toEqual(transactions);
      expect(result.data.total).toBe(2);
      expect(result.data.hasMore).toBe(false);
    });

    it('should apply type filter', async () => {
      const { getUserTransactions } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const result = await getUserTransactions('user-1', { type: 'payment' });

      expect(result.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should apply status filter', async () => {
      const { getUserTransactions } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const result = await getUserTransactions('user-1', { status: 'completed' });

      expect(result.success).toBe(true);
    });

    it('should apply date range filters', async () => {
      const { getUserTransactions } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const result = await getUserTransactions('user-1', {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      expect(result.success).toBe(true);
    });

    it('should apply all filters together', async () => {
      const { getUserTransactions } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const result = await getUserTransactions('user-1', {
        type: 'payment',
        status: 'completed',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        page: 2,
        limit: 10,
      });

      expect(result.success).toBe(true);
    });

    it('should handle pagination correctly', async () => {
      const { getUserTransactions } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '25' }], rowCount: 1 });

      const result = await getUserTransactions('user-1', { page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.hasMore).toBe(true);
      expect(result.data.total).toBe(25);
    });

    it('should handle database errors', async () => {
      const { getUserTransactions } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserTransactions('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getTransactionById', () => {
    it('should return transaction when found and user is authorized', async () => {
      const { getTransactionById } = await importModule();

      const transaction = { id: 'tx-1', from_user_id: 'user-1', to_user_id: 'user-2', amount: 100 };
      mockPool.query.mockResolvedValueOnce({ rows: [transaction], rowCount: 1 });

      const result = await getTransactionById('tx-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(transaction);
    });

    it('should return transaction when user is the receiver', async () => {
      const { getTransactionById } = await importModule();

      const transaction = { id: 'tx-1', from_user_id: 'user-1', to_user_id: 'user-2', amount: 100 };
      mockPool.query.mockResolvedValueOnce({ rows: [transaction], rowCount: 1 });

      const result = await getTransactionById('tx-1', 'user-2');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(transaction);
    });

    it('should return NOT_FOUND when transaction does not exist', async () => {
      const { getTransactionById } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getTransactionById('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not involved', async () => {
      const { getTransactionById } = await importModule();

      const transaction = { id: 'tx-1', from_user_id: 'user-1', to_user_id: 'user-2', amount: 100 };
      mockPool.query.mockResolvedValueOnce({ rows: [transaction], rowCount: 1 });

      const result = await getTransactionById('tx-1', 'user-3');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getTransactionById } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getTransactionById('tx-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getContractTransactions', () => {
    it('should return transactions for contract when user is freelancer', async () => {
      const { getContractTransactions } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ freelancer_id: 'user-1', employer_id: 'user-2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'tx-1', contract_id: 'contract-1' }], rowCount: 1 });

      const result = await getContractTransactions('contract-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should return transactions for contract when user is employer', async () => {
      const { getContractTransactions } = await importModule();

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ freelancer_id: 'user-1', employer_id: 'user-2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'tx-1', contract_id: 'contract-1' }], rowCount: 1 });

      const result = await getContractTransactions('contract-1', 'user-2');

      expect(result.success).toBe(true);
    });

    it('should return CONTRACT_NOT_FOUND when contract does not exist', async () => {
      const { getContractTransactions } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getContractTransactions('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not part of contract', async () => {
      const { getContractTransactions } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'user-1', employer_id: 'user-2' }], rowCount: 1 });

      const result = await getContractTransactions('contract-1', 'user-3');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getContractTransactions } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getContractTransactions('contract-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('createTransaction', () => {
    it('should create a transaction successfully', async () => {
      const { createTransaction } = await importModule();

      const newTx = {
        id: 'tx-new',
        contract_id: 'contract-1',
        from_user_id: 'user-1',
        to_user_id: 'user-2',
        amount: 500,
        type: 'payment',
        status: 'completed',
        transaction_hash: '0xabc',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [newTx], rowCount: 1 });

      const result = await createTransaction({
        contract_id: 'contract-1',
        from_user_id: 'user-1',
        to_user_id: 'user-2',
        amount: 500,
        type: 'payment',
        status: 'completed',
        transaction_hash: '0xabc',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(newTx);
    });

    it('should create transaction with metadata', async () => {
      const { createTransaction } = await importModule();

      const newTx = { id: 'tx-new', amount: 100, type: 'fee', status: 'completed', metadata: { fee_type: 'platform' } };
      mockPool.query.mockResolvedValueOnce({ rows: [newTx], rowCount: 1 });

      const result = await createTransaction({
        amount: 100,
        type: 'fee',
        status: 'completed',
        metadata: { fee_type: 'platform' },
      });

      expect(result.success).toBe(true);
    });

    it('should create transaction without optional fields', async () => {
      const { createTransaction } = await importModule();

      const newTx = { id: 'tx-new', amount: 100, type: 'fee', status: 'pending' };
      mockPool.query.mockResolvedValueOnce({ rows: [newTx], rowCount: 1 });

      const result = await createTransaction({
        amount: 100,
        type: 'fee',
        status: 'pending',
      });

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { createTransaction } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await createTransaction({
        amount: 100,
        type: 'payment',
        status: 'pending',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
