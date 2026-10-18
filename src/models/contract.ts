// Contract domain types
import type { Milestone } from './milestone.js';

// Hiring flow: negotiating → awaiting_signatures → awaiting_funding → active.
// 'pending' is the legacy pre-negotiation status (accept → fund directly).
export type ContractStatus =
  | 'negotiating'
  | 'awaiting_signatures'
  | 'awaiting_funding'
  | 'pending'
  | 'active'
  | 'completed'
  | 'disputed'
  | 'resolved'
  | 'cancelled';

export type MilestoneSource = 'project' | 'contract';

export type Contract = {
  id: string;
  projectId: string;
  proposalId: string;
  freelancerId: string;
  employerId: string;
  escrowAddress: string;
  baseAmount: number;
  rushFee: number;
  totalAmount: number;
  currency?: string;
  status: ContractStatus;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  milestones?: Milestone[];
  milestoneSource?: MilestoneSource;
  additionalPay?: number;
  rushFeePercentage?: number;
  deadline?: string;
  acceptedOfferId?: string;
  termsHash?: string;
  termsLockedAt?: string;
  fullySignedAt?: string;
  fundingDeadline?: string;
  fundedAt?: string;
  cancelReason?: string;
  cancelledBy?: string;
  createdAt: string;
  updatedAt: string;
  // Extended relational fields populated by getContractByIdWithRelations;
  // shapes vary by producer, so keep them loosely typed
  project?: Record<string, unknown> | null;
  freelancer?: Record<string, unknown>;
  employer?: Record<string, unknown>;
};
