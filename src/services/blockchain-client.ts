/**
 * Simulated Blockchain Client
 *
 * Provides a simulated blockchain transaction layer backed by Appwrite.
 * Generates mock transaction hashes and wallet addresses — does NOT interact
 * with any real blockchain network. Used when BLOCKCHAIN_MODE=simulated.
 *
 * Data is persisted in Appwrite so it survives server restarts.
 */

import { config } from '../config/env.js';
import { generateId } from '../utils/id.js';
import { safeJsonParse } from '../utils/index.js';
import { blockchainTransactionRepository, type BlockchainTransactionEntity } from '../repositories/blockchain-transaction-repository.js';
import {
  Transaction,
  TransactionInput,
  BlockchainConfig,
} from './blockchain-types.js';

// Default configuration
const defaultConfig: BlockchainConfig = {
  rpcUrl: config.blockchain.rpcUrl ?? '',
  privateKey: config.blockchain.privateKey ?? '',
  chainId: 1,
};

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
 * Create and submit a transaction to the blockchain
 */
export async function submitTransaction(
  input: TransactionInput,
  _blockchainConfig: BlockchainConfig = defaultConfig
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

  // Generate transaction hash
  tx.hash = generateTransactionHash();

  // Simulate pending confirmation (would be confirmed after ~2 seconds in simulation)
  const confirmAt = Date.now() + 2000;

  // Persist to database
  await blockchainTransactionRepository.createTransaction({
    id: tx.id,
    type: tx.type,
    from_address: tx.from,
    to_address: tx.to,
    amount: tx.amount.toString(),
    data: JSON.stringify(tx.data) as unknown as string,
    timestamp: tx.timestamp,
    status: tx.status,
    hash: tx.hash,
    confirm_at: confirmAt,
  });

  return tx;
}


/**
 * Get transaction by ID
 */
export async function getTransaction(txId: string): Promise<Transaction | null> {
  const entity = await blockchainTransactionRepository.getTransactionById(txId);
  if (!entity) return null;
  return {
    id: entity.id,
    type: entity.type as Transaction['type'],
    from: entity.from_address,
    to: entity.to_address,
    amount: BigInt(entity.amount),
    data: safeJsonParse<Record<string, unknown>>(entity.data),
    timestamp: entity.timestamp,
    status: entity.status as Transaction['status'],
    hash: entity.hash ?? undefined,
    blockNumber: entity.block_number ?? undefined,
    gasUsed: entity.gas_used ? BigInt(entity.gas_used) : undefined,
  };
}

/**
 * Confirm a transaction immediately (for testing/simulation)
 */
export async function confirmTransaction(txId: string): Promise<Transaction | null> {
  const blockNumber = Math.floor(Math.random() * 1000000) + 1;
  const gasUsed = BigInt(21000 + Math.floor(Math.random() * 50000));

  const updates: Partial<BlockchainTransactionEntity> = {
    status: 'confirmed',
    block_number: blockNumber,
    gas_used: gasUsed.toString(),
  };
  const entity = await blockchainTransactionRepository.updateTransaction(txId, updates);

  if (!entity) return null;
  return {
    id: entity.id,
    type: entity.type as Transaction['type'],
    from: entity.from_address,
    to: entity.to_address,
    amount: BigInt(entity.amount),
    data: safeJsonParse<Record<string, unknown>>(entity.data),
    timestamp: entity.timestamp,
    status: entity.status as Transaction['status'],
    hash: entity.hash ?? undefined,
    blockNumber: entity.block_number ?? undefined,
    gasUsed: entity.gas_used ? BigInt(entity.gas_used) : undefined,
  };
}


