/**
 * Web3 Client Tests - Refactored
 * Tests for Ethereum blockchain integration using shared test utilities
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';

// Create mock instances
const mockProvider = {
  getBalance: jest.fn<any>(),
  getNetwork: jest.fn<any>(),
  getTransaction: jest.fn<any>(),
  getTransactionReceipt: jest.fn<any>(),
  waitForTransaction: jest.fn<any>(),
  getFeeData: jest.fn<any>(),
  getBlockNumber: jest.fn<any>(),
};

const mockWallet = {
  address: '0x1234567890123456789012345678901234567890',
  sendTransaction: jest.fn<any>(),
  estimateGas: jest.fn<any>(),
  signMessage: jest.fn<any>(),
};

const mockContract = {
  getAddress: jest.fn<any>(),
  deploymentTransaction: jest.fn<any>(),
  waitForDeployment: jest.fn<any>(),
};

const mockContractFactory = {
  deploy: jest.fn<any>(),
};

const mockEthers = {
  JsonRpcProvider: jest.fn(() => mockProvider),
  Wallet: jest.fn(() => mockWallet),
  Contract: jest.fn(() => mockContract),
  ContractFactory: jest.fn(() => mockContractFactory),
  formatEther: jest.fn((wei: bigint) => (Number(wei) / 1e18).toString()),
  parseEther: jest.fn((eth: string) => BigInt(Math.floor(parseFloat(eth) * 1e18))),
  isAddress: jest.fn((addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr)),
  getAddress: jest.fn((addr: string) => addr),
  verifyMessage: jest.fn(),
};

// Mock ethers module (ESM)
jest.unstable_mockModule('ethers', () => ({
  ethers: mockEthers,
  JsonRpcProvider: mockEthers.JsonRpcProvider,
  Wallet: mockEthers.Wallet,
  Contract: mockEthers.Contract,
  ContractFactory: mockEthers.ContractFactory,
  formatEther: mockEthers.formatEther,
  parseEther: mockEthers.parseEther,
  isAddress: mockEthers.isAddress,
  getAddress: mockEthers.getAddress,
  verifyMessage: mockEthers.verifyMessage,
}));

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock config
jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    blockchain: {
      rpcUrl: 'http://localhost:8545',
      privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
      chainId: 1337,
    },
  },
}));

describe('Web3 Client - Refactored', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock implementations
    mockProvider.getBalance.mockResolvedValue(BigInt('1000000000000000000') as any);
    mockProvider.getNetwork.mockResolvedValue({ chainId: BigInt(1337), name: 'localhost' } as any);
    mockProvider.getFeeData.mockResolvedValue({ gasPrice: BigInt('20000000000') } as any);
    mockProvider.getBlockNumber.mockResolvedValue(12345 as any);
    
    mockWallet.estimateGas.mockResolvedValue(BigInt('21000') as any);
    mockWallet.signMessage.mockResolvedValue('0xsignature' as any);
    
    mockContract.getAddress.mockResolvedValue('0xContractAddress' as any);
    mockContract.waitForDeployment.mockResolvedValue(undefined as any);
    mockContract.deploymentTransaction.mockReturnValue({
      hash: '0xDeployHash',
      wait: jest.fn<any>().mockResolvedValue({
        hash: '0xDeployHash',
        blockNumber: 100,
        status: 1,
      } as any),
    } as any);
    
    mockContractFactory.deploy.mockResolvedValue(mockContract as any);
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('isWeb3Available', () => {
    it('should return true when blockchain config is set', async () => {
      const { isWeb3Available } = await import('../../services/web3-client.js');
      expect(isWeb3Available()).toBe(true);
    });
  });

  describe('getProvider', () => {
    it('should create and return provider instance', async () => {
      const { getProvider } = await import('../../services/web3-client.js');
      const provider = getProvider();
      expect(provider).toBeDefined();
    });

    it('should return cached provider on subsequent calls', async () => {
      const { getProvider } = await import('../../services/web3-client.js');
      const provider1 = getProvider();
      const provider2 = getProvider();
      expect(provider1).toBe(provider2);
    });
  });

  describe('getWallet', () => {
    it('should create and return wallet instance', async () => {
      const { getWallet } = await import('../../services/web3-client.js');
      const wallet = getWallet();
      expect(wallet).toBeDefined();
    });

    it('should return cached wallet on subsequent calls', async () => {
      const { getWallet } = await import('../../services/web3-client.js');
      const wallet1 = getWallet();
      const wallet2 = getWallet();
      expect(wallet1).toBe(wallet2);
    });
  });

  describe('getWalletInfo', () => {
    it('should return wallet information', async () => {
      const { getWalletInfo } = await import('../../services/web3-client.js');
      const info = await getWalletInfo();
      expect(info.address).toBe('0x1234567890123456789012345678901234567890');
      expect(info.chainId).toBe(1337);
      expect(info.balance.toString()).toBe('1000000000000000000');
    });
  });

  describe('isValidAddress', () => {
    it('should validate Ethereum addresses correctly', async () => {
      const { isValidAddress } = await import('../../services/web3-client.js');
      
      // Valid addresses
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidAddress('0xABCDEF1234567890123456789012345678901234')).toBe(true);
      
      // Invalid addresses
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('')).toBe(false);
    });
  });

  describe('formatEther and parseEther', () => {
    it('should format and parse ether correctly', async () => {
      const { formatEther, parseEther } = await import('../../services/web3-client.js');
      
      const wei = parseEther('1');
      expect(wei).toBe(BigInt('1000000000000000000'));
      
      const eth = formatEther(BigInt('1000000000000000000'));
      expect(eth).toBe('1');
      
      const wei2 = parseEther('0.5');
      expect(wei2).toBe(BigInt('500000000000000000'));
      
      const eth2 = formatEther(BigInt('500000000000000000'));
      expect(eth2).toBe('0.5');
    });
  });

  describe('getContract', () => {
    it('should create contract instance', async () => {
      const { getContract } = await import('../../services/web3-client.js');
      const contract = getContract('0xContractAddress', []);
      expect(contract).toBeDefined();
    });
  });

  describe('getContractWithSigner', () => {
    it('should create contract instance with signer', async () => {
      const { getContractWithSigner } = await import('../../services/web3-client.js');
      const contract = getContractWithSigner('0xContractAddress', []);
      expect(contract).toBeDefined();
    });
  });

  describe('estimateGas', () => {
    it('should estimate gas for transaction', async () => {
      const { estimateGas } = await import('../../services/web3-client.js');
      const gas = await estimateGas('0xRecipient', BigInt('1000000000000000000'));
      expect(gas).toBe(BigInt('21000'));
    });
  });

  describe('signMessage', () => {
    it('should sign message with wallet', async () => {
      const { signMessage } = await import('../../services/web3-client.js');
      const signature = await signMessage('Hello, World!');
      expect(signature).toBe('0xsignature');
    });
  });

  describe('getBlockNumber', () => {
    it('should return current block number', async () => {
      const { getBlockNumber } = await import('../../services/web3-client.js');
      const blockNumber = await getBlockNumber();
      expect(blockNumber).toBe(12345);
    });
  });
});
