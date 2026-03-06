/**
 * KYC Verification Smart Contract Interface
 * Handles on-chain KYC verification status storage
 * Requirements: Privacy-compliant blockchain KYC verification
 *
 * ARCHITECTURE: Uses Supabase (blockchain_kyc_verifications table)
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

// KYC verification status on blockchain
export type BlockchainKycStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'expired';

// KYC tier levels
export type BlockchainKycTier = 'none' | 'basic' | 'standard' | 'enhanced';

// On-chain KYC verification record
export type BlockchainKycVerification = {
  walletAddress: string;
  userId: string;
  userIdHash: string;
  status: BlockchainKycStatus;
  tier: BlockchainKycTier;
  dataHash: string;
  verifiedAt: number | null;
  expiresAt: number | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  transactionHash: string;
  blockNumber: number;
};

// Input for submitting KYC to blockchain
export type KycBlockchainSubmitInput = {
  userId: string;
  walletAddress: string;
  kycData: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    documentType: string;
    documentNumber: string;
  };
};

// Input for approving KYC on blockchain
export type KycBlockchainApproveInput = {
  walletAddress: string;
  tier: BlockchainKycTier;
  validityDays: number;
};

// KYC contract address (simulated - would be deployed contract address)
const KYC_CONTRACT_ADDRESS = generateWalletAddress();

// DB row type
type KycRow = {
  wallet_address: string;
  user_id: string;
  user_id_hash: string;
  status: string;
  tier: string;
  data_hash: string;
  verified_at: number | null;
  expires_at: number | null;
  verified_by: string | null;
  rejection_reason: string | null;
  transaction_hash: string;
  block_number: number;
};

function rowToVerification(row: KycRow): BlockchainKycVerification {
  return {
    walletAddress: row.wallet_address,
    userId: row.user_id,
    userIdHash: row.user_id_hash,
    status: row.status as BlockchainKycStatus,
    tier: row.tier as BlockchainKycTier,
    dataHash: row.data_hash,
    verifiedAt: row.verified_at,
    expiresAt: row.expires_at,
    verifiedBy: row.verified_by,
    rejectionReason: row.rejection_reason,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number,
  };
}


/**
 * Generate a hash of KYC data for on-chain storage
 * This creates a proof without revealing actual data
 */
export function generateKycDataHash(data: KycBlockchainSubmitInput['kycData']): string {
  const dataString = JSON.stringify({
    firstName: data.firstName.toLowerCase().trim(),
    lastName: data.lastName.toLowerCase().trim(),
    dateOfBirth: data.dateOfBirth,
    nationality: data.nationality.toUpperCase(),
    documentType: data.documentType,
    documentNumber: data.documentNumber,
  });
  return '0x' + createHash('sha256').update(dataString).digest('hex');
}

/**
 * Generate a hash of user ID for on-chain mapping
 */
export function generateUserIdHash(userId: string): string {
  return '0x' + createHash('sha256').update(userId).digest('hex');
}

/**
 * Submit KYC verification to blockchain
 * Called when user submits KYC - stores pending status on-chain
 */
export async function submitKycToBlockchain(
  input: KycBlockchainSubmitInput
): Promise<{ verification: BlockchainKycVerification; receipt: TransactionReceipt }> {
  const { userId, walletAddress, kycData } = input;

  // Check if already has pending or approved verification
  const supabase = getSupabaseServiceClient();
  const { data: existingRow } = await supabase
    .from('blockchain_kyc_verifications')
    .select('status')
    .eq('wallet_address', walletAddress)
    .single();

  if (existingRow) {
    const existingStatus = (existingRow as { status: string }).status;
    if (existingStatus === 'pending' || existingStatus === 'approved') {
      throw new Error('Verification already pending or approved');
    }
  }

  const dataHash = generateKycDataHash(kycData);
  const userIdHash = generateUserIdHash(userId);

  // Submit transaction to blockchain
  const tx = await submitTransaction({
    type: 'escrow_deploy', // Using existing type for simulation
    from: walletAddress,
    to: KYC_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: {
      action: 'submit_kyc',
      walletAddress,
      userIdHash,
      dataHash,
    },
  });

  // Confirm the transaction
  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) {
    throw new Error('Failed to confirm KYC submission transaction');
  }

  // Create blockchain verification record
  const verification: BlockchainKycVerification = {
    walletAddress,
    userId,
    userIdHash,
    status: 'pending',
    tier: 'none',
    dataHash,
    verifiedAt: null,
    expiresAt: null,
    verifiedBy: null,
    rejectionReason: null,
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
  };

  // Persist to DB (upsert to handle re-submission after rejection/expiry)
  await supabase.from('blockchain_kyc_verifications').upsert({
    wallet_address: verification.walletAddress,
    user_id: verification.userId,
    user_id_hash: verification.userIdHash,
    status: verification.status,
    tier: verification.tier,
    data_hash: verification.dataHash,
    verified_at: verification.verifiedAt,
    expires_at: verification.expiresAt,
    verified_by: verification.verifiedBy,
    rejection_reason: verification.rejectionReason,
    transaction_hash: verification.transactionHash,
    block_number: verification.blockNumber,
  });

  const receipt: TransactionReceipt = {
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
    status: 'success',
    gasUsed: confirmed.gasUsed!,
    timestamp: Date.now(),
  };

  return { verification, receipt };
}

/**
 * Approve KYC verification on blockchain
 * Called by admin when KYC is approved
 */
export async function approveKycOnBlockchain(
  input: KycBlockchainApproveInput,
  verifierAddress: string
): Promise<{ verification: BlockchainKycVerification; receipt: TransactionReceipt }> {
  const { walletAddress, tier, validityDays } = input;

  const supabase = getSupabaseServiceClient();
  const { data: row, error } = await supabase
    .from('blockchain_kyc_verifications')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (error || !row) {
    throw new Error('No KYC verification found for this wallet');
  }
  const existing = rowToVerification(row as KycRow);
  if (existing.status !== 'pending') {
    throw new Error('KYC verification is not pending');
  }

  // Submit approval transaction
  const tx = await submitTransaction({
    type: 'escrow_deploy',
    from: verifierAddress,
    to: KYC_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: {
      action: 'approve_kyc',
      walletAddress,
      tier,
      validityDays,
    },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) {
    throw new Error('Failed to confirm KYC approval transaction');
  }

  const now = Date.now();
  const expiresAt = now + validityDays * 24 * 60 * 60 * 1000;

  // Update in DB
  await supabase
    .from('blockchain_kyc_verifications')
    .update({
      status: 'approved',
      tier,
      verified_at: now,
      expires_at: expiresAt,
      verified_by: verifierAddress,
      transaction_hash: confirmed.hash!,
      block_number: confirmed.blockNumber!,
      updated_at: new Date().toISOString(),
    })
    .eq('wallet_address', walletAddress);

  const verification: BlockchainKycVerification = {
    ...existing,
    status: 'approved',
    tier,
    verifiedAt: now,
    expiresAt,
    verifiedBy: verifierAddress,
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
  };

  const receipt: TransactionReceipt = {
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
    status: 'success',
    gasUsed: confirmed.gasUsed!,
    timestamp: now,
  };

  return { verification, receipt };
}

/**
 * Reject KYC verification on blockchain
 */
export async function rejectKycOnBlockchain(
  walletAddress: string,
  reason: string,
  verifierAddress: string
): Promise<{ verification: BlockchainKycVerification; receipt: TransactionReceipt }> {
  const supabase = getSupabaseServiceClient();
  const { data: row, error } = await supabase
    .from('blockchain_kyc_verifications')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (error || !row) {
    throw new Error('No KYC verification found for this wallet');
  }
  const existing = rowToVerification(row as KycRow);
  if (existing.status !== 'pending') {
    throw new Error('KYC verification is not pending');
  }

  const tx = await submitTransaction({
    type: 'escrow_deploy',
    from: verifierAddress,
    to: KYC_CONTRACT_ADDRESS,
    amount: BigInt(0),
    data: {
      action: 'reject_kyc',
      walletAddress,
      reason,
    },
  });

  const confirmed = await confirmTransaction(tx.id);
  if (!confirmed) {
    throw new Error('Failed to confirm KYC rejection transaction');
  }

  const now = Date.now();

  // Update in DB
  await supabase
    .from('blockchain_kyc_verifications')
    .update({
      status: 'rejected',
      verified_at: now,
      verified_by: verifierAddress,
      rejection_reason: reason,
      transaction_hash: confirmed.hash!,
      block_number: confirmed.blockNumber!,
      updated_at: new Date().toISOString(),
    })
    .eq('wallet_address', walletAddress);

  const verification: BlockchainKycVerification = {
    ...existing,
    status: 'rejected',
    verifiedAt: now,
    verifiedBy: verifierAddress,
    rejectionReason: reason,
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
  };

  const receipt: TransactionReceipt = {
    transactionHash: confirmed.hash!,
    blockNumber: confirmed.blockNumber!,
    status: 'success',
    gasUsed: confirmed.gasUsed!,
    timestamp: now,
  };

  return { verification, receipt };
}

/**
 * Check if wallet is verified on blockchain
 */
export async function isWalletVerified(walletAddress: string): Promise<{
  isVerified: boolean;
  tier: BlockchainKycTier;
  expiresAt: number | null;
}> {
  const supabase = getSupabaseServiceClient();
  const { data: row, error } = await supabase
    .from('blockchain_kyc_verifications')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (error || !row) {
    return { isVerified: false, tier: 'none', expiresAt: null };
  }

  const verification = rowToVerification(row as KycRow);

  if (verification.status === 'approved' && verification.expiresAt) {
    const isExpired = Date.now() > verification.expiresAt;
    if (isExpired) {
      // Mark as expired in DB
      await supabase
        .from('blockchain_kyc_verifications')
        .update({
          status: 'expired',
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_address', walletAddress);
      return { isVerified: false, tier: 'none', expiresAt: verification.expiresAt };
    }
    return { isVerified: true, tier: verification.tier, expiresAt: verification.expiresAt };
  }

  return { isVerified: false, tier: 'none', expiresAt: null };
}

/**
 * Get KYC verification from blockchain by wallet address
 */
export async function getKycFromBlockchain(walletAddress: string): Promise<BlockchainKycVerification | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_kyc_verifications')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (error || !data) return null;
  return rowToVerification(data as KycRow);
}

/**
 * Get KYC verification by user ID (derived via SQL query on user_id_hash)
 */
export async function getKycByUserId(userId: string): Promise<BlockchainKycVerification | null> {
  const userIdHash = generateUserIdHash(userId);
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_kyc_verifications')
    .select('*')
    .eq('user_id_hash', userIdHash)
    .single();

  if (error || !data) return null;
  return rowToVerification(data as KycRow);
}

/**
 * Verify data hash matches on-chain record
 * Used to verify that off-chain data matches what was submitted
 */
export async function verifyKycDataHash(
  walletAddress: string,
  kycData: KycBlockchainSubmitInput['kycData']
): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('blockchain_kyc_verifications')
    .select('data_hash')
    .eq('wallet_address', walletAddress)
    .single();

  if (error || !data) return false;

  const computedHash = generateKycDataHash(kycData);
  return (data as { data_hash: string }).data_hash === computedHash;
}

/**
 * Get KYC contract address
 */
export function getKycContractAddress(): string {
  return KYC_CONTRACT_ADDRESS;
}

/**
 * Clear all KYC verifications (for testing)
 */
export async function clearBlockchainKyc(): Promise<void> {
  const supabase = getSupabaseServiceClient();
  await supabase.from('blockchain_kyc_verifications').delete().neq('wallet_address', '');
}

/**
 * Get all verified wallets (for admin/reporting)
 */
export async function getAllVerifiedWallets(): Promise<BlockchainKycVerification[]> {
  const supabase = getSupabaseServiceClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from('blockchain_kyc_verifications')
    .select('*')
    .eq('status', 'approved')
    .gte('expires_at', now);

  if (error || !data) return [];
  return (data as KycRow[]).map(rowToVerification);
}
