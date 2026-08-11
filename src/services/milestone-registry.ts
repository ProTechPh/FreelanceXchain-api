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
import { blockchainMilestoneRecordRepository, type BlockchainMilestoneRecordEntity } from '../repositories/blockchain-milestone-record-repository.js';

export type BlockchainMilestoneStatus = 'submitted' | 'approved' | 'rejected' | 'disputed';

type BlockchainMilestoneRecord = {
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

type FreelancerStats = {
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

function entityToRecord(entity: BlockchainMilestoneRecordEntity): BlockchainMilestoneRecord {
  return {
    milestoneIdHash: entity.milestone_id_hash,
    contractIdHash: entity.contract_id_hash,
    workHash: entity.work_hash,
    freelancerWallet: entity.freelancer_wallet,
    employerWallet: entity.employer_wallet,
    amount: Number(entity.amount),
    status: entity.status as BlockchainMilestoneStatus,
    submittedAt: entity.submitted_at,
    completedAt: entity.completed_at ?? null,
    title: entity.title,
    transactionHash: entity.transaction_hash,
    blockNumber: entity.block_number,
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
  const existing = await blockchainMilestoneRecordRepository.findByMilestoneIdHash(milestoneIdHash);

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
  await blockchainMilestoneRecordRepository.createMilestoneRecord({
    id: milestoneIdHash,
    milestone_id_hash: record.milestoneIdHash,
    contract_id_hash: record.contractIdHash,
    work_hash: record.workHash,
    freelancer_wallet: record.freelancerWallet,
    employer_wallet: record.employerWallet,
    amount: record.amount,
    status: record.status,
    submitted_at: record.submittedAt,
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

  const entity = await blockchainMilestoneRecordRepository.findByMilestoneIdHash(milestoneIdHash);

  if (!entity) throw new Error('Milestone not found');
  const record = entityToRecord(entity);

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
  await blockchainMilestoneRecordRepository.updateMilestoneRecord(entity.id, {
    status: 'approved',
    completed_at: now,
    transaction_hash: confirmed.hash!,
    block_number: confirmed.blockNumber!,
  });

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

  const entity = await blockchainMilestoneRecordRepository.findByMilestoneIdHash(milestoneIdHash);

  if (!entity) throw new Error('Milestone not found');
  const record = entityToRecord(entity);

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
  await blockchainMilestoneRecordRepository.updateMilestoneRecord(entity.id, {
    status: 'rejected',
    transaction_hash: confirmed.hash!,
    block_number: confirmed.blockNumber!,
  });

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
  const entity = await blockchainMilestoneRecordRepository.findByMilestoneIdHash(milestoneIdHash);

  if (!entity) return null;
  return entityToRecord(entity);
}

/**
 * Get freelancer stats from blockchain (derived via in-memory computation)
 */
export async function getFreelancerStatsFromRegistry(walletAddress: string): Promise<FreelancerStats> {
  const allMilestones = await blockchainMilestoneRecordRepository.findByWallet(walletAddress);

  const approvedMilestones = allMilestones.filter(m => m.status === 'approved');
  const completedCount = approvedMilestones.length;
  let totalEarned = 0;
  for (const m of approvedMilestones) {
    totalEarned += Number(m.amount);
  }

  return {
    completedCount,
    totalEarned,
    totalMilestones: allMilestones.length,
  };
}

/**
 * Get freelancer's completed milestones (portfolio)
 */
export async function getFreelancerPortfolio(walletAddress: string): Promise<BlockchainMilestoneRecord[]> {
  const allMilestones = await blockchainMilestoneRecordRepository.findByWallet(walletAddress);
  return allMilestones
    .filter(m => m.status === 'approved')
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
    .map(entityToRecord);
}

/**
 * Verify work hash matches on-chain record
 */
export async function verifyMilestoneWork(milestoneId: string, deliverables: string): Promise<boolean> {
  const milestoneIdHash = generateMilestoneIdHash(milestoneId);
  
  const entity = await blockchainMilestoneRecordRepository.findByMilestoneIdHash(milestoneIdHash);

  if (!entity) return false;

  const computedHash = generateWorkHash(deliverables);
  return entity.work_hash === computedHash;
}

export async function clearMilestoneRegistry(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  const all = await blockchainMilestoneRecordRepository.queryAll('submitted_at');
  await Promise.all(all.map(record => blockchainMilestoneRecordRepository.delete(record.id)));
}

export function getMilestoneRegistryAddress(): string {
  return MILESTONE_REGISTRY_ADDRESS;
}
