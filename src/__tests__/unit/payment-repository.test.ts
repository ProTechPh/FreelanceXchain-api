import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { PaymentRepository } = await import('../../repositories/payment-repository.js');

describe('PaymentRepository', () => {
  let mockDatabases: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases = (globalThis as any).__mockDatabases;
  });

  describe('create', () => {
    it('should create and return a payment', async () => {
      const payment = { id: 'p1', contract_id: 'c1', amount: 100 };
      mockDatabases.createDocument.mockResolvedValueOnce({
        $id: 'p1', contract_id: 'c1', amount: 100,
      });
      const result = await PaymentRepository.create(payment as any);
      expect(result.id).toBe('p1');
      expect(result.contract_id).toBe('c1');
    });

    it('should throw on database error', async () => {
      mockDatabases.createDocument.mockRejectedValueOnce(new Error('insert failed'));
      await expect(PaymentRepository.create({ id: 'p1' } as any)).rejects.toThrow();
    });
  });

  describe('findByContractId', () => {
    it('should return payments for a contract', async () => {
      const payments = [{ $id: 'p1', contract_id: 'c1' }];
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: payments, total: 1 });
      const result = await PaymentRepository.findByContractId('c1');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('p1');
    });

    it('should throw on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      await expect(PaymentRepository.findByContractId('c1')).rejects.toThrow('Failed to find payments: select failed');
    });
  });

  describe('findByUserId', () => {
    it('should return paginated payments for a user', async () => {
      const payments = [{ $id: 'p1', payer_id: 'u1' }];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 1 })
        .mockResolvedValueOnce({ documents: payments, total: 1 });
      const result = await PaymentRepository.findByUserId('u1');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const payments = [{ $id: 'p1' }];
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 5 })
        .mockResolvedValueOnce({ documents: payments, total: 5 });
      const result = await PaymentRepository.findByUserId('u1', { limit: 1, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should throw on database error', async () => {
      mockDatabases.listDocuments.mockRejectedValueOnce(new Error('select failed'));
      await expect(PaymentRepository.findByUserId('u1')).rejects.toThrow('select failed');
    });

    it('should throw on data query error', async () => {
      mockDatabases.listDocuments
        .mockResolvedValueOnce({ documents: [], total: 3 })
        .mockRejectedValueOnce(new Error('data query failed'));
      await expect(PaymentRepository.findByUserId('u1')).rejects.toThrow('Failed to find payments');
    });
  });

  describe('findByTxHash', () => {
    it('should return payment by tx hash', async () => {
      const payment = { $id: 'p1', tx_hash: '0xabc' };
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [payment], total: 1 });
      const result = await PaymentRepository.findByTxHash('0xabc');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('p1');
    });

    it('should return null when not found', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await PaymentRepository.findByTxHash('0xabc');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status and return payment', async () => {
      mockDatabases.updateDocument.mockResolvedValueOnce({
        $id: 'p1', status: 'completed',
      });
      const result = await PaymentRepository.updateStatus('p1', 'completed');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('p1');
    });

    it('should return null when not found', async () => {
      mockDatabases.updateDocument.mockRejectedValueOnce(new Error('not found'));
      const result = await PaymentRepository.updateStatus('p1', 'completed');
      expect(result).toBeNull();
    });
  });

  describe('getTotalEarnings', () => {
    it('should return total earnings', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ amount: 100 }, { amount: 200 }],
        total: 2,
      });
      const result = await PaymentRepository.getTotalEarnings('u1');
      expect(result).toBe(300);
    });

    it('should return 0 when no earnings', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await PaymentRepository.getTotalEarnings('u1');
      expect(result).toBe(0);
    });
  });

  describe('getTotalSpent', () => {
    it('should return total spent', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({
        documents: [{ amount: 100 }, { amount: 100 }],
        total: 2,
      });
      const result = await PaymentRepository.getTotalSpent('u1');
      expect(result).toBe(200);
    });

    it('should return 0 when no spent', async () => {
      mockDatabases.listDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
      const result = await PaymentRepository.getTotalSpent('u1');
      expect(result).toBe(0);
    });
  });
});