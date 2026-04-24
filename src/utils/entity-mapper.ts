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
import { RushUpgradeRequestEntity } from '../repositories/rush-upgrade-request-repository.js';

// Import domain types from models
import type { User, KycStatus } from '../models/user.js';
import type { Skill, SkillCategory, SkillReference, ProjectSkillReference } from '../models/skill.js';
import type { FreelancerProfile } from '../models/freelancer-profile.js';
import type { EmployerProfile } from '../models/employer-profile.js';
import type { Project, Milestone } from '../models/project.js';
import type { Proposal } from '../models/proposal.js';
import type { Contract } from '../models/contract.js';
import type { Dispute, Evidence } from '../models/dispute.js';
import type { Notification } from '../models/notification.js';
import type { RushUpgradeRequest } from '../models/rush-upgrade-request.js';

// Re-export types for backward compatibility
export type { User, KycStatus } from '../models/user.js';
export type { Skill, SkillCategory, SkillReference, ProjectSkillReference } from '../models/skill.js';
export type { FreelancerProfile, WorkExperience } from '../models/freelancer-profile.js';
export type { EmployerProfile } from '../models/employer-profile.js';
export type { Project, Milestone, MilestoneStatus, ProjectStatus } from '../models/project.js';
export type { Proposal, ProposalStatus } from '../models/proposal.js';
export type { Contract, ContractStatus } from '../models/contract.js';
export type { Dispute, Evidence, DisputeResolution, DisputeStatus } from '../models/dispute.js';
export type { Notification, NotificationType } from '../models/notification.js';
export type { RushUpgradeRequest, RushUpgradeRequestStatus } from '../models/rush-upgrade-request.js';

// Internal helper types
type SkillRefEntity = { name: string; years_of_experience: number };
type ProjectSkillRefEntity = { skill_id?: string; skill_name: string; category_id?: string; years_of_experience?: number };
type ExpEntity = { id: string; title: string; company: string; description: string; start_date: string; end_date: string | null };

// User mapping functions
export function mapUserFromEntity(entity: UserEntity, kycStatus?: string): User {
  return {
    id: entity.id,
    email: entity.email,
    name: entity.name ?? '',
    role: entity.role,
    walletAddress: entity.wallet_address,
    kycStatus: kycStatus as KycStatus | undefined,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

export function mapUserToEntity(user: Omit<User, 'createdAt' | 'updatedAt'>): Omit<UserEntity, 'created_at' | 'updated_at'> {
  return {
    id: user.id,
    email: user.email,
    password_hash: '',
    role: user.role,
    wallet_address: user.walletAddress,
    name: user.name,
    is_suspended: false,
    suspension_reason: null,
  };
}

// Skill mapping functions
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

function mapProjectSkillRefFromEntity(entity: ProjectSkillRefEntity): ProjectSkillReference {
  const result: ProjectSkillReference = {
    skillName: entity.skill_name,
  };
  if (entity.skill_id) result.skillId = entity.skill_id;
  if (entity.category_id) result.categoryId = entity.category_id;
  if (entity.years_of_experience !== undefined) result.yearsOfExperience = entity.years_of_experience;
  return result;
}

// FreelancerProfile mapping functions
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

// EmployerProfile mapping functions
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

// Project mapping functions
export function mapMilestoneFromEntity(entity: MilestoneEntity): Milestone {
  const contractId = entity.contractId || entity.contract_id;
  const submittedAt = entity.submittedAt || entity.submitted_at;
  const approvedAt = entity.approvedAt || entity.approved_at;
  const rejectedAt = entity.rejectedAt || entity.rejected_at;
  const completedAt = entity.completedAt || entity.completed_at;
  const rejectionReason = entity.rejectionReason || entity.rejection_reason || null;

  return {
    id: entity.id,
    title: entity.title,
    description: entity.description,
    amount: entity.amount,
    dueDate: entity.dueDate || entity.due_date,
    status: entity.status,
    deliverableFiles: entity.deliverableFiles || entity.deliverable_files || [],
    revisionCount: entity.revisionCount ?? entity.revision_count ?? 0,
    notes: (entity as any).notes,
    ...(contractId !== undefined ? { contractId } : {}),
    ...(submittedAt !== undefined ? { submittedAt } : {}),
    ...(approvedAt !== undefined ? { approvedAt } : {}),
    ...(rejectedAt !== undefined ? { rejectedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...(rejectionReason !== undefined ? { rejectionReason } : {}),
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
    isRush: entity.is_rush ?? false,
    rushFeePercentage: entity.rush_fee_percentage ?? 25,
    status: entity.status,
    milestones: (entity.milestones || []).map(mapMilestoneFromEntity),
    tags: entity.tags || [],
    attachments: entity.attachments || [],
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// Proposal mapping functions
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

// Contract mapping functions
export function mapContractFromEntity(entity: ContractEntity & { project?: any; freelancer?: any; employer?: any }): Contract {
  if (!entity) {
    throw new Error('Cannot map null or undefined ContractEntity');
  }
  
  const freelancerData = entity.freelancer ? {
    id: entity.freelancer.id,
    name: entity.freelancer.name,
    email: entity.freelancer.email,
    bio: entity.freelancer.freelancer_profile?.[0]?.bio,
    hourlyRate: entity.freelancer.freelancer_profile?.[0]?.hourly_rate,
    availability: entity.freelancer.freelancer_profile?.[0]?.availability,
  } : undefined;
  
  const employerData = entity.employer ? {
    id: entity.employer.id,
    name: entity.employer.name,
    email: entity.employer.email,
    companyName: entity.employer.employer_profile?.[0]?.company_name,
    industry: entity.employer.employer_profile?.[0]?.industry,
    description: entity.employer.employer_profile?.[0]?.description,
  } : undefined;
  
  return {
    id: entity.id,
    projectId: entity.project_id,
    proposalId: entity.proposal_id,
    freelancerId: entity.freelancer_id,
    employerId: entity.employer_id,
    escrowAddress: entity.escrow_address,
    baseAmount: entity.base_amount,
    rushFee: entity.rush_fee,
    totalAmount: entity.total_amount,
    status: entity.status,
    title: entity.project?.title,
    description: entity.project?.description,
    startDate: entity.created_at,
    endDate: entity.project?.deadline,
    milestones: entity.project?.milestones || [],
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
    project: entity.project,
    freelancer: freelancerData,
    employer: employerData,
  };
}

// Dispute mapping functions
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

// Notification mapping functions
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
    updatedAt: entity.updated_at,
  };
}

// Export skill ref mapper for use in services
export { mapSkillRefToEntity };

// RushUpgradeRequest mapping functions
export function mapRushUpgradeRequestFromEntity(entity: RushUpgradeRequestEntity): RushUpgradeRequest {
  if (!entity) {
    throw new Error('Cannot map null or undefined RushUpgradeRequestEntity');
  }
  return {
    id: entity.id,
    contractId: entity.contract_id,
    requestedBy: entity.requested_by,
    proposedPercentage: entity.proposed_percentage,
    counterPercentage: entity.counter_percentage,
    status: entity.status,
    respondedBy: entity.responded_by,
    respondedAt: entity.responded_at,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}
