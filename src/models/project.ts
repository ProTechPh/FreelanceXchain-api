import type { SkillReference } from './freelancer-profile.js';

export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';

export type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'disputed';

export type Milestone = {
  id: string;
  title: string;
  description: string;
  amount: number;
  dueDate: string;
  status: MilestoneStatus;
};

export type Project = {
  id: string;
  employerId: string;
  title: string;
  description: string;
  requiredSkills: SkillReference[];
  budget: number;
  deadline: string;
  status: ProjectStatus;
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
};
