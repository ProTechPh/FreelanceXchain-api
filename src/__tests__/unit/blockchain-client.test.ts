/**
 * Blockchain Client Tests - Refactored
 * Tests for blockchain transaction operations and serialization
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fc from 'fast-check';
import path from 'node:path';
import type { Transaction, PaymentTransaction } from '../../services/blockchain-types.js';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// In-memory transaction store for mocking DB
let transactionStore: Map<string, any> = new Map();

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: {
    query: jest.fn(async (sql: string, params: any[]) => {
      const s = sql.trim().toUpperCase();
      if (s.startsWith('INSERT INTO BLOCKCHAIN_TRANSACTIONS')) {
        const row = {
          id: params[0], type: params[1], from_address: params[2], to_address: params[3],
          amount: params[4], data: JSON.parse(params[5]), timestamp: params[6],
          status: params[7], hash: params[8], block_number: params[9],
          gas_used: params[10], confirm_at: params[11],
        };
        transactionStore.set(params[0], row);
        return { rows: [row] };
      }
      if (s.startsWith('SELECT * FROM BLOCKCHAIN_TRANSACTIONS WHERE ID')) {
        const row = transactionStore.get(params[0]) ?? null;
        return { rows: row ? [row] : [] };
      }
      if (s.startsWith('SELECT CONFIRM_AT FROM BLOCKCHAIN_TRANSACTIONS WHERE ID')) {
        const row = transactionStore.get(params[0]) ?? null;
        return { rows: row ? [{ confirm_at: row.confirm_at }] : [] };
      }
      if (s.startsWith('UPDATE BLOCKCHAIN_TRANSACTIONS') && s.includes('STATUS') && s.includes('BLOCK_NUMBER')) {
        const row = transactionStore.get(params[3]);
        if (!row) return { rows: [] };
        row.status = params[0]; row.block_number = params[1]; row.gas_used = params[2]; row.confirm_at = null;
        transactionStore.set(params[3], row);
        return { rows: [row] };
      }
      if (s.startsWith('UPDATE BLOCKCHAIN_TRANSACTIONS') && s.includes('STATUS')) {
        const row = transactionStore.get(params[1]);
        if (!row) return { rows: [] };
        row.status = params[0]; row.confirm_at = null;
        transactionStore.set(params[1], row);
        return { rows: [row] };
      }
      if (s.startsWith('DELETE FROM BLOCKCHAIN_TRANSACTIONS')) {
        transactionStore.clear();
        return { rows: [] };
      }
      return { rows: [] };
    }),
  },
  config: { blockchain: { rpcUrl: 'http://rpc.example.com', privateKey: '0xabc', mode: 'real' } },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    blockchain: { rpcUrl: 'http://rpc.example.com', privateKey: '0xabc', mode: 'real' },
    database: { url: 'postgresql://localhost/test' },
    server: { port: 3000, nodeEnv: 'test', baseUrl: 'http://localhost:3000', enableApiDocs: false },
    jwt: { secret: 'test', refreshSecret: 'test', expiresIn: '1h', refreshExpiresIn: '7d' },
    appwrite: { endpoint: 'https://cloud.appwrite.io/v1', projectId: 'test', apiKey: 'test', buckets: {} },
    llm: { apiKey: undefined, apiUrl: 'http://localhost:5000', model: 'test' },
  },
}));

// Import blockchain client functions
const {
  submitTransaction,
  getTransaction,
  confirmTransaction,
  failTransaction,
  clearTransactions,
  getBlockchainConfig,
  isBlockchainAvailable,
  generateWalletAddress,
  serializeTransaction,
  deserializeTransaction,
  serializePaymentTransaction,
  deserializePaymentTransaction,
} = await import('../../services/blockchain-client.js');

// Custom arbitraries for property-based testing
const walletAddressArbitrary = () =>
  fc.string({ minLength: 40, maxLength: 40, unit: 'binary-ascii' }).map(s => 
    `0x${Array.from(s).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').slice(0, 40)}`
  );

const transactionTypeArbitrary = () =>
  fc.constantFrom('escrow_deploy', 'escrow_deposit', 'milestone_release', 'refund');

const transactionArbitrary = () =>
  fc.record({
    id: fc.uuid(),
    type: transactionTypeArbitrary(),
    from: walletAddressArbitrary(),
    to: walletAddressArbitrary(),
    amount: fc.bigInt({ min: 0n, max: 1000000000000000000n }),
    hash: fc.option(fc.string({ minLength: 32, maxLength: 32, unit: 'binary-ascii' }).map(s => 
      `0x${Array.from(s).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')}`
    ), { nil: undefined }),
    status: fc.constantFrom('pending', 'confirmed', 'failed'),
    blockNumber: fc.option(fc.integer({ min: 1, max: 1000000 }), { nil: undefined }),
    gasUsed: fc.option(fc.bigInt({ min: 21000n, max: 500000n }), { nil: undefined }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    data: fc.option(fc.record({ milestoneId: fc.string() }), { nil: undefined }),
  }) as fc.Arbitrary<Transaction>;

const paymentTransactionArbitrary = () =>
  fc.record({
    escrowAddress: walletAddressArbitrary(),
    milestoneId: fc.string(),
    amount: fc.bigInt({ min: 0n, max: 1000000000000000000n }),
    recipient: walletAddressArbitrary(),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    transactionHash: fc.string({ minLength: 32, maxLength: 32, unit: 'binary-ascii' }).map(s => 
      `0x${Array.from(s).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')}`
    ),
  }) as fc.Arbitrary<PaymentTransaction>;

describe('Blockchain Client - Refactored', () => {
  beforeEach(() => {
    transactionStore.clear();
  });

  describe('Transaction Serialization', () => {
    it('should serialize and deserialize transactions correctly', () => {
      fc.assert(
        fc.property(
          transactionArbitrary(),
          (tx) => {
            const serialized = serializeTransaction(tx);
            const deserialized = deserializeTransaction(serialized);

            expect(deserialized.id).toBe(tx.id);
            expect(deserialized.type).toBe(tx.type);
            expect(deserialized.from).toBe(tx.from);
            expect(deserialized.to).toBe(tx.to);
            expect(deserialized.amount).toBe(tx.amount);
            expect(deserialized.status).toBe(tx.status);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle JSON stringify/parse cycle', () => {
      fc.assert(
        fc.property(
          transactionArbitrary(),
          (tx) => {
            const serialized = serializeTransaction(tx);
            const jsonString = JSON.stringify(serialized);
            const parsed = JSON.parse(jsonString);
            const deserialized = deserializeTransaction(parsed);

            expect(deserialized.id).toBe(tx.id);
            expect(deserialized.amount).toBe(tx.amount);
            if (tx.gasUsed !== undefined) {
              expect(deserialized.gasUsed).toBe(tx.gasUsed);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle PaymentTransaction JSON stringify/parse cycle', () => {
      fc.assert(
        fc.property(
          paymentTransactionArbitrary(),
          (tx) => {
            const serialized = serializePaymentTransaction(tx);
            const jsonString = JSON.stringify(serialized);
            const parsed = JSON.parse(jsonString);
            const deserialized = deserializePaymentTransaction(parsed);

            expect(deserialized.escrowAddress).toBe(tx.escrowAddress);
            expect(deserialized.amount).toBe(tx.amount);
            expect(deserialized.milestoneId).toBe(tx.milestoneId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Transaction Operations', () => {
    it('should create a transaction with pending status', async () => {
      const input = {
        type: 'escrow_deploy' as const,
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
      const input = {
        type: 'milestone_release' as const,
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

    it('should update transaction status to confirmed', async () => {
      const input = {
        type: 'escrow_deposit' as const,
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

      // All 100 addresses should be unique
      expect(addresses.size).toBe(100);
    });
  });

  describe('failTransaction', () => {
    it('should fail a transaction', async () => {
      const input = {
        type: 'refund' as const,
        from: generateWalletAddress(),
        to: generateWalletAddress(),
        amount: BigInt(300000),
      };

      const tx = await submitTransaction(input);
      expect(tx.status).toBe('pending');

      const failed = await failTransaction(tx.id);

      expect(failed).not.toBeNull();
      expect(failed?.status).toBe('failed');
    });

    it('should return null for non-existent transaction', async () => {
      const result = await failTransaction('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('clearTransactions', () => {
    it('should clear all transactions in test environment', async () => {
      const input = {
        type: 'escrow_deploy' as const,
        from: generateWalletAddress(),
        to: generateWalletAddress(),
        amount: BigInt(1000000),
      };

      await submitTransaction(input);
      
      const tx = await submitTransaction(input);
      const txsBefore = await getTransaction(tx.id);
      expect(txsBefore).not.toBeNull();

      await clearTransactions();

      const txsAfter = await getTransaction(tx.id);
      expect(txsAfter).toBeNull();
    });
  });

  describe('isBlockchainAvailable', () => {
    it('should check if blockchain is available', async () => {
      const available = await isBlockchainAvailable();
      expect(available).toBe(true);
    });
  });

  describe('getBlockchainConfig', () => {
    it('should return blockchain configuration', () => {
      const config = getBlockchainConfig();
      expect(config).toBeDefined();
      expect(config.rpcUrl).toBeDefined();
      expect(config.privateKey).toBeDefined();
      expect(config.chainId).toBe(1);
    });
  });
});
