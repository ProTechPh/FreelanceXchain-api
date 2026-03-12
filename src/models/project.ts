// Project domain types
import type { ProjectSkillReference } from './skill.js';

export type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'disputed' | 'refunded';
export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';

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
  requiredSkills: ProjectSkillReference[];
  budget: number;
  deadline: string;
  status: ProjectStatus;
  milestones: Milestone[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
