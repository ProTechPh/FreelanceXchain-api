/**
 * Canonical MilestoneStatus — superset of all milestone lifecycle states.
 *
 * Project-context values: 'pending' | 'in_progress' | 'submitted' | 'releasing' | 'approved' | 'disputed' | 'refunded'
 * Standalone values:      'pending' | 'submitted' | 'approved' | 'rejected' | 'disputed' | 'completed'
 */
export type MilestoneStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'releasing'
  | 'approved'
  | 'rejected'
  | 'disputed'
  | 'refunded'
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
  dueDate: string;
  status: MilestoneStatus;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  completedAt?: string;
  deliverableFiles?: FileAttachment[];
  rejectionReason?: string;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
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
