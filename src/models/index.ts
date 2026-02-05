// Models barrel export
// This file will export all data models as they are created

export type { User, UserRole } from './user';
export type { FreelancerProfile, SkillReference, WorkExperience } from './freelancer-profile';
export type { EmployerProfile } from './employer-profile';
export type { Project, Milestone, ProjectStatus, MilestoneStatus } from './project';
export type { Proposal, ProposalStatus } from './proposal';
export type { Contract, ContractStatus } from './contract';
export type { Dispute, Evidence, DisputeResolution, DisputeStatus } from './dispute';
export type { 
  Skill, 
  SkillCategory, 
  CreateSkillCategoryInput, 
  CreateSkillInput, 
  SkillWithCategory, 
  SkillTaxonomy 
} from './skill';
export type { Notification, NotificationType } from './notification';
export type {
  KycStatus,
  KycVerification,
  CreateKycVerificationInput,
  UpdateKycVerificationInput,
  DiditSessionStatus,
  DiditVerificationDecision,
  DiditCreateSessionRequest,
  DiditCreateSessionResponse,
  DiditVerificationDecisionResponse,
  DiditWebhookType,
  DiditWebhookStatus,
  DiditWebhookPayload,
  DiditDecisionData,
  DiditApiError,
} from './didit-kyc';
