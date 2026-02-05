/**
 * Web3 Client Tests
 * Tests for Ethereum blockchain integration
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

describe('Web3 Client', () => {
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
      const { isWeb3Available } = await import('../web3-client.js');
      expect(isWeb3Available()).toBe(true);
    });
  });

  describe('getProvider', () => {
    it('should create and return provider instance', async () => {
      const { getProvider } = await import('../web3-client.js');
      const provider = getProvider();
      expect(provider).toBeDefined();
    });

    it('should return cached provider on subsequent calls', async () => {
      const { getProvider } = await import('../web3-client.js');
      const provider1 = getProvider();
      const provider2 = getProvider();
      expect(provider1).toBe(provider2);
    });
  });

  describe('getWallet', () => {
    it('should create and return wallet instance', async () => {
      const { getWallet } = await import('../web3-client.js');
      const wallet = getWallet();
      expect(wallet).toBeDefined();
    });

    it('should return cached wallet on subsequent calls', async () => {
      const { getWallet } = await import('../web3-client.js');
      const wallet1 = getWallet();
      const wallet2 = getWallet();
      expect(wallet1).toBe(wallet2);
    });
  });

  describe('getWalletInfo', () => {
    it('should return wallet information', async () => {
      const { getWalletInfo } = await import('../web3-client.js');
      const info = await getWalletInfo();
      expect(info.address).toBe('0x1234567890123456789012345678901234567890');
      expect(info.chainId).toBe(1337);
      expect(info.balance.toString()).toBe('1000000000000000000');
    });
  });

  describe('getBalance', () => {
    it('should return balance for an address', async () => {
      const { getBalance } = await import('../web3-client.js');
      const balance = await getBalance('0xTestAddress');
      expect(balance.toString()).toBe('1000000000000000000');
      expect(mockProvider.getBalance).toHaveBeenCalledWith('0xTestAddress');
    });
  });

  describe('sendTransaction', () => {
    it('should send transaction and return result', async () => {
      mockWallet.sendTransaction.mockResolvedValue({
        hash: '0xTransactionHash',
        from: '0x1234567890123456789012345678901234567890',
        to: '0xRecipient',
        wait: jest.fn<any>().mockResolvedValue({
          hash: '0xTransactionHash',
          blockNumber: 12346,
          from: '0x1234567890123456789012345678901234567890',
          to: '0xRecipient',
          gasUsed: BigInt('21000'),
          status: 1,
        } as any),
      } as any);

      const { sendTransaction } = await import('../web3-client.js');
      const result = await sendTransaction(
        '0xRecipient',
        BigInt('1000000000000000000')
      );

      expect(result.hash).toBe('0xTransactionHash');
      expect(result.blockNumber).toBe(12346);
      expect(result.from).toBe('0x1234567890123456789012345678901234567890');
      expect(result.to).toBe('0xRecipient');
      expect(result.value.toString()).toBe('1000000000000000000');
      expect(result.gasUsed.toString()).toBe('21000');
      expect(result.status).toBe('success');
    });

    it('should handle failed transaction', async () => {
      mockWallet.sendTransaction.mockResolvedValue({
        hash: '0xFailedHash',
        from: '0x1234567890123456789012345678901234567890',
        to: '0xRecipient',
        wait: jest.fn<any>().mockResolvedValue({
          hash: '0xFailedHash',
          blockNumber: 12346,
          from: '0x1234567890123456789012345678901234567890',
          to: '0xRecipient',
          gasUsed: BigInt('21000'),
          status: 0,
        } as any),
      } as any);

      const { sendTransaction } = await import('../web3-client.js');
      const result = await sendTransaction(
        '0xRecipient',
        BigInt('1000000000000000000')
      );

      expect(result.status).toBe('failed');
    });
  });

  describe('getTransactionByHash', () => {
    it('should return transaction details', async () => {
      mockProvider.getTransaction.mockResolvedValue({
        hash: '0xTxHash',
        from: '0xSender',
        to: '0xRecipient',
        value: BigInt('1000000000000000000'),
        blockNumber: 12345,
      });

      mockProvider.getTransactionReceipt.mockResolvedValue({
        status: 1,
        gasUsed: BigInt('21000'),
        blockNumber: 12345,
      });

      const { getTransactionByHash } = await import('../web3-client.js');
      const result = await getTransactionByHash('0xTxHash');

      expect(result.hash).toBe('0xTxHash');
      expect(result.from).toBe('0xSender');
      expect(result.to).toBe('0xRecipient');
      expect(result.value.toString()).toBe('1000000000000000000');
      expect(result.blockNumber).toBe(12345);
      expect(result.status).toBe('success');
      expect(result.gasUsed.toString()).toBe('21000');
    });

    it('should return null for non-existent transaction', async () => {
      mockProvider.getTransaction.mockResolvedValue(null);

      const { getTransactionByHash } = await import('../web3-client.js');
      const result = await getTransactionByHash('0xNonExistent');

      expect(result).toBeNull();
    });
  });

  describe('getGasPrice', () => {
    it('should return current gas price', async () => {
      const { getGasPrice } = await import('../web3-client.js');
      const gasPrice = await getGasPrice();
      expect(gasPrice.toString()).toBe('20000000000');
    });
  });

  describe('getBlockNumber', () => {
    it('should return current block number', async () => {
      const { getBlockNumber } = await import('../web3-client.js');
      const blockNumber = await getBlockNumber();
      expect(blockNumber).toBe(12345);
    });
  });

  describe('estimateGas', () => {
    it('should estimate gas for transaction', async () => {
      const { estimateGas } = await import('../web3-client.js');
      const gas = await estimateGas(
        '0xRecipient',
        BigInt('1000000000000000000')
      );
      expect(gas.toString()).toBe('21000');
    });
  });

  describe('formatEther and parseEther', () => {
    it('should format wei to ETH', async () => {
      const { formatEther } = await import('../web3-client.js');
      const eth = formatEther(BigInt('1000000000000000000'));
      expect(eth).toBe('1');
    });

    it('should parse ETH to wei', async () => {
      const { parseEther } = await import('../web3-client.js');
      const wei = parseEther('1');
      expect(wei.toString()).toBe('1000000000000000000');
    });
  });

  describe('isValidAddress', () => {
    it('should validate correct Ethereum address', async () => {
      const { isValidAddress } = await import('../web3-client.js');
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
    });

    it('should reject invalid address', async () => {
      const { isValidAddress } = await import('../web3-client.js');
      expect(isValidAddress('invalid')).toBe(false);
    });
  });

  describe('signMessage', () => {
    it('should sign a message', async () => {
      const { signMessage } = await import('../web3-client.js');
      const signature = await signMessage('Hello, World!');
      expect(signature).toBe('0xsignature');
      expect(mockWallet.signMessage).toHaveBeenCalledWith('Hello, World!');
    });
  });

  describe('getNetworkInfo', () => {
    it('should return network information', async () => {
      const { getNetworkInfo } = await import('../web3-client.js');
      const info = await getNetworkInfo();
      expect(info.chainId.toString()).toBe('1337');
      expect(info.name).toBe('localhost');
    });
  });

  describe('isCorrectNetwork', () => {
    it('should return true for correct network', async () => {
      const { isCorrectNetwork } = await import('../web3-client.js');
      const isCorrect = await isCorrectNetwork(1337);
      expect(isCorrect).toBe(true);
    });

    it('should return false for incorrect network', async () => {
      mockProvider.getNetwork.mockResolvedValue({ chainId: BigInt(999), name: 'wrong' });
      
      const { isCorrectNetwork } = await import('../web3-client.js');
      const isCorrect = await isCorrectNetwork(1337);
      expect(isCorrect).toBe(false);
    });
  });

  describe('deployContract', () => {
    it('should deploy contract and return address', async () => {
      const { deployContract } = await import('../web3-client.js');
      const result = await deployContract(
        [{ type: 'constructor', inputs: [] }],
        '0xBytecode',
        []
      );
      expect(result.address).toBe('0xContractAddress');
      expect(result.transactionHash).toBe('0xDeployHash');
    });
  });

  describe('getContract', () => {
    it('should return contract instance for reading', async () => {
      const { getContract } = await import('../web3-client.js');
      const contract = getContract('0xContractAddress', []);
      expect(contract).toBeDefined();
    });
  });

  describe('getContractWithSigner', () => {
    it('should return contract instance for writing', async () => {
      const { getContractWithSigner } = await import('../web3-client.js');
      const contract = getContractWithSigner('0xContractAddress', []);
      expect(contract).toBeDefined();
    });
  });
});
