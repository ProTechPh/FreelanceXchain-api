import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    blockchain: {
      rpcUrl: 'http://localhost:8545',
      privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
      mode: 'simulated',
    },
    server: { port: 3000, nodeEnv: 'test', baseUrl: 'http://localhost:3000', enableApiDocs: false },
    appwrite: { url: 'http://localhost', anonKey: 'test', serviceRoleKey: 'test', storage: { proposalAttachmentsBucket: 'test' } },
    jwt: { secret: 'test', refreshSecret: 'test', expiresIn: '1h', refreshExpiresIn: '7d' },
    llm: { apiKey: 'test', apiUrl: 'http://localhost', model: 'test' },
  },
}));

describe('Contracts Config', () => {
  const importModule = async () => {
    return await import('../../config/contracts.js');
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // Clear all contract address env vars
    const networks = ['HARDHAT', 'GANACHE', 'SEPOLIA', 'POLYGON', 'AMOY', 'MAINNET'];
    const contracts = ['REPUTATION', 'ESCROW', 'AGREEMENT', 'DISPUTE', 'MILESTONE'];
    for (const network of networks) {
      for (const contract of contracts) {
        delete process.env[`${network}_${contract}_ADDRESS`];
      }
    }
  });

  describe('getCurrentNetwork', () => {
    it('should detect hardhat network', async () => {
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('hardhat');
    });

    it('should detect ganache network', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'http://localhost:7545', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('ganache');
    });

    it('should detect sepolia network', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'https://sepolia.infura.io', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('sepolia');
    });

    it('should detect polygon network', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'https://polygon-mainnet.infura.io', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('polygon');
    });

    it('should detect amoy network', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'https://amoy.infura.io', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('amoy');
    });

    it('should detect mainnet network', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'https://mainnet.infura.io', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('mainnet');
    });

    it('should default to ganache for unknown rpc', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'http://unknown.com', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('ganache');
    });

    it('should handle empty rpcUrl', async () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: '', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getCurrentNetwork } = await importModule();
      expect(getCurrentNetwork()).toBe('ganache');
    });
  });

  describe('getContractAddress', () => {
    const applyEnvMock = () => {
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: {
          blockchain: {
            rpcUrl: 'http://localhost:8545',
            privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
            mode: 'simulated',
          },
          server: { port: 3000, nodeEnv: 'test', baseUrl: 'http://localhost:3000', enableApiDocs: false },
          appwrite: { url: 'http://localhost', anonKey: 'test', serviceRoleKey: 'test', storage: { proposalAttachmentsBucket: 'test' } },
          jwt: { secret: 'test', refreshSecret: 'test', expiresIn: '1h', refreshExpiresIn: '7d' },
          llm: { apiKey: 'test', apiUrl: 'http://localhost', model: 'test' },
        },
      }));
    };

    it('should return undefined when no address configured', async () => {
      applyEnvMock();
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBeUndefined();
      expect(getContractAddress('escrow')).toBeUndefined();
      expect(getContractAddress('agreement')).toBeUndefined();
      expect(getContractAddress('disputeResolution')).toBeUndefined();
      expect(getContractAddress('milestoneRegistry')).toBeUndefined();
    });

    it('should return hardhat reputation address', async () => {
      process.env.HARDHAT_REPUTATION_ADDRESS = '0xHardhatRep';
      applyEnvMock();
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBe('0xHardhatRep');
    });

    it('should return hardhat escrow address', async () => {
      process.env.HARDHAT_ESCROW_ADDRESS = '0xHardhatEscrow';
      applyEnvMock();
      const { getContractAddress } = await importModule();
      expect(getContractAddress('escrow')).toBe('0xHardhatEscrow');
    });

    it('should return hardhat agreement address', async () => {
      process.env.HARDHAT_AGREEMENT_ADDRESS = '0xHardhatAgreement';
      applyEnvMock();
      const { getContractAddress } = await importModule();
      expect(getContractAddress('agreement')).toBe('0xHardhatAgreement');
    });

    it('should return hardhat disputeResolution address', async () => {
      process.env.HARDHAT_DISPUTE_ADDRESS = '0xHardhatDispute';
      applyEnvMock();
      const { getContractAddress } = await importModule();
      expect(getContractAddress('disputeResolution')).toBe('0xHardhatDispute');
    });

    it('should return hardhat milestoneRegistry address', async () => {
      process.env.HARDHAT_MILESTONE_ADDRESS = '0xHardhatMilestone';
      applyEnvMock();
      const { getContractAddress } = await importModule();
      expect(getContractAddress('milestoneRegistry')).toBe('0xHardhatMilestone');
    });
  });

  describe('top-level env loading for all networks', () => {
    it('should load ganache addresses', async () => {
      process.env.GANACHE_REPUTATION_ADDRESS = '0xGanacheRep';
      process.env.GANACHE_ESCROW_ADDRESS = '0xGanacheEscrow';
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'http://localhost:7545', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBe('0xGanacheRep');
      expect(getContractAddress('escrow')).toBe('0xGanacheEscrow');
    });

    it('should load sepolia addresses', async () => {
      process.env.SEPOLIA_REPUTATION_ADDRESS = '0xSepoliaRep';
      process.env.SEPOLIA_AGREEMENT_ADDRESS = '0xSepoliaAgreement';
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'https://sepolia.infura.io', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBe('0xSepoliaRep');
      expect(getContractAddress('agreement')).toBe('0xSepoliaAgreement');
    });

    it('should load polygon addresses', async () => {
      process.env.POLYGON_DISPUTE_ADDRESS = '0xPolygonDispute';
      process.env.POLYGON_MILESTONE_ADDRESS = '0xPolygonMilestone';
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'https://polygon-mainnet.infura.io', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getContractAddress } = await importModule();
      expect(getContractAddress('disputeResolution')).toBe('0xPolygonDispute');
      expect(getContractAddress('milestoneRegistry')).toBe('0xPolygonMilestone');
    });

    it('should load amoy addresses', async () => {
      process.env.AMOY_REPUTATION_ADDRESS = '0xAmoyRep';
      process.env.AMOY_ESCROW_ADDRESS = '0xAmoyEscrow';
      process.env.AMOY_AGREEMENT_ADDRESS = '0xAmoyAgreement';
      process.env.AMOY_DISPUTE_ADDRESS = '0xAmoyDispute';
      process.env.AMOY_MILESTONE_ADDRESS = '0xAmoyMilestone';
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'https://amoy.infura.io', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBe('0xAmoyRep');
      expect(getContractAddress('escrow')).toBe('0xAmoyEscrow');
      expect(getContractAddress('agreement')).toBe('0xAmoyAgreement');
      expect(getContractAddress('disputeResolution')).toBe('0xAmoyDispute');
      expect(getContractAddress('milestoneRegistry')).toBe('0xAmoyMilestone');
    });

    it('should load mainnet addresses', async () => {
      process.env.MAINNET_REPUTATION_ADDRESS = '0xMainnetRep';
      process.env.MAINNET_ESCROW_ADDRESS = '0xMainnetEscrow';
      jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
        config: { blockchain: { rpcUrl: 'https://mainnet.infura.io', privateKey: '0x123', mode: 'simulated' } },
      }));
      const { getContractAddress } = await importModule();
      expect(getContractAddress('reputation')).toBe('0xMainnetRep');
      expect(getContractAddress('escrow')).toBe('0xMainnetEscrow');
    });
  });
});
