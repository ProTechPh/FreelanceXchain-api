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
import { pool } from '../config/database.js';

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
  const existingResult = await pool.query(
    'SELECT contract_id_hash FROM blockchain_agreements WHERE contract_id_hash = $1',
    [contractIdHash]
  );

  if (existingResult.rows.length > 0) {
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
  await pool.query(
    `INSERT INTO blockchain_agreements 
     (contract_id_hash, terms_hash, employer_wallet, freelancer_wallet, total_amount, 
      milestone_count, status, employer_signed_at, freelancer_signed_at, created_at_ts, 
      transaction_hash, block_number, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
    [
      agreement.contractIdHash,
      agreement.termsHash,
      agreement.employerWallet,
      agreement.freelancerWallet,
      agreement.totalAmount,
      agreement.milestoneCount,
      agreement.status,
      agreement.employerSignedAt,
      agreement.freelancerSignedAt,
      agreement.createdAt,
      agreement.transactionHash,
      agreement.blockNumber
    ]
  );

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

  const result = await pool.query(
    'SELECT * FROM blockchain_agreements WHERE contract_id_hash = $1',
    [contractIdHash]
  );

  if (result.rows.length === 0) throw new Error('Agreement not found');
  const agreement = rowToAgreement(result.rows[0] as AgreementRow);
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

  await pool.query(
    `UPDATE blockchain_agreements 
     SET status = $1, employer_signed_at = $2, freelancer_signed_at = $3, 
         transaction_hash = $4, block_number = $5, updated_at = NOW() 
     WHERE contract_id_hash = $6`,
    [status, employerSignedAt, freelancerSignedAt, confirmed.hash!, confirmed.blockNumber!, contractIdHash]
  );

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

  const result = await pool.query(
    'SELECT * FROM blockchain_agreements WHERE contract_id_hash = $1',
    [contractIdHash]
  );

  if (result.rows.length === 0) throw new Error('Agreement not found');
  const agreement = rowToAgreement(result.rows[0] as AgreementRow);
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
  await pool.query(
    `UPDATE blockchain_agreements 
     SET status = $1, transaction_hash = $2, block_number = $3, updated_at = NOW()
     WHERE contract_id_hash = $4`,
    ['completed', confirmed.hash!, confirmed.blockNumber!, contractIdHash]
  );

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

  const result = await pool.query(
    'SELECT * FROM blockchain_agreements WHERE contract_id_hash = $1',
    [contractIdHash]
  );

  if (result.rows.length === 0) throw new Error('Agreement not found');
  const agreement = rowToAgreement(result.rows[0] as AgreementRow);
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
  await pool.query(
    `UPDATE blockchain_agreements 
     SET status = $1, transaction_hash = $2, block_number = $3, updated_at = NOW()
     WHERE contract_id_hash = $4`,
    ['disputed', confirmed.hash!, confirmed.blockNumber!, contractIdHash]
  );

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
  const result = await pool.query(
    'SELECT * FROM blockchain_agreements WHERE contract_id_hash = $1',
    [contractIdHash]
  );

  if (result.rows.length === 0) return null;
  return rowToAgreement(result.rows[0] as AgreementRow);
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
    const result = await pool.query(
      `SELECT * FROM blockchain_agreements 
       WHERE employer_wallet = $1 OR freelancer_wallet = $1
       ORDER BY created_at_ts DESC`,
      [walletAddress]
    );

    return result.rows.map(rowToAgreement);
  } catch {
    return [];
  }
}

/**
 * Clear all agreements (for testing)
 */
export async function clearBlockchainAgreements(): Promise<void> {
  if (process.env['NODE_ENV'] !== 'test') return;
  await pool.query('DELETE FROM blockchain_agreements');
}

export function getAgreementContractAddress(): string {
  return AGREEMENT_CONTRACT_ADDRESS;
}
