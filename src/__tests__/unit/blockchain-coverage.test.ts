// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { blockchain: { mode: 'simulated' } },
}));

const mockGetEscrowState = jest.fn<any>();
const mockReleaseMilestone = jest.fn<any>();
const mockRefundMilestone = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  getEscrowState: mockGetEscrowState,
  releaseMilestone: mockReleaseMilestone,
  refundMilestone: mockRefundMilestone,
  deployEscrow: jest.fn<any>().mockResolvedValue({ address: '0x123', transactionHash: 'tx1' }),
  depositToEscrow: jest.fn<any>().mockResolvedValue({ transactionHash: 'tx2' }),
  getEscrowBalance: jest.fn<any>().mockResolvedValue(BigInt(0)),
  getEscrowByContractId: jest.fn<any>(),
}));

// ============================================================
// Factory - Lines 21-22, 34-35
// ============================================================
describe('Blockchain Factory - Coverage', () => {
  it('should return simulated mode by default', async () => {
    const { getBlockchainMode, createBlockchainAdapter } = await import('../../services/blockchain/factory.js');
    const mode = getBlockchainMode();
    expect(mode).toBe('simulated');

    const adapter = createBlockchainAdapter();
    expect(adapter).toBeDefined();
  });
});

// ============================================================
// Simulated Adapter - Lines 117-118, 158-159, 210-211
// ============================================================
const { SimulatedBlockchainAdapter } = await import('../../services/blockchain/simulated-adapter.js');

describe('Simulated Blockchain Adapter - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Lines 117-118: approveMilestone - escrow not found
  it('should throw when escrow not found in approveMilestone', async () => {
    mockGetEscrowState.mockResolvedValue(null);
    const adapter = new SimulatedBlockchainAdapter();
    await expect(adapter.approveMilestone('0x123', 0)).rejects.toThrow('Escrow not found');
  });

  it('should throw milestone index out of bounds in approveMilestone', async () => {
    mockGetEscrowState.mockResolvedValue({ milestones: [], employerAddress: '0xemp' });
    const adapter = new SimulatedBlockchainAdapter();
    await expect(adapter.approveMilestone('0x123', 5)).rejects.toThrow('Milestone index out of bounds');
  });

  // Lines 158-159: resolveDispute - escrow not found
  it('should throw when escrow not found in resolveDispute', async () => {
    mockGetEscrowState.mockResolvedValue(null);
    const adapter = new SimulatedBlockchainAdapter();
    await expect(adapter.resolveDispute('0x123', 0, true)).rejects.toThrow('Escrow not found');
  });

  it('should throw milestone index out of bounds in resolveDispute', async () => {
    mockGetEscrowState.mockResolvedValue({ milestones: [{ id: 'm1', amount: BigInt(100), status: 'pending' }], employerAddress: '0xemp' });
    const adapter = new SimulatedBlockchainAdapter();
    await expect(adapter.resolveDispute('0x123', 5, true)).rejects.toThrow('Milestone index out of bounds');
  });

  // Lines 210-211: getMilestone - escrow not found
  it('should throw when escrow not found in getMilestone', async () => {
    mockGetEscrowState.mockResolvedValue(null);
    const adapter = new SimulatedBlockchainAdapter();
    await expect(adapter.getMilestone('0x123', 0)).rejects.toThrow('Escrow not found');
  });

  it('should throw milestone index out of bounds in getMilestone', async () => {
    mockGetEscrowState.mockResolvedValue({ milestones: [{ id: 'm1' }], employerAddress: '0xemp' });
    const adapter = new SimulatedBlockchainAdapter();
    await expect(adapter.getMilestone('0x123', 5)).rejects.toThrow('Milestone index out of bounds');
  });

  // refundEscrow - escrow not found
  it('should throw when escrow not found in refundEscrow', async () => {
    mockGetEscrowState.mockResolvedValue(null);
    const adapter = new SimulatedBlockchainAdapter();
    await expect(adapter.refundEscrow('0x123')).rejects.toThrow('Escrow not found');
  });
});
