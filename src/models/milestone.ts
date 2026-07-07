export type MilestoneStatus = 
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'disputed'
  | 'completed';

export type FileAttachment = {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
};

export type Milestone = {
  id: string;
  contractId: string;
  title: string;
  description: string;
  amount: number;
  dueDate: Date;
  status: MilestoneStatus;
  submittedAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  completedAt?: Date;
  deliverableFiles?: FileAttachment[];
  rejectionReason?: string;
  revisionCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SubmitMilestoneInput = {
  milestoneId: string;
  freelancerId: string;
  deliverables: FileAttachment[];
  notes?: string;
};

export type ApproveMilestoneInput = {
  milestoneId: string;
  employerId: string;
  feedback?: string;
};

export type RejectMilestoneInput = {
  milestoneId: string;
  employerId: string;
  reason: string;
  requestRevision: boolean;
};
