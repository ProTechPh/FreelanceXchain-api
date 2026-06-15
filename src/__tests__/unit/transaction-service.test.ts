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

const mockTransactionRepository = {
  findByUser: jest.fn<any>(),
  getById: jest.fn<any>(),
  findByContract: jest.fn<any>(),
  create: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/transaction-repository.ts'), () => ({
  transactionRepository: mockTransactionRepository,
}));

const mockContractRepository = {
  getContractById: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

describe('Transaction Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const importModule = async () => {
    return await import('../../services/transaction-service.js');
  };

  describe('getUserTransactions', () => {
    it('should return paginated transactions for user', async () => {
      const { getUserTransactions } = await importModule();

      const transactions = [
        { id: 'tx-1', from_user_id: 'user-1', to_user_id: 'user-2', amount: 100, type: 'payment', status: 'completed', created_at: '2025-01-01', updated_at: '2025-01-01' },
        { id: 'tx-2', from_user_id: 'user-2', to_user_id: 'user-1', amount: 50, type: 'refund', status: 'completed', created_at: '2025-01-02', updated_at: '2025-01-02' },
      ];

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items: transactions,
        total: 2,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1');

      expect(result.success).toBe(true);
      expect(result.data.items).toEqual(transactions);
      expect(result.data.total).toBe(2);
      expect(result.data.hasMore).toBe(false);
    });

    it('should apply type filter', async () => {
      const { getUserTransactions } = await importModule();

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items: [],
        total: 0,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1', { type: 'payment' });

      expect(result.success).toBe(true);
      expect(mockTransactionRepository.findByUser).toHaveBeenCalledTimes(1);
    });

    it('should apply status filter', async () => {
      const { getUserTransactions } = await importModule();

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items: [],
        total: 0,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1', { status: 'completed' });

      expect(result.success).toBe(true);
    });

    it('should apply date range filters', async () => {
      const { getUserTransactions } = await importModule();

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items: [],
        total: 0,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1', {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      expect(result.success).toBe(true);
    });

    it('should apply all filters together', async () => {
      const { getUserTransactions } = await importModule();

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items: [],
        total: 0,
        hasMore: false,
      });

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

    it('should filter transactions by type correctly', async () => {
      const { getUserTransactions } = await importModule();

      const transactions = [
        { id: 'tx-1', type: 'payment', status: 'completed', amount: 100, created_at: '2025-01-01', updated_at: '2025-01-01' },
        { id: 'tx-2', type: 'refund', status: 'completed', amount: 50, created_at: '2025-01-02', updated_at: '2025-01-02' },
        { id: 'tx-3', type: 'payment', status: 'pending', amount: 200, created_at: '2025-01-03', updated_at: '2025-01-03' },
      ];

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items: transactions,
        total: 3,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1', { type: 'payment' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
        expect(result.data.total).toBe(2);
        expect(result.data.items.every(t => t.type === 'payment')).toBe(true);
      }
    });

    it('should filter transactions by status correctly', async () => {
      const { getUserTransactions } = await importModule();

      const transactions = [
        { id: 'tx-1', type: 'payment', status: 'completed', amount: 100, created_at: '2025-01-01', updated_at: '2025-01-01' },
        { id: 'tx-2', type: 'payment', status: 'pending', amount: 50, created_at: '2025-01-02', updated_at: '2025-01-02' },
      ];

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items: transactions,
        total: 2,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1', { status: 'pending' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.items[0].status).toBe('pending');
      }
    });

    it('should filter transactions by date range correctly', async () => {
      const { getUserTransactions } = await importModule();

      const transactions = [
        { id: 'tx-1', type: 'payment', status: 'completed', amount: 100, created_at: '2025-01-15', updated_at: '2025-01-15' },
        { id: 'tx-2', type: 'payment', status: 'completed', amount: 50, created_at: '2025-02-15', updated_at: '2025-02-15' },
        { id: 'tx-3', type: 'payment', status: 'completed', amount: 200, created_at: '2025-03-15', updated_at: '2025-03-15' },
      ];

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items: transactions,
        total: 3,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1', {
        startDate: '2025-01-20',
        endDate: '2025-03-01',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.items[0].id).toBe('tx-2');
      }
    });

    it('should return no results when all filters exclude everything', async () => {
      const { getUserTransactions } = await importModule();

      const transactions = [
        { id: 'tx-1', type: 'refund', status: 'pending', amount: 100, created_at: '2025-06-01', updated_at: '2025-06-01' },
      ];

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items: transactions,
        total: 1,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1', { type: 'payment', status: 'completed' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
        expect(result.data.total).toBe(0);
      }
    });

    it('should handle hasMore correctly when on last page', async () => {
      const { getUserTransactions } = await importModule();

      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `tx-${i}`, amount: 100, type: 'payment', status: 'completed',
        created_at: '2025-01-01', updated_at: '2025-01-01',
      }));

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items,
        total: 5,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1', { page: 1, limit: 20 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasMore).toBe(false);
      }
    });

    it('should handle pagination correctly', async () => {
      const { getUserTransactions } = await importModule();

      const items = Array.from({ length: 25 }, (_, i) => ({
        id: `tx-${i}`, amount: 100, type: 'payment', status: 'completed',
        created_at: `2025-01-${String(i + 1).padStart(2, '0')}`,
        updated_at: `2025-01-${String(i + 1).padStart(2, '0')}`,
      }));

      mockTransactionRepository.findByUser.mockResolvedValueOnce({
        items,
        total: 25,
        hasMore: false,
      });

      const result = await getUserTransactions('user-1', { page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.hasMore).toBe(true);
      expect(result.data.total).toBe(25);
    });

    it('should handle database errors', async () => {
      const { getUserTransactions } = await importModule();

      mockTransactionRepository.findByUser.mockRejectedValueOnce(new Error('DB error'));

      const result = await getUserTransactions('user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getTransactionById', () => {
    it('should return transaction when found and user is authorized', async () => {
      const { getTransactionById } = await importModule();

      const transaction = { id: 'tx-1', from_user_id: 'user-1', to_user_id: 'user-2', amount: 100, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockTransactionRepository.getById.mockResolvedValueOnce(transaction);

      const result = await getTransactionById('tx-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(transaction);
    });

    it('should return transaction when user is the receiver', async () => {
      const { getTransactionById } = await importModule();

      const transaction = { id: 'tx-1', from_user_id: 'user-1', to_user_id: 'user-2', amount: 100, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockTransactionRepository.getById.mockResolvedValueOnce(transaction);

      const result = await getTransactionById('tx-1', 'user-2');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(transaction);
    });

    it('should return NOT_FOUND when transaction does not exist', async () => {
      const { getTransactionById } = await importModule();

      mockTransactionRepository.getById.mockResolvedValueOnce(null);

      const result = await getTransactionById('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not involved', async () => {
      const { getTransactionById } = await importModule();

      const transaction = { id: 'tx-1', from_user_id: 'user-1', to_user_id: 'user-2', amount: 100, created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockTransactionRepository.getById.mockResolvedValueOnce(transaction);

      const result = await getTransactionById('tx-1', 'user-3');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getTransactionById } = await importModule();

      mockTransactionRepository.getById.mockRejectedValueOnce(new Error('DB error'));

      const result = await getTransactionById('tx-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('getContractTransactions', () => {
    it('should return transactions for contract when user is freelancer', async () => {
      const { getContractTransactions } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'contract-1', freelancer_id: 'user-1', employer_id: 'user-2' });
      mockTransactionRepository.findByContract.mockResolvedValueOnce([{ id: 'tx-1', contract_id: 'contract-1', created_at: '2025-01-01', updated_at: '2025-01-01' }]);

      const result = await getContractTransactions('contract-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should return transactions for contract when user is employer', async () => {
      const { getContractTransactions } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'contract-1', freelancer_id: 'user-1', employer_id: 'user-2' });
      mockTransactionRepository.findByContract.mockResolvedValueOnce([{ id: 'tx-1', contract_id: 'contract-1', created_at: '2025-01-01', updated_at: '2025-01-01' }]);

      const result = await getContractTransactions('contract-1', 'user-2');

      expect(result.success).toBe(true);
    });

    it('should return CONTRACT_NOT_FOUND when contract does not exist', async () => {
      const { getContractTransactions } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await getContractTransactions('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not part of contract', async () => {
      const { getContractTransactions } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'contract-1', freelancer_id: 'user-1', employer_id: 'user-2' });

      const result = await getContractTransactions('contract-1', 'user-3');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getContractTransactions } = await importModule();

      mockContractRepository.getContractById.mockRejectedValueOnce(new Error('DB error'));

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
      mockTransactionRepository.create.mockResolvedValueOnce(newTx);

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

      const newTx = { id: 'tx-new', amount: 100, type: 'fee', status: 'completed', metadata: '{"fee_type":"platform"}', created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockTransactionRepository.create.mockResolvedValueOnce(newTx);

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

      const newTx = { id: 'tx-new', amount: 100, type: 'fee', status: 'pending', created_at: '2025-01-01', updated_at: '2025-01-01' };
      mockTransactionRepository.create.mockResolvedValueOnce(newTx);

      const result = await createTransaction({
        amount: 100,
        type: 'fee',
        status: 'pending',
      });

      expect(result.success).toBe(true);
    });

    it('should handle database errors', async () => {
      const { createTransaction } = await importModule();

      mockTransactionRepository.create.mockRejectedValueOnce(new Error('DB error'));

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
