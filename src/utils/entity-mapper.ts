// Entity mapper utilities for converting between database entities (snake_case) and API models (camelCase)

import { UserEntity } from '../repositories/user-repository.js';
import { FreelancerProfileEntity } from '../repositories/freelancer-profile-repository.js';
import { EmployerProfileEntity } from '../repositories/employer-profile-repository.js';
import { ProjectEntity, MilestoneEntity } from '../repositories/project-repository.js';
import { ProposalEntity } from '../repositories/proposal-repository.js';
import { ContractEntity } from '../repositories/contract-repository.js';
import { DisputeEntity, EvidenceEntity } from '../repositories/dispute-repository.js';
import { SkillEntity, SkillCategoryEntity } from '../repositories/skill-repository.js';
import { NotificationEntity } from '../repositories/notification-repository.js';

// User mapping
export type KycStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected' | 'expired';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  role: 'freelancer' | 'employer' | 'admin';
  walletAddress: string;
  kycStatus?: KycStatus;
  createdAt: string;
  updatedAt: string;
};

export function mapUserFromEntity(entity: UserEntity, kycStatus?: string): User {
  return {
    id: entity.id,
    email: entity.email,
    passwordHash: entity.password_hash,
    role: entity.role,
    walletAddress: entity.wallet_address,
    kycStatus: kycStatus as any,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

export function mapUserToEntity(user: Omit<User, 'createdAt' | 'updatedAt'>): Omit<UserEntity, 'created_at' | 'updated_at'> {
  return {
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    role: user.role,
    wallet_address: user.walletAddress,
    name: '',
  };
}

// Skill mapping
export type SkillCategory = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Skill = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function mapSkillCategoryFromEntity(entity: SkillCategoryEntity): SkillCategory {
  if (!entity) {
    throw new Error('Cannot map null or undefined SkillCategoryEntity');
  }
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    isActive: entity.is_active,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

export function mapSkillFromEntity(entity: SkillEntity): Skill {
  if (!entity) {
    throw new Error('Cannot map null or undefined SkillEntity');
  }
  return {
    id: entity.id,
    categoryId: entity.category_id,
    name: entity.name,
    description: entity.description,
    isActive: entity.is_active,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// SkillReference for profiles (simplified - just name and experience)
export type SkillReference = {
  name: string;
  yearsOfExperience: number;
};

type SkillRefEntity = { name: string; years_of_experience: number };

function mapSkillRefFromEntity(entity: SkillRefEntity): SkillReference {
  return {
    name: entity.name,
    yearsOfExperience: entity.years_of_experience,
  };
}

function mapSkillRefToEntity(ref: SkillReference): SkillRefEntity {
  return {
    name: ref.name,
    years_of_experience: ref.yearsOfExperience,
  };
}

// ProjectSkillReference for projects (can be more detailed if needed)
export type ProjectSkillReference = {
  skillId?: string;
  skillName: string;
  categoryId?: string;
};

type ProjectSkillRefEntity = { skill_id?: string; skill_name: string; category_id?: string };

function mapProjectSkillRefFromEntity(entity: ProjectSkillRefEntity): ProjectSkillReference {
  const result: ProjectSkillReference = {
    skillName: entity.skill_name,
  };
  if (entity.skill_id) result.skillId = entity.skill_id;
  if (entity.category_id) result.categoryId = entity.category_id;
  return result;
}

// FreelancerProfile mapping
export type WorkExperience = {
  id: string;
  title: string;
  company: string;
  description: string;
  startDate: string;
  endDate: string | null;
};

export type FreelancerProfile = {
  id: string;
  userId: string;
  name: string | null;
  nationality: string | null;
  bio: string;
  hourlyRate: number;
  skills: SkillReference[];
  experience: WorkExperience[];
  availability: 'available' | 'busy' | 'unavailable';
  createdAt: string;
  updatedAt: string;
};

type ExpEntity = { id: string; title: string; company: string; description: string; start_date: string; end_date: string | null };

export function mapFreelancerProfileFromEntity(entity: FreelancerProfileEntity): FreelancerProfile {
  if (!entity) {
    throw new Error('Cannot map null or undefined FreelancerProfileEntity');
  }
  return {
    id: entity.id,
    userId: entity.user_id,
    name: entity.name,
    nationality: entity.nationality,
    bio: entity.bio,
    hourlyRate: entity.hourly_rate,
    skills: (entity.skills || []).map(mapSkillRefFromEntity),
    experience: (entity.experience || []).map((e: ExpEntity) => ({
      id: e.id,
      title: e.title,
      company: e.company,
      description: e.description,
      startDate: e.start_date,
      endDate: e.end_date,
    })),
    availability: entity.availability,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// EmployerProfile mapping
export type EmployerProfile = {
  id: string;
  userId: string;
  name: string | null;
  nationality: string | null;
  companyName: string;
  description: string;
  industry: string;
  createdAt: string;
  updatedAt: string;
};

export function mapEmployerProfileFromEntity(entity: EmployerProfileEntity): EmployerProfile {
  if (!entity) {
    throw new Error('Cannot map null or undefined EmployerProfileEntity');
  }
  return {
    id: entity.id,
    userId: entity.user_id,
    name: entity.name,
    nationality: entity.nationality,
    companyName: entity.company_name,
    description: entity.description,
    industry: entity.industry,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// Project mapping
export type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'disputed';
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
  createdAt: string;
  updatedAt: string;
};

export function mapMilestoneFromEntity(entity: MilestoneEntity): Milestone {
  return {
    id: entity.id,
    title: entity.title,
    description: entity.description,
    amount: entity.amount,
    dueDate: entity.due_date,
    status: entity.status,
  };
}

export function mapProjectFromEntity(entity: ProjectEntity): Project {
  if (!entity) {
    throw new Error('Cannot map null or undefined ProjectEntity');
  }
  return {
    id: entity.id,
    employerId: entity.employer_id,
    title: entity.title,
    description: entity.description,
    requiredSkills: (entity.required_skills || []).map(mapProjectSkillRefFromEntity),
    budget: entity.budget,
    deadline: entity.deadline,
    status: entity.status,
    milestones: (entity.milestones || []).map(mapMilestoneFromEntity),
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// Proposal mapping
import { FileAttachment } from './file-validator.js';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type Proposal = {
  id: string;
  projectId: string;
  freelancerId: string;
  coverLetter: string | null;
  attachments: FileAttachment[];
  proposedRate: number;
  estimatedDuration: number;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
};

export function mapProposalFromEntity(entity: ProposalEntity): Proposal {
  if (!entity) {
    throw new Error('Cannot map null or undefined ProposalEntity');
  }
  return {
    id: entity.id,
    projectId: entity.project_id,
    freelancerId: entity.freelancer_id,
    coverLetter: entity.cover_letter,
    attachments: entity.attachments || [],
    proposedRate: entity.proposed_rate,
    estimatedDuration: entity.estimated_duration,
    status: entity.status,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// Contract mapping
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

export function mapContractFromEntity(entity: ContractEntity): Contract {
  if (!entity) {
    throw new Error('Cannot map null or undefined ContractEntity');
  }
  return {
    id: entity.id,
    projectId: entity.project_id,
    proposalId: entity.proposal_id,
    freelancerId: entity.freelancer_id,
    employerId: entity.employer_id,
    escrowAddress: entity.escrow_address,
    totalAmount: entity.total_amount,
    status: entity.status,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// Dispute mapping
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

export function mapEvidenceFromEntity(entity: EvidenceEntity): Evidence {
  return {
    id: entity.id,
    submitterId: entity.submitter_id,
    type: entity.type,
    content: entity.content,
    submittedAt: entity.submitted_at,
  };
}

export function mapDisputeFromEntity(entity: DisputeEntity): Dispute {
  return {
    id: entity.id,
    contractId: entity.contract_id,
    milestoneId: entity.milestone_id,
    initiatorId: entity.initiator_id,
    reason: entity.reason,
    evidence: (entity.evidence || []).map(mapEvidenceFromEntity),
    status: entity.status,
    resolution: entity.resolution ? {
      decision: entity.resolution.decision,
      reasoning: entity.resolution.reasoning,
      resolvedBy: entity.resolution.resolved_by,
      resolvedAt: entity.resolution.resolved_at,
    } : null,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// Notification mapping
export type NotificationType =
  | 'proposal_received'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'payment_released'
  | 'dispute_created'
  | 'dispute_resolved'
  | 'rating_received'
  | 'message';

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
};

export function mapNotificationFromEntity(entity: NotificationEntity): Notification {
  return {
    id: entity.id,
    userId: entity.user_id,
    type: entity.type,
    title: entity.title,
    message: entity.message,
    data: entity.data,
    isRead: entity.is_read,
    createdAt: entity.created_at,
  };
}

// Export skill ref mapper for use in services
export { mapSkillRefToEntity };
