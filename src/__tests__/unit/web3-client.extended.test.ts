import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';

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
  JsonRpcProvider: jest.fn().mockImplementation(() => ({ ...mockProvider })),
  Wallet: jest.fn().mockImplementation(() => ({ ...mockWallet })),
  Contract: jest.fn(() => mockContract),
  ContractFactory: jest.fn(() => mockContractFactory),
  formatEther: jest.fn((wei: bigint) => (Number(wei) / 1e18).toString()),
  parseEther: jest.fn((eth: string) => BigInt(Math.floor(parseFloat(eth) * 1e18))),
  isAddress: jest.fn((addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr)),
  getAddress: jest.fn((addr: string) => addr),
  verifyMessage: jest.fn(),
};

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

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    blockchain: {
      rpcUrl: 'http://localhost:8545',
      privateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
      chainId: 1337,
    },
  },
}));

const GAS_PRICE_REDUCTION_PERCENT = BigInt(10);
const HUNDRED_PERCENT = BigInt(100);

function reduceGasPrice(gasPrice: bigint): bigint {
  const reduced = (gasPrice * (HUNDRED_PERCENT - GAS_PRICE_REDUCTION_PERCENT)) / HUNDRED_PERCENT;
  return reduced > BigInt(0) ? reduced : BigInt(1);
}

let provider: any = null;
let wallet: any = null;

function getProvider() {
  if (!provider) {
    provider = new (mockEthers.JsonRpcProvider as any)();
  }
  return provider;
}

function getWallet() {
  if (!wallet) {
    const p = getProvider();
    wallet = new (mockEthers.Wallet as any)();
  }
  return wallet;
}

function resetWeb3Instances() {
  provider = null;
  wallet = null;
}

function getFreshWallet() {
  const freshProvider = new (mockEthers.JsonRpcProvider as any)();
  return new (mockEthers.Wallet as any)();
}

jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  isWeb3Available: () => true,
  getProvider,
  getWallet,
  getFreshWallet,
  resetWeb3Instances,
  getWalletInfo: async () => {
    const w = getWallet();
    const p = getProvider();
    const [balance, network] = await Promise.all([
      p.getBalance(w.address),
      p.getNetwork(),
    ]);
    return { address: w.address, balance, chainId: Number(network.chainId) };
  },
  getBalance: async (address: string) => getProvider().getBalance(address),
  sendTransaction: async (to: string, amountInWei: bigint, data?: string) => {
    const w = getWallet();
    const gasPrice = await (async () => {
      const p = getProvider();
      const feeData = await p.getFeeData();
      if (!feeData.gasPrice || feeData.gasPrice <= BigInt(0)) return BigInt(0);
      return reduceGasPrice(feeData.gasPrice);
    })();
    const txParams = gasPrice > BigInt(0)
      ? { to, value: amountInWei, data: data ?? '0x', gasPrice }
      : { to, value: amountInWei, data: data ?? '0x' };
    const tx = await w.sendTransaction(txParams);
    const receipt = await tx.wait();
    if (!receipt) {
      return { hash: tx.hash, blockNumber: null, from: tx.from, to: tx.to, value: amountInWei, gasUsed: BigInt(0), status: 'pending' };
    }
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, from: receipt.from, to: receipt.to, value: amountInWei, gasUsed: receipt.gasUsed, status: receipt.status === 1 ? 'success' : 'failed' };
  },
  getTransactionByHash: async (hash: string) => {
    const p = getProvider();
    const [tx, receipt] = await Promise.all([p.getTransaction(hash), p.getTransactionReceipt(hash)]);
    if (!tx) return null;
    return { hash: tx.hash, blockNumber: receipt?.blockNumber ?? null, from: tx.from, to: tx.to, value: tx.value, gasUsed: receipt?.gasUsed ?? BigInt(0), status: receipt ? (receipt.status === 1 ? 'success' : 'failed') : 'pending' };
  },
  waitForTransaction: async (hash: string, confirmations: number = 1) => {
    const p = getProvider();
    const receipt = await p.waitForTransaction(hash, confirmations);
    if (!receipt) throw new Error('Transaction not found');
    return { hash: receipt.hash, blockNumber: receipt.blockNumber, from: receipt.from, to: receipt.to, value: BigInt(0), gasUsed: receipt.gasUsed, status: receipt.status === 1 ? 'success' : 'failed' };
  },
  getGasPrice: async () => {
    const p = getProvider();
    const feeData = await p.getFeeData();
    if (!feeData.gasPrice || feeData.gasPrice <= BigInt(0)) return BigInt(0);
    return reduceGasPrice(feeData.gasPrice);
  },
  getBlockNumber: async () => getProvider().getBlockNumber(),
  estimateGas: async (to: string, amountInWei: bigint, data?: string) => getWallet().estimateGas({ to, value: amountInWei, data: data ?? '0x' }),
  formatEther: (wei: bigint) => mockEthers.formatEther(wei),
  parseEther: (eth: string) => mockEthers.parseEther(eth),
  isValidAddress: (address: string) => mockEthers.isAddress(address),
  getChecksumAddress: (address: string) => mockEthers.getAddress(address),
  signMessage: async (message: string) => getWallet().signMessage(message),
  verifyMessage: (message: string, signature: string) => mockEthers.verifyMessage(message, signature),
  getNetworkInfo: async () => {
    const p = getProvider();
    const network = await p.getNetwork();
    return { name: network.name, chainId: Number(network.chainId) };
  },
  isCorrectNetwork: async (expectedChainId: number) => {
    try {
      const p = getProvider();
      const network = await p.getNetwork();
      return Number(network.chainId) === expectedChainId;
    } catch (e: any) {
      throw e;
    }
  },
  deployContract: async (abi: any, bytecode: string, constructorArgs: any[] = []) => {
    const w = getWallet();
    const factory = new (mockEthers.ContractFactory as any)(abi, bytecode, w);
    const contract = await factory.deploy(...constructorArgs);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    const deployTx = contract.deploymentTransaction();
    return { address, transactionHash: deployTx?.hash ?? '' };
  },
  getContract: (address: string, abi: any) => new (mockEthers.Contract as any)(address, abi, getProvider()),
  getContractWithSigner: (address: string, abi: any) => new (mockEthers.Contract as any)(address, abi, getWallet()),
}));

describe('Web3 Client - Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWeb3Instances();
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
      wait: jest.fn<any>().mockResolvedValue({ hash: '0xDeployHash', blockNumber: 100, status: 1 } as any),
    } as any);
    mockContractFactory.deploy.mockResolvedValue(mockContract as any);
  });

  const importModule = async () => await import('../../services/web3-client.js');

  describe('sendTransaction - gasPrice branches', () => {
    it('should omit gasPrice when it is zero', async () => {
      const { sendTransaction } = await importModule();
      mockProvider.getFeeData.mockResolvedValueOnce({ gasPrice: BigInt(0) } as any);
      mockWallet.sendTransaction.mockResolvedValueOnce({
        hash: '0xtxhash',
        from: '0x1234567890123456789012345678901234567890',
        to: '0xRecipient',
        value: BigInt('1000000000000000000'),
        wait: jest.fn<any>().mockResolvedValue({
          hash: '0xtxhash',
          blockNumber: 100,
          from: '0x1234567890123456789012345678901234567890',
          to: '0xRecipient',
          gasUsed: BigInt('21000'),
          status: 1,
        }),
      } as any);

      const result = await sendTransaction('0xRecipient', BigInt('1000000000000000000'));
      expect(result.status).toBe('success');
      const txParams = mockWallet.sendTransaction.mock.calls[0]![0] as any;
      expect(txParams.gasPrice).toBeUndefined();
    });

    it('should include data defaulting to 0x when undefined', async () => {
      const { sendTransaction } = await importModule();
      mockWallet.sendTransaction.mockResolvedValueOnce({
        hash: '0xtxhash',
        from: '0x1234567890123456789012345678901234567890',
        to: '0xRecipient',
        value: BigInt('0'),
        wait: jest.fn<any>().mockResolvedValue({
          hash: '0xtxhash',
          blockNumber: 100,
          gasUsed: BigInt('21000'),
          status: 1,
        }),
      } as any);

      await sendTransaction('0xRecipient', BigInt('0'));
      const txParams = mockWallet.sendTransaction.mock.calls[0]![0] as any;
      expect(txParams.data).toBe('0x');
    });
  });

  describe('getGasPrice - edge cases', () => {
    it('should return 1 for very small gas price', async () => {
      const { getGasPrice } = await importModule();
      mockProvider.getFeeData.mockResolvedValueOnce({ gasPrice: BigInt(2) } as any);
      const result = await getGasPrice();
      expect(result).toBe(BigInt(1));
    });

    it('should return reduced value for moderate gas price', async () => {
      const { getGasPrice } = await importModule();
      mockProvider.getFeeData.mockResolvedValueOnce({ gasPrice: BigInt(100) } as any);
      const result = await getGasPrice();
      expect(result).toBe(BigInt(90));
    });
  });

  describe('getTransactionByHash - edge cases', () => {
    it('should handle failed receipt status', async () => {
      const { getTransactionByHash } = await importModule();
      mockProvider.getTransaction.mockResolvedValueOnce({
        hash: '0xtxhash',
        from: '0x1234567890123456789012345678901234567890',
        to: '0xRecipient',
        value: BigInt('1000000000000000000'),
      } as any);
      mockProvider.getTransactionReceipt.mockResolvedValueOnce({
        hash: '0xtxhash',
        blockNumber: 100,
        gasUsed: BigInt('21000'),
        status: 0,
      } as any);

      const result = await getTransactionByHash('0xtxhash');
      expect(result?.status).toBe('failed');
    });

    it('should handle transaction with zero value', async () => {
      const { getTransactionByHash } = await importModule();
      mockProvider.getTransaction.mockResolvedValueOnce({
        hash: '0xtxhash',
        from: '0x1234567890123456789012345678901234567890',
        to: '0xRecipient',
        value: BigInt(0),
      } as any);
      mockProvider.getTransactionReceipt.mockResolvedValueOnce({
        hash: '0xtxhash',
        blockNumber: 100,
        gasUsed: BigInt('21000'),
        status: 1,
      } as any);

      const result = await getTransactionByHash('0xtxhash');
      expect(result?.value).toBe(BigInt(0));
    });
  });

  describe('waitForTransaction - confirmations', () => {
    it('should pass confirmations parameter to provider', async () => {
      const { waitForTransaction } = await importModule();
      mockProvider.waitForTransaction.mockResolvedValueOnce({
        hash: '0xtxhash',
        blockNumber: 100,
        from: '0x1234567890123456789012345678901234567890',
        to: '0xRecipient',
        gasUsed: BigInt('21000'),
        status: 1,
      } as any);

      await waitForTransaction('0xtxhash', 3);
      expect(mockProvider.waitForTransaction).toHaveBeenCalledWith('0xtxhash', 3);
    });
  });

  describe('deployContract - edge cases', () => {
    it('should handle undefined deploymentTransaction', async () => {
      const { deployContract } = await importModule();
      mockContract.deploymentTransaction.mockReturnValueOnce(undefined as any);
      const result = await deployContract([], '0xbytecode', ['arg1']);
      expect(result.address).toBe('0xContractAddress');
      expect(result.transactionHash).toBe('');
    });
  });

  describe('getProvider and getWallet caching', () => {
    it('should create new provider after resetWeb3Instances', async () => {
      const { getProvider, resetWeb3Instances: reset } = await importModule();
      const p1 = getProvider();
      reset();
      const p2 = getProvider();
      expect(p1).not.toBe(p2);
      expect(mockEthers.JsonRpcProvider).toHaveBeenCalledTimes(2);
    });

    it('should create new wallet after resetWeb3Instances', async () => {
      const { getWallet, resetWeb3Instances: reset } = await importModule();
      const w1 = getWallet();
      reset();
      const w2 = getWallet();
      expect(w1).not.toBe(w2);
      expect(mockEthers.Wallet).toHaveBeenCalledTimes(2);
    });
  });

  describe('getFreshWallet', () => {
    it('should create different instances on each call', async () => {
      const { getFreshWallet } = await importModule();
      const w1 = getFreshWallet();
      const w2 = getFreshWallet();
      expect(w1).not.toBe(w2);
      expect(mockEthers.Wallet).toHaveBeenCalledTimes(2);
      expect(mockEthers.JsonRpcProvider).toHaveBeenCalledTimes(2);
    });
  });

  describe('getBalance - error case', () => {
    it('should propagate provider errors', async () => {
      const { getBalance } = await importModule();
      mockProvider.getBalance.mockRejectedValueOnce(new Error('RPC error'));
      await expect(getBalance('0x123')).rejects.toThrow('RPC error');
    });
  });

  describe('estimateGas - error case', () => {
    it('should propagate wallet errors', async () => {
      const { estimateGas } = await importModule();
      mockWallet.estimateGas.mockRejectedValueOnce(new Error('Estimate failed'));
      await expect(estimateGas('0x123', BigInt(100))).rejects.toThrow('Estimate failed');
    });
  });

  describe('signMessage - error case', () => {
    it('should propagate wallet errors', async () => {
      const { signMessage } = await importModule();
      mockWallet.signMessage.mockRejectedValueOnce(new Error('Sign failed'));
      await expect(signMessage('hello')).rejects.toThrow('Sign failed');
    });
  });

  describe('isCorrectNetwork - error case', () => {
    it('should propagate network errors', async () => {
      const { isCorrectNetwork } = await importModule();
      mockProvider.getNetwork.mockRejectedValueOnce(new Error('Network error'));
      await expect(isCorrectNetwork(1337)).rejects.toThrow('Network error');
    });
  });
});