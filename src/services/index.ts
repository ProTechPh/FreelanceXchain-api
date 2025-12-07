// Services barrel export
// This file will export all services as they are created

export {
  register,
  login,
  validateToken,
  refreshTokens,
  isAuthError,
} from './auth-service.js';

export type {
  RegisterInput,
  LoginInput,
  TokenPayload,
  AuthResult,
  AuthError,
} from './auth-types.js';

export {
  createCategory,
  getCategoryById,
  updateCategory,
  getAllCategories,
  getActiveCategories,
  createSkill,
  getSkillById,
  updateSkill,
  deprecateSkill,
  getAllSkills,
  getActiveSkills,
  getSkillsByCategory,
  getActiveSkillsByCategory,
  searchSkills,
  getFullTaxonomy,
  validateSkillIds,
} from './skill-service.js';

export type {
  SkillServiceError,
  SkillServiceResult,
} from './skill-service.js';

export {
  createProfile as createFreelancerProfile,
  getProfileByUserId as getFreelancerProfileByUserId,
  updateProfile as updateFreelancerProfile,
  addSkillsToProfile,
  removeSkillFromProfile,
  addExperience,
  updateExperience,
  removeExperience,
} from './freelancer-profile-service.js';

export type {
  CreateFreelancerProfileInput,
  UpdateFreelancerProfileInput,
  AddSkillInput,
  AddExperienceInput,
  FreelancerProfileServiceError,
  FreelancerProfileServiceResult,
} from './freelancer-profile-service.js';

export {
  createEmployerProfile,
  getEmployerProfileByUserId,
  updateEmployerProfile,
} from './employer-profile-service.js';

export type {
  CreateEmployerProfileInput,
  UpdateEmployerProfileInput,
  EmployerProfileServiceError,
  EmployerProfileServiceResult,
} from './employer-profile-service.js';

export {
  createProject,
  getProjectById,
  updateProject,
  addMilestones,
  setMilestones,
  listProjectsByEmployer,
  listOpenProjects,
  listProjectsByStatus,
  searchProjects as searchProjectsByKeyword,
  listProjectsBySkills,
  listProjectsByBudgetRange,
  deleteProject,
} from './project-service.js';

export type {
  CreateProjectInput,
  UpdateProjectInput,
  AddMilestoneInput,
  ProjectWithProposalCount,
  ProjectServiceError,
  ProjectServiceResult,
} from './project-service.js';

export {
  searchProjects,
  searchFreelancers,
} from './search-service.js';

export type {
  ProjectSearchFilters,
  FreelancerSearchFilters,
  SearchPaginationInput,
  SearchResultMetadata,
  SearchResult,
  SearchServiceError,
  SearchServiceResult,
} from './search-service.js';
