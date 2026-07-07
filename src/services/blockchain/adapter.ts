/**
 * Blockchain Adapter Interface
 * Provides a unified interface for both real and simulated blockchain implementations
 */

import { TransactionReceipt } from '../blockchain-types.js';

export type MilestoneStatus = 'Pending' | 'Submitted' | 'Approved' | 'Disputed' | 'Refunded' | 'pending' | 'released' | 'refunded';

export type EscrowDeploymentParams = {
  contractId: string;
  employerAddress: string;
  freelancerAddress: string;
  arbiterAddress: string;
  milestoneAmounts: bigint[];
  milestoneDescriptions: string[];
  totalAmount: bigint;
};

export type EscrowDeploymentResult = {
  escrowAddress: string;
  transactionHash: string;
  receipt?: TransactionReceipt | any;
};

export type EscrowInfo = {
  employer: string;
  freelancer: string;
  arbiter: string;
  totalAmount: bigint;
  releasedAmount: bigint;
  isActive: boolean;
  contractId: string;
  balance: bigint;
};

export type TransactionResult = {
  transactionHash: string;
  receipt?: TransactionReceipt | any;
};

/**
 * Blockchain Adapter Interface
 * Abstracts blockchain operations to support both real and simulated implementations
 */
export interface IBlockchainAdapter {
  /**
   * Check if blockchain is available/configured
   */
  isAvailable(): boolean;

  /**
   * Deploy a new escrow contract
   */
  deployEscrowContract(params: EscrowDeploymentParams): Promise<EscrowDeploymentResult>;

  /**
   * Get escrow contract information
   */
  getEscrowInfo(escrowAddress: string): Promise<EscrowInfo>;

  /**
   * Submit milestone for approval (freelancer)
   */
  submitMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult>;

  /**
   * Approve milestone and release payment (employer)
   */
  approveMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult>;

  /**
   * Dispute a milestone
   */
  disputeMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult>;

  /**
   * Resolve dispute (arbiter only)
   */
  resolveDispute(
    escrowAddress: string,
    milestoneIndex: number,
    inFavorOfFreelancer: boolean
  ): Promise<TransactionResult>;

  /**
   * Refund escrow to employer
   */
  refundEscrow(escrowAddress: string): Promise<TransactionResult>;

  /**
   * Get milestone information
   */
  getMilestone(escrowAddress: string, milestoneIndex: number): Promise<{
    amount: bigint;
    status: MilestoneStatus;
    description: string;
  }>;

  /**
   * Get escrow balance
   */
  getEscrowBalance(escrowAddress: string): Promise<bigint>;
}
