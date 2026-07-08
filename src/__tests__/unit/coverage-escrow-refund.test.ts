// @ts-nocheck
/**
 * Covers refundMilestone error paths in escrow-contract.ts
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

// Mock Appwrite databases
let escrowStore: Map<string, any> = new Map();
let milestoneStore: Map<string, any[]> = new Map();

const mockDatabases = {
  listDocuments: jest.fn(async (databaseId: string, collectionId: string, queries?: any[]) => {
    if (collectionId === 'blockchain_escrows') {
      const addressQuery = queries?.find((q: any) => q.attribute === 'address');
      if (addressQuery) {
        const escrow = escrowStore.get(addressQuery.values[0]);
        return { documents: escrow ? [escrow] : [], total: escrow ? 1 : 0 };
      }
      return { documents: Array.from(escrowStore.values()), total: escrowStore.size };
    }
    if (collectionId === 'blockchain_escrow_milestones') {
      const addressQuery = queries?.find((q: any) => q.attribute === 'escrow_address');
      if (addressQuery) {
        const ms = milestoneStore.get(addressQuery.values[0]) || [];
        return { documents: ms, total: ms.length };
      }
      return { documents: [], total: 0 };
    }
    return { documents: [], total: 0 };
  }),
  createDocument: jest.fn(async (databaseId: string, collectionId: string, documentId: string, data: any) => {
    if (collectionId === 'blockchain_escrows') {
      escrowStore.set(data.address, { $id: documentId, ...data });
    }
    if (collectionId === 'blockchain_escrow_milestones') {
      const existing = milestoneStore.get(data.escrow_address) || [];
      existing.push({ $id: documentId, ...data });
      milestoneStore.set(data.escrow_address, existing);
    }
    return { $id: documentId, ...data };
  }),
  updateDocument: jest.fn(async (databaseId: string, collectionId: string, documentId: string, data: any) => {
    if (collectionId === 'blockchain_escrows') {
      for (const [key, value] of escrowStore.entries()) {
        if (value.$id === documentId) {
          escrowStore.set(key, { ...value, ...data });
          break;
        }
      }
    }
    if (collectionId === 'blockchain_escrow_milestones') {
      for (const [, milestones] of milestoneStore.entries()) {
        const milestone = milestones.find((m: any) => m.$id === documentId);
        if (milestone) {
          Object.assign(milestone, data);
          break;
        }
      }
    }
    return { $id: documentId, ...data };
  }),
  deleteDocument: jest.fn(),
};

const mockQuery = {
  equal: (attribute: string, value: any) => ({ attribute, method: 'equal', values: [value] }),
  limit: (limit: number) => ({ method: 'limit', values: [limit] }),
};

const mockID = {
  unique: () => `unique-${Date.now()}-${Math.random().toString(36).slice(2)}`,
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: mockDatabases,
  DATABASE_ID: 'test-db',
  Query: mockQuery,
  ID: mockID,
}));

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  databases: mockDatabases,
  DATABASE_ID: 'test-db',
}));

const mockSubmitTransaction = jest.fn<any>();
const mockConfirmTransaction = jest.fn<any>();
const mockGenerateWalletAddress = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTransaction,
  confirmTransaction: mockConfirmTransaction,
  generateWalletAddress: mockGenerateWalletAddress,
}));

jest.unstable_mockModule(resolveModule('src/services/blockchain-types.ts'), () => ({}));

jest.unstable_mockModule(resolveModule('src/utils/async-lock.ts'), () => ({
  withLock: (_key: string, fn: () => Promise<any>) => fn(),
}));

const { deployEscrow, depositToEscrow, releaseMilestone, refundMilestone } = await import(
  '../../services/escrow-contract.js'
);

describe('Escrow Contract - refund coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    escrowStore.clear();
    milestoneStore.clear();
    mockGenerateWalletAddress.mockReturnValue('0xescrow');
    mockSubmitTransaction.mockResolvedValue({ id: 'tx-1', hash: '0xtx', blockNumber: 1 });
    mockConfirmTransaction.mockResolvedValue({ id: 'tx-1', hash: '0xtx', blockNumber: 1, gasUsed: BigInt(21000) });
  });

  async function setupEscrow(milestoneStatus = 'pending', balance = BigInt(1000)) {
    await deployEscrow({
      contractId: 'c-1',
      employerAddress: '0xemp',
      freelancerAddress: '0xfree',
      totalAmount: BigInt(1000),
      milestones: [{ id: 'm-1', amount: BigInt(500), description: 'Test milestone' }],
    });

    if (balance > BigInt(0)) {
      await depositToEscrow('0xescrow', balance, '0xemp');
    }
  }

  describe('refundMilestone error paths', () => {
    it('should fail when escrow not found', async () => {
      await expect(
        refundMilestone('0xnonexistent', 'm-1', '0xemp')
      ).rejects.toThrow('Escrow contract not found');
    });

    it('should fail when resolver is not employer', async () => {
      await setupEscrow('pending');
      await expect(
        refundMilestone('0xescrow', 'm-1', '0xwrong')
      ).rejects.toThrow('Only the employer or authorized resolver can refund a milestone');
    });

    it('should fail when milestone not found', async () => {
      await setupEscrow('pending');
      await expect(
        refundMilestone('0xescrow', 'm-nonexistent', '0xemp')
      ).rejects.toThrow('Milestone not found');
    });

    it('should fail when milestone already released', async () => {
      await setupEscrow('pending');
      await releaseMilestone('0xescrow', 'm-1', '0xemp');
      await expect(
        refundMilestone('0xescrow', 'm-1', '0xemp')
      ).rejects.toThrow('Milestone already released');
    });

    it('should fail when milestone already refunded', async () => {
      await setupEscrow('pending');
      await refundMilestone('0xescrow', 'm-1', '0xemp');
      await expect(
        refundMilestone('0xescrow', 'm-1', '0xemp')
      ).rejects.toThrow('Milestone already refunded');
    });

    it('should fail when insufficient balance', async () => {
      await setupEscrow('pending', BigInt(100));
      await expect(
        refundMilestone('0xescrow', 'm-1', '0xemp')
      ).rejects.toThrow('Insufficient escrow balance');
    });

    it('should fail when confirm transaction fails', async () => {
      await setupEscrow('pending');
      mockConfirmTransaction.mockResolvedValueOnce(null);
      await expect(
        refundMilestone('0xescrow', 'm-1', '0xemp')
      ).rejects.toThrow('Failed to confirm refund transaction');
    });
  });
});
