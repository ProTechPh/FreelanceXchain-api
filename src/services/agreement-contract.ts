/**
 * Contract Agreement Blockchain Service
 * Stores contract agreements and signatures on-chain
 * Creates immutable proof that both parties agreed to terms
 */

import {
  submitTransaction,
  confirmTransaction,
  generateWalletAddress,
} from './blockchain-client.js';
import { TransactionReceipt } from './blockchain-types.js';
import { createHash } from 'crypto';
import { blockchainAgreementRepository } from '../repositories/blockchain-agreement-repository.js';

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
  const existing = await blockchainAgreementRepository.findByContractIdHash(contractIdHash);

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
  const createData: Record<string, unknown> = {
    id: contractIdHash,
    contract_id_hash: agreement.contractIdHash,
    terms_hash: agreement.termsHash,
    employer_wallet: agreement.employerWallet,
    freelancer_wallet: agreement.freelancerWallet,
    total_amount: agreement.totalAmount,
    milestone_count: agreement.milestoneCount,
    status: agreement.status,
    created_at_ts: agreement.createdAt,
    transaction_hash: agreement.transactionHash,
    block_number: agreement.blockNumber,
  };
  if (agreement.employerSignedAt != null) createData['employer_signed_at'] = agreement.employerSignedAt;
  if (agreement.freelancerSignedAt != null) createData['freelancer_signed_at'] = agreement.freelancerSignedAt;
  await blockchainAgreementRepository.createAgreement(createData as any);

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

  const entity = await blockchainAgreementRepository.findByContractIdHash(contractIdHash);

  if (!entity) throw new Error('Agreement not found');
  const agreement: BlockchainAgreement = {
    contractIdHash: entity.contract_id_hash,
    termsHash: entity.terms_hash,
    employerWallet: entity.employer_wallet,
    freelancerWallet: entity.freelancer_wallet,
    totalAmount: entity.total_amount,
    milestoneCount: entity.milestone_count,
    status: entity.status as BlockchainAgreementStatus,
    employerSignedAt: entity.employer_signed_at ?? null,
    freelancerSignedAt: entity.freelancer_signed_at ?? null,
    createdAt: entity.created_at_ts,
    transactionHash: entity.transaction_hash,
    blockNumber: entity.block_number,
  };
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
  /* istanbul ignore next */
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();
  let status: BlockchainAgreementStatus = agreement.status;
  let employerSignedAt = agreement.employerSignedAt;
  let freelancerSignedAt = agreement.freelancerSignedAt;

  if (signerWallet === agreement.employerWallet && !employerSignedAt) {
    employerSignedAt = now;
  } else if (signerWallet === agreement.freelancerWallet && !freelancerSignedAt) {
    freelancerSignedAt = now;
  }

  // Both signed = fully signed
  if (employerSignedAt && freelancerSignedAt) {
    status = 'signed';
  }

  const signUpdates: Record<string, unknown> = {
    status,
    transaction_hash: confirmed.hash!,
    block_number: confirmed.blockNumber!,
  };
  if (employerSignedAt != null) signUpdates['employer_signed_at'] = employerSignedAt;
  if (freelancerSignedAt != null) signUpdates['freelancer_signed_at'] = freelancerSignedAt;
  await blockchainAgreementRepository.updateAgreement(entity.id, signUpdates as any);

  const updatedAgreement = {
    ...agreement,
    status,
    employerSignedAt,
    freelancerSignedAt,
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
  };

  return {
    agreement: updatedAgreement,
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

  const entity = await blockchainAgreementRepository.findByContractIdHash(contractIdHash);

  if (!entity) throw new Error('Agreement not found');
  const agreement: BlockchainAgreement = {
    contractIdHash: entity.contract_id_hash,
    termsHash: entity.terms_hash,
    employerWallet: entity.employer_wallet,
    freelancerWallet: entity.freelancer_wallet,
    totalAmount: entity.total_amount,
    milestoneCount: entity.milestone_count,
    status: entity.status as BlockchainAgreementStatus,
    employerSignedAt: entity.employer_signed_at ?? null,
    freelancerSignedAt: entity.freelancer_signed_at ?? null,
    createdAt: entity.created_at_ts,
    transactionHash: entity.transaction_hash,
    blockNumber: entity.block_number,
  };
  if (agreement.status !== 'signed') throw new Error('Agreement not active');

  if (callerWallet !== agreement.employerWallet && callerWallet !== agreement.freelancerWallet) {
    throw new Error('Unauthorized: caller is not a party to this agreement');
  }

  const tx = await submitTransaction({
    type: 'agreement_complete',
    from: callerWallet,
    to: AGREEMENT_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: { action: 'complete_agreement', contractIdHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();

  // Update in DB
  await blockchainAgreementRepository.updateAgreement(entity.id, {
    status: 'completed',
    transaction_hash: confirmed.hash!,
    block_number: confirmed.blockNumber!,
  });

  const updatedAgreement = {
    ...agreement,
    status: 'completed' as BlockchainAgreementStatus,
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
  };

  return {
    agreement: updatedAgreement,
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
 * Mark agreement as disputed
 */
export async function disputeAgreement(
  contractId: string,
  callerWallet: string
): Promise<{ agreement: BlockchainAgreement; receipt: TransactionReceipt }> {
  const contractIdHash = generateContractIdHash(contractId);

  const entity = await blockchainAgreementRepository.findByContractIdHash(contractIdHash);

  if (!entity) throw new Error('Agreement not found');
  const agreement: BlockchainAgreement = {
    contractIdHash: entity.contract_id_hash,
    termsHash: entity.terms_hash,
    employerWallet: entity.employer_wallet,
    freelancerWallet: entity.freelancer_wallet,
    totalAmount: entity.total_amount,
    milestoneCount: entity.milestone_count,
    status: entity.status as BlockchainAgreementStatus,
    employerSignedAt: entity.employer_signed_at ?? null,
    freelancerSignedAt: entity.freelancer_signed_at ?? null,
    createdAt: entity.created_at_ts,
    transactionHash: entity.transaction_hash,
    blockNumber: entity.block_number,
  };
  if (agreement.status !== 'signed') throw new Error('Agreement not active');

  if (callerWallet !== agreement.employerWallet && callerWallet !== agreement.freelancerWallet) {
    throw new Error('Unauthorized: caller is not a party to this agreement');
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

  const now = Date.now();

  // Update in DB
  await blockchainAgreementRepository.updateAgreement(entity.id, {
    status: 'disputed',
    transaction_hash: confirmed.hash!,
    block_number: confirmed.blockNumber!,
  });

  const updatedAgreement = {
    ...agreement,
    status: 'disputed' as BlockchainAgreementStatus,
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
  };

  return {
    agreement: updatedAgreement,
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
 * Get agreement from blockchain
 */
export async function getAgreementFromBlockchain(contractId: string): Promise<BlockchainAgreement | null> {
  const contractIdHash = generateContractIdHash(contractId);
  const entity = await blockchainAgreementRepository.findByContractIdHash(contractIdHash);

  if (!entity) return null;
  return {
    contractIdHash: entity.contract_id_hash,
    termsHash: entity.terms_hash,
    employerWallet: entity.employer_wallet,
    freelancerWallet: entity.freelancer_wallet,
    totalAmount: entity.total_amount,
    milestoneCount: entity.milestone_count,
    status: entity.status as BlockchainAgreementStatus,
    employerSignedAt: entity.employer_signed_at ?? null,
    freelancerSignedAt: entity.freelancer_signed_at ?? null,
    createdAt: entity.created_at_ts,
    transactionHash: entity.transaction_hash,
    blockNumber: entity.block_number,
  };
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
  try {
    const entities = await blockchainAgreementRepository.findByWallet(walletAddress);
    return entities.map(entity => ({
      contractIdHash: entity.contract_id_hash,
      termsHash: entity.terms_hash,
      employerWallet: entity.employer_wallet,
      freelancerWallet: entity.freelancer_wallet,
      totalAmount: entity.total_amount,
      milestoneCount: entity.milestone_count,
      status: entity.status as BlockchainAgreementStatus,
      employerSignedAt: entity.employer_signed_at ?? null,
      freelancerSignedAt: entity.freelancer_signed_at ?? null,
      createdAt: entity.created_at_ts,
      transactionHash: entity.transaction_hash,
      blockNumber: entity.block_number,
    }));
  } catch {
    return [];
  }
}

/**
 * Clear all agreements (for testing)
 */
export async function clearBlockchainAgreements(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  const all = await blockchainAgreementRepository.queryAll('created_at_ts');
  for (const agreement of all) {
    await blockchainAgreementRepository.delete(agreement.id);
  }
}

export function getAgreementContractAddress(): string {
  return AGREEMENT_CONTRACT_ADDRESS;
}
