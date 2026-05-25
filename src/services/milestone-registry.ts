/**
 * Milestone Registry Blockchain Service
 * Records milestone completions on-chain for verifiable work history
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

export type BlockchainMilestoneStatus = 'submitted' | 'approved' | 'rejected' | 'disputed';

export type BlockchainMilestoneRecord = {
  milestoneIdHash: string;
  contractIdHash: string;
  workHash: string;
  freelancerWallet: string;
  employerWallet: string;
  amount: number;
  status: BlockchainMilestoneStatus;
  submittedAt: number;
  completedAt: number | null;
  title: string;
  transactionHash: string;
  blockNumber: number;
};

export type FreelancerStats = {
  completedCount: number;
  totalEarned: number;
  totalMilestones: number;
};

export type SubmitMilestoneInput = {
  milestoneId: string;
  contractId: string;
  freelancerWallet: string;
  employerWallet: string;
  amount: number;
  title: string;
  deliverables: string; // Description or link to deliverables
};

const MILESTONE_REGISTRY_ADDRESS = generateWalletAddress();

// DB row type
type MilestoneRow = {
  milestone_id_hash: string;
  contract_id_hash: string;
  work_hash: string;
  freelancer_wallet: string;
  employer_wallet: string;
  amount: number;
  status: string;
  submitted_at: number;
  completed_at: number | null;
  title: string;
  transaction_hash: string;
  block_number: number;
};

function rowToRecord(row: MilestoneRow): BlockchainMilestoneRecord {
  return {
    milestoneIdHash: row.milestone_id_hash,
    contractIdHash: row.contract_id_hash,
    workHash: row.work_hash,
    freelancerWallet: row.freelancer_wallet,
    employerWallet: row.employer_wallet,
    amount: Number(row.amount),
    status: row.status as BlockchainMilestoneStatus,
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    title: row.title,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
  };
}

export function generateMilestoneIdHash(milestoneId: string): string {
  return '0x' + createHash('sha256').update(milestoneId).digest('hex');
}

export function generateWorkHash(deliverables: string): string {
  return '0x' + createHash('sha256').update(deliverables).digest('hex');
}

/**
 * Submit milestone to blockchain registry
 */
export async function submitMilestoneToRegistry(
  input: SubmitMilestoneInput
): Promise<{ record: BlockchainMilestoneRecord; receipt: TransactionReceipt }> {
  const milestoneIdHash = generateMilestoneIdHash(input.milestoneId);
  const contractIdHash = '0x' + createHash('sha256').update(input.contractId).digest('hex');
  const workHash = generateWorkHash(input.deliverables);

  // Check if already exists
  const existingResult = await pool.query(
    'SELECT milestone_id_hash FROM blockchain_milestones WHERE milestone_id_hash = $1',
    [milestoneIdHash]
  );

  if (existingResult.rows.length > 0) {
    throw new Error('Milestone already submitted');
  }

  const tx = await submitTransaction({
    type: 'milestone_submit',
    from: input.freelancerWallet,
    to: MILESTONE_REGISTRY_ADDRESS,
    amount: BigInt(0),
    data: {
      action: 'submit_milestone',
      milestoneIdHash,
      contractIdHash,
      workHash,
      freelancer: input.freelancerWallet,
      employer: input.employerWallet,
      amount: input.amount,
      title: input.title,
    },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();
  const record: BlockchainMilestoneRecord = {
    milestoneIdHash,
    contractIdHash,
    workHash,
    freelancerWallet: input.freelancerWallet,
    employerWallet: input.employerWallet,
    amount: input.amount,
    status: 'submitted',
    submittedAt: now,
    completedAt: null,
    title: input.title,
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
  };

  // Persist to DB
  await pool.query(
    `INSERT INTO blockchain_milestones 
     (milestone_id_hash, contract_id_hash, work_hash, freelancer_wallet, employer_wallet, 
      amount, status, submitted_at, completed_at, title, transaction_hash, block_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      record.milestoneIdHash,
      record.contractIdHash,
      record.workHash,
      record.freelancerWallet,
      record.employerWallet,
      record.amount,
      record.status,
      record.submittedAt,
      record.completedAt,
      record.title,
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
 * Approve milestone on blockchain
 */
export async function approveMilestoneOnRegistry(
  milestoneId: string,
  approverWallet: string
): Promise<{ record: BlockchainMilestoneRecord; receipt: TransactionReceipt }> {
  const milestoneIdHash = generateMilestoneIdHash(milestoneId);

  const result = await pool.query(
    'SELECT * FROM blockchain_milestones WHERE milestone_id_hash = $1',
    [milestoneIdHash]
  );

  if (result.rows.length === 0) throw new Error('Milestone not found');
  const record = rowToRecord(result.rows[0] as MilestoneRow);

  if (record.status !== 'submitted' && record.status !== 'disputed') {
    throw new Error('Invalid milestone status');
  }

  const tx = await submitTransaction({
    type: 'milestone_approve',
    from: approverWallet,
    to: MILESTONE_REGISTRY_ADDRESS,
    amount: BigInt(0),
    data: { action: 'approve_milestone', milestoneIdHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();

  // Update in DB
  await pool.query(
    `UPDATE blockchain_milestones 
     SET status = $1, completed_at = $2, transaction_hash = $3, block_number = $4, updated_at = NOW()
     WHERE milestone_id_hash = $5`,
    ['approved', now, confirmed.hash!, confirmed.blockNumber!, milestoneIdHash]
  );

  record.status = 'approved';
  record.completedAt = now;
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
 * Reject milestone on blockchain
 */
export async function rejectMilestoneOnRegistry(
  milestoneId: string,
  rejecterWallet: string,
  reason: string
): Promise<{ record: BlockchainMilestoneRecord; receipt: TransactionReceipt }> {
  const milestoneIdHash = generateMilestoneIdHash(milestoneId);

  const result = await pool.query(
    'SELECT * FROM blockchain_milestones WHERE milestone_id_hash = $1',
    [milestoneIdHash]
  );

  if (result.rows.length === 0) throw new Error('Milestone not found');
  const record = rowToRecord(result.rows[0] as MilestoneRow);

  if (record.status !== 'submitted') throw new Error('Invalid milestone status');

  const tx = await submitTransaction({
    type: 'milestone_reject',
    from: rejecterWallet,
    to: MILESTONE_REGISTRY_ADDRESS,
    amount: BigInt(0),
    data: { action: 'reject_milestone', milestoneIdHash, reason },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  // Update in DB
  await pool.query(
    `UPDATE blockchain_milestones 
     SET status = $1, transaction_hash = $2, block_number = $3, updated_at = NOW()
     WHERE milestone_id_hash = $4`,
    ['rejected', confirmed.hash!, confirmed.blockNumber!, milestoneIdHash]
  );

  record.status = 'rejected';
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
 * Get milestone record from blockchain
 */
export async function getMilestoneFromRegistry(milestoneId: string): Promise<BlockchainMilestoneRecord | null> {
  const milestoneIdHash = generateMilestoneIdHash(milestoneId);
  const result = await pool.query(
    'SELECT * FROM blockchain_milestones WHERE milestone_id_hash = $1',
    [milestoneIdHash]
  );

  if (result.rows.length === 0) return null;
  return rowToRecord(result.rows[0] as MilestoneRow);
}

/**
 * Get freelancer stats from blockchain (derived via SQL aggregates)
 */
export async function getFreelancerStatsFromRegistry(walletAddress: string): Promise<FreelancerStats> {
  // Total milestones for this freelancer
  const totalResult = await pool.query(
    'SELECT COUNT(*) as count FROM blockchain_milestones WHERE freelancer_wallet = $1',
    [walletAddress]
  );

  // Approved milestones (completed) with sum of amounts
  const approvedResult = await pool.query(
    'SELECT amount FROM blockchain_milestones WHERE freelancer_wallet = $1 AND status = $2',
    [walletAddress, 'approved']
  );

  const completedCount = approvedResult.rows.length;
  let totalEarned = 0;
  for (const row of approvedResult.rows) {
    totalEarned += Number(row.amount);
  }

  return {
    completedCount,
    totalEarned,
    totalMilestones: parseInt(totalResult.rows[0].count) || 0,
  };
}

/**
 * Get freelancer's completed milestones (portfolio)
 */
export async function getFreelancerPortfolio(walletAddress: string): Promise<BlockchainMilestoneRecord[]> {
  const result = await pool.query(
    'SELECT * FROM blockchain_milestones WHERE freelancer_wallet = $1 AND status = $2 ORDER BY completed_at DESC',
    [walletAddress, 'approved']
  );

  return result.rows.map(rowToRecord);
}

/**
 * Verify work hash matches on-chain record
 */
export async function verifyMilestoneWork(milestoneId: string, deliverables: string): Promise<boolean> {
  const milestoneIdHash = generateMilestoneIdHash(milestoneId);
  
  const result = await pool.query(
    'SELECT work_hash FROM blockchain_milestones WHERE milestone_id_hash = $1',
    [milestoneIdHash]
  );

  if (result.rows.length === 0) return false;

  const computedHash = generateWorkHash(deliverables);
  return result.rows[0].work_hash === computedHash;
}

export async function clearMilestoneRegistry(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  await pool.query("DELETE FROM blockchain_milestones WHERE milestone_id_hash != ''");
}

export function getMilestoneRegistryAddress(): string {
  return MILESTONE_REGISTRY_ADDRESS;
}
