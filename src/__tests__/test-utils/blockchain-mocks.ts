/**
 * Blockchain Test Utilities
 * Provides mock implementations for blockchain services in tests
 */

import { jest } from '@jest/globals';

// Mock provider responses
export const mockProviderResponses = {
  balance: BigInt('1000000000000000000'), // 1 ETH
  network: { chainId: BigInt(1337), name: 'localhost' },
  feeData: { gasPrice: BigInt('20000000000') }, // 20 gwei
  blockNumber: 12345,
  transaction: {
    hash: '0x1234567890abcdef',
    from: '0x1234567890123456789012345678901234567890',
    to: '0x0987654321098765432109876543210987654321',
    value: BigInt('1000000000000000000'),
    blockNumber: 12345,
    gasUsed: BigInt('21000'),
    status: 1,
  },
  receipt: {
    hash: '0x1234567890abcdef',
    blockNumber: 12345,
    from: '0x1234567890123456789012345678901234567890',
    to: '0x0987654321098765432109876543210987654321',
    gasUsed: BigInt('21000'),
    status: 1,
  },
};

// Mock wallet responses
export const mockWalletResponses = {
  address: '0x1234567890123456789012345678901234567890',
  signature: '0xmocksignature1234567890abcdef',
  estimatedGas: BigInt('21000'),
};

// Mock contract responses
export const mockContractResponses = {
  address: '0xContractAddress1234567890123456789012345678',
  deploymentHash: '0xDeployHash1234567890abcdef',
};

// Create mock provider
export function createMockProvider() {
  return {
    getBalance: jest.fn().mockResolvedValue(mockProviderResponses.balance),
    getNetwork: jest.fn().mockResolvedValue(mockProviderResponses.network),
    getTransaction: jest.fn().mockResolvedValue(mockProviderResponses.transaction),
    getTransactionReceipt: jest.fn().mockResolvedValue(mockProviderResponses.receipt),
    waitForTransaction: jest.fn().mockResolvedValue(mockProviderResponses.receipt),
    getFeeData: jest.fn().mockResolvedValue(mockProviderResponses.feeData),
    getBlockNumber: jest.fn().mockResolvedValue(mockProviderResponses.blockNumber),
  };
}

// Create mock wallet
export function createMockWallet() {
  return {
    address: mockWalletResponses.address,
    sendTransaction: jest.fn().mockResolvedValue({
      hash: mockProviderResponses.transaction.hash,
      from: mockProviderResponses.transaction.from,
      to: mockProviderResponses.transaction.to,
      value: mockProviderResponses.transaction.value,
      wait: jest.fn().mockResolvedValue(mockProviderResponses.receipt),
    }),
    estimateGas: jest.fn().mockResolvedValue(mockWalletResponses.estimatedGas),
    signMessage: jest.fn().mockResolvedValue(mockWalletResponses.signature),
  };
}

// Create mock contract
export function createMockContract() {
  return {
    getAddress: jest.fn().mockResolvedValue(mockContractResponses.address),
    waitForDeployment: jest.fn().mockResolvedValue(undefined),
    deploymentTransaction: jest.fn().mockReturnValue({
      hash: mockContractResponses.deploymentHash,
      wait: jest.fn().mockResolvedValue({
        hash: mockContractResponses.deploymentHash,
        blockNumber: mockProviderResponses.blockNumber,
        status: 1,
      }),
    }),
  };
}

// Create mock contract factory
export function createMockContractFactory() {
  return {
    deploy: jest.fn().mockResolvedValue(createMockContract()),
  };
}

// Mock ethers utilities
export const mockEthersUtils = {
  formatEther: jest.fn((wei: bigint) => {
    const eth = Number(wei) / 1e18;
    // Return integer format for whole numbers to match test expectations
    return eth % 1 === 0 ? eth.toString() : eth.toString();
  }),
  parseEther: jest.fn((eth: string) => BigInt(Math.floor(parseFloat(eth) * 1e18))),
  isAddress: jest.fn((addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr)),
  getAddress: jest.fn((addr: string) => addr),
  verifyMessage: jest.fn().mockReturnValue(mockWalletResponses.address),
};

// Test configuration for blockchain
export const testBlockchainConfig = {
  rpcUrl: 'http://localhost:8545',
  privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
  chainId: 1337,
};

// Setup blockchain mocks for tests
export function setupBlockchainMocks() {
  const mockProvider = createMockProvider();
  const mockWallet = createMockWallet();
  const mockContract = createMockContract();
  const mockContractFactory = createMockContractFactory();

  // Mock ethers module
  jest.mock('ethers', () => ({
    JsonRpcProvider: jest.fn(() => mockProvider),
    Wallet: jest.fn(() => mockWallet),
    Contract: jest.fn(() => mockContract),
    ContractFactory: jest.fn(() => mockContractFactory),
    ...mockEthersUtils,
  }));

  // Mock config
  jest.mock('../../config/env.js', () => ({
    config: {
      blockchain: testBlockchainConfig,
    },
  }));

  return {
    mockProvider,
    mockWallet,
    mockContract,
    mockContractFactory,
  };
}

// Reset all blockchain mocks
export function resetBlockchainMocks() {
  jest.clearAllMocks();
}