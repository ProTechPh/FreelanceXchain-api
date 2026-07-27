import { TransactionReceipt } from '../blockchain-types.js';
import type { MilestoneStatus } from '../../models/milestone.js';

// PascalCase status values from smart contracts.
// Use fromBlockchainMilestoneStatus / toBlockchainMilestoneStatus to convert.
export type BlockchainMilestoneStatus = 'Pending' | 'Submitted' | 'Approved' | 'Disputed' | 'Refunded';

const BLOCKCHAIN_TO_DOMAIN: Record<BlockchainMilestoneStatus, MilestoneStatus> = {
  Pending: 'pending',
  Submitted: 'submitted',
  Approved: 'approved',
  Disputed: 'disputed',
  Refunded: 'refunded',
};

const DOMAIN_TO_BLOCKCHAIN: Partial<Record<MilestoneStatus, BlockchainMilestoneStatus>> = {
  pending: 'Pending',
  submitted: 'Submitted',
  approved: 'Approved',
  disputed: 'Disputed',
  refunded: 'Refunded',
};

/** Convert a smart-contract status value to the domain MilestoneStatus. */
export function fromBlockchainMilestoneStatus(status: BlockchainMilestoneStatus): MilestoneStatus {
  return BLOCKCHAIN_TO_DOMAIN[status];
}

/** Convert a domain MilestoneStatus to the smart-contract PascalCase value.
 *  Returns undefined for statuses that have no blockchain equivalent (e.g. 'completed', 'rejected'). */
export function toBlockchainMilestoneStatus(status: MilestoneStatus): BlockchainMilestoneStatus | undefined {
  return DOMAIN_TO_BLOCKCHAIN[status];
}

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

export interface IBlockchainAdapter {
  isAvailable(): boolean;
  deployEscrowContract(params: EscrowDeploymentParams): Promise<EscrowDeploymentResult>;
  getEscrowInfo(escrowAddress: string): Promise<EscrowInfo>;
  submitMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult>;
  approveMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult>;
  disputeMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult>;
  resolveDispute(
    escrowAddress: string,
    milestoneIndex: number,
    inFavorOfFreelancer: boolean
  ): Promise<TransactionResult>;
  refundEscrow(escrowAddress: string): Promise<TransactionResult>;
  getMilestone(escrowAddress: string, milestoneIndex: number): Promise<{
    amount: bigint;
    status: BlockchainMilestoneStatus;
    description: string;
  }>;
  getEscrowBalance(escrowAddress: string): Promise<bigint>;
}
