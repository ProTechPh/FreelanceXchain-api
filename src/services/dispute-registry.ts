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
import { blockchainDisputeRecordRepository, type BlockchainDisputeRecordEntity } from '../repositories/blockchain-dispute-record-repository.js';

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

function entityToRecord(entity: BlockchainDisputeRecordEntity): BlockchainDisputeRecord {
  return {
    disputeIdHash: entity.dispute_id_hash,
    contractIdHash: entity.contract_id_hash,
    milestoneIdHash: entity.milestone_id_hash,
    evidenceHash: entity.evidence_hash ?? null,
    initiatorWallet: entity.initiator_wallet,
    freelancerWallet: entity.freelancer_wallet,
    employerWallet: entity.employer_wallet,
    arbiterWallet: entity.arbiter_wallet ?? null,
    amount: entity.amount,
    outcome: entity.outcome as BlockchainDisputeOutcome,
    reasoning: entity.reasoning ?? null,
    createdAt: entity.created_at_ts,
    resolvedAt: entity.resolved_at ?? null,
    transactionHash: entity.transaction_hash,
    blockNumber: entity.block_number,
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
  const existing = await blockchainDisputeRecordRepository.findByDisputeIdHash(disputeIdHash);

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
  await blockchainDisputeRecordRepository.createDisputeRecord({
    id: disputeIdHash,
    dispute_id_hash: record.disputeIdHash,
    contract_id_hash: record.contractIdHash,
    milestone_id_hash: record.milestoneIdHash,
    initiator_wallet: record.initiatorWallet,
    freelancer_wallet: record.freelancerWallet,
    employer_wallet: record.employerWallet,
    amount: record.amount,
    outcome: record.outcome,
    created_at_ts: record.createdAt,
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

  const entity = await blockchainDisputeRecordRepository.findByDisputeIdHash(disputeIdHash);

  if (!entity) throw new Error('Dispute not found');
  const record = entityToRecord(entity);
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
  await blockchainDisputeRecordRepository.updateDisputeRecord(entity.id, {
    evidence_hash: evidenceHash,
    transaction_hash: confirmed.hash!,
    block_number: confirmed.blockNumber!,
  });

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

  const entity = await blockchainDisputeRecordRepository.findByDisputeIdHash(disputeIdHash);

  if (!entity) throw new Error('Dispute not found');
  const record = entityToRecord(entity);
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
  await blockchainDisputeRecordRepository.updateDisputeRecord(entity.id, {
    outcome: input.outcome,
    reasoning: input.reasoning,
    arbiter_wallet: input.arbiterWallet,
    resolved_at: now,
    transaction_hash: confirmed.hash!,
    block_number: confirmed.blockNumber!,
  });

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
  const entity = await blockchainDisputeRecordRepository.findByDisputeIdHash(disputeIdHash);

  if (!entity) return null;
  return entityToRecord(entity);
}

/**
 * Get user dispute stats (derived from DB queries)
 */
export async function getUserDisputeStats(walletAddress: string): Promise<UserDisputeStats> {
  const allDisputes = await blockchainDisputeRecordRepository.findByWallet(walletAddress);

  let won = 0;
  let lost = 0;
  for (const d of allDisputes) {
    if (d.outcome === 'freelancer_favor' && d.freelancer_wallet === walletAddress) won++;
    else if (d.outcome === 'employer_favor' && d.employer_wallet === walletAddress) won++;
    else if (d.outcome === 'freelancer_favor' && d.employer_wallet === walletAddress) lost++;
    else if (d.outcome === 'employer_favor' && d.freelancer_wallet === walletAddress) lost++;
  }

  return { won, lost, total: allDisputes.length };
}

/**
 * Get user's disputes
 */
export async function getUserDisputes(walletAddress: string): Promise<BlockchainDisputeRecord[]> {
  const entities = await blockchainDisputeRecordRepository.findByWallet(walletAddress);
  return entities.map(entityToRecord);
}

export async function clearDisputeRegistry(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  const all = await blockchainDisputeRecordRepository.queryAll('created_at_ts');
  await Promise.all(all.map(record => blockchainDisputeRecordRepository.delete(record.id)));
}

export function getDisputeRegistryAddress(): string {
  return DISPUTE_REGISTRY_ADDRESS;
}
