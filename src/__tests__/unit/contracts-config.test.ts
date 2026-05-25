import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Save original env
const originalEnv = { ...process.env };

describe('Contracts Config', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    const networks = ['HARDHAT', 'GANACHE', 'SEPOLIA', 'POLYGON', 'AMOY', 'MAINNET'];
    const contracts = ['REPUTATION', 'ESCROW', 'AGREEMENT', 'DISPUTE', 'MILESTONE'];
    for (const network of networks) {
      for (const contract of contracts) {
        delete process.env[`${network}_${contract}_ADDRESS`];
      }
    }
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const importModule = async () => {
    return await import('../../config/contracts.js');
  };

  describe('getCurrentNetwork', () => {
    it('should detect sepolia from RPC URL', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'https://sepolia.infura.io/v3/test',
          },
        },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('sepolia');
    });

    it('should detect polygon from RPC URL', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'https://polygon-mainnet.infura.io/v3/test',
          },
        },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('polygon');
    });

    it('should detect amoy from RPC URL', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'https://polygon-amoy.infura.io/v3/test',
          },
        },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('amoy');
    });

    it('should detect ganache from localhost:7545', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'http://127.0.0.1:7545',
          },
        },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('ganache');
    });

    it('should detect hardhat from localhost:8545', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'http://localhost:8545',
          },
        },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('hardhat');
    });

    it('should detect mainnet from RPC URL', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'https://mainnet.infura.io/v3/test',
          },
        },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('mainnet');
    });

    it('should default to ganache for unknown RPC', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'https://unknown.network.com',
          },
        },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('ganache');
    });

    it('should default to ganache for empty RPC URL', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: '',
          },
        },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('ganache');
    });
  });

  describe('getContractAddress', () => {
    it('should return contract address from environment', async () => {
      process.env.HARDHAT_REPUTATION_ADDRESS = '0xHardhatReputation';
      process.env.HARDHAT_ESCROW_ADDRESS = '0xHardhatEscrow';
      process.env.HARDHAT_AGREEMENT_ADDRESS = '0xHardhatAgreement';
      process.env.HARDHAT_DISPUTE_ADDRESS = '0xHardhatDispute';
      process.env.HARDHAT_MILESTONE_ADDRESS = '0xHardhatMilestone';

      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'http://localhost:8545',
          },
        },
      }));
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBe('0xHardhatReputation');
      expect(getContractAddress('escrow')).toBe('0xHardhatEscrow');
      expect(getContractAddress('agreement')).toBe('0xHardhatAgreement');
      expect(getContractAddress('disputeResolution')).toBe('0xHardhatDispute');
      expect(getContractAddress('milestoneRegistry')).toBe('0xHardhatMilestone');
    });

    it('should return undefined for unset contract', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'http://localhost:8545',
          },
        },
      }));
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBeUndefined();
    });

    it('should load ganache addresses', async () => {
      process.env.GANACHE_REPUTATION_ADDRESS = '0xGanacheReputation';
      process.env.GANACHE_ESCROW_ADDRESS = '0xGanacheEscrow';
      process.env.GANACHE_AGREEMENT_ADDRESS = '0xGanacheAgreement';
      process.env.GANACHE_DISPUTE_ADDRESS = '0xGanacheDispute';
      process.env.GANACHE_MILESTONE_ADDRESS = '0xGanacheMilestone';

      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'http://127.0.0.1:7545',
          },
        },
      }));
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBe('0xGanacheReputation');
      expect(getContractAddress('escrow')).toBe('0xGanacheEscrow');
      expect(getContractAddress('agreement')).toBe('0xGanacheAgreement');
      expect(getContractAddress('disputeResolution')).toBe('0xGanacheDispute');
      expect(getContractAddress('milestoneRegistry')).toBe('0xGanacheMilestone');
    });

    it('should load sepolia addresses', async () => {
      process.env.SEPOLIA_REPUTATION_ADDRESS = '0xSepoliaReputation';
      process.env.SEPOLIA_ESCROW_ADDRESS = '0xSepoliaEscrow';
      process.env.SEPOLIA_AGREEMENT_ADDRESS = '0xSepoliaAgreement';
      process.env.SEPOLIA_DISPUTE_ADDRESS = '0xSepoliaDispute';
      process.env.SEPOLIA_MILESTONE_ADDRESS = '0xSepoliaMilestone';

      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'https://sepolia.infura.io/v3/test',
          },
        },
      }));
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBe('0xSepoliaReputation');
      expect(getContractAddress('escrow')).toBe('0xSepoliaEscrow');
      expect(getContractAddress('agreement')).toBe('0xSepoliaAgreement');
      expect(getContractAddress('disputeResolution')).toBe('0xSepoliaDispute');
      expect(getContractAddress('milestoneRegistry')).toBe('0xSepoliaMilestone');
    });
  });
});
