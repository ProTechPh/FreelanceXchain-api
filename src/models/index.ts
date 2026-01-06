// Models barrel export
// This file will export all data models as they are created

export type { User, UserRole } from './user.js';
export type { FreelancerProfile, SkillReference, WorkExperience } from './freelancer-profile.js';
export type { EmployerProfile } from './employer-profile.js';
export type { Project, Milestone, ProjectStatus, MilestoneStatus } from './project.js';
export type { Proposal, ProposalStatus } from './proposal.js';
export type { Contract, ContractStatus } from './contract.js';
export type { Dispute, Evidence, DisputeResolution, DisputeStatus } from './dispute.js';
export type { 
  Skill, 
  SkillCategory, 
  CreateSkillCategoryInput, 
  CreateSkillInput, 
  SkillWithCategory, 
  SkillTaxonomy 
} from './skill.js';
export type { Notification, NotificationType } from './notification.js';
export type {
  KycStatus,
  DocumentType,
  LivenessCheckStatus,
  LivenessCheck,
  LivenessChallenge,
  KycDocument,
  MrzData,
  OcrExtractedData,
  InternationalAddress,
  KycVerification,
  KycTier,
  KycRejectionCode,
  KycSubmissionInput,
  LivenessSessionInput,
  LivenessVerificationInput,
  FaceMatchInput,
  KycReviewInput,
  SupportedCountry,
} from './kyc.js';
