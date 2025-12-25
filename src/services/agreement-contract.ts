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
  };
};

// Contract address (simulated)
const AGREEMENT_CONTRACT_ADDRESS = generateWalletAddress();

// In-memory store (simulates blockchain)
const agreementStore = new Map<string, BlockchainAgreement>();
const userAgreementsMap = new Map<string, string[]>();


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
  if (agreementStore.has(contractIdHash)) {
    throw new Error('Agreement already exists for this contract');
  }

  const tx = await submitTransaction({
    type: 'escrow_deploy',
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

  agreementStore.set(contractIdHash, agreement);
  
  // Track by user
  const employerAgreements = userAgreementsMap.get(input.employerWallet) ?? [];
  employerAgreements.push(contractIdHash);
  userAgreementsMap.set(input.employerWallet, employerAgreements);

  const freelancerAgreements = userAgreementsMap.get(input.freelancerWallet) ?? [];
  freelancerAgreements.push(contractIdHash);
  userAgreementsMap.set(input.freelancerWallet, freelancerAgreements);

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
  const agreement = agreementStore.get(contractIdHash);

  if (!agreement) throw new Error('Agreement not found');
  if (agreement.status !== 'pending') throw new Error('Agreement not pending');
  if (signerWallet !== agreement.employerWallet && signerWallet !== agreement.freelancerWallet) {
    throw new Error('Not a party to this agreement');
  }

  const tx = await submitTransaction({
    type: 'escrow_deploy',
    from: signerWallet,
    to: AGREEMENT_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: { action: 'sign_agreement', contractIdHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  const now = Date.now();
  if (signerWallet === agreement.employerWallet && !agreement.employerSignedAt) {
    agreement.employerSignedAt = now;
  } else if (signerWallet === agreement.freelancerWallet && !agreement.freelancerSignedAt) {
    agreement.freelancerSignedAt = now;
  }

  // Both signed = fully signed
  if (agreement.employerSignedAt && agreement.freelancerSignedAt) {
    agreement.status = 'signed';
  }

  agreement.transactionHash = confirmed.hash!;
  agreement.blockNumber = confirmed.blockNumber!;
  agreementStore.set(contractIdHash, agreement);

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
  const agreement = agreementStore.get(contractIdHash);

  if (!agreement) throw new Error('Agreement not found');
  if (agreement.status !== 'signed') throw new Error('Agreement not active');

  const tx = await submitTransaction({
    type: 'escrow_deploy',
    from: callerWallet,
    to: AGREEMENT_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: { action: 'complete_agreement', contractIdHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  agreement.status = 'completed';
  agreement.transactionHash = confirmed.hash!;
  agreement.blockNumber = confirmed.blockNumber!;
  agreementStore.set(contractIdHash, agreement);

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
  const agreement = agreementStore.get(contractIdHash);

  if (!agreement) throw new Error('Agreement not found');
  if (agreement.status !== 'signed') throw new Error('Agreement not active');
  if (callerWallet !== agreement.employerWallet && callerWallet !== agreement.freelancerWallet) {
    throw new Error('Not a party');
  }

  const tx = await submitTransaction({
    type: 'escrow_deploy',
    from: callerWallet,
    to: AGREEMENT_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: { action: 'dispute_agreement', contractIdHash },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) throw new Error('Failed to confirm transaction');

  agreement.status = 'disputed';
  agreement.transactionHash = confirmed.hash!;
  agreement.blockNumber = confirmed.blockNumber!;
  agreementStore.set(contractIdHash, agreement);

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
  return agreementStore.get(contractIdHash) ?? null;
}

/**
 * Verify terms hash matches on-chain record
 */
export async function verifyAgreementTerms(
  contractId: string,
  terms: CreateAgreementInput['terms']
): Promise<boolean> {
  const contractIdHash = generateContractIdHash(contractId);
  const agreement = agreementStore.get(contractIdHash);
  if (!agreement) return false;

  const computedHash = generateTermsHash(terms);
  return agreement.termsHash === computedHash;
}

/**
 * Check if agreement is fully signed
 */
export async function isAgreementFullySigned(contractId: string): Promise<boolean> {
  const contractIdHash = generateContractIdHash(contractId);
  const agreement = agreementStore.get(contractIdHash);
  if (!agreement) return false;
  return agreement.employerSignedAt !== null && agreement.freelancerSignedAt !== null;
}

/**
 * Get user's agreements
 */
export async function getUserAgreements(walletAddress: string): Promise<BlockchainAgreement[]> {
  const contractIdHashes = userAgreementsMap.get(walletAddress) ?? [];
  return contractIdHashes
    .map(hash => agreementStore.get(hash))
    .filter((a): a is BlockchainAgreement => a !== undefined);
}

/**
 * Clear all agreements (for testing)
 */
export function clearBlockchainAgreements(): void {
  agreementStore.clear();
  userAgreementsMap.clear();
}

export function getAgreementContractAddress(): string {
  return AGREEMENT_CONTRACT_ADDRESS;
}
