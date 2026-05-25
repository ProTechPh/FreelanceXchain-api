/**
 * Dispute Resolution Blockchain Service
 * Records dispute outcomes on-chain for transparency
 *
 * for persistent storage instead of in-memory Maps.
 */

import {
  submitTransaction,
  confirmTransaction,
  generateWalletAddress,
} from './blockchain-client.js';
import { TransactionReceipt } from './blockchain-types.js';
import { createHash } from 'crypto';
import { pool } from '../config/database.js';

export type BlockchainDisputeOutcome = 'pending' | 'freelancer_favor' | 'employer_favor' | 'split' | 'cancelled';

export type BlockchainDisputeRecord = {
  disputeIdHash: string;
  contractIdHash: string;
  milestoneIdHash: string;
  evidenceHash: string | null;
  initiatorWallet: string;
  freelancerWallet: string;
  employerWallet: string;
  arbiterWallet: string | null;
  amount: number;
  outcome: BlockchainDisputeOutcome;
  reasoning: string | null;
  createdAt: number;
  resolvedAt: number | null;
  transactionHash: string;
  blockNumber: number;
};

export type UserDisputeStats = {
  won: number;
  lost: number;
  total: number;
};

export type CreateDisputeInput = {
  disputeId: string;
  contractId: string;
  milestoneId: string;
  initiatorWallet: string;
  freelancerWallet: string;
  employerWallet: string;
  amount: number;
};

export type ResolveDisputeInput = {
  disputeId: string;
  outcome: 'freelancer_favor' | 'employer_favor' | 'split';
  reasoning: string;
  arbiterWallet: string;
};

const DISPUTE_REGISTRY_ADDRESS = generateWalletAddress();

function generateHash(value: string): string {
  return '0x' + createHash('sha256').update(value).digest('hex');
}

type DisputeRow = {
  dispute_id_hash: string;
  contract_id_hash: string;
  milestone_id_hash: string;
  evidence_hash: string | null;
  initiator_wallet: string;
  freelancer_wallet: string;
  employer_wallet: string;
  arbiter_wallet: string | null;
  amount: number;
  outcome: string;
  reasoning: string | null;
  created_at_ts: number;
  resolved_at: number | null;
  transaction_hash: string;
  block_number: number;
};

function rowToRecord(row: DisputeRow): BlockchainDisputeRecord {
  return {
    disputeIdHash: row.dispute_id_hash,
    contractIdHash: row.contract_id_hash,
    milestoneIdHash: row.milestone_id_hash,
    evidenceHash: row.evidence_hash,
    initiatorWallet: row.initiator_wallet,
    freelancerWallet: row.freelancer_wallet,
    employerWallet: row.employer_wallet,
    arbiterWallet: row.arbiter_wallet,
    amount: row.amount,
    outcome: row.outcome as BlockchainDisputeOutcome,
    reasoning: row.reasoning,
    createdAt: row.created_at_ts,
    resolvedAt: row.resolved_at,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
  };
}

/**
 * Create dispute record on blockchain
 */
export async function createDisputeOnBlockchain(
  input: CreateDisputeInput
): Promise<{ record: BlockchainDisputeRecord; receipt: TransactionReceipt }> {
  const disputeIdHash = generateHash(input.disputeId);
  const contractIdHash = generateHash(input.contractId);
  const milestoneIdHash = generateHash(input.milestoneId);

  // Check if already exists
  const existingResult = await pool.query(
    'SELECT dispute_id_hash FROM blockchain_dispute_records WHERE dispute_id_hash = $1',
    [disputeIdHash]
  );

  if (existingResult.rows.length > 0) {
    throw new Error('Dispute already exists on blockchain');
  }

  const tx = await submitTransaction({
    type: 'dispute_create',
    from: input.initiatorWallet,
    to: DISPUTE_REGISTRY_ADDRESS,
    amount: BigInt(0),
    data: {
      action: 'create_dispute',
      disputeIdHash,
      contractIdHash,
      milestoneIdHash,
      initiator: input.initiatorWallet,
      freelancer: input.freelancerWallet,
      employer: input.employerWallet,
      amount: input.amount,
    },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();
  const record: BlockchainDisputeRecord = {
    disputeIdHash,
    contractIdHash,
    milestoneIdHash,
    evidenceHash: null,
    initiatorWallet: input.initiatorWallet,
    freelancerWallet: input.freelancerWallet,
    employerWallet: input.employerWallet,
    arbiterWallet: null,
    amount: input.amount,
    outcome: 'pending',
    reasoning: null,
    createdAt: now,
    resolvedAt: null,
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
  };

  // Persist to DB
  await pool.query(
    `INSERT INTO blockchain_dispute_records 
     (dispute_id_hash, contract_id_hash, milestone_id_hash, evidence_hash, initiator_wallet, 
      freelancer_wallet, employer_wallet, arbiter_wallet, amount, outcome, reasoning, 
      created_at_ts, resolved_at, transaction_hash, block_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      record.disputeIdHash,
      record.contractIdHash,
      record.milestoneIdHash,
      record.evidenceHash,
      record.initiatorWallet,
      record.freelancerWallet,
      record.employerWallet,
      record.arbiterWallet,
      record.amount,
      record.outcome,
      record.reasoning,
      record.createdAt,
      record.resolvedAt,
      record.transactionHash,
      record.blockNumber
    ]
  );

  return {
    record,
    receipt: {
      transactionHash: confirmed.hash!,
      blockNumber: confirmed.blockNumber!,
      status: 'success',
      gasUsed: confirmed.gasUsed!,
      timestamp: now,
    },
  };
}

/**
 * Update evidence hash on blockchain
 */
export async function updateDisputeEvidence(
  disputeId: string,
  evidenceData: string,
  submitterWallet: string
): Promise<{ record: BlockchainDisputeRecord; receipt: TransactionReceipt }> {
  const disputeIdHash = generateHash(disputeId);

  const result = await pool.query(
    'SELECT * FROM blockchain_dispute_records WHERE dispute_id_hash = $1',
    [disputeIdHash]
  );

  if (result.rows.length === 0) throw new Error('Dispute not found');
  const record = rowToRecord(result.rows[0] as DisputeRow);
  if (record.outcome !== 'pending') throw new Error('Dispute already resolved');

  const evidenceHash = generateHash(evidenceData);

  const tx = await submitTransaction({
    type: 'dispute_create',
    from: submitterWallet,
    to: DISPUTE_REGISTRY_ADDRESS,
    amount: BigInt(0),
    data: { action: 'update_evidence', disputeIdHash, evidenceHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  // Update in DB
  await pool.query(
    `UPDATE blockchain_dispute_records 
     SET evidence_hash = $1, transaction_hash = $2, block_number = $3, updated_at = NOW()
     WHERE dispute_id_hash = $4`,
    [evidenceHash, confirmed.hash!, confirmed.blockNumber!, disputeIdHash]
  );

  record.evidenceHash = evidenceHash;
  record.transactionHash = confirmed.hash!;
  record.blockNumber = confirmed.blockNumber!;

  return {
    record,
    receipt: {
      transactionHash: confirmed.hash!,
      blockNumber: confirmed.blockNumber!,
      status: 'success',
      gasUsed: confirmed.gasUsed!,
      timestamp: Date.now(),
    },
  };
}

/**
 * Resolve dispute on blockchain
 */
export async function resolveDisputeOnBlockchain(
  input: ResolveDisputeInput
): Promise<{ record: BlockchainDisputeRecord; receipt: TransactionReceipt }> {
  const disputeIdHash = generateHash(input.disputeId);

  const result = await pool.query(
    'SELECT * FROM blockchain_dispute_records WHERE dispute_id_hash = $1',
    [disputeIdHash]
  );

  if (result.rows.length === 0) throw new Error('Dispute not found');
  const record = rowToRecord(result.rows[0] as DisputeRow);
  if (record.outcome !== 'pending') throw new Error('Dispute already resolved');

  const tx = await submitTransaction({
    type: 'dispute_resolve',
    from: input.arbiterWallet,
    to: DISPUTE_REGISTRY_ADDRESS,
    amount: BigInt(0),
    data: {
      action: 'resolve_dispute',
      disputeIdHash,
      outcome: input.outcome,
      reasoning: input.reasoning,
    },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();

  // Update in DB
  await pool.query(
    `UPDATE blockchain_dispute_records 
     SET outcome = $1, reasoning = $2, arbiter_wallet = $3, resolved_at = $4, 
         transaction_hash = $5, block_number = $6, updated_at = NOW()
     WHERE dispute_id_hash = $7`,
    [input.outcome, input.reasoning, input.arbiterWallet, now, confirmed.hash!, confirmed.blockNumber!, disputeIdHash]
  );

  record.outcome = input.outcome;
  record.reasoning = input.reasoning;
  record.arbiterWallet = input.arbiterWallet;
  record.resolvedAt = now;
  record.transactionHash = confirmed.hash!;
  record.blockNumber = confirmed.blockNumber!;

  return {
    record,
    receipt: {
      transactionHash: confirmed.hash!,
      blockNumber: confirmed.blockNumber!,
      status: 'success',
      gasUsed: confirmed.gasUsed!,
      timestamp: now,
    },
  };
}

/**
 * Get dispute from blockchain
 */
export async function getDisputeFromBlockchain(disputeId: string): Promise<BlockchainDisputeRecord | null> {
  const disputeIdHash = generateHash(disputeId);
  const result = await pool.query(
    'SELECT * FROM blockchain_dispute_records WHERE dispute_id_hash = $1',
    [disputeIdHash]
  );

  if (result.rows.length === 0) return null;
  return rowToRecord(result.rows[0] as DisputeRow);
}

/**
 * Get user dispute stats (derived from DB queries)
 */
export async function getUserDisputeStats(walletAddress: string): Promise<UserDisputeStats> {
  // Count total disputes involving this wallet
  const totalResult = await pool.query(
    'SELECT COUNT(*) as count FROM blockchain_dispute_records WHERE freelancer_wallet = $1 OR employer_wallet = $1',
    [walletAddress]
  );

  // Get all resolved disputes to count wins/losses
  const resolvedResult = await pool.query(
    `SELECT outcome, freelancer_wallet, employer_wallet FROM blockchain_dispute_records 
     WHERE (freelancer_wallet = $1 OR employer_wallet = $1) AND outcome != 'pending'`,
    [walletAddress]
  );

  let won = 0;
  let lost = 0;
  for (const d of resolvedResult.rows) {
    if (d.outcome === 'freelancer_favor' && d.freelancer_wallet === walletAddress) won++;
    else if (d.outcome === 'employer_favor' && d.employer_wallet === walletAddress) won++;
    else if (d.outcome === 'freelancer_favor' && d.employer_wallet === walletAddress) lost++;
    else if (d.outcome === 'employer_favor' && d.freelancer_wallet === walletAddress) lost++;
  }

  return { won, lost, total: parseInt(totalResult.rows[0].count) || 0 };
}

/**
 * Get user's disputes
 */
export async function getUserDisputes(walletAddress: string): Promise<BlockchainDisputeRecord[]> {
  const result = await pool.query(
    `SELECT * FROM blockchain_dispute_records 
     WHERE freelancer_wallet = $1 OR employer_wallet = $1
     ORDER BY created_at_ts DESC`,
    [walletAddress]
  );

  if (result.rows.length === 0) return [];
  return result.rows.map(rowToRecord);
}

export async function clearDisputeRegistry(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  await pool.query('DELETE FROM blockchain_dispute_records');
}

export function getDisputeRegistryAddress(): string {
  return DISPUTE_REGISTRY_ADDRESS;
}
