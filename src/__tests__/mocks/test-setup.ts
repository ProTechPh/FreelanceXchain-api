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
  resetWeb3Client: jest.fn(),
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

// Mock Supabase Client
export const mockSupabaseClient = {
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    containedBy: jest.fn().mockReturnThis(),
    rangeGt: jest.fn().mockReturnThis(),
    rangeGte: jest.fn().mockReturnThis(),
    rangeLt: jest.fn().mockReturnThis(),
    rangeLte: jest.fn().mockReturnThis(),
    rangeAdjacent: jest.fn().mockReturnThis(),
    overlaps: jest.fn().mockReturnThis(),
    textSearch: jest.fn().mockReturnThis(),
    match: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    abortSignal: jest.fn().mockReturnThis(),
    single: (jest.fn() as any).mockResolvedValue({ data: null, error: null }),
    maybeSingle: (jest.fn() as any).mockResolvedValue({ data: null, error: null }),
    csv: jest.fn().mockReturnThis(),
    geojson: jest.fn().mockReturnThis(),
    explain: jest.fn().mockReturnThis(),
    rollback: jest.fn().mockReturnThis(),
    returns: jest.fn().mockReturnThis(),
    then: (jest.fn() as any).mockResolvedValue({ data: [], error: null }),
    catch: jest.fn(),
  })),
  auth: {
    signUp: (jest.fn() as any).mockResolvedValue({ 
      data: { user: { id: '1', email: 'test@example.com' }, session: null }, 
      error: null 
    }),
    signInWithPassword: (jest.fn() as any).mockResolvedValue({ 
      data: { user: { id: '1', email: 'test@example.com' }, session: null }, 
      error: null 
    }),
    getUser: (jest.fn() as any).mockResolvedValue({ 
      data: { user: { id: '1', email: 'test@example.com' } }, 
      error: null 
    }),
    getSession: (jest.fn() as any).mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    }),
    signInWithOAuth: (jest.fn() as any).mockResolvedValue({ 
      data: { url: 'https://mock-oauth-url.com' }, 
      error: null 
    }),
    refreshSession: (jest.fn() as any).mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    }),
    setSession: (jest.fn() as any).mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    }),
    updateUser: (jest.fn() as any).mockResolvedValue({ 
      data: { user: null }, 
      error: null 
    }),
    resetPasswordForEmail: (jest.fn() as any).mockResolvedValue({ 
      data: null, 
      error: null 
    }),
    resend: (jest.fn() as any).mockResolvedValue({ 
      data: null, 
      error: null 
    }),
    exchangeCodeForSession: (jest.fn() as any).mockResolvedValue({ 
      data: { session: null }, 
      error: null 
    }),
  },
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
  
  // Mock supabase config
  jest.mock('../../config/supabase.js', () => ({
    getSupabaseClient: jest.fn(() => mockSupabaseClient),
  }), { virtual: true });
  
  // Mock KYC repository
  jest.mock('../../repositories/didit-kyc-repository.js', () => mockKycRepository, { virtual: true });
}

// Reset all mocks
export function resetTestMocks() {
  jest.clearAllMocks();
}