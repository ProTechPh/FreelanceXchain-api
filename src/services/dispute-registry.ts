/**
 * Dispute Resolution Blockchain Service
 * Records dispute outcomes on-chain for transparency
 *
 * ARCHITECTURE: Uses Supabase (blockchain_dispute_records table)
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
  const supabase = getSupabaseServiceClient();
  const { data: existing } = await supabase
    .from('blockchain_dispute_records')
    .select('dispute_id_hash')
    .eq('dispute_id_hash', disputeIdHash)
    .single();

  if (existing) {
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
  await supabase.from('blockchain_dispute_records').insert({
    dispute_id_hash: record.disputeIdHash,
    contract_id_hash: record.contractIdHash,
    milestone_id_hash: record.milestoneIdHash,
    evidence_hash: record.evidenceHash,
    initiator_wallet: record.initiatorWallet,
    freelancer_wallet: record.freelancerWallet,
    employer_wallet: record.employerWallet,
    arbiter_wallet: record.arbiterWallet,
    amount: record.amount,
    outcome: record.outcome,
    reasoning: record.reasoning,
    created_at_ts: record.createdAt,
    resolved_at: record.resolvedAt,
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
 * Update evidence hash on blockchain
 */
export async function updateDisputeEvidence(
  disputeId: string,
  evidenceData: string,
  submitterWallet: string
): Promise<{ record: BlockchainDisputeRecord; receipt: TransactionReceipt }> {
  const disputeIdHash = generateHash(disputeId);
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('blockchain_dispute_records')
    .select('*')
    .eq('dispute_id_hash', disputeIdHash)
    .single();

  if (error || !row) throw new Error('Dispute not found');
  const record = rowToRecord(row as DisputeRow);
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
  await supabase
    .from('blockchain_dispute_records')
    .update({
      evidence_hash: evidenceHash,
      transaction_hash: confirmed.hash!,
      block_number: confirmed.blockNumber!,
      updated_at: new Date().toISOString(),
    })
    .eq('dispute_id_hash', disputeIdHash);

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
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('blockchain_dispute_records')
    .select('*')
    .eq('dispute_id_hash', disputeIdHash)
    .single();

  if (error || !row) throw new Error('Dispute not found');
  const record = rowToRecord(row as DisputeRow);
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
  await supabase
    .from('blockchain_dispute_records')
    .update({
      outcome: input.outcome,
      reasoning: input.reasoning,
      arbiter_wallet: input.arbiterWallet,
      resolved_at: now,
      transaction_hash: confirmed.hash!,
      block_number: confirmed.blockNumber!,
      updated_at: new Date().toISOString(),
    })
    .eq('dispute_id_hash', disputeIdHash);

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
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_dispute_records')
    .select('*')
    .eq('dispute_id_hash', disputeIdHash)
    .single();

  if (error || !data) return null;
  return rowToRecord(data as DisputeRow);
}

/**
 * Get user dispute stats (derived from DB queries)
 */
export async function getUserDisputeStats(walletAddress: string): Promise<UserDisputeStats> {
  const supabase = getSupabaseServiceClient();

  // Count total disputes involving this wallet
  const { count: total } = await supabase
    .from('blockchain_dispute_records')
    .select('*', { count: 'exact', head: true })
    .or(`freelancer_wallet.eq.${walletAddress},employer_wallet.eq.${walletAddress}`);

  // Count won (freelancer_favor where wallet is freelancer, or employer_favor where wallet is employer)
  const { data: allDisputes } = await supabase
    .from('blockchain_dispute_records')
    .select('outcome, freelancer_wallet, employer_wallet')
    .or(`freelancer_wallet.eq.${walletAddress},employer_wallet.eq.${walletAddress}`)
    .neq('outcome', 'pending');

  let won = 0;
  let lost = 0;
  for (const d of (allDisputes ?? []) as { outcome: string; freelancer_wallet: string; employer_wallet: string }[]) {
    if (d.outcome === 'freelancer_favor' && d.freelancer_wallet === walletAddress) won++;
    else if (d.outcome === 'employer_favor' && d.employer_wallet === walletAddress) won++;
    else if (d.outcome === 'freelancer_favor' && d.employer_wallet === walletAddress) lost++;
    else if (d.outcome === 'employer_favor' && d.freelancer_wallet === walletAddress) lost++;
  }

  return { won, lost, total: total ?? 0 };
}

/**
 * Get user's disputes
 */
export async function getUserDisputes(walletAddress: string): Promise<BlockchainDisputeRecord[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_dispute_records')
    .select('*')
    .or(`freelancer_wallet.eq.${walletAddress},employer_wallet.eq.${walletAddress}`)
    .order('created_at_ts', { ascending: false });

  if (error || !data) return [];
  return (data as DisputeRow[]).map(rowToRecord);
}

export async function clearDisputeRegistry(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  const supabase = getSupabaseServiceClient();
  await supabase.from('blockchain_dispute_records').delete().neq('dispute_id_hash', '');
}

export function getDisputeRegistryAddress(): string {
  return DISPUTE_REGISTRY_ADDRESS;
}
