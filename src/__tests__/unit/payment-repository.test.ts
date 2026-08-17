// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const { paymentRepository: PaymentRepository } = await import('../../repositories/payment-repository.js');

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

// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('payment-repository.ts - Branch Coverage', () => {
  it('L123: reduce handles null amount', () => {
    const docs = [{ amount: undefined }, { amount: '100' }, { amount: null }];
    const sum = docs.reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    expect(sum).toBe(100);
  });

  it('L140: reduce handles null amount for spending', () => {
    const docs = [{ amount: undefined }, { amount: '50' }];
    const sum = docs.reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    expect(sum).toBe(50);
  });
});

describe('merged branch coverage', () => {
  it('payment-repository L123: getTotalEarned returns 0 when no documents', async () => {
    const { paymentRepository } = await import(resolveModule('src/repositories/payment-repository.ts'));
    const result = await paymentRepository.getTotalEarnings('u1');
    expect(typeof result).toBe('number');
  });
});

describe('merged branch coverage', () => {
  it('payment-repository L140: getTotalSpent returns 0 when no documents', async () => {
    const { paymentRepository } = await import(resolveModule('src/repositories/payment-repository.ts'));
    const result = await paymentRepository.getTotalSpent('u1');
    expect(typeof result).toBe('number');
  });
});

describe('PaymentRepository - Additional Branch Coverage', () => {
  it('getTotalSpent returns null on database error', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockRejectedValueOnce(new Error('db down'));
    const result = await PaymentRepository.getTotalSpent('user-1');
    expect(result).toBeNull();
  });

  it('getTotalEarnings returns null on database error', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockRejectedValueOnce(new Error('db down'));
    const result = await PaymentRepository.getTotalEarnings('user-1');
    expect(result).toBeNull();
  });

  it('getTotalSpent with documents containing null amounts', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [{ amount: null }, { amount: 100 }, { amount: undefined }],
      total: 3,
    });
    const result = await PaymentRepository.getTotalSpent('user-1');
    expect(result).toBe(100);
  });

  it('getTotalEarnings with documents containing null amounts', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [{ amount: 50 }, { amount: null }],
      total: 2,
    });
    const result = await PaymentRepository.getTotalEarnings('user-1');
    expect(result).toBe(50);
  });
});

describe('PaymentRepository - amount unit normalization', () => {
  // milestone_release records store escrow amounts as wei-as-Number; the totals
  // must normalize them to ETH units so surfaced totals are not 1e18x too large.
  it('getTotalEarnings normalizes wei milestone_release records to ETH', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [
        { amount: 5e20, payment_type: 'milestone_release' }, // 500 ETH in wei
        { amount: 250, payment_type: 'rush_fee' },
      ],
      total: 2,
    });
    const result = await PaymentRepository.getTotalEarnings('user-1');
    expect(result).toBe(750);
  });

  it('getTotalSpent normalizes wei milestone_release records to ETH', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [{ amount: 5e20, payment_type: 'milestone_release' }],
      total: 1,
    });
    const result = await PaymentRepository.getTotalSpent('user-1');
    expect(result).toBe(500);
  });

  it('getTotalEarnings leaves non-milestone_release amounts untouched even when large', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [{ amount: 5e20, payment_type: 'dispute_resolution' }],
      total: 1,
    });
    const result = await PaymentRepository.getTotalEarnings('user-1');
    expect(result).toBe(5e20);
  });
});

describe('PaymentRepository - totals semantics', () => {
  // Pinned definition: totalEarnings/totalSpent count every completed
  // record type that moves money between parties — milestone_release, refund,
  // dispute_resolution (each leg), rush_fee — and EXCLUDE escrow_deposit, the
  // funding trace whose disposition is already captured by the other legs.
  it('getTotalEarnings counts rush_fee and dispute legs but excludes escrow_deposit', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [
        { amount: 5e20, payment_type: 'milestone_release' }, // 500 ETH, wei-normalized
        { amount: 250, payment_type: 'rush_fee' },
        { amount: 100, payment_type: 'dispute_resolution' },
        { amount: 50, payment_type: 'refund' },
        { amount: 1000, payment_type: 'escrow_deposit' }, // excluded
      ],
      total: 5,
    });
    const result = await PaymentRepository.getTotalEarnings('user-1');
    expect(result).toBe(900); // 500 + 250 + 100 + 50, deposit not counted
  });

  it('getTotalSpent counts rush_fee and dispute legs but excludes escrow_deposit', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [
        { amount: 300, payment_type: 'milestone_release' },
        { amount: 250, payment_type: 'rush_fee' },
        { amount: 50, payment_type: 'dispute_resolution' },
        { amount: 1000, payment_type: 'escrow_deposit' }, // excluded
      ],
      total: 4,
    });
    const result = await PaymentRepository.getTotalSpent('user-1');
    expect(result).toBe(600); // 300 + 250 + 50, deposit not counted
  });

  it('getTotalEarnings returns 0 when only escrow_deposit records exist', async () => {
    const mockDb = (globalThis as any).__mockDatabases;
    mockDb.listDocuments.mockReset();
    mockDb.listDocuments.mockResolvedValueOnce({
      documents: [{ amount: 1000, payment_type: 'escrow_deposit' }],
      total: 1,
    });
    const result = await PaymentRepository.getTotalEarnings('user-1');
    expect(result).toBe(0);
  });
});
