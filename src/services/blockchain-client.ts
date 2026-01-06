/**
 * Blockchain Client
 * Handles blockchain transactions, serialization, and status polling
 * Requirements: 6.6, 6.7
 */

import { config } from '../config/env.js';
import { generateId } from '../utils/id.js';
import {
  Transaction,
  TransactionInput,
  TransactionReceipt,
  TransactionPollResult,
  SerializedTransaction,
  PaymentTransaction,
  SerializedPaymentTransaction,
  BlockchainConfig,
} from './blockchain-types.js';

// In-memory transaction store for simulation (would be replaced with actual blockchain in production)
const transactionStore = new Map<string, Transaction>();
const pendingTransactions = new Map<string, { confirmAt: number }>();

// Default configuration
const defaultConfig: BlockchainConfig = {
  rpcUrl: config.blockchain.rpcUrl ?? '',
  privateKey: config.blockchain.privateKey ?? '',
  chainId: 1,
};

/**
 * Serialize a Transaction to JSON-compatible format
 * Converts bigint values to strings for JSON encoding
 */
export function serializeTransaction(tx: Transaction): SerializedTransaction {
  return {
    id: tx.id,
    type: tx.type,
    from: tx.from,
    to: tx.to,
    amount: tx.amount.toString(),
    data: tx.data,
    timestamp: tx.timestamp,
    status: tx.status,
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    gasUsed: tx.gasUsed?.toString(),
  };
}

/**
 * Deserialize a JSON object back to Transaction
 * Converts string values back to bigint
 */
export function deserializeTransaction(json: SerializedTransaction): Transaction {
  return {
    id: json.id,
    type: json.type,
    from: json.from,
    to: json.to,
    amount: BigInt(json.amount),
    data: json.data,
    timestamp: json.timestamp,
    status: json.status,
    hash: json.hash,
    blockNumber: json.blockNumber,
    gasUsed: json.gasUsed ? BigInt(json.gasUsed) : undefined,
  };
}


/**
 * Serialize a PaymentTransaction to JSON-compatible format
 */
export function serializePaymentTransaction(tx: PaymentTransaction): SerializedPaymentTransaction {
  return {
    escrowAddress: tx.escrowAddress,
    milestoneId: tx.milestoneId,
    amount: tx.amount.toString(),
    recipient: tx.recipient,
    timestamp: tx.timestamp,
    transactionHash: tx.transactionHash,
  };
}

/**
 * Deserialize a JSON object back to PaymentTransaction
 */
export function deserializePaymentTransaction(json: SerializedPaymentTransaction): PaymentTransaction {
  return {
    escrowAddress: json.escrowAddress,
    milestoneId: json.milestoneId,
    amount: BigInt(json.amount),
    recipient: json.recipient,
    timestamp: json.timestamp,
    transactionHash: json.transactionHash,
  };
}

/**
 * Generate a mock transaction hash
 */
function generateTransactionHash(): string {
  return '0x' + Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Generate a mock wallet address
 */
export function generateWalletAddress(): string {
  return '0x' + Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/**
 * Sign a transaction (simulated)
 * In production, this would use actual cryptographic signing
 */
export function signTransaction(tx: Transaction, _privateKey: string): string {
  // Simulated signature - in production would use actual signing
  const txData = JSON.stringify(serializeTransaction(tx));
  return '0x' + Buffer.from(txData).toString('hex').slice(0, 130);
}

/**
 * Create and submit a transaction to the blockchain
 */
export async function submitTransaction(
  input: TransactionInput,
  blockchainConfig: BlockchainConfig = defaultConfig
): Promise<Transaction> {
  const tx: Transaction = {
    id: generateId(),
    type: input.type,
    from: input.from,
    to: input.to,
    amount: input.amount,
    data: input.data ?? {},
    timestamp: Date.now(),
    status: 'pending',
  };

  // Sign the transaction (signature used for blockchain submission in production)
  signTransaction(tx, blockchainConfig.privateKey);

  // Generate transaction hash
  tx.hash = generateTransactionHash();

  // Store the transaction
  transactionStore.set(tx.id, tx);

  // Simulate pending confirmation (would be confirmed after ~2 seconds in simulation)
  pendingTransactions.set(tx.id, { confirmAt: Date.now() + 2000 });

  return tx;
}


/**
 * Get transaction by ID
 */
export async function getTransaction(txId: string): Promise<Transaction | null> {
  return transactionStore.get(txId) ?? null;
}

/**
 * Get transaction by hash
 */
export async function getTransactionByHash(hash: string): Promise<Transaction | null> {
  for (const tx of transactionStore.values()) {
    if (tx.hash === hash) {
      return tx;
    }
  }
  return null;
}

/**
 * Poll transaction status until confirmed or failed
 */
export async function pollTransactionStatus(
  txId: string,
  maxAttempts: number = 10,
  intervalMs: number = 1000
): Promise<TransactionPollResult> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const tx = transactionStore.get(txId);
    if (!tx) {
      return { status: 'failed', error: 'Transaction not found' };
    }

    // Check if transaction should be confirmed (simulation)
    const pending = pendingTransactions.get(txId);
    if (pending && Date.now() >= pending.confirmAt) {
      // Confirm the transaction
      tx.status = 'confirmed';
      tx.blockNumber = Math.floor(Math.random() * 1000000) + 1;
      tx.gasUsed = BigInt(21000 + Math.floor(Math.random() * 50000));
      transactionStore.set(txId, tx);
      pendingTransactions.delete(txId);

      const receipt: TransactionReceipt = {
        transactionHash: tx.hash!,
        blockNumber: tx.blockNumber,
        status: 'success',
        gasUsed: tx.gasUsed,
        timestamp: Date.now(),
      };

      return { status: 'confirmed', receipt };
    }

    if (tx.status === 'confirmed') {
      const receipt: TransactionReceipt = {
        transactionHash: tx.hash!,
        blockNumber: tx.blockNumber!,
        status: 'success',
        gasUsed: tx.gasUsed!,
        timestamp: tx.timestamp,
      };
      return { status: 'confirmed', receipt };
    }

    if (tx.status === 'failed') {
      return { status: 'failed', error: 'Transaction failed on chain' };
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    attempts++;
  }

  return { status: 'pending' };
}

/**
 * Confirm a transaction immediately (for testing)
 */
export async function confirmTransaction(txId: string): Promise<Transaction | null> {
  const tx = transactionStore.get(txId);
  if (!tx) return null;

  tx.status = 'confirmed';
  tx.blockNumber = Math.floor(Math.random() * 1000000) + 1;
  tx.gasUsed = BigInt(21000 + Math.floor(Math.random() * 50000));
  transactionStore.set(txId, tx);
  pendingTransactions.delete(txId);

  return tx;
}

/**
 * Fail a transaction (for testing)
 */
export async function failTransaction(txId: string): Promise<Transaction | null> {
  const tx = transactionStore.get(txId);
  if (!tx) return null;

  tx.status = 'failed';
  transactionStore.set(txId, tx);
  pendingTransactions.delete(txId);

  return tx;
}

/**
 * Clear all transactions (for testing)
 */
export function clearTransactions(): void {
  transactionStore.clear();
  pendingTransactions.clear();
}

/**
 * Get blockchain client configuration
 */
export function getBlockchainConfig(): BlockchainConfig {
  return { ...defaultConfig };
}

/**
 * Check if blockchain is available
 */
export async function isBlockchainAvailable(): Promise<boolean> {
  // In production, this would ping the RPC endpoint
  return !!config.blockchain.rpcUrl;
}
