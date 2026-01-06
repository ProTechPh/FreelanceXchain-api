import { describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import {
  serializeTransaction,
  deserializeTransaction,
  serializePaymentTransaction,
  deserializePaymentTransaction,
  submitTransaction,
  getTransaction,
  confirmTransaction,
  clearTransactions,
  generateWalletAddress,
} from '../blockchain-client.js';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentTransaction,
  TransactionInput,
} from '../blockchain-types.js';

// Custom arbitraries for property-based testing

const transactionTypeArbitrary = (): fc.Arbitrary<TransactionType> =>
  fc.constantFrom('escrow_deploy', 'escrow_deposit', 'milestone_release', 'refund');

const transactionStatusArbitrary = (): fc.Arbitrary<TransactionStatus> =>
  fc.constantFrom('pending', 'confirmed', 'failed');

const walletAddressArbitrary = (): fc.Arbitrary<string> =>
  fc.hexaString({ minLength: 40, maxLength: 40 }).map(hex => '0x' + hex);

const transactionHashArbitrary = (): fc.Arbitrary<string> =>
  fc.hexaString({ minLength: 64, maxLength: 64 }).map(hex => '0x' + hex);

const bigintArbitrary = (): fc.Arbitrary<bigint> =>
  fc.bigInt({ min: BigInt(0), max: BigInt('1000000000000000000000') });

const transactionDataArbitrary = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
    fc.oneof(
      fc.string({ minLength: 0, maxLength: 100 }),
      fc.integer(),
      fc.boolean(),
      fc.constant(null)
    ),
    { minKeys: 0, maxKeys: 5 }
  );


const transactionArbitrary = (): fc.Arbitrary<Transaction> =>
  fc.record({
    id: fc.uuid(),
    type: transactionTypeArbitrary(),
    from: walletAddressArbitrary(),
    to: walletAddressArbitrary(),
    amount: bigintArbitrary(),
    data: transactionDataArbitrary(),
    timestamp: fc.integer({ min: 0, max: Date.now() + 1000000 }),
    status: transactionStatusArbitrary(),
    hash: fc.option(transactionHashArbitrary(), { nil: undefined }),
    blockNumber: fc.option(fc.integer({ min: 1, max: 10000000 }), { nil: undefined }),
    gasUsed: fc.option(bigintArbitrary(), { nil: undefined }),
  });

const paymentTransactionArbitrary = (): fc.Arbitrary<PaymentTransaction> =>
  fc.record({
    escrowAddress: walletAddressArbitrary(),
    milestoneId: fc.uuid(),
    amount: bigintArbitrary(),
    recipient: walletAddressArbitrary(),
    timestamp: fc.integer({ min: 0, max: Date.now() + 1000000 }),
    transactionHash: transactionHashArbitrary(),
  });

describe('Blockchain Client - Payment Serialization Properties', () => {
  /**
   * **Feature: blockchain-freelance-marketplace, Property 21: Payment transaction serialization round-trip**
   * **Validates: Requirements 6.6, 6.7**
   * 
   * For any valid payment transaction object, serializing to JSON and 
   * deserializing back shall produce an equivalent object.
   */
  describe('Property 21: Payment transaction serialization round-trip', () => {
    it('should round-trip Transaction objects correctly', () => {
      fc.assert(
        fc.property(
          transactionArbitrary(),
          (tx: Transaction) => {
            // Serialize
            const serialized = serializeTransaction(tx);
            
            // Verify serialized format has string amounts
            expect(typeof serialized.amount).toBe('string');
            if (serialized.gasUsed !== undefined) {
              expect(typeof serialized.gasUsed).toBe('string');
            }
            
            // Deserialize
            const deserialized = deserializeTransaction(serialized);
            
            // Verify all fields match
            expect(deserialized.id).toBe(tx.id);
            expect(deserialized.type).toBe(tx.type);
            expect(deserialized.from).toBe(tx.from);
            expect(deserialized.to).toBe(tx.to);
            expect(deserialized.amount).toBe(tx.amount);
            expect(deserialized.data).toEqual(tx.data);
            expect(deserialized.timestamp).toBe(tx.timestamp);
            expect(deserialized.status).toBe(tx.status);
            expect(deserialized.hash).toBe(tx.hash);
            expect(deserialized.blockNumber).toBe(tx.blockNumber);
            expect(deserialized.gasUsed).toBe(tx.gasUsed);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should round-trip PaymentTransaction objects correctly', () => {
      fc.assert(
        fc.property(
          paymentTransactionArbitrary(),
          (tx: PaymentTransaction) => {
            // Serialize
            const serialized = serializePaymentTransaction(tx);
            
            // Verify serialized format has string amount
            expect(typeof serialized.amount).toBe('string');
            
            // Deserialize
            const deserialized = deserializePaymentTransaction(serialized);
            
            // Verify all fields match
            expect(deserialized.escrowAddress).toBe(tx.escrowAddress);
            expect(deserialized.milestoneId).toBe(tx.milestoneId);
            expect(deserialized.amount).toBe(tx.amount);
            expect(deserialized.recipient).toBe(tx.recipient);
            expect(deserialized.timestamp).toBe(tx.timestamp);
            expect(deserialized.transactionHash).toBe(tx.transactionHash);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve bigint precision for large amounts', () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: BigInt('1000000000000000000'), max: BigInt('999999999999999999999999') }),
          (largeAmount: bigint) => {
            const tx: Transaction = {
              id: 'test-id',
              type: 'milestone_release',
              from: '0x' + '1'.repeat(40),
              to: '0x' + '2'.repeat(40),
              amount: largeAmount,
              data: {},
              timestamp: Date.now(),
              status: 'confirmed',
            };
            
            const serialized = serializeTransaction(tx);
            const deserialized = deserializeTransaction(serialized);
            
            // BigInt precision should be preserved
            expect(deserialized.amount).toBe(largeAmount);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle JSON stringify/parse cycle', () => {
      fc.assert(
        fc.property(
          transactionArbitrary(),
          (tx: Transaction) => {
            // Serialize to JSON string
            const serialized = serializeTransaction(tx);
            const jsonString = JSON.stringify(serialized);
            
            // Parse back from JSON string
            const parsed = JSON.parse(jsonString);
            const deserialized = deserializeTransaction(parsed);
            
            // Should still match original
            expect(deserialized.id).toBe(tx.id);
            expect(deserialized.amount).toBe(tx.amount);
            expect(deserialized.gasUsed).toBe(tx.gasUsed);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle PaymentTransaction JSON stringify/parse cycle', () => {
      fc.assert(
        fc.property(
          paymentTransactionArbitrary(),
          (tx: PaymentTransaction) => {
            // Serialize to JSON string
            const serialized = serializePaymentTransaction(tx);
            const jsonString = JSON.stringify(serialized);
            
            // Parse back from JSON string
            const parsed = JSON.parse(jsonString);
            const deserialized = deserializePaymentTransaction(parsed);
            
            // Should still match original
            expect(deserialized.escrowAddress).toBe(tx.escrowAddress);
            expect(deserialized.amount).toBe(tx.amount);
            expect(deserialized.milestoneId).toBe(tx.milestoneId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('Blockchain Client - Transaction Operations', () => {
  beforeEach(() => {
    clearTransactions();
  });

  describe('submitTransaction', () => {
    it('should create a transaction with pending status', async () => {
      const input: TransactionInput = {
        type: 'escrow_deploy',
        from: generateWalletAddress(),
        to: generateWalletAddress(),
        amount: BigInt(1000000),
      };

      const tx = await submitTransaction(input);

      expect(tx.id).toBeDefined();
      expect(tx.type).toBe('escrow_deploy');
      expect(tx.status).toBe('pending');
      expect(tx.hash).toBeDefined();
      expect(tx.hash?.startsWith('0x')).toBe(true);
    });

    it('should store transaction for later retrieval', async () => {
      const input: TransactionInput = {
        type: 'milestone_release',
        from: generateWalletAddress(),
        to: generateWalletAddress(),
        amount: BigInt(500000),
        data: { milestoneId: 'milestone-1' },
      };

      const tx = await submitTransaction(input);
      const retrieved = await getTransaction(tx.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(tx.id);
      expect(retrieved?.data).toEqual({ milestoneId: 'milestone-1' });
    });
  });

  describe('confirmTransaction', () => {
    it('should update transaction status to confirmed', async () => {
      const input: TransactionInput = {
        type: 'escrow_deposit',
        from: generateWalletAddress(),
        to: generateWalletAddress(),
        amount: BigInt(2000000),
      };

      const tx = await submitTransaction(input);
      expect(tx.status).toBe('pending');

      const confirmed = await confirmTransaction(tx.id);

      expect(confirmed).not.toBeNull();
      expect(confirmed?.status).toBe('confirmed');
      expect(confirmed?.blockNumber).toBeDefined();
      expect(confirmed?.gasUsed).toBeDefined();
    });

    it('should return null for non-existent transaction', async () => {
      const result = await confirmTransaction('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('generateWalletAddress', () => {
    it('should generate valid Ethereum-style addresses', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          () => {
            const address = generateWalletAddress();
            
            // Should start with 0x
            expect(address.startsWith('0x')).toBe(true);
            
            // Should be 42 characters (0x + 40 hex chars)
            expect(address.length).toBe(42);
            
            // Should only contain valid hex characters after 0x
            expect(/^0x[0-9a-f]{40}$/.test(address)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should generate unique addresses', () => {
      const addresses = new Set<string>();
      for (let i = 0; i < 100; i++) {
        addresses.add(generateWalletAddress());
      }
      // All 100 addresses should be unique (extremely high probability)
      expect(addresses.size).toBe(100);
    });
  });
});
