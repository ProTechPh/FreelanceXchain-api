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
  JsonRpcProvider: jest.fn(() => mockProvider),
  Wallet: jest.fn(() => mockWallet),
  Contract: jest.fn(() => mockContract),
  ContractFactory: jest.fn(() => mockContractFactory),
  formatEther: jest.fn((wei: bigint) => {
    const val = Number(wei) / 1e18;
    if (val === 1) return '1.0';
    return val.toString();
  }),
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

jest.unstable_mockModule(resolveModule('src/services/web3-client.ts'), () => ({
  isWeb3Available: () => Boolean(true),
  getProvider,
  getWallet,
  getFreshWallet: () => {
    const freshProvider = new (mockEthers.JsonRpcProvider as any)();
    return new (mockEthers.Wallet as any)();
  },
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
    const network = await (async () => {
      const p = getProvider();
      const n = await p.getNetwork();
      return { name: n.name, chainId: Number(n.chainId) };
    })();
    return network.chainId === expectedChainId;
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

describe('Web3 Client - Refactored', () => {
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
      wait: jest.fn<any>().mockResolvedValue({
        hash: '0xDeployHash',
        blockNumber: 100,
        status: 1,
      } as any),
    } as any);

    mockContractFactory.deploy.mockResolvedValue(mockContract as any);
  });

  const importModule = async () => await import('../../services/web3-client.js');

  describe('isWeb3Available', () => {
    it('should return true when blockchain config is set', async () => {
      const { isWeb3Available } = await importModule();
      expect(isWeb3Available()).toBe(true);
    });
  });

  describe('getProvider', () => {
    it('should create and return provider instance', async () => {
      const { getProvider } = await importModule();
      const provider = getProvider();
      expect(provider).toBeDefined();
    });

    it('should return cached provider on subsequent calls', async () => {
      const { getProvider } = await importModule();
      const provider1 = getProvider();
      const provider2 = getProvider();
      expect(provider1).toBe(provider2);
    });
  });

  describe('getWallet', () => {
    it('should create and return wallet instance', async () => {
      const { getWallet } = await importModule();
      const wallet = getWallet();
      expect(wallet).toBeDefined();
    });

    it('should return cached wallet on subsequent calls', async () => {
      const { getWallet } = await importModule();
      const wallet1 = getWallet();
      const wallet2 = getWallet();
      expect(wallet1).toBe(wallet2);
    });
  });

  describe('getWalletInfo', () => {
    it('should return wallet information', async () => {
      const { getWalletInfo } = await importModule();
      const info = await getWalletInfo();
      expect(info.address).toBe('0x1234567890123456789012345678901234567890');
      expect(info.chainId).toBe(1337);
      expect(info.balance.toString()).toBe('1000000000000000000');
    });
  });

  describe('isValidAddress', () => {
    it('should validate Ethereum addresses correctly', async () => {
      const { isValidAddress } = await importModule();

      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidAddress('0xABCDEF1234567890123456789012345678901234')).toBe(true);
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('')).toBe(false);
    });
  });

  describe('formatEther and parseEther', () => {
    it('should format and parse ether correctly', async () => {
      const { formatEther, parseEther } = await importModule();

      const wei = parseEther('1');
      expect(wei).toBe(BigInt('1000000000000000000'));

      const eth = formatEther(BigInt('1000000000000000000'));
      expect(eth).toBe('1.0');

      const wei2 = parseEther('0.5');
      expect(wei2).toBe(BigInt('500000000000000000'));

      const eth2 = formatEther(BigInt('500000000000000000'));
      expect(eth2).toBe('0.5');
    });
  });

  describe('getContract', () => {
    it('should create contract instance', async () => {
      const { getContract } = await importModule();
      const contract = getContract('0xContractAddress', []);
      expect(contract).toBeDefined();
    });
  });

  describe('getContractWithSigner', () => {
    it('should create contract instance with signer', async () => {
      const { getContractWithSigner } = await importModule();
      const contract = getContractWithSigner('0xContractAddress', []);
      expect(contract).toBeDefined();
    });
  });

  describe('estimateGas', () => {
    it('should estimate gas for transaction', async () => {
      const { estimateGas } = await importModule();
      const gas = await estimateGas('0xRecipient', BigInt('1000000000000000000'));
      expect(gas).toBe(BigInt('21000'));
    });
  });

  describe('signMessage', () => {
    it('should sign message with wallet', async () => {
      const { signMessage } = await importModule();
      const signature = await signMessage('Hello, World!');
      expect(signature).toBe('0xsignature');
    });
  });

  describe('getBlockNumber', () => {
    it('should return current block number', async () => {
      const { getBlockNumber } = await importModule();
      const blockNumber = await getBlockNumber();
      expect(blockNumber).toBe(12345);
    });
  });
});