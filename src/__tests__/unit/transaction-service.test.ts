import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { PaymentEntity, PaymentStatus, PaymentType } from '../../repositories/payment-repository.js';
import { createInMemoryStore, createMockPaymentRepository } from '../helpers/mock-repository-factory.js';
import { createTestPayment } from '../helpers/test-data-factory.js';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Create stores and mocks using shared utilities
const paymentStore = createInMemoryStore();
const mockPaymentRepo = createMockPaymentRepository(paymentStore);

// Mock the payment repository
jest.unstable_mockModule(resolveModule('src/repositories/payment-repository.ts'), () => ({
  PaymentRepository: mockPaymentRepo,
  PaymentEntity: {} as PaymentEntity,
  CreatePaymentInput: {},
  PaymentStatus: {} as PaymentStatus,
  PaymentType: {} as PaymentType,
}));

// Import after mocking
const { TransactionService } = await import('../../services/transaction-service.js');

// Custom arbitraries for property-based testing
const validAmountArbitrary = () => fc.double({ min: 0.01, max: 1000000, noNaN: true });
const validCurrencyArbitrary = () => fc.constantFrom('ETH', 'USDC', 'USDT', 'DAI');
const validPaymentTypeArbitrary = () =>
  fc.constantFrom<PaymentType>('escrow_deposit', 'milestone_release', 'refund', 'dispute_resolution');

describe('Transaction Service', () => {
  beforeEach(() => {
    mockPaymentRepo.clear();
  });

  describe('recordPayment', () => {
    it('should record a payment successfully with tx hash', async () => {
      const input = {
        contractId: 'contract-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
        amount: 1000,
        txHash: '0x' + '1'.repeat(64),
        paymentType: 'escrow_deposit' as PaymentType,
      };

      const result = await TransactionService.recordPayment(input);

      expect(result).toBeDefined();
      expect(result.contract_id).toBe(input.contractId);
      expect(result.payer_id).toBe(input.payerId);
      expect(result.payee_id).toBe(input.payeeId);
      expect(result.amount).toBe(input.amount);
      expect(result.tx_hash).toBe(input.txHash);
      expect(result.status).toBe('completed'); // Has tx hash, so completed
      expect(result.payment_type).toBe(input.paymentType);
    });

    it('should record a payment as pending without tx hash', async () => {
      const input = {
        contractId: 'contract-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
        amount: 1000,
        paymentType: 'escrow_deposit' as PaymentType,
      };

      const result = await TransactionService.recordPayment(input);

      expect(result.status).toBe('pending');
      expect(result.tx_hash).toBeNull();
    });

    it('should use default currency ETH when not specified', async () => {
      const input = {
        contractId: 'contract-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
        amount: 1000,
        paymentType: 'escrow_deposit' as PaymentType,
      };

      const result = await TransactionService.recordPayment(input);

      expect(result.currency).toBe('ETH');
    });

    it('should use custom currency when specified', async () => {
      const input = {
        contractId: 'contract-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
        amount: 1000,
        currency: 'USDC',
        paymentType: 'escrow_deposit' as PaymentType,
      };

      const result = await TransactionService.recordPayment(input);

      expect(result.currency).toBe('USDC');
    });

    it('should include milestone ID when provided', async () => {
      const input = {
        contractId: 'contract-1',
        milestoneId: 'milestone-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
        amount: 500,
        paymentType: 'milestone_release' as PaymentType,
      };

      const result = await TransactionService.recordPayment(input);

      expect(result.milestone_id).toBe('milestone-1');
    });

    it('should handle various payment types', async () => {
      const paymentTypes: PaymentType[] = ['escrow_deposit', 'milestone_release', 'refund', 'dispute_resolution'];

      for (const paymentType of paymentTypes) {
        mockPaymentRepo.clear();

        const result = await TransactionService.recordPayment({
          contractId: 'contract-1',
          payerId: 'payer-1',
          payeeId: 'payee-1',
          amount: 1000,
          paymentType,
        });

        expect(result.payment_type).toBe(paymentType);
      }
    });

    it('should handle various amounts and currencies (property-based)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validAmountArbitrary(),
          validCurrencyArbitrary(),
          async (amount, currency) => {
            mockPaymentRepo.clear();

            const result = await TransactionService.recordPayment({
              contractId: 'contract-1',
              payerId: 'payer-1',
              payeeId: 'payee-1',
              amount,
              currency,
              paymentType: 'escrow_deposit',
            });

            expect(result.amount).toBe(amount);
            expect(result.currency).toBe(currency);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle very small amounts', async () => {
      const result = await TransactionService.recordPayment({
        contractId: 'contract-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
        amount: 0.001,
        paymentType: 'escrow_deposit',
      });

      expect(result.amount).toBe(0.001);
    });

    it('should handle very large amounts', async () => {
      const result = await TransactionService.recordPayment({
        contractId: 'contract-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
        amount: 1000000,
        paymentType: 'escrow_deposit',
      });

      expect(result.amount).toBe(1000000);
    });
  });

  describe('updatePaymentStatus', () => {
    it('should update payment status successfully', async () => {
      const payment = createTestPayment({ status: 'pending' });
      paymentStore.set(payment.id, payment);

      const result = await TransactionService.updatePaymentStatus(payment.id, 'completed');

      expect(result).toBeDefined();
      expect(result?.status).toBe('completed');
    });

    it('should update payment status with tx hash', async () => {
      const payment = createTestPayment({ status: 'pending', tx_hash: null });
      paymentStore.set(payment.id, payment);
      const txHash = '0x' + '1'.repeat(64);

      const result = await TransactionService.updatePaymentStatus(payment.id, 'completed', txHash);

      expect(result?.status).toBe('completed');
      expect(result?.tx_hash).toBe(txHash);
    });

    it('should return null for non-existent payment', async () => {
      const result = await TransactionService.updatePaymentStatus('non-existent-id', 'completed');

      expect(result).toBeNull();
    });

    it('should handle all status transitions', async () => {
      const statuses: PaymentStatus[] = ['pending', 'processing', 'completed', 'failed', 'refunded'];

      for (const status of statuses) {
        mockPaymentRepo.clear();
        const payment = createTestPayment({ status: 'pending' });
        paymentStore.set(payment.id, payment);

        const result = await TransactionService.updatePaymentStatus(payment.id, status);

        expect(result?.status).toBe(status);
      }
    });

    it('should preserve existing tx hash when not provided', async () => {
      const originalTxHash = '0x' + '1'.repeat(64);
      const payment = createTestPayment({ status: 'pending', tx_hash: originalTxHash });
      paymentStore.set(payment.id, payment);

      const result = await TransactionService.updatePaymentStatus(payment.id, 'completed');

      expect(result?.tx_hash).toBe(originalTxHash);
    });

    it('should update tx hash when provided', async () => {
      const payment = createTestPayment({ status: 'pending', tx_hash: '0x' + '1'.repeat(64) });
      paymentStore.set(payment.id, payment);
      const newTxHash = '0x' + '2'.repeat(64);

      const result = await TransactionService.updatePaymentStatus(payment.id, 'completed', newTxHash);

      expect(result?.tx_hash).toBe(newTxHash);
    });
  });

  describe('getPaymentsByContract', () => {
    it('should retrieve all payments for a contract', async () => {
      const contractId = 'contract-1';
      const p1 = createTestPayment({ contract_id: contractId, amount: 1000 });
      const p2 = createTestPayment({ contract_id: contractId, amount: 500 });
      const p3 = createTestPayment({ contract_id: 'other-contract', amount: 200 });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);
      paymentStore.set(p3.id, p3);

      const payments = await TransactionService.getPaymentsByContract(contractId);

      expect(payments).toHaveLength(2);
      expect(payments.every(p => p.contract_id === contractId)).toBe(true);
    });

    it('should return empty array when no payments exist', async () => {
      const payments = await TransactionService.getPaymentsByContract('contract-with-no-payments');

      expect(payments).toHaveLength(0);
    });

    it('should return payments of all types for a contract', async () => {
      const contractId = 'contract-1';
      const p1 = createTestPayment({ contract_id: contractId, payment_type: 'escrow_deposit' });
      const p2 = createTestPayment({ contract_id: contractId, payment_type: 'milestone_release' });
      const p3 = createTestPayment({ contract_id: contractId, payment_type: 'refund' });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);
      paymentStore.set(p3.id, p3);

      const payments = await TransactionService.getPaymentsByContract(contractId);

      expect(payments).toHaveLength(3);
      expect(payments.map(p => p.payment_type)).toContain('escrow_deposit');
      expect(payments.map(p => p.payment_type)).toContain('milestone_release');
      expect(payments.map(p => p.payment_type)).toContain('refund');
    });
  });

  describe('getUserPayments', () => {
    it('should retrieve payments where user is payer', async () => {
      const userId = 'user-1';
      const p1 = createTestPayment({ payer_id: userId, amount: 1000 });
      const p2 = createTestPayment({ payer_id: userId, amount: 500 });
      const p3 = createTestPayment({ payer_id: 'other-user', amount: 200 });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);
      paymentStore.set(p3.id, p3);

      const result = await TransactionService.getUserPayments(userId);

      expect(result.items).toHaveLength(2);
    });

    it('should retrieve payments where user is payee', async () => {
      const userId = 'user-1';
      const p1 = createTestPayment({ payee_id: userId, amount: 1000 });
      const p2 = createTestPayment({ payee_id: userId, amount: 500 });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);

      const result = await TransactionService.getUserPayments(userId);

      expect(result.items).toHaveLength(2);
    });

    it('should retrieve payments where user is both payer and payee', async () => {
      const userId = 'user-1';
      const p1 = createTestPayment({ payer_id: userId, amount: 1000 });
      const p2 = createTestPayment({ payee_id: userId, amount: 500 });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);

      const result = await TransactionService.getUserPayments(userId);

      expect(result.items).toHaveLength(2);
    });

    it('should support pagination', async () => {
      const userId = 'user-1';
      for (let i = 0; i < 10; i++) {
        const p = createTestPayment({ payer_id: userId, amount: 100 * i });
        paymentStore.set(p.id, p);
      }

      const result = await TransactionService.getUserPayments(userId, { limit: 5, offset: 0 });

      expect(result.items).toHaveLength(5);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it('should return empty result for user with no payments', async () => {
      const result = await TransactionService.getUserPayments('user-with-no-payments');

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getPaymentByTxHash', () => {
    it('should retrieve payment by transaction hash', async () => {
      const txHash = '0x' + '1'.repeat(64);
      const testPayment = createTestPayment({ tx_hash: txHash, amount: 1000 });
      paymentStore.set(testPayment.id, testPayment);

      const payment = await TransactionService.getPaymentByTxHash(txHash);

      expect(payment).toBeDefined();
      expect(payment?.tx_hash).toBe(txHash);
      expect(payment?.amount).toBe(1000);
    });

    it('should return null when tx hash not found', async () => {
      const payment = await TransactionService.getPaymentByTxHash('0x' + '9'.repeat(64));

      expect(payment).toBeNull();
    });

    it('should handle case-sensitive tx hash lookup', async () => {
      const txHash = '0xAbCdEf' + '1'.repeat(58);
      const testPayment = createTestPayment({ tx_hash: txHash });
      paymentStore.set(testPayment.id, testPayment);

      const payment = await TransactionService.getPaymentByTxHash(txHash);

      expect(payment?.tx_hash).toBe(txHash);
    });
  });

  describe('getPaymentSummary', () => {
    it('should calculate total earnings correctly', async () => {
      const userId = 'user-1';
      const p1 = createTestPayment({ payee_id: userId, amount: 1000, status: 'completed' });
      const p2 = createTestPayment({ payee_id: userId, amount: 500, status: 'completed' });
      const p3 = createTestPayment({ payee_id: userId, amount: 200, status: 'pending' });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);
      paymentStore.set(p3.id, p3);

      const summary = await TransactionService.getPaymentSummary(userId);

      expect(summary.totalEarnings).toBe(1500);
    });

    it('should calculate total spent correctly', async () => {
      const userId = 'user-1';
      const p1 = createTestPayment({ payer_id: userId, amount: 1000, status: 'completed' });
      const p2 = createTestPayment({ payer_id: userId, amount: 500, status: 'completed' });
      const p3 = createTestPayment({ payer_id: userId, amount: 200, status: 'pending' });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);
      paymentStore.set(p3.id, p3);

      const summary = await TransactionService.getPaymentSummary(userId);

      expect(summary.totalSpent).toBe(1500);
    });

    it('should calculate pending payments correctly', async () => {
      const userId = 'user-1';
      const p1 = createTestPayment({ payee_id: userId, amount: 100, status: 'pending' });
      const p2 = createTestPayment({ payee_id: userId, amount: 200, status: 'processing' });
      const p3 = createTestPayment({ payee_id: userId, amount: 300, status: 'completed' });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);
      paymentStore.set(p3.id, p3);

      const summary = await TransactionService.getPaymentSummary(userId);

      expect(summary.pendingPayments).toBe(300);
    });

    it('should return zeros for user with no payments', async () => {
      const summary = await TransactionService.getPaymentSummary('user-with-no-payments');

      expect(summary.userId).toBe('user-with-no-payments');
      expect(summary.totalEarnings).toBe(0);
      expect(summary.totalSpent).toBe(0);
      expect(summary.pendingPayments).toBe(0);
    });

    it('should handle user with both earnings and spending', async () => {
      const userId = 'user-1';
      const p1 = createTestPayment({ payee_id: userId, amount: 1000, status: 'completed' });
      const p2 = createTestPayment({ payer_id: userId, amount: 500, status: 'completed' });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);

      const summary = await TransactionService.getPaymentSummary(userId);

      expect(summary.totalEarnings).toBe(1000);
      expect(summary.totalSpent).toBe(500);
    });

    it('should only count completed payments in totals', async () => {
      const userId = 'user-1';
      const p1 = createTestPayment({ payee_id: userId, amount: 1000, status: 'completed' });
      const p2 = createTestPayment({ payee_id: userId, amount: 500, status: 'pending' });
      const p3 = createTestPayment({ payee_id: userId, amount: 300, status: 'failed' });
      const p4 = createTestPayment({ payee_id: userId, amount: 200, status: 'processing' });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);
      paymentStore.set(p3.id, p3);
      paymentStore.set(p4.id, p4);

      const summary = await TransactionService.getPaymentSummary(userId);

      expect(summary.totalEarnings).toBe(1000); // Only completed
      expect(summary.pendingPayments).toBe(700); // pending + processing
    });
  });

  describe('recordEscrowDeposit', () => {
    it('should record escrow deposit successfully', async () => {
      const result = await TransactionService.recordEscrowDeposit(
        'contract-1',
        'employer-1',
        'freelancer-1',
        1000,
        '0x' + '1'.repeat(64)
      );

      expect(result.payment_type).toBe('escrow_deposit');
      expect(result.payer_id).toBe('employer-1');
      expect(result.payee_id).toBe('freelancer-1');
      expect(result.amount).toBe(1000);
      expect(result.status).toBe('completed');
    });

    it('should record escrow deposit without tx hash', async () => {
      const result = await TransactionService.recordEscrowDeposit(
        'contract-1',
        'employer-1',
        'freelancer-1',
        1000
      );

      expect(result.payment_type).toBe('escrow_deposit');
      expect(result.status).toBe('pending');
      expect(result.tx_hash).toBeNull();
    });
  });

  describe('recordMilestoneRelease', () => {
    it('should record milestone release successfully', async () => {
      const result = await TransactionService.recordMilestoneRelease(
        'contract-1',
        'milestone-1',
        'employer-1',
        'freelancer-1',
        500,
        '0x' + '2'.repeat(64)
      );

      expect(result.payment_type).toBe('milestone_release');
      expect(result.milestone_id).toBe('milestone-1');
      expect(result.amount).toBe(500);
      expect(result.status).toBe('completed');
    });

    it('should record milestone release without tx hash', async () => {
      const result = await TransactionService.recordMilestoneRelease(
        'contract-1',
        'milestone-1',
        'employer-1',
        'freelancer-1',
        500
      );

      expect(result.payment_type).toBe('milestone_release');
      expect(result.status).toBe('pending');
    });
  });

  describe('recordRefund', () => {
    it('should record refund successfully', async () => {
      const result = await TransactionService.recordRefund(
        'contract-1',
        'freelancer-1',
        'employer-1',
        800,
        '0x' + '3'.repeat(64)
      );

      expect(result.payment_type).toBe('refund');
      expect(result.payer_id).toBe('freelancer-1');
      expect(result.payee_id).toBe('employer-1');
      expect(result.amount).toBe(800);
      expect(result.status).toBe('completed');
    });

    it('should record refund without tx hash', async () => {
      const result = await TransactionService.recordRefund(
        'contract-1',
        'freelancer-1',
        'employer-1',
        800
      );

      expect(result.payment_type).toBe('refund');
      expect(result.status).toBe('pending');
    });
  });

  describe('recordDisputeResolution', () => {
    it('should record dispute resolution successfully', async () => {
      const result = await TransactionService.recordDisputeResolution(
        'contract-1',
        'employer-1',
        'freelancer-1',
        600,
        '0x' + '4'.repeat(64)
      );

      expect(result.payment_type).toBe('dispute_resolution');
      expect(result.amount).toBe(600);
      expect(result.status).toBe('completed');
    });

    it('should record dispute resolution without tx hash', async () => {
      const result = await TransactionService.recordDisputeResolution(
        'contract-1',
        'employer-1',
        'freelancer-1',
        600
      );

      expect(result.payment_type).toBe('dispute_resolution');
      expect(result.status).toBe('pending');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero amount payments', async () => {
      const result = await TransactionService.recordPayment({
        contractId: 'contract-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
        amount: 0,
        paymentType: 'escrow_deposit',
      });

      expect(result.amount).toBe(0);
    });

    it('should handle decimal amounts with high precision', async () => {
      const result = await TransactionService.recordPayment({
        contractId: 'contract-1',
        payerId: 'payer-1',
        payeeId: 'payee-1',
        amount: 0.123456789,
        paymentType: 'escrow_deposit',
      });

      expect(result.amount).toBe(0.123456789);
    });

    it('should handle various tx hash formats', async () => {
      const txHashes = [
        '0x' + '1'.repeat(64),
        '0x' + 'a'.repeat(64),
        '0x' + 'A'.repeat(64),
        '0x' + 'f'.repeat(64),
      ];

      for (const txHash of txHashes) {
        mockPaymentRepo.clear();

        const result = await TransactionService.recordPayment({
          contractId: 'contract-1',
          payerId: 'payer-1',
          payeeId: 'payee-1',
          amount: 1000,
          txHash,
          paymentType: 'escrow_deposit',
        });

        expect(result.tx_hash).toBe(txHash);
      }
    });

    it('should handle multiple payments for same contract', async () => {
      const contractId = 'contract-1';
      await TransactionService.recordEscrowDeposit(contractId, 'employer-1', 'freelancer-1', 1000);
      await TransactionService.recordMilestoneRelease(contractId, 'milestone-1', 'employer-1', 'freelancer-1', 300);
      await TransactionService.recordMilestoneRelease(contractId, 'milestone-2', 'employer-1', 'freelancer-1', 400);

      const payments = await TransactionService.getPaymentsByContract(contractId);

      expect(payments).toHaveLength(3);
    });

    it('should handle rapid payment recording', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          TransactionService.recordPayment({
            contractId: 'contract-1',
            payerId: 'payer-1',
            payeeId: 'payee-1',
            amount: 100 * i,
            paymentType: 'escrow_deposit',
          })
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
    });

    it('should handle payment summary with mixed statuses', async () => {
      const userId = 'user-1';
      const p1 = createTestPayment({ payee_id: userId, amount: 100, status: 'completed' });
      const p2 = createTestPayment({ payee_id: userId, amount: 200, status: 'pending' });
      const p3 = createTestPayment({ payee_id: userId, amount: 300, status: 'processing' });
      const p4 = createTestPayment({ payee_id: userId, amount: 400, status: 'failed' });
      const p5 = createTestPayment({ payee_id: userId, amount: 500, status: 'refunded' });
      paymentStore.set(p1.id, p1);
      paymentStore.set(p2.id, p2);
      paymentStore.set(p3.id, p3);
      paymentStore.set(p4.id, p4);
      paymentStore.set(p5.id, p5);

      const summary = await TransactionService.getPaymentSummary(userId);

      expect(summary.totalEarnings).toBe(100); // Only completed
      expect(summary.pendingPayments).toBe(500); // pending + processing
    });
  });
});
