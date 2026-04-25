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
import { getSupabaseServiceClient } from '../config/supabase.js';

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
  const supabase = getSupabaseServiceClient();
  const { data: existing } = await supabase
    .from('blockchain_milestones')
    .select('milestone_id_hash')
    .eq('milestone_id_hash', milestoneIdHash)
    .single();

  if (existing) {
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
  await supabase.from('blockchain_milestones').insert({
    milestone_id_hash: record.milestoneIdHash,
    contract_id_hash: record.contractIdHash,
    work_hash: record.workHash,
    freelancer_wallet: record.freelancerWallet,
    employer_wallet: record.employerWallet,
    amount: record.amount,
    status: record.status,
    submitted_at: record.submittedAt,
    completed_at: record.completedAt,
    title: record.title,
    transaction_hash: record.transactionHash,
    block_number: record.blockNumber,
  });

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
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('blockchain_milestones')
    .select('*')
    .eq('milestone_id_hash', milestoneIdHash)
    .single();

  if (error || !row) throw new Error('Milestone not found');
  const record = rowToRecord(row as MilestoneRow);

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
  await supabase
    .from('blockchain_milestones')
    .update({
      status: 'approved',
      completed_at: now,
      transaction_hash: confirmed.hash!,
      block_number: confirmed.blockNumber!,
      updated_at: new Date().toISOString(),
    })
    .eq('milestone_id_hash', milestoneIdHash);

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
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('blockchain_milestones')
    .select('*')
    .eq('milestone_id_hash', milestoneIdHash)
    .single();

  if (error || !row) throw new Error('Milestone not found');
  const record = rowToRecord(row as MilestoneRow);

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
  await supabase
    .from('blockchain_milestones')
    .update({
      status: 'rejected',
      transaction_hash: confirmed.hash!,
      block_number: confirmed.blockNumber!,
      updated_at: new Date().toISOString(),
    })
    .eq('milestone_id_hash', milestoneIdHash);

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
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_milestones')
    .select('*')
    .eq('milestone_id_hash', milestoneIdHash)
    .single();

  if (error || !data) return null;
  return rowToRecord(data as MilestoneRow);
}

/**
 * Get freelancer stats from blockchain (derived via SQL aggregates)
 */
export async function getFreelancerStatsFromRegistry(walletAddress: string): Promise<FreelancerStats> {
  const supabase = getSupabaseServiceClient();

  // Total milestones for this freelancer
  const { count: totalMilestones } = await supabase
    .from('blockchain_milestones')
    .select('*', { count: 'exact', head: true })
    .eq('freelancer_wallet', walletAddress);

  // Approved milestones (completed) with sum of amounts
  const { data: approvedRows } = await supabase
    .from('blockchain_milestones')
    .select('amount')
    .eq('freelancer_wallet', walletAddress)
    .eq('status', 'approved');

  const completedCount = approvedRows?.length ?? 0;
  let totalEarned = 0;
  for (const row of (approvedRows ?? []) as { amount: number }[]) {
    totalEarned += Number(row.amount);
  }

  return {
    completedCount,
    totalEarned,
    totalMilestones: totalMilestones ?? 0,
  };
}

/**
 * Get freelancer's completed milestones (portfolio)
 */
export async function getFreelancerPortfolio(walletAddress: string): Promise<BlockchainMilestoneRecord[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_milestones')
    .select('*')
    .eq('freelancer_wallet', walletAddress)
    .eq('status', 'approved')
    .order('completed_at', { ascending: false });

  if (error || !data) return [];
  return (data as MilestoneRow[]).map(rowToRecord);
}

/**
 * Verify work hash matches on-chain record
 */
export async function verifyMilestoneWork(milestoneId: string, deliverables: string): Promise<boolean> {
  const milestoneIdHash = generateMilestoneIdHash(milestoneId);
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_milestones')
    .select('work_hash')
    .eq('milestone_id_hash', milestoneIdHash)
    .single();

  if (error || !data) return false;

  const computedHash = generateWorkHash(deliverables);
  return (data as { work_hash: string }).work_hash === computedHash;
}

export async function clearMilestoneRegistry(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  const supabase = getSupabaseServiceClient();
  await supabase.from('blockchain_milestones').delete().neq('milestone_id_hash', '');
}

export function getMilestoneRegistryAddress(): string {
  return MILESTONE_REGISTRY_ADDRESS;
}
