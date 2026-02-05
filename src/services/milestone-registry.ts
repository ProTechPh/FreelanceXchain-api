/**
 * Milestone Registry Blockchain Service
 * Records milestone completions on-chain for verifiable work history
 */

import {
  submitTransaction,
  confirmTransaction,
  generateWalletAddress,
} from './blockchain-client';
import { TransactionReceipt } from './blockchain-types';
import { createHash } from 'crypto';

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
const milestoneStore = new Map<string, BlockchainMilestoneRecord>();
const freelancerMilestonesMap = new Map<string, string[]>();
const freelancerStatsMap = new Map<string, FreelancerStats>();

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

  if (milestoneStore.has(milestoneIdHash)) {
    throw new Error('Milestone already submitted');
  }

  const tx = await submitTransaction({
    type: 'escrow_deploy',
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

  milestoneStore.set(milestoneIdHash, record);

  // Track by freelancer
  const freelancerMilestones = freelancerMilestonesMap.get(input.freelancerWallet) ?? [];
  freelancerMilestones.push(milestoneIdHash);
  freelancerMilestonesMap.set(input.freelancerWallet, freelancerMilestones);

  // Initialize stats if needed
  if (!freelancerStatsMap.has(input.freelancerWallet)) {
    freelancerStatsMap.set(input.freelancerWallet, { completedCount: 0, totalEarned: 0, totalMilestones: 0 });
  }
  const stats = freelancerStatsMap.get(input.freelancerWallet)!;
  stats.totalMilestones++;
  freelancerStatsMap.set(input.freelancerWallet, stats);

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
  const record = milestoneStore.get(milestoneIdHash);

  if (!record) throw new Error('Milestone not found');
  if (record.status !== 'submitted' && record.status !== 'disputed') {
    throw new Error('Invalid milestone status');
  }

  const tx = await submitTransaction({
    type: 'escrow_deploy',
    from: approverWallet,
    to: MILESTONE_REGISTRY_ADDRESS,
    amount: BigInt(0),
    data: { action: 'approve_milestone', milestoneIdHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();
  record.status = 'approved';
  record.completedAt = now;
  record.transactionHash = confirmed.hash!;
  record.blockNumber = confirmed.blockNumber!;
  milestoneStore.set(milestoneIdHash, record);

  // Update freelancer stats
  const stats = freelancerStatsMap.get(record.freelancerWallet)!;
  stats.completedCount++;
  stats.totalEarned += record.amount;
  freelancerStatsMap.set(record.freelancerWallet, stats);

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
  const record = milestoneStore.get(milestoneIdHash);

  if (!record) throw new Error('Milestone not found');
  if (record.status !== 'submitted') throw new Error('Invalid milestone status');

  const tx = await submitTransaction({
    type: 'escrow_deploy',
    from: rejecterWallet,
    to: MILESTONE_REGISTRY_ADDRESS,
    amount: BigInt(0),
    data: { action: 'reject_milestone', milestoneIdHash, reason },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  record.status = 'rejected';
  record.transactionHash = confirmed.hash!;
  record.blockNumber = confirmed.blockNumber!;
  milestoneStore.set(milestoneIdHash, record);

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
  return milestoneStore.get(milestoneIdHash) ?? null;
}

/**
 * Get freelancer stats from blockchain
 */
export async function getFreelancerStatsFromRegistry(walletAddress: string): Promise<FreelancerStats> {
  return freelancerStatsMap.get(walletAddress) ?? { completedCount: 0, totalEarned: 0, totalMilestones: 0 };
}

/**
 * Get freelancer's completed milestones (portfolio)
 */
export async function getFreelancerPortfolio(walletAddress: string): Promise<BlockchainMilestoneRecord[]> {
  const milestoneHashes = freelancerMilestonesMap.get(walletAddress) ?? [];
  return milestoneHashes
    .map(hash => milestoneStore.get(hash))
    .filter((m): m is BlockchainMilestoneRecord => m !== undefined && m.status === 'approved');
}

/**
 * Verify work hash matches on-chain record
 */
export async function verifyMilestoneWork(milestoneId: string, deliverables: string): Promise<boolean> {
  const milestoneIdHash = generateMilestoneIdHash(milestoneId);
  const record = milestoneStore.get(milestoneIdHash);
  if (!record) return false;

  const computedHash = generateWorkHash(deliverables);
  return record.workHash === computedHash;
}

export function clearMilestoneRegistry(): void {
  milestoneStore.clear();
  freelancerMilestonesMap.clear();
  freelancerStatsMap.clear();
}

export function getMilestoneRegistryAddress(): string {
  return MILESTONE_REGISTRY_ADDRESS;
}
