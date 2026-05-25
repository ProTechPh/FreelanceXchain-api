// @ts-nocheck
/**
 * Covers lines 117-118, 158-159, 210-211 in simulated-adapter.ts
 * These are the `if (!milestone)` null checks after valid index access.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockGetEscrowState = jest.fn<any>();
const mockReleaseMilestone = jest.fn<any>();
const mockRefundMilestone = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  deployEscrow: jest.fn(),
  depositToEscrow: jest.fn(),
  releaseMilestone: mockReleaseMilestone,
  refundMilestone: mockRefundMilestone,
  getEscrowBalance: jest.fn<any>().mockResolvedValue(BigInt(0)),
  getEscrowState: mockGetEscrowState,
}));

const { SimulatedBlockchainAdapter } = await import(
  '../../services/blockchain/simulated-adapter.js'
);

describe('SimulatedBlockchainAdapter - sparse milestone arrays', () => {
  let adapter: InstanceType<typeof SimulatedBlockchainAdapter>;

  beforeEach(() => {
    adapter = new SimulatedBlockchainAdapter();
    jest.clearAllMocks();
  });

  // Sparse array: length=3 but index 1 is undefined
  function makeSparseState() {
    const milestones: any[] = [];
    milestones[0] = { id: 'ms-0', amount: BigInt(500), status: 'pending' };
    milestones.length = 3; // makes index 1,2 empty slots (undefined)
    return {
      contractId: 'c-1',
      employerAddress: '0xEmp',
      freelancerAddress: '0xFree',
      totalAmount: BigInt(1000),
      balance: BigInt(1000),
      milestones,
    };
  }

  // Lines 117-118: approveMilestone with undefined milestone at valid index
  it('approveMilestone throws "Milestone not found" for sparse array', async () => {
    mockGetEscrowState.mockResolvedValue(makeSparseState());
    await expect(adapter.approveMilestone('0xEscrow', 1)).rejects.toThrow('Milestone not found');
  });

  // Lines 158-159: resolveDispute with undefined milestone at valid index
  it('resolveDispute throws "Milestone not found" for sparse array', async () => {
    mockGetEscrowState.mockResolvedValue(makeSparseState());
    await expect(adapter.resolveDispute('0xEscrow', 1, true)).rejects.toThrow('Milestone not found');
  });

  // Lines 210-211: getMilestone with undefined milestone at valid index
  it('getMilestone throws "Milestone not found" for sparse array', async () => {
    mockGetEscrowState.mockResolvedValue(makeSparseState());
    await expect(adapter.getMilestone('0xEscrow', 1)).rejects.toThrow('Milestone not found');
  });
});
