/**
 * Contract Agreement Blockchain Service
 * Stores contract agreements and signatures on-chain
 * Creates immutable proof that both parties agreed to terms
 *
 * ARCHITECTURE: Uses Supabase (blockchain_agreements table)
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

// Agreement status on blockchain
export type BlockchainAgreementStatus = 'pending' | 'signed' | 'completed' | 'disputed' | 'cancelled';

// On-chain agreement record
export type BlockchainAgreement = {
  contractIdHash: string;
  termsHash: string;
  employerWallet: string;
  freelancerWallet: string;
  totalAmount: number;
  milestoneCount: number;
  status: BlockchainAgreementStatus;
  employerSignedAt: number | null;
  freelancerSignedAt: number | null;
  createdAt: number;
  transactionHash: string;
  blockNumber: number;
};

// Input for creating agreement
export type CreateAgreementInput = {
  contractId: string;
  employerWallet: string;
  freelancerWallet: string;
  totalAmount: number;
  milestoneCount: number;
  terms: {
    projectTitle: string;
    description: string;
    milestones: { title: string; amount: number }[];
    deadline: string;
    isRush?: boolean;
    rushFee?: number;
    rushFeePercentage?: number;
  };
};

// Contract address (simulated)
const AGREEMENT_CONTRACT_ADDRESS = generateWalletAddress();

// DB row type
type AgreementRow = {
  contract_id_hash: string;
  terms_hash: string;
  employer_wallet: string;
  freelancer_wallet: string;
  total_amount: number;
  milestone_count: number;
  status: string;
  employer_signed_at: number | null;
  freelancer_signed_at: number | null;
  created_at_ts: number;
  transaction_hash: string;
  block_number: number;
};

function rowToAgreement(row: AgreementRow): BlockchainAgreement {
  return {
    contractIdHash: row.contract_id_hash,
    termsHash: row.terms_hash,
    employerWallet: row.employer_wallet,
    freelancerWallet: row.freelancer_wallet,
    totalAmount: row.total_amount,
    milestoneCount: row.milestone_count,
    status: row.status as BlockchainAgreementStatus,
    employerSignedAt: row.employer_signed_at,
    freelancerSignedAt: row.freelancer_signed_at,
    createdAt: row.created_at_ts,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
  };
}

/**
 * Generate hash of contract ID
 */
export function generateContractIdHash(contractId: string): string {
  return '0x' + createHash('sha256').update(contractId).digest('hex');
}

/**
 * Generate hash of contract terms for on-chain storage
 */
export function generateTermsHash(terms: CreateAgreementInput['terms']): string {
  const termsString = JSON.stringify({
    projectTitle: terms.projectTitle,
    description: terms.description,
    milestones: terms.milestones,
    deadline: terms.deadline,
  });
  return '0x' + createHash('sha256').update(termsString).digest('hex');
}

/**
 * Create agreement on blockchain
 */
export async function createAgreementOnBlockchain(
  input: CreateAgreementInput
): Promise<{ agreement: BlockchainAgreement; receipt: TransactionReceipt }> {
  const contractIdHash = generateContractIdHash(input.contractId);
  const termsHash = generateTermsHash(input.terms);

  // Check if already exists
  const supabase = getSupabaseServiceClient();
  const { data: existing } = await supabase
    .from('blockchain_agreements')
    .select('contract_id_hash')
    .eq('contract_id_hash', contractIdHash)
    .single();

  if (existing) {
    throw new Error('Agreement already exists for this contract');
  }

  const tx = await submitTransaction({
    type: 'agreement_create',
    from: input.employerWallet,
    to: AGREEMENT_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: {
      action: 'create_agreement',
      contractIdHash,
      termsHash,
      employer: input.employerWallet,
      freelancer: input.freelancerWallet,
      totalAmount: input.totalAmount,
      milestoneCount: input.milestoneCount,
    },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();
  const agreement: BlockchainAgreement = {
    contractIdHash,
    termsHash,
    employerWallet: input.employerWallet,
    freelancerWallet: input.freelancerWallet,
    totalAmount: input.totalAmount,
    milestoneCount: input.milestoneCount,
    status: 'pending',
    employerSignedAt: now, // Employer signs on creation
    freelancerSignedAt: null,
    createdAt: now,
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
  };

  // Persist to DB
  await supabase.from('blockchain_agreements').insert({
    contract_id_hash: agreement.contractIdHash,
    terms_hash: agreement.termsHash,
    employer_wallet: agreement.employerWallet,
    freelancer_wallet: agreement.freelancerWallet,
    total_amount: agreement.totalAmount,
    milestone_count: agreement.milestoneCount,
    status: agreement.status,
    employer_signed_at: agreement.employerSignedAt,
    freelancer_signed_at: agreement.freelancerSignedAt,
    created_at_ts: agreement.createdAt,
    transaction_hash: agreement.transactionHash,
    block_number: agreement.blockNumber,
  });

  return {
    agreement,
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
 * Sign agreement (freelancer signs to accept)
 */
export async function signAgreement(
  contractId: string,
  signerWallet: string
): Promise<{ agreement: BlockchainAgreement; receipt: TransactionReceipt }> {
  const contractIdHash = generateContractIdHash(contractId);
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('blockchain_agreements')
    .select('*')
    .eq('contract_id_hash', contractIdHash)
    .single();

  if (error || !row) throw new Error('Agreement not found');
  const agreement = rowToAgreement(row as AgreementRow);
  if (agreement.status !== 'pending') throw new Error('Agreement not pending');
  if (signerWallet !== agreement.employerWallet && signerWallet !== agreement.freelancerWallet) {
    throw new Error('Not a party to this agreement');
  }

  const tx = await submitTransaction({
    type: 'agreement_sign',
    from: signerWallet,
    to: AGREEMENT_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: { action: 'sign_agreement', contractIdHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();
  const updates: Record<string, unknown> = {
    transaction_hash: confirmed.hash!,
    block_number: confirmed.blockNumber!,
    updated_at: new Date().toISOString(),
  };

  if (signerWallet === agreement.employerWallet && !agreement.employerSignedAt) {
    updates['employer_signed_at'] = now;
    agreement.employerSignedAt = now;
  } else if (signerWallet === agreement.freelancerWallet && !agreement.freelancerSignedAt) {
    updates['freelancer_signed_at'] = now;
    agreement.freelancerSignedAt = now;
  }

  // Both signed = fully signed
  if (agreement.employerSignedAt && agreement.freelancerSignedAt) {
    updates['status'] = 'signed';
    agreement.status = 'signed';
  }

  await supabase
    .from('blockchain_agreements')
    .update(updates)
    .eq('contract_id_hash', contractIdHash);

  agreement.transactionHash = confirmed.hash!;
  agreement.blockNumber = confirmed.blockNumber!;

  return {
    agreement,
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
 * Complete agreement on blockchain
 */
export async function completeAgreement(
  contractId: string,
  callerWallet: string
): Promise<{ agreement: BlockchainAgreement; receipt: TransactionReceipt }> {
  const contractIdHash = generateContractIdHash(contractId);
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('blockchain_agreements')
    .select('*')
    .eq('contract_id_hash', contractIdHash)
    .single();

  if (error || !row) throw new Error('Agreement not found');
  const agreement = rowToAgreement(row as AgreementRow);
  if (agreement.status !== 'signed') throw new Error('Agreement not active');

  const tx = await submitTransaction({
    type: 'agreement_complete',
    from: callerWallet,
    to: AGREEMENT_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: { action: 'complete_agreement', contractIdHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  await supabase
    .from('blockchain_agreements')
    .update({
      status: 'completed',
      transaction_hash: confirmed.hash!,
      block_number: confirmed.blockNumber!,
      updated_at: new Date().toISOString(),
    })
    .eq('contract_id_hash', contractIdHash);

  agreement.status = 'completed';
  agreement.transactionHash = confirmed.hash!;
  agreement.blockNumber = confirmed.blockNumber!;

  return {
    agreement,
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
 * Mark agreement as disputed
 */
export async function disputeAgreement(
  contractId: string,
  callerWallet: string
): Promise<{ agreement: BlockchainAgreement; receipt: TransactionReceipt }> {
  const contractIdHash = generateContractIdHash(contractId);
  const supabase = getSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from('blockchain_agreements')
    .select('*')
    .eq('contract_id_hash', contractIdHash)
    .single();

  if (error || !row) throw new Error('Agreement not found');
  const agreement = rowToAgreement(row as AgreementRow);
  if (agreement.status !== 'signed') throw new Error('Agreement not active');
  if (callerWallet !== agreement.employerWallet && callerWallet !== agreement.freelancerWallet) {
    throw new Error('Not a party');
  }

  const tx = await submitTransaction({
    type: 'agreement_dispute',
    from: callerWallet,
    to: AGREEMENT_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: { action: 'dispute_agreement', contractIdHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  await supabase
    .from('blockchain_agreements')
    .update({
      status: 'disputed',
      transaction_hash: confirmed.hash!,
      block_number: confirmed.blockNumber!,
      updated_at: new Date().toISOString(),
    })
    .eq('contract_id_hash', contractIdHash);

  agreement.status = 'disputed';
  agreement.transactionHash = confirmed.hash!;
  agreement.blockNumber = confirmed.blockNumber!;

  return {
    agreement,
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
 * Get agreement from blockchain
 */
export async function getAgreementFromBlockchain(contractId: string): Promise<BlockchainAgreement | null> {
  const contractIdHash = generateContractIdHash(contractId);
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_agreements')
    .select('*')
    .eq('contract_id_hash', contractIdHash)
    .single();

  if (error || !data) return null;
  return rowToAgreement(data as AgreementRow);
}

/**
 * Verify terms hash matches on-chain record
 */
export async function verifyAgreementTerms(
  contractId: string,
  terms: CreateAgreementInput['terms']
): Promise<boolean> {
  const agreement = await getAgreementFromBlockchain(contractId);
  if (!agreement) return false;

  const computedHash = generateTermsHash(terms);
  return agreement.termsHash === computedHash;
}

/**
 * Check if agreement is fully signed
 */
export async function isAgreementFullySigned(contractId: string): Promise<boolean> {
  const agreement = await getAgreementFromBlockchain(contractId);
  if (!agreement) return false;
  return agreement.employerSignedAt !== null && agreement.freelancerSignedAt !== null;
}

/**
 * Get user's agreements
 */
export async function getUserAgreements(walletAddress: string): Promise<BlockchainAgreement[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_agreements')
    .select('*')
    .or(`employer_wallet.eq.${walletAddress},freelancer_wallet.eq.${walletAddress}`)
    .order('created_at_ts', { ascending: false });

  if (error || !data) return [];
  return (data as AgreementRow[]).map(rowToAgreement);
}

/**
 * Clear all agreements (for testing)
 */
export async function clearBlockchainAgreements(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  const supabase = getSupabaseServiceClient();
  await supabase.from('blockchain_agreements').delete().neq('contract_id_hash', '');
}

export function getAgreementContractAddress(): string {
  return AGREEMENT_CONTRACT_ADDRESS;
}
