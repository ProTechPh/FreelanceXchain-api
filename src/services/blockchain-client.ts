/**
 * Blockchain Client
 * Handles blockchain transactions, serialization, and status polling
 * Requirements: 6.6, 6.7
 * 
 * ARCHITECTURE: Uses Supabase (blockchain_transactions table) for persistent storage
 * instead of in-memory Maps, so data survives server restarts.
 */

import { config } from '../config/env.js';
import { generateId } from '../utils/id.js';
import { getSupabaseServiceClient } from '../config/supabase.js';
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

// Default configuration
const defaultConfig: BlockchainConfig = {
  rpcUrl: config.blockchain.rpcUrl ?? '',
  privateKey: config.blockchain.privateKey ?? '',
  chainId: 1,
};

// DB row type for blockchain_transactions table
type TransactionRow = {
  id: string;
  type: string;
  from_address: string;
  to_address: string;
  amount: string;
  data: Record<string, unknown>;
  timestamp: number;
  status: string;
  hash: string | null;
  block_number: number | null;
  gas_used: string | null;
  confirm_at: number | null;
};

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type as Transaction['type'],
    from: row.from_address,
    to: row.to_address,
    amount: BigInt(row.amount),
    data: row.data,
    timestamp: row.timestamp,
    status: row.status as Transaction['status'],
    hash: row.hash ?? undefined,
    blockNumber: row.block_number ?? undefined,
    gasUsed: row.gas_used ? BigInt(row.gas_used) : undefined,
  };
}

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
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from('blockchain_transactions')
    .insert({
      id: tx.id,
      type: tx.type,
      from_address: tx.from,
      to_address: tx.to,
      amount: tx.amount.toString(),
      data: tx.data,
      timestamp: tx.timestamp,
      status: tx.status,
      hash: tx.hash,
      block_number: null,
      gas_used: null,
      confirm_at: confirmAt,
    });

  if (error) {
    throw new Error(`Failed to store transaction: ${error.message}`);
  }

  return tx;
}


/**
 * Get transaction by ID
 */
export async function getTransaction(txId: string): Promise<Transaction | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_transactions')
    .select('*')
    .eq('id', txId)
    .single();

  if (error || !data) return null;
  return rowToTransaction(data as TransactionRow);
}

/**
 * Get transaction by hash
 */
export async function getTransactionByHash(hash: string): Promise<Transaction | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_transactions')
    .select('*')
    .eq('hash', hash)
    .limit(1)
    .single();

  if (error || !data) return null;
  return rowToTransaction(data as TransactionRow);
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
    const tx = await getTransaction(txId);
    if (!tx) {
      return { status: 'failed', error: 'Transaction not found' };
    }

    // Check if transaction should be confirmed (simulation)
    const supabase = getSupabaseServiceClient();
    const { data: row } = await supabase
      .from('blockchain_transactions')
      .select('confirm_at')
      .eq('id', txId)
      .single();

    const confirmAt = (row as TransactionRow | null)?.confirm_at;
    if (confirmAt && Date.now() >= confirmAt) {
      // Confirm the transaction
      const confirmed = await confirmTransaction(txId);
      if (confirmed) {
        const receipt: TransactionReceipt = {
          transactionHash: confirmed.hash!,
          blockNumber: confirmed.blockNumber!,
          status: 'success',
          gasUsed: confirmed.gasUsed!,
          timestamp: Date.now(),
        };
        return { status: 'confirmed', receipt };
      }
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
 * Confirm a transaction immediately (for testing/simulation)
 */
export async function confirmTransaction(txId: string): Promise<Transaction | null> {
  const blockNumber = Math.floor(Math.random() * 1000000) + 1;
  const gasUsed = BigInt(21000 + Math.floor(Math.random() * 50000));

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_transactions')
    .update({
      status: 'confirmed',
      block_number: blockNumber,
      gas_used: gasUsed.toString(),
      confirm_at: null,
    })
    .eq('id', txId)
    .select('*')
    .single();

  if (error || !data) return null;
  return rowToTransaction(data as TransactionRow);
}

/**
 * Fail a transaction (for testing)
 */
export async function failTransaction(txId: string): Promise<Transaction | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_transactions')
    .update({
      status: 'failed',
      confirm_at: null,
    })
    .eq('id', txId)
    .select('*')
    .single();

  if (error || !data) return null;
  return rowToTransaction(data as TransactionRow);
}

/**
 * Clear all transactions (for testing)
 */
export async function clearTransactions(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  const supabase = getSupabaseServiceClient();
  await supabase.from('blockchain_transactions').delete().neq('id', '');
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
