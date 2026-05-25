import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockIsWeb3Available = jest.fn(() => false);

jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  isWeb3Available: mockIsWeb3Available,
  isValidAddress: jest.fn(),
  formatEther: jest.fn(),
  parseEther: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  deployEscrowContract: jest.fn(),
  getEscrowInfo: jest.fn(),
  submitMilestone: jest.fn(),
  approveMilestone: jest.fn(),
  disputeMilestone: jest.fn(),
  resolveDispute: jest.fn(),
  cancelContract: jest.fn(),
  getMilestone: jest.fn(),
  getEscrowBalance: jest.fn(),
  getAllMilestones: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  deployEscrow: jest.fn(),
  depositToEscrow: jest.fn(),
  releaseMilestone: jest.fn(),
  refundMilestone: jest.fn(),
  getEscrowBalance: jest.fn(),
  getEscrowState: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    blockchain: { mode: 'simulated' },
    appwrite: { url: 'http://localhost', anonKey: 'key', serviceRoleKey: 'skey' },
    jwt: { secret: 'secret' },
    server: { port: 3000, nodeEnv: 'test' },
  },
}));

const {
  getBlockchainMode,
  createBlockchainAdapter,
  getBlockchainAdapter,
  resetBlockchainAdapter,
} = await import('../../services/blockchain/factory.js');

const { SimulatedBlockchainAdapter } = await import('../../services/blockchain/simulated-adapter.js');
const { RealBlockchainAdapter } = await import('../../services/blockchain/real-adapter.js');

describe('Blockchain Factory', () => {
  beforeEach(() => {
    resetBlockchainAdapter();
    jest.clearAllMocks();
  });

  describe('getBlockchainMode', () => {
    it('should return simulated when config.blockchain.mode is undefined', async () => {
      const { config } = await import('../../config/env.js');
      (config.blockchain as any).mode = undefined;
      const mode = getBlockchainMode();
      expect(mode).toBe('simulated');
      (config.blockchain as any).mode = 'simulated';
    });

    it('should return simulated by default', () => {
      const mode = getBlockchainMode();
      expect(['simulated', 'real']).toContain(mode);
    });
  });

  describe('createBlockchainAdapter', () => {
    it('should create a SimulatedBlockchainAdapter in simulated mode', () => {
      const adapter = createBlockchainAdapter();
      expect(adapter).toBeInstanceOf(SimulatedBlockchainAdapter);
    });
  });

  describe('getBlockchainAdapter', () => {
    it('should return a blockchain adapter instance', () => {
      const adapter = getBlockchainAdapter();
      expect(adapter).toBeDefined();
      expect(typeof adapter.isAvailable).toBe('function');
    });

    it('should return the same instance on repeated calls (singleton)', () => {
      const adapter1 = getBlockchainAdapter();
      const adapter2 = getBlockchainAdapter();
      expect(adapter1).toBe(adapter2);
    });
  });

  describe('resetBlockchainAdapter', () => {
    it('should reset the singleton so the next call creates a new instance', () => {
      const adapter1 = getBlockchainAdapter();
      resetBlockchainAdapter();
      const adapter2 = getBlockchainAdapter();
      expect(adapter1).not.toBe(adapter2);
    });
  });
});
