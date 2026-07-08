// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockSubmitTx = jest.fn() as jest.Mock<any>;
const mockConfirmTx = jest.fn() as jest.Mock<any>;

const mockDatabases = {
  listDocuments: jest.fn(async () => ({ documents: [], total: 0 })),
  createDocument: jest.fn(async () => ({})),
  updateDocument: jest.fn(async () => ({})),
  deleteDocument: jest.fn(async () => ({})),
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: mockDatabases,
  DATABASE_ID: 'test-db',
  ID: { unique: () => 'unique-id' },
  Query: {
    equal: (attr: string, val: any) => ({ attribute: attr, values: [val], operator: 'equal' }),
    limit: (n: number) => ({ limit: n }),
  },
}));

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTx,
  confirmTransaction: mockConfirmTx,
  generateWalletAddress: jest.fn(() => '0x' + 'a'.repeat(40)),
}));

jest.unstable_mockModule(resolveModule('src/utils/async-lock.ts'), () => ({
  withLock: (_key: string, fn: () => Promise<any>) => fn(),
}));

const {
  depositToEscrow,
  releaseMilestone,
} = await import('../../services/escrow-contract.js');

describe('Escrow Contract - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabases.listDocuments.mockReset();
    mockDatabases.createDocument.mockReset();
    mockDatabases.updateDocument.mockReset();
    mockDatabases.deleteDocument.mockReset();
  });

  // L234, L235: depositToEscrow - escrow not found
  describe('depositToEscrow - escrow not found (L234, L235)', () => {
    it('should throw when escrow contract is not found', async () => {
      mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });

      await expect(depositToEscrow('0xnonexistent', BigInt(1000), '0xEmployer')).rejects.toThrow('Escrow contract not found');
    });
  });

  // L282, L283: releaseMilestone - escrow not found
  describe('releaseMilestone - escrow not found (L282, L283)', () => {
    it('should throw when escrow contract is not found', async () => {
      mockDatabases.listDocuments.mockResolvedValue({ documents: [], total: 0 });

      await expect(releaseMilestone('0xnonexistent', 'ms-1', '0xEmployer')).rejects.toThrow('Escrow contract not found');
    });
  });
});
