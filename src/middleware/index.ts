// Middleware barrel export
// This file will export all middleware as they are created

export { errorHandler } from './error-handler';
export { requestLogger } from './request-logger';
export { authMiddleware, requireRole } from './auth-middleware';
export {
  validate,
  validateRequest,
  validateUUID,
  isValidUUID,
  // Auth schemas
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  // Freelancer profile schemas
  createFreelancerProfileSchema,
  updateFreelancerProfileSchema,
  addSkillsSchema,
  addExperienceSchema,
  // Employer profile schemas
  createEmployerProfileSchema,
  updateEmployerProfileSchema,
  // Project schemas
  createProjectSchema,
  updateProjectSchema,
  addMilestonesSchema,
  // Proposal schemas
  submitProposalSchema,
  // Dispute schemas
  createDisputeSchema,
  submitEvidenceSchema,
  resolveDisputeSchema,
  // Reputation schemas
  submitRatingSchema,
  // Skill taxonomy schemas
  createSkillCategorySchema,
  createSkillSchema,
  // Notification schemas
  markNotificationReadSchema,
  // Search schemas
  searchProjectsSchema,
  searchFreelancersSchema,
  // Matching schemas
  extractSkillsSchema,
  // Payment schemas
  milestoneActionSchema,
  disputeMilestoneSchema,
  // Common schemas
  idParamSchema,
  uuidParamSchema,
} from './validation-middleware';
export type { RequestSchema } from './validation-middleware';
