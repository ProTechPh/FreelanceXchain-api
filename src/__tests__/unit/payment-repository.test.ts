import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { PaymentRepository } = await import('../../repositories/payment-repository.js');

describe('PaymentRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a payment', async () => {
      const payment = { id: 'p1', contract_id: 'c1', amount: 100 };
      mockAppwriteResult({ data: payment });
      const result = await PaymentRepository.create(payment as any);
      expect(result).toEqual(payment);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'insert failed' } });
      await expect(PaymentRepository.create({ id: 'p1' } as any)).rejects.toThrow('Failed to create in payments: insert failed');
    });
  });

  describe('findByContractId', () => {
    it('should return payments for a contract', async () => {
      const payments = [{ id: 'p1', contract_id: 'c1' }];
      mockAppwriteResult({ data: payments });
      const result = await PaymentRepository.findByContractId('c1');
      expect(result).toEqual(payments);
    });

    it('should throw on database error', async () => {
      mockAppwriteResult({ error: { message: 'select failed' } });
      await expect(PaymentRepository.findByContractId('c1')).rejects.toThrow('Failed to find payments: select failed');
    });
  });

  describe('findByUserId', () => {
    it('should return paginated payments for a user', async () => {
      const payments = [{ id: 'p1', payer_id: 'u1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: payments, rowCount: 1 });
      const result = await PaymentRepository.findByUserId('u1');
      expect(result.items).toEqual(payments);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle custom options and hasMore=true', async () => {
      const payments = [{ id: 'p1' }];
      mockPool.query.mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: payments, rowCount: 1 });
      const result = await PaymentRepository.findByUserId('u1', { limit: 1, offset: 0 });
      expect(result.items).toEqual(payments);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(5);
    });

    it('should throw on database error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('select failed'));
      await expect(PaymentRepository.findByUserId('u1')).rejects.toThrow('select failed');
    });

    it('should throw on data query error (line 76)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockRejectedValueOnce(new Error('data query failed'));
      await expect(PaymentRepository.findByUserId('u1')).rejects.toThrow('Failed to find payments');
    });
  });

  describe('findByTxHash', () => {
    it('should return payment by tx hash', async () => {
      const payment = { id: 'p1', tx_hash: '0xabc' };
      mockAppwriteResult({ data: payment });
      const result = await PaymentRepository.findByTxHash('0xabc');
      expect(result).toEqual(payment);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await PaymentRepository.findByTxHash('0xabc');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status and return payment', async () => {
      const payment = { id: 'p1', status: 'completed' };
      mockAppwriteResult({ data: payment });
      const result = await PaymentRepository.updateStatus('p1', 'completed');
      expect(result).toEqual(payment);
    });

    it('should return null when not found', async () => {
      mockAppwriteResult({ data: null });
      const result = await PaymentRepository.updateStatus('p1', 'completed');
      expect(result).toBeNull();
    });
  });

  describe('getTotalEarnings', () => {
    it('should return total earnings', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '300' }], rowCount: 1 });
      const result = await PaymentRepository.getTotalEarnings('u1');
      expect(result).toBe(300);
    });

    it('should return 0 when no earnings', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: null }], rowCount: 1 });
      const result = await PaymentRepository.getTotalEarnings('u1');
      expect(result).toBe(0);
    });
  });

  describe('getTotalSpent', () => {
    it('should return total spent', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: '200' }], rowCount: 1 });
      const result = await PaymentRepository.getTotalSpent('u1');
      expect(result).toBe(200);
    });

    it('should return 0 when no spent', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ total: null }], rowCount: 1 });
      const result = await PaymentRepository.getTotalSpent('u1');
      expect(result).toBe(0);
    });
  });
});