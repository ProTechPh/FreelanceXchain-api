// Project domain types
import type { ProjectSkillReference } from './skill.js';
import type { FileAttachment } from '../utils/file-validator.js';

export type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'disputed' | 'refunded';
export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';

export type Milestone = {
  id: string;
  title: string;
  description: string;
  amount: number;
  dueDate: string;
  status: MilestoneStatus;
  contractId?: string;
  deliverableFiles?: FileAttachment[];
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  completedAt?: string;
  rejectionReason?: string | null;
  revisionCount?: number;
  notes?: string;
};

export type Project = {
  id: string;
  employerId: string;
  title: string;
  description: string;
  requiredSkills: ProjectSkillReference[];
  budget: number;
  deadline: string;
  isRush: boolean;
  rushFeePercentage: number;
  status: ProjectStatus;
  milestones: Milestone[];
  tags: string[];
  attachments: FileAttachment[];
  createdAt: string;
  updatedAt: string;
};
