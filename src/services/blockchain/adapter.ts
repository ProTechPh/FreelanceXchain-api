import { TransactionReceipt } from '../blockchain-types.js';

// PascalCase status values from smart contracts.
export type BlockchainMilestoneStatus = 'Pending' | 'Submitted' | 'Approved' | 'Disputed' | 'Refunded';


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
  /**
   * Resolve a disputed milestone.
   * @param freelancerBps Portion of the milestone awarded to the freelancer (0-10000).
   *                      10000 = full to freelancer, 0 = full to employer.
   */
  resolveDispute(
    escrowAddress: string,
    milestoneIndex: number,
    freelancerBps: number
  ): Promise<TransactionResult>;
  refundEscrow(escrowAddress: string): Promise<TransactionResult>;
  /**
   * Refund a single milestone back to the employer (pending milestones only,
   * matching the FreelanceEscrow contract). Used for partial refunds.
   */
  refundMilestone(escrowAddress: string, milestoneIndex: number): Promise<TransactionResult>;
  getMilestone(escrowAddress: string, milestoneIndex: number): Promise<{
    amount: bigint;
    status: BlockchainMilestoneStatus;
    description: string;
  }>;
  getEscrowBalance(escrowAddress: string): Promise<bigint>;
}
