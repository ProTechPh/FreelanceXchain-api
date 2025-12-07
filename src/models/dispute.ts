export type DisputeStatus = 'open' | 'under_review' | 'resolved';

export type Evidence = {
  id: string;
  submitterId: string;
  type: 'text' | 'file' | 'link';
  content: string;
  submittedAt: string;
};

export type DisputeResolution = {
  decision: 'freelancer_favor' | 'employer_favor' | 'split';
  reasoning: string;
  resolvedBy: string;
  resolvedAt: string;
};

export type Dispute = {
  id: string;
  contractId: string;
  milestoneId: string;
  initiatorId: string;
  reason: string;
  evidence: Evidence[];
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  createdAt: string;
  updatedAt: string;
};
