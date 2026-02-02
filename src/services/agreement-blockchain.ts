/**
 * Agreement Blockchain Integration
 * Real blockchain integration for contract agreements using deployed smart contracts
 */

import { Contract, TransactionReceipt } from 'ethers';
import { getContractWithSigner, getContract, isWeb3Available } from './web3-client.js';
import { getContractAddress } from '../config/contracts.js';
import { ContractAgreementABI } from './contract-abis.js';
import { createHash } from 'crypto';

export type BlockchainAgreementStatus = 'pending' | 'signed' | 'completed' | 'disputed' | 'cancelled';

export type BlockchainAgreement = {
  contractIdHash: string;
  termsHash: string;
  employerWallet: string;
  freelancerWallet: string;
  totalAmount: bigint;
  milestoneCount: bigint;
  status: number; // 0=pending, 1=signed, 2=completed, 3=disputed, 4=cancelled
  employerSignedAt: bigint;
  freelancerSignedAt: bigint;
  createdAt: bigint;
};

export type CreateAgreementInput = {
  contractId: string;
  employerWallet: string;
  freelancerWallet: string;
  totalAmount: bigint;
  milestoneCount: number;
  terms: {
    projectTitle: string;
    description: string;
    milestones: { title: string; amount: number }[];
    deadline: string;
  };
};

/**
 * Get Agreement contract instance for reading
 */
function getAgreementContract(): Contract {
  const address = getContractAddress('agreement');
  if (!address) {
    throw new Error('Agreement contract not deployed. Please deploy contracts first.');
  }
  return getContract(address, ContractAgreementABI);
}

/**
 * Get Agreement contract instance for writing
 */
function getAgreementContractWithSigner(): Contract {
  const address = getContractAddress('agreement');
  if (!address) {
    throw new Error('Agreement contract not deployed. Please deploy contracts first.');
  }
  return getContractWithSigner(address, ContractAgreementABI);
}

/**
 * Generate hash of contract ID
 */
export function generateContractIdHash(contractId: string): string {
  return '0x' + createHash('sha256').update(contractId).digest('hex');
}

/**
 * Generate hash of contract terms
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
): Promise<{ agreement: BlockchainAgreement; transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured. Please set BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY');
  }

  const contractIdHash = generateContractIdHash(input.contractId);
  const termsHash = generateTermsHash(input.terms);

  const contract = getAgreementContractWithSigner();

  // Create agreement transaction
  const tx = await (contract as any).createAgreement(
    contractIdHash,
    termsHash,
    input.employerWallet,
    input.freelancerWallet,
    input.totalAmount,
    input.milestoneCount
  );

  const receipt = await tx.wait();

  // Fetch the created agreement
  const agreement = await getAgreementFromBlockchain(input.contractId);
  if (!agreement) {
    throw new Error('Failed to retrieve created agreement');
  }

  return {
    agreement,
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Sign agreement (freelancer accepts)
 */
export async function signAgreement(
  contractId: string
): Promise<{ agreement: BlockchainAgreement; transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contractIdHash = generateContractIdHash(contractId);
  const contract = getAgreementContractWithSigner();

  const tx = await (contract as any).signAgreement(contractIdHash);
  const receipt = await tx.wait();

  const agreement = await getAgreementFromBlockchain(contractId);
  if (!agreement) {
    throw new Error('Failed to retrieve signed agreement');
  }

  return {
    agreement,
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Complete agreement
 */
export async function completeAgreement(
  contractId: string
): Promise<{ agreement: BlockchainAgreement; transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contractIdHash = generateContractIdHash(contractId);
  const contract = getAgreementContractWithSigner();

  const tx = await (contract as any).completeAgreement(contractIdHash);
  const receipt = await tx.wait();

  const agreement = await getAgreementFromBlockchain(contractId);
  if (!agreement) {
    throw new Error('Failed to retrieve completed agreement');
  }

  return {
    agreement,
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Dispute agreement
 */
export async function disputeAgreement(
  contractId: string
): Promise<{ agreement: BlockchainAgreement; transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contractIdHash = generateContractIdHash(contractId);
  const contract = getAgreementContractWithSigner();

  const tx = await (contract as any).disputeAgreement(contractIdHash);
  const receipt = await tx.wait();

  const agreement = await getAgreementFromBlockchain(contractId);
  if (!agreement) {
    throw new Error('Failed to retrieve disputed agreement');
  }

  return {
    agreement,
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Cancel agreement
 */
export async function cancelAgreement(
  contractId: string
): Promise<{ agreement: BlockchainAgreement; transactionHash: string; receipt: TransactionReceipt }> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contractIdHash = generateContractIdHash(contractId);
  const contract = getAgreementContractWithSigner();

  const tx = await (contract as any).cancelAgreement(contractIdHash);
  const receipt = await tx.wait();

  const agreement = await getAgreementFromBlockchain(contractId);
  if (!agreement) {
    throw new Error('Failed to retrieve cancelled agreement');
  }

  return {
    agreement,
    transactionHash: receipt.hash,
    receipt,
  };
}

/**
 * Get agreement from blockchain
 */
export async function getAgreementFromBlockchain(contractId: string): Promise<BlockchainAgreement | null> {
  if (!isWeb3Available()) {
    throw new Error('Web3 is not configured');
  }

  const contractIdHash = generateContractIdHash(contractId);
  const contract = getAgreementContract();

  try {
    const agreement = await (contract as any).getAgreement(contractIdHash);
    
    // Check if agreement exists (employerWallet should not be zero address)
    if (agreement[2] === '0x0000000000000000000000000000000000000000') {
      return null;
    }

    return {
      contractIdHash: agreement[0],
      termsHash: agreement[1],
      employerWallet: agreement[2],
      freelancerWallet: agreement[3],
      totalAmount: agreement[4],
      milestoneCount: agreement[5],
      status: Number(agreement[6]),
      employerSignedAt: agreement[7],
      freelancerSignedAt: agreement[8],
      createdAt: agreement[9],
    };
  } catch (error) {
    return null;
  }
}

/**
 * Verify agreement terms match on-chain hash
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

  return agreement.employerSignedAt > 0 && agreement.freelancerSignedAt > 0;
}

/**
 * Get agreement status as string
 */
export function getAgreementStatusString(statusCode: number): BlockchainAgreementStatus {
  const statuses: BlockchainAgreementStatus[] = ['pending', 'signed', 'completed', 'disputed', 'cancelled'];
  return statuses[statusCode] || 'pending';
}

/**
 * Get agreement contract address
 */
export function getAgreementContractAddress(): string {
  const address = getContractAddress('agreement');
  if (!address) {
    throw new Error('Agreement contract not deployed');
  }
  return address;
}
