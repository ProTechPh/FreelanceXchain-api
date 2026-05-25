/**
 * Centralized Test Setup
 * Handles all mocking configuration for consistent test behavior
 */

import { jest } from '@jest/globals';

// Mock Ethers.js completely to prevent real network calls
export const mockEthers = {
  JsonRpcProvider: jest.fn(),
  Wallet: jest.fn(),
  Contract: jest.fn(),
  ContractFactory: jest.fn(),
  formatEther: jest.fn((wei: bigint) => {
    const eth = Number(wei) / 1e18;
    return eth % 1 === 0 ? eth.toString() : eth.toString();
  }),
  parseEther: jest.fn((eth: string) => BigInt(Math.floor(parseFloat(eth) * 1e18))),
  isAddress: jest.fn((addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr)),
  getAddress: jest.fn((addr: string) => addr),
  verifyMessage: jest.fn(() => '0x1234567890123456789012345678901234567890'),
};

// Mock Web3 Client
export const mockWeb3Client = {
  isWeb3Available: jest.fn(() => true),
  getProvider: jest.fn(),
  getWallet: jest.fn(() => ({
    address: '0x1234567890123456789012345678901234567890',
    sendTransaction: jest.fn(),
    estimateGas: jest.fn(),
    signMessage: jest.fn(),
  })),
  getFreshWallet: jest.fn(),
  resetWeb3Instances: jest.fn(),
  getWalletInfo: jest.fn(),
  getBalance: jest.fn(),
  sendTransaction: jest.fn(),
  getTransactionByHash: jest.fn(),
  waitForTransaction: jest.fn(),
  getGasPrice: jest.fn(),
  getBlockNumber: jest.fn(),
  estimateGas: jest.fn(),
  formatEther: mockEthers.formatEther,
  parseEther: mockEthers.parseEther,
  isValidAddress: mockEthers.isAddress,
  getChecksumAddress: mockEthers.getAddress,
  signMessage: jest.fn(),
  verifyMessage: mockEthers.verifyMessage,
  getNetworkInfo: jest.fn(),
  isCorrectNetwork: jest.fn(),
  deployContract: jest.fn(),
  getContract: jest.fn(),
  getContractWithSigner: jest.fn(),
};

// Mock Blockchain Config
export const mockBlockchainConfig = {
  config: {
    blockchain: {
      rpcUrl: 'http://localhost:8545',
      privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
    },
  },
};

// Mock Contract Addresses
export const mockContractAddresses = {
  getContractAddress: jest.fn((contractName: string) => {
    const addresses: Record<string, string> = {
      agreement: '0x1234567890123456789012345678901234567890',
      reputation: '0x0987654321098765432109876543210987654321',
      escrow: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      disputeResolution: '0xfedcbafedcbafedcbafedcbafedcbafedcbafedcba',
      milestoneRegistry: '0x1111111111111111111111111111111111111111',
    };
    return addresses[contractName] || null;
  }),
  getCurrentNetwork: jest.fn(() => 'hardhat'),
  getContractAddresses: jest.fn(() => ({
    agreement: '0x1234567890123456789012345678901234567890',
    reputation: '0x0987654321098765432109876543210987654321',
    escrow: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    disputeResolution: '0xfedcbafedcbafedcbafedcbafedcbafedcbafedcba',
    milestoneRegistry: '0x1111111111111111111111111111111111111111',
  })),
  setContractAddress: jest.fn(),
  areContractsDeployed: jest.fn(() => true),
  isContractDeployed: jest.fn(() => true),
};


// Mock KYC Repository
export const mockKycRepository = {
  getKycVerificationByUserId: (jest.fn() as any).mockResolvedValue(null),
  createKycVerification: jest.fn(),
  updateKycVerification: jest.fn(),
  getKycVerificationById: jest.fn(),
};

// Setup all mocks
export function setupTestMocks() {
  // Mock ethers
  jest.mock('ethers', () => mockEthers, { virtual: true });

  // Mock web3-client
  jest.mock('../../services/web3-client.js', () => mockWeb3Client, { virtual: true });

  // Mock config
  jest.mock('../../config/env.js', () => mockBlockchainConfig, { virtual: true });

  // Mock contracts config
  jest.mock('../../config/contracts.js', () => mockContractAddresses, { virtual: true });


  // Mock KYC repository
  jest.mock('../../repositories/didit-kyc-repository.js', () => mockKycRepository, { virtual: true });
}

// Reset all mocks
export function resetTestMocks() {
  jest.clearAllMocks();
}