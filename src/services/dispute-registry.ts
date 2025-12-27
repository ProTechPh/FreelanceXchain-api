/**
 * Dispute Resolution Blockchain Service
 * Records dispute outcomes on-chain for transparency
 */

import {
  submitTransaction,
  confirmTransaction,
  generateWalletAddress,
} from './blockchain-client.js';
import { TransactionReceipt } from './blockchain-types.js';
import { createHash } from 'crypto';

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
const disputeStore = new Map<string, BlockchainDisputeRecord>();
const userDisputesMap = new Map<string, string[]>();
const userStatsMap = new Map<string, UserDisputeStats>();

function generateHash(value: string): string {
  return '0x' + createHash('sha256').update(value).digest('hex');
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

  if (disputeStore.has(disputeIdHash)) {
    throw new Error('Dispute already exists on blockchain');
  }

  const tx = await submitTransaction({
    type: 'escrow_deploy',
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

  disputeStore.set(disputeIdHash, record);

  // Track by users
  for (const wallet of [input.freelancerWallet, input.employerWallet]) {
    const userDisputes = userDisputesMap.get(wallet) ?? [];
    userDisputes.push(disputeIdHash);
    userDisputesMap.set(wallet, userDisputes);

    if (!userStatsMap.has(wallet)) {
      userStatsMap.set(wallet, { won: 0, lost: 0, total: 0 });
    }
    const stats = userStatsMap.get(wallet)!;
    stats.total++;
    userStatsMap.set(wallet, stats);
  }

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
  const record = disputeStore.get(disputeIdHash);

  if (!record) throw new Error('Dispute not found');
  if (record.outcome !== 'pending') throw new Error('Dispute already resolved');

  const evidenceHash = generateHash(evidenceData);

  const tx = await submitTransaction({
    type: 'escrow_deploy',
    from: submitterWallet,
    to: DISPUTE_REGISTRY_ADDRESS,
    amount: BigInt(0),
    data: { action: 'update_evidence', disputeIdHash, evidenceHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  record.evidenceHash = evidenceHash;
  record.transactionHash = confirmed.hash!;
  record.blockNumber = confirmed.blockNumber!;
  disputeStore.set(disputeIdHash, record);

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
  const record = disputeStore.get(disputeIdHash);

  if (!record) throw new Error('Dispute not found');
  if (record.outcome !== 'pending') throw new Error('Dispute already resolved');

  const tx = await submitTransaction({
    type: 'escrow_deploy',
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
  record.outcome = input.outcome;
  record.reasoning = input.reasoning;
  record.arbiterWallet = input.arbiterWallet;
  record.resolvedAt = now;
  record.transactionHash = confirmed.hash!;
  record.blockNumber = confirmed.blockNumber!;
  disputeStore.set(disputeIdHash, record);

  // Update win/loss stats
  const freelancerStats = userStatsMap.get(record.freelancerWallet)!;
  const employerStats = userStatsMap.get(record.employerWallet)!;

  if (input.outcome === 'freelancer_favor') {
    freelancerStats.won++;
    employerStats.lost++;
  } else if (input.outcome === 'employer_favor') {
    employerStats.won++;
    freelancerStats.lost++;
  }

  userStatsMap.set(record.freelancerWallet, freelancerStats);
  userStatsMap.set(record.employerWallet, employerStats);

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
  return disputeStore.get(disputeIdHash) ?? null;
}

/**
 * Get user dispute stats
 */
export async function getUserDisputeStats(walletAddress: string): Promise<UserDisputeStats> {
  return userStatsMap.get(walletAddress) ?? { won: 0, lost: 0, total: 0 };
}

/**
 * Get user's disputes
 */
export async function getUserDisputes(walletAddress: string): Promise<BlockchainDisputeRecord[]> {
  const disputeHashes = userDisputesMap.get(walletAddress) ?? [];
  return disputeHashes
    .map(hash => disputeStore.get(hash))
    .filter((d): d is BlockchainDisputeRecord => d !== undefined);
}

export function clearDisputeRegistry(): void {
  disputeStore.clear();
  userDisputesMap.clear();
  userStatsMap.clear();
}

export function getDisputeRegistryAddress(): string {
  return DISPUTE_REGISTRY_ADDRESS;
}
