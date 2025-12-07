export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type Proposal = {
  id: string;
  projectId: string;
  freelancerId: string;
  coverLetter: string;
  proposedRate: number;
  estimatedDuration: number;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
};
