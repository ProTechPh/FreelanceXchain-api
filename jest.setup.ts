// @ts-nocheck
// Jest setup file
// Load environment variables for tests
import dotenv from 'dotenv';
import { jest } from '@jest/globals';
import path from 'node:path';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Ensure test environment is set
process.env.NODE_ENV = 'test';

// Add BigInt serialization support
BigInt.prototype.toJSON = function() {
  return this.toString();
};

// Mock PostgreSQL pool
const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  }),
  on: jest.fn(),
};

// Export to global for use in tests
global.mockPool = mockPool;

/**
 * Mock helper for PG query results
 * Usage: mockAppwriteResult({ data: [...] }) for success
 *        mockAppwriteResult({ data: null }) for empty/no results (returns empty rows)
 *        mockAppwriteResult({ error: { code: 'PGRST116', message: '...' } }) for "not found" (returns empty rows)
 *        mockAppwriteResult({ error: { message: '...' } }) for error (rejects query)
 */
global.mockAppwriteResult = (result: { data?: any; error?: any; count?: any }) => {
  if (result.error) {
    // PGRST116 error code means "not found" in the old Appwrite convention
    // Map this to empty rows for PG instead of throwing
    if (result.error.code === 'PGRST116') {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      return;
    }
    mockPool.query.mockRejectedValueOnce(new Error(result.error.message || 'Database error'));
    return;
  }
  
  const rows = Array.isArray(result.data) ? result.data : (result.data === null || result.data === undefined ? [] : [result.data]);
  
  mockPool.query.mockResolvedValueOnce({ 
    rows,
    rowCount: rows.length
  });
};

// Also mock the global client for files that use it directly
global.mockAppwriteClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  maybeSingle: jest.fn(),
  storage: {
    listBuckets: jest.fn().mockResolvedValue({ buckets: [], total: 0 }),
    createBucket: jest.fn().mockResolvedValue({ $id: 'bucket-id' }),
    deleteBucket: jest.fn().mockResolvedValue({}),
    getBucket: jest.fn().mockResolvedValue({ $id: 'bucket-id', name: 'test-bucket' }),
  },
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
};

// Mock node-appwrite
const mockAppwriteAccount = {
  get: jest.fn().mockResolvedValue({ $id: 'test-user-id', email: 'test@example.com' }),
  create: jest.fn().mockResolvedValue({ $id: 'test-user-id' }),
  createEmailPasswordSession: jest.fn().mockImplementation((email: string, password: string) => {
    const key = String(email).toLowerCase();
    const stored = global.mockPasswordStore;
    if (stored && stored.has(key)) {
      if (stored.get(key) !== password) {
        return Promise.reject(new Error('Invalid credentials'));
      }
    } else if (stored) {
      stored.set(key, password);
    }
    if (password === 'wrong-password') {
      return Promise.reject(new Error('Invalid credentials'));
    }
    return Promise.resolve({ secret: 'test-session-secret' });
  }),
  deleteSession: jest.fn().mockResolvedValue({}),
  createRecovery: jest.fn().mockResolvedValue({}),
  updatePassword: jest.fn().mockResolvedValue({}),
  createOAuth2Token: jest.fn().mockResolvedValue('https://mock-oauth-url.com'),
  createMFAAuthenticator: jest.fn().mockResolvedValue({ uri: 'otpauth://...', secret: 'MOCK' }),
  updateMFAAuthenticator: jest.fn().mockResolvedValue({}),
  createMFAChallenge: jest.fn().mockResolvedValue({ $id: 'challenge-id' }),
  updateMFAChallenge: jest.fn().mockResolvedValue({}),
  listMFAFactors: jest.fn().mockResolvedValue({ totp: true }),
  deleteMFAAuthenticator: jest.fn().mockResolvedValue({}),
};

global.mockAppwriteAccount = mockAppwriteAccount;

const mockAppwriteUsers = {
  create: jest.fn().mockResolvedValue({ $id: 'test-user-id' }),
  get: jest.fn().mockResolvedValue({ $id: 'test-user-id' }),
};

global.mockAppwriteUsers = mockAppwriteUsers;

const mockAppwriteStorage = {
  createFile: jest.fn().mockResolvedValue({ $id: 'file-id' }),
  deleteFile: jest.fn().mockResolvedValue({}),
  getFileView: jest.fn().mockReturnValue({ href: 'https://...' }),
  listFiles: jest.fn().mockResolvedValue({ files: [], total: 0 }),
  getFile: jest.fn().mockResolvedValue({ $id: 'file-id', name: 'test-file.txt' }),
};

global.mockAppwriteStorage = mockAppwriteStorage;

// Mock jsonwebtoken
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    verify: jest.fn().mockImplementation((token, secret) => {
      if (token === 'test-session-secret') {
        return {
          userId: 'test-user-id',
          email: 'test@example.com',
          role: 'freelancer',
          type: 'access',
        };
      }
      throw new Error('Invalid token');
    }),
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  },
  verify: jest.fn().mockImplementation((token, secret) => {
    if (token === 'test-session-secret') {
      return {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'freelancer',
        type: 'access',
      };
    }
    throw new Error('Invalid token');
  }),
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
}));

// Mock the database pool and query functions
jest.unstable_mockModule('./src/config/database.js', () => ({
  pool: mockPool,
  query: jest.fn().mockImplementation((text, params) => mockPool.query(text, params).then(res => res.rows)),
  queryOne: jest.fn().mockImplementation((text, params) => mockPool.query(text, params).then(res => res.rows[0] || null)),
  initializeDatabase: jest.fn().mockResolvedValue(undefined),
}));

// Mock file-type (ESM-only module)
jest.unstable_mockModule('file-type', () => ({
  fileTypeFromBuffer: jest.fn().mockResolvedValue({ ext: 'png', mime: 'image/png' }),
}));

// Mock contract-abis to avoid ESM import.meta.url issues
jest.unstable_mockModule('./src/services/contract-abis.js', () => ({
  FreelanceReputationABI: [],
  FreelanceEscrowABI: [],
  ContractAgreementABI: [],
  DisputeRegistryABI: [],
  MilestoneRegistryABI: [],
  FreelanceReputationBytecode: '',
  FreelanceEscrowBytecode: '',
  ContractAgreementBytecode: '',
  DisputeResolutionBytecode: '',
  MilestoneRegistryBytecode: '',
}));

// Mock web3 client to avoid real blockchain connections
jest.unstable_mockModule('./src/services/web3-client.js', () => ({
  isWeb3Available: jest.fn().mockReturnValue(false),
  getProvider: jest.fn().mockReturnValue(null),
  getWallet: jest.fn().mockReturnValue(null),
  getFreshWallet: jest.fn().mockReturnValue(null),
  resetWeb3Instances: jest.fn(),
  getWalletInfo: jest.fn().mockResolvedValue({ address: '0xmock', balance: BigInt(0), chainId: 1 }),
  getBalance: jest.fn().mockResolvedValue(BigInt(0)),
  sendTransaction: jest.fn().mockResolvedValue({ hash: '0xmock', blockNumber: 1, from: '0xmock', to: '0xmock', value: BigInt(0), gasUsed: BigInt(21000), status: 'success' }),
  getTransactionByHash: jest.fn().mockResolvedValue(null),
  waitForTransaction: jest.fn().mockResolvedValue({ hash: '0xmock', blockNumber: 1, from: '0xmock', to: '0xmock', value: BigInt(0), gasUsed: BigInt(21000), status: 'success' }),
  getGasPrice: jest.fn().mockResolvedValue(BigInt(0)),
  getBlockNumber: jest.fn().mockResolvedValue(1),
  estimateGas: jest.fn().mockResolvedValue(BigInt(21000)),
  formatEther: jest.fn().mockReturnValue('0.0'),
  parseEther: jest.fn().mockReturnValue(BigInt(0)),
  isValidAddress: jest.fn().mockReturnValue(true),
  getChecksumAddress: jest.fn().mockReturnValue('0xmock'),
  signMessage: jest.fn().mockResolvedValue('0xmock-signature'),
  verifyMessage: jest.fn().mockReturnValue('0xmock'),
  getNetworkInfo: jest.fn().mockResolvedValue({ name: 'mock', chainId: 1 }),
  isCorrectNetwork: jest.fn().mockResolvedValue(true),
  deployContract: jest.fn().mockResolvedValue({ address: '0xmock', transactionHash: '0xmock' }),
  getContract: jest.fn().mockReturnValue(null),
  getContractWithSigner: jest.fn().mockReturnValue(null),
}));

// Mock pg module
jest.unstable_mockModule('pg', () => ({
  default: { Pool: jest.fn(() => mockPool) },
  Pool: jest.fn(() => mockPool),
}));

jest.unstable_mockModule('node-appwrite', () => ({
  Client: jest.fn().mockImplementation(() => ({
    setEndpoint: jest.fn().mockReturnThis(),
    setProject: jest.fn().mockReturnThis(),
    setKey: jest.fn().mockReturnThis(),
    setJWT: jest.fn().mockReturnThis(),
    setSession: jest.fn().mockReturnThis(),
  })),
  Account: jest.fn(() => mockAppwriteAccount),
  Users: jest.fn(() => mockAppwriteUsers),
  Storage: jest.fn(() => mockAppwriteStorage),
  ID: { unique: () => 'unique-id' },
  OAuthProvider: { Google: 'google' },
  AuthenticatorType: { Totp: 'totp' },
  InputFile: {
    fromBuffer: jest.fn().mockReturnValue({ name: 'mock-file', type: 'image/png', size: 100 }),
    fromPath: jest.fn().mockReturnValue({ name: 'mock-file', type: 'image/png', size: 100 }),
    fromBlob: jest.fn().mockReturnValue({ name: 'mock-file', type: 'image/png', size: 100 }),
    fromStream: jest.fn().mockReturnValue({ name: 'mock-file', type: 'image/png', size: 100 }),
  },
}));

jest.unstable_mockModule('node-appwrite/file', () => ({
  InputFile: {
    fromBuffer: jest.fn().mockReturnValue({ name: 'mock-file', type: 'image/png', size: 100 }),
    fromPath: jest.fn().mockReturnValue({ name: 'mock-file', type: 'image/png', size: 100 }),
    fromBlob: jest.fn().mockReturnValue({ name: 'mock-file', type: 'image/png', size: 100 }),
    fromStream: jest.fn().mockReturnValue({ name: 'mock-file', type: 'image/png', size: 100 }),
  },
}));

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'Mocked fetch error' }),
  })
);

// Export createMockBuilder globally
global.createMockBuilder = (result) => {
  return {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: jest.fn().mockImplementation((resolve) => resolve(result)),
  };
};

declare global {
  function mockAppwriteResult(result: any): void;
  function createMockBuilder(result: any): any;
  var mockPool: any;
  var mockAppwriteClient: any;
  var mockAppwriteAccount: any;
  var mockAppwriteUsers: any;
  var mockAppwriteStorage: any;
}
