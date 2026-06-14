import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockSubmitTx = jest.fn() as jest.Mock<any>;
const mockConfirmTx = jest.fn() as jest.Mock<any>;
const mockGenerateWallet = jest.fn() as jest.Mock<any>;

let escrowStore: Map<string, any> = new Map();
let milestoneStore: Map<string, any[]> = new Map();

// Mock Appwrite databases
const mockDatabases = {
  listDocuments: jest.fn(async (databaseId: string, collectionId: string, queries?: any[]) => {
    if (collectionId === 'blockchain_escrows') {
      const addressQuery = queries?.find((q: any) => q.attribute === 'address');
      const contractIdQuery = queries?.find((q: any) => q.attribute === 'contract_id');
      
      if (addressQuery) {
        const escrow = escrowStore.get(addressQuery.values[0]);
        return { documents: escrow ? [escrow] : [], total: escrow ? 1 : 0 };
      }
      if (contractIdQuery) {
        const escrow = Array.from(escrowStore.values()).find((e: any) => e.contract_id === contractIdQuery.values[0]);
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
      return { documents: Array.from(milestoneStore.values()).flat(), total: milestoneStore.size };
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
  deleteDocument: jest.fn(async (databaseId: string, collectionId: string, documentId: string) => {
    if (collectionId === 'blockchain_escrows') {
      for (const [key, value] of escrowStore.entries()) {
        if (value.$id === documentId) {
          escrowStore.delete(key);
          break;
        }
      }
    }
    if (collectionId === 'blockchain_escrow_milestones') {
      for (const [key, milestones] of milestoneStore.entries()) {
        const index = milestones.findIndex((m: any) => m.$id === documentId);
        if (index >= 0) {
          milestones.splice(index, 1);
          break;
        }
      }
    }
    return { $id: documentId };
  }),
};

const mockQuery = {
  equal: (attribute: string, value: any) => ({ attribute, method: 'equal', values: [value] }),
  limit: (limit: number) => ({ method: 'limit', values: [limit] }),
};

const mockID = {
  unique: () => `unique-${Date.now()}-${Math.random().toString(36).slice(2)}`,
};

jest.unstable_mockModule(resolveModule('src/services/blockchain-client.ts'), () => ({
  submitTransaction: mockSubmitTx,
  confirmTransaction: mockConfirmTx,
  generateWalletAddress: mockGenerateWallet,
}));

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: mockDatabases,
  DATABASE_ID: 'test-db',
  Query: mockQuery,
  ID: mockID,
}));

// Also mock database.ts since it re-exports from appwrite.ts
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  databases: mockDatabases,
  DATABASE_ID: 'test-db',
}));

const {
  deployEscrow,
  depositToEscrow,
  releaseMilestone,
  refundMilestone,
  getEscrowBalance,
  getEscrowState,
  getMilestoneStatus,
  areAllMilestonesReleased,
  getEscrowByContractId,
  clearEscrows,
} = await import('../../services/escrow-contract.js');

const ESCROW_ADDR = '0xAddr1';
const EMPLOYER = '0xEmployer';
const FREELANCER = '0xFreelancer';

function makeTx(hash = 'tx-hash', blockNumber = 1) {
  return {
    id: 'tx-1',
    type: 'escrow_deploy',
    hash,
    blockNumber,
    gasUsed: BigInt(21000),
  };
}

describe('Escrow Contract - Appwrite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    escrowStore.clear();
    milestoneStore.clear();
    mockGenerateWallet.mockReturnValue(ESCROW_ADDR);
    mockSubmitTx.mockResolvedValue(makeTx());
    mockConfirmTx.mockResolvedValue(makeTx());
  });

  describe('deployEscrow', () => {
    it('should deploy escrow and store in Appwrite', async () => {
      const result = await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      expect(result.escrowAddress).toBe(ESCROW_ADDR);
      expect(result.transactionHash).toBe('tx-hash');
      expect(mockDatabases.createDocument).toHaveBeenCalled();
    });
  });

  describe('depositToEscrow', () => {
    it('should deposit funds to escrow', async () => {
      // Setup escrow first
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      const result = await depositToEscrow(ESCROW_ADDR, BigInt(500), EMPLOYER);
      expect(result.transactionHash).toBe('tx-hash');
      expect(mockDatabases.updateDocument).toHaveBeenCalled();
    });

    it('should reject non-employer deposits', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      await expect(depositToEscrow(ESCROW_ADDR, BigInt(500), '0xWrongAddress'))
        .rejects.toThrow('Only employer can deposit to escrow');
    });
  });

  describe('releaseMilestone', () => {
    it('should release milestone payment', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      await depositToEscrow(ESCROW_ADDR, BigInt(500), EMPLOYER);

      const result = await releaseMilestone(ESCROW_ADDR, 'm-1', EMPLOYER);
      expect(result.transactionHash).toBe('tx-hash');
    });
  });

  describe('refundMilestone', () => {
    it('should refund milestone to employer', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      await depositToEscrow(ESCROW_ADDR, BigInt(500), EMPLOYER);

      const result = await refundMilestone(ESCROW_ADDR, 'm-1', EMPLOYER);
      expect(result.transactionHash).toBe('tx-hash');
    });
  });

  describe('getEscrowBalance', () => {
    it('should return escrow balance', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      await depositToEscrow(ESCROW_ADDR, BigInt(500), EMPLOYER);

      const balance = await getEscrowBalance(ESCROW_ADDR);
      expect(balance).toBe(BigInt(500));
    });
  });

  describe('getEscrowState', () => {
    it('should return null when not found', async () => {
      const state = await getEscrowState('0xNonExistent');
      expect(state).toBeNull();
    });

    it('should return state', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      const state = await getEscrowState(ESCROW_ADDR);
      expect(state).not.toBeNull();
      expect(state?.contractId).toBe('c-1');
    });
  });

  describe('getMilestoneStatus', () => {
    it('should return null when escrow not found', async () => {
      const status = await getMilestoneStatus('0xNonExistent', 'm-1');
      expect(status).toBeNull();
    });

    it('should return null when milestone not found', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      const status = await getMilestoneStatus(ESCROW_ADDR, 'm-nonexistent');
      expect(status).toBeNull();
    });

    it('should return milestone status', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      const status = await getMilestoneStatus(ESCROW_ADDR, 'm-1');
      expect(status).not.toBeNull();
      expect(status?.id).toBe('m-1');
      expect(status?.status).toBe('pending');
    });
  });

  describe('areAllMilestonesReleased', () => {
    it('should return false when escrow not found', async () => {
      const result = await areAllMilestonesReleased('0xNonExistent');
      expect(result).toBe(false);
    });

    it('should return false when not all released', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      const result = await areAllMilestonesReleased(ESCROW_ADDR);
      expect(result).toBe(false);
    });

    it('should return true when all released', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      await depositToEscrow(ESCROW_ADDR, BigInt(500), EMPLOYER);
      await releaseMilestone(ESCROW_ADDR, 'm-1', EMPLOYER);

      const result = await areAllMilestonesReleased(ESCROW_ADDR);
      expect(result).toBe(true);
    });
  });

  describe('getEscrowByContractId', () => {
    it('should return null when not found', async () => {
      const escrow = await getEscrowByContractId('c-nonexistent');
      expect(escrow).toBeNull();
    });

    it('should return escrow state', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      const escrow = await getEscrowByContractId('c-1');
      expect(escrow).not.toBeNull();
      expect(escrow?.address).toBe(ESCROW_ADDR);
    });
  });

  describe('clearEscrows', () => {
    it('should clear all escrows', async () => {
      await deployEscrow({
        contractId: 'c-1',
        employerAddress: EMPLOYER,
        freelancerAddress: FREELANCER,
        totalAmount: BigInt(1000),
        milestones: [{ id: 'm-1', amount: BigInt(500), status: 'pending' as const }],
      });

      await clearEscrows();

      const state = await getEscrowState(ESCROW_ADDR);
      expect(state).toBeNull();
    });
  });
});
