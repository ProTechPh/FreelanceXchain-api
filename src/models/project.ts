// Project domain types
import type { ProjectSkillReference } from './skill.js';
import type { FileAttachment, MilestoneStatus } from './milestone.js';

export type { MilestoneStatus } from './milestone.js';
export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';

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
  freelancerLimit: number;
  tags: string[];
  attachments: FileAttachment[];
  proposalCount?: number;
  employer?: {
    id: string;
    userId?: string;
    name: string;
    companyName?: string;
    description?: string;
    industry?: string;
  };
  createdAt: string;
  updatedAt: string;
};
