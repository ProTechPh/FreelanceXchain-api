/**
 * Web3 Client
 * Real Ethereum blockchain integration using ethers.js
 * Connects to Infura/Alchemy for mainnet/testnet transactions
 */

import { ethers, JsonRpcProvider, Wallet, TransactionResponse, TransactionReceipt as EthersReceipt } from 'ethers';
import { config } from '../config/env.js';

// Types
export type Web3Config = {
  rpcUrl: string;
  privateKey: string;
  chainId: number;
};

export type Web3TransactionResult = {
  hash: string;
  blockNumber: number | null;
  from: string;
  to: string | null;
  value: bigint;
  gasUsed: bigint;
  status: 'success' | 'failed' | 'pending';
};

export type WalletInfo = {
  address: string;
  balance: bigint;
  chainId: number;
};

// Singleton instances
let provider: JsonRpcProvider | null = null;
let wallet: Wallet | null = null;
const GAS_PRICE_REDUCTION_PERCENT = BigInt(10);
const HUNDRED_PERCENT = BigInt(100);

function reduceGasPrice(gasPrice: bigint): bigint {
  const reduced = (gasPrice * (HUNDRED_PERCENT - GAS_PRICE_REDUCTION_PERCENT)) / HUNDRED_PERCENT;
  return reduced > BigInt(0) ? reduced : BigInt(1);
}

/**
 * Check if Web3 is configured and available
 */
export function isWeb3Available(): boolean {
  return Boolean(config.blockchain.rpcUrl && config.blockchain.privateKey);
}

/**
 * Get or create the JSON-RPC provider
 */
export function getProvider(): JsonRpcProvider {
  if (!provider) {
    if (!config.blockchain.rpcUrl) {
      throw new Error('BLOCKCHAIN_RPC_URL is not configured');
    }
    provider = new JsonRpcProvider(config.blockchain.rpcUrl);
  }
  return provider;
}

/**
 * Get or create the wallet instance
 */
export function getWallet(): Wallet {
  if (!wallet) {
    if (!config.blockchain.privateKey) {
      throw new Error('BLOCKCHAIN_PRIVATE_KEY is not configured');
    }
    const p = getProvider();
    wallet = new Wallet(config.blockchain.privateKey, p);
  }
  return wallet;
}

/**
 * Get a fresh wallet instance (not cached) for sequential transactions
 * This creates a new provider connection to ensure accurate nonce
 */
export function getFreshWallet(): Wallet {
  if (!config.blockchain.privateKey) {
    throw new Error('BLOCKCHAIN_PRIVATE_KEY is not configured');
  }
  if (!config.blockchain.rpcUrl) {
    throw new Error('BLOCKCHAIN_RPC_URL is not configured');
  }
  const freshProvider = new JsonRpcProvider(config.blockchain.rpcUrl);
  return new Wallet(config.blockchain.privateKey, freshProvider);
}

/**
 * Reset the cached provider and wallet instances
 * Useful when nonce gets out of sync
 */
export function resetWeb3Instances(): void {
  provider = null;
  wallet = null;
}

/**
 * Get wallet information including balance
 */
export async function getWalletInfo(): Promise<WalletInfo> {
  const w = getWallet();
  const p = getProvider();
  
  const [balance, network] = await Promise.all([
    p.getBalance(w.address),
    p.getNetwork(),
  ]);

  return {
    address: w.address,
    balance,
    chainId: Number(network.chainId),
  };
}

/**
 * Get balance of any address
 */
export async function getBalance(address: string): Promise<bigint> {
  const p = getProvider();
  return p.getBalance(address);
}

/**
 * Send ETH to an address
 */
export async function sendTransaction(
  to: string,
  amountInWei: bigint,
  data?: string
): Promise<Web3TransactionResult> {
  const w = getWallet();
  const gasPrice = await getGasPrice();
  const txParams = gasPrice > BigInt(0)
    ? {
      to,
      value: amountInWei,
      data: data ?? '0x',
      gasPrice,
    }
    : {
      to,
      value: amountInWei,
      data: data ?? '0x',
    };

  const tx: TransactionResponse = await w.sendTransaction(txParams);

  // Wait for confirmation
  const receipt: EthersReceipt | null = await tx.wait();

  if (!receipt) {
    return {
      hash: tx.hash,
      blockNumber: null,
      from: tx.from,
      to: tx.to,
      value: amountInWei,
      gasUsed: BigInt(0),
      status: 'pending',
    };
  }

  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    from: receipt.from,
    to: receipt.to,
    value: amountInWei,
    gasUsed: receipt.gasUsed,
    status: receipt.status === 1 ? 'success' : 'failed',
  };
}


/**
 * Get transaction by hash
 */
export async function getTransactionByHash(hash: string): Promise<Web3TransactionResult | null> {
  const p = getProvider();
  
  const [tx, receipt] = await Promise.all([
    p.getTransaction(hash),
    p.getTransactionReceipt(hash),
  ]);

  if (!tx) return null;

  return {
    hash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    gasUsed: receipt?.gasUsed ?? BigInt(0),
    status: receipt ? (receipt.status === 1 ? 'success' : 'failed') : 'pending',
  };
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  hash: string,
  confirmations: number = 1
): Promise<Web3TransactionResult> {
  const p = getProvider();
  const receipt = await p.waitForTransaction(hash, confirmations);

  if (!receipt) {
    throw new Error('Transaction not found');
  }

  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    from: receipt.from,
    to: receipt.to,
    value: BigInt(0), // Value not available in receipt
    gasUsed: receipt.gasUsed,
    status: receipt.status === 1 ? 'success' : 'failed',
  };
}

/**
 * Get current gas price
 */
export async function getGasPrice(): Promise<bigint> {
  const p = getProvider();
  const feeData = await p.getFeeData();
  if (!feeData.gasPrice || feeData.gasPrice <= BigInt(0)) {
    return BigInt(0);
  }

  return reduceGasPrice(feeData.gasPrice);
}

/**
 * Get current block number
 */
export async function getBlockNumber(): Promise<number> {
  const p = getProvider();
  return p.getBlockNumber();
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  to: string,
  amountInWei: bigint,
  data?: string
): Promise<bigint> {
  const w = getWallet();
  return w.estimateGas({
    to,
    value: amountInWei,
    data: data ?? '0x',
  });
}

/**
 * Format wei to ETH string
 */
export function formatEther(wei: bigint): string {
  return ethers.formatEther(wei);
}

/**
 * Parse ETH string to wei
 */
export function parseEther(eth: string): bigint {
  return ethers.parseEther(eth);
}

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

/**
 * Get checksum address
 */
export function getChecksumAddress(address: string): string {
  return ethers.getAddress(address);
}

/**
 * Sign a message with the wallet
 */
export async function signMessage(message: string): Promise<string> {
  const w = getWallet();
  return w.signMessage(message);
}

/**
 * Verify a signed message
 */
export function verifyMessage(message: string, signature: string): string {
  return ethers.verifyMessage(message, signature);
}

/**
 * Get network information
 */
export async function getNetworkInfo(): Promise<{ name: string; chainId: number }> {
  const p = getProvider();
  const network = await p.getNetwork();
  return {
    name: network.name,
    chainId: Number(network.chainId),
  };
}

/**
 * Check if connected to expected network
 */
export async function isCorrectNetwork(expectedChainId: number): Promise<boolean> {
  const network = await getNetworkInfo();
  return network.chainId === expectedChainId;
}

/**
 * Reset provider and wallet (for testing or reconnection)
 */
export function resetWeb3Client(): void {
  provider = null;
  wallet = null;
}

// Contract interaction helpers

/**
 * Deploy a contract
 */
export async function deployContract(
  abi: ethers.InterfaceAbi,
  bytecode: string,
  constructorArgs: unknown[] = []
): Promise<{ address: string; transactionHash: string }> {
  const w = getWallet();
  const factory = new ethers.ContractFactory(abi, bytecode, w);
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  
  return {
    address,
    transactionHash: deployTx?.hash ?? '',
  };
}

/**
 * Get contract instance for reading
 */
export function getContract(
  address: string,
  abi: ethers.InterfaceAbi
): ethers.Contract {
  const p = getProvider();
  return new ethers.Contract(address, abi, p);
}

/**
 * Get contract instance for writing (with signer)
 */
export function getContractWithSigner(
  address: string,
  abi: ethers.InterfaceAbi
): ethers.Contract {
  const w = getWallet();
  return new ethers.Contract(address, abi, w);
}
