// Contract domain types
export type ContractStatus = 'pending' | 'active' | 'completed' | 'disputed' | 'cancelled';

export type Contract = {
  id: string;
  projectId: string;
  proposalId: string;
  freelancerId: string;
  employerId: string;
  escrowAddress: string;
  totalAmount: number;
  status: ContractStatus;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  milestones?: any[];
  createdAt: string;
  updatedAt: string;
  // Extended fields
  project?: any;
  freelancer?: any;
  employer?: any;
};
