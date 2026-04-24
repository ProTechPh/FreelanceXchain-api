/**
 * Blockchain Types
 * Type definitions for blockchain transactions and operations
 */

// Transaction types
export type TransactionType =
  | 'escrow_deploy'
  | 'escrow_deposit'
  | 'milestone_release'
  | 'refund'
  | 'agreement_create'
  | 'agreement_sign'
  | 'agreement_complete'
  | 'dispute_create'
  | 'dispute_resolve'
  | 'rating_submit'
  | 'milestone_submit'
  | 'milestone_approve'
  | 'milestone_reject'
  | 'agreement_dispute';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

// Base transaction structure
export type Transaction = {
  id: string;
  type: TransactionType;
  from: string;
  to: string;
  amount: bigint;
  data: Record<string, unknown>;
  timestamp: number;
  status: TransactionStatus;
  hash?: string | undefined;
  blockNumber?: number | undefined;
  gasUsed?: bigint | undefined;
};

// Transaction input for creating new transactions
export type TransactionInput = {
  type: TransactionType;
  from: string;
  to: string;
  amount: bigint;
  data?: Record<string, unknown>;
};

// Transaction receipt after submission
export type TransactionReceipt = {
  transactionHash: string;
  blockNumber: number;
  status: 'success' | 'failure';
  gasUsed: bigint;
  timestamp: number;
};

// Escrow contract parameters
export type EscrowParams = {
  contractId: string;
  employerAddress: string;
  freelancerAddress: string;
  totalAmount: bigint;
  milestones: EscrowMilestone[];
};

export type EscrowMilestone = {
  id: string;
  amount: bigint;
  status: 'pending' | 'released' | 'refunded';
};

// Escrow deployment result
export type EscrowDeployment = {
  escrowAddress: string;
  transactionHash: string;
  blockNumber: number;
  deployedAt: number;
};

// Payment transaction for milestone release
export type PaymentTransaction = {
  escrowAddress: string;
  milestoneId: string;
  amount: bigint;
  recipient: string;
  timestamp: number;
  transactionHash: string;
};

// Serialized transaction for JSON encoding
export type SerializedTransaction = {
  id: string;
  type: TransactionType;
  from: string;
  to: string;
  amount: string; // bigint serialized as string
  data: Record<string, unknown>;
  timestamp: number;
  status: TransactionStatus;
  hash?: string | undefined;
  blockNumber?: number | undefined;
  gasUsed?: string | undefined; // bigint serialized as string
};

// Serialized payment transaction
export type SerializedPaymentTransaction = {
  escrowAddress: string;
  milestoneId: string;
  amount: string; // bigint serialized as string
  recipient: string;
  timestamp: number;
  transactionHash: string;
};

// Blockchain client configuration
export type BlockchainConfig = {
  rpcUrl: string;
  privateKey: string;
  chainId: number;
};

// Transaction polling result
export type TransactionPollResult = {
  status: TransactionStatus;
  receipt?: TransactionReceipt;
  error?: string;
};
