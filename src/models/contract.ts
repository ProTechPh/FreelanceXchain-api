// Contract domain types
import type { Milestone } from './milestone.js';

export type ContractStatus = 'pending' | 'active' | 'completed' | 'disputed' | 'resolved' | 'cancelled';

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
  status: ContractStatus;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  milestones?: Milestone[];
  createdAt: string;
  updatedAt: string;
  // Extended relational fields populated by getContractByIdWithRelations;
  // shapes vary by producer, so keep them loosely typed
  project?: Record<string, unknown> | null;
  freelancer?: Record<string, unknown>;
  employer?: Record<string, unknown>;
};
