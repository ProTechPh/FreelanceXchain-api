export type ContractStatus = 'active' | 'completed' | 'disputed' | 'cancelled';

export type Contract = {
  id: string;
  projectId: string;
  proposalId: string;
  freelancerId: string;
  employerId: string;
  escrowAddress: string;
  totalAmount: number;
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
};
