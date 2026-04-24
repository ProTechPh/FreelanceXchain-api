import { projectRepository, ProjectEntity, MilestoneEntity, ProjectStatus, MilestoneStatus } from '../repositories/project-repository.js';
import { proposalRepository } from '../repositories/proposal-repository.js';
import { skillRepository } from '../repositories/skill-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';
import { generateId } from '../utils/id.js';
import { FileAttachment, validateAttachments } from '../utils/file-validator.js';
import type { ServiceResult, ServiceError } from '../types/service-result.js';

export type CreateProjectInput = {
  title: string;
  description: string;
  requiredSkills: { skillId: string }[];
  budget: number;
  deadline: string;
  isRush?: boolean;
  rushFeePercentage?: number;
  tags?: string[];
  attachments?: FileAttachment[];
};

export type UpdateProjectInput = {
  title?: string;
  description?: string;
  requiredSkills?: { skillId: string }[];
  budget?: number;
  deadline?: string;
  isRush?: boolean;
  rushFeePercentage?: number;
  status?: ProjectStatus;
  tags?: string[];
  attachments?: FileAttachment[];
};

export type AddMilestoneInput = {
  title: string;
  description: string;
  amount: number;
  dueDate: string;
};

export type ProjectWithProposalCount = ProjectEntity & {
  proposalCount: number;
};

export type ProjectServiceResult<T> = ServiceResult<T>;
export type ProjectServiceError = ServiceError;

type SkillRef = { skill_id: string; skill_name: string; category_id: string; years_of_experience: number };

function validateMilestoneBudget(milestones: MilestoneEntity[], totalBudget: number): { valid: boolean; message?: string } {
  const milestoneSum = milestones.reduce((sum, m) => sum + m.amount, 0);
  if (milestoneSum !== totalBudget) {
    return {
      valid: false,
      message: `Milestone amounts sum (${milestoneSum}) must equal total budget (${totalBudget})`,
    };
  }
  return { valid: true };
}

async function validateSkills(skillIds: string[]): Promise<{ valid: boolean; invalidIds: string[] }> {
  const invalidIds: string[] = [];
  for (const skillId of skillIds) {
    const skill = await skillRepository.findSkillById(skillId);
    if (!skill || !skill.is_active) {
      invalidIds.push(skillId);
    }
  }
  return { valid: invalidIds.length === 0, invalidIds };
}

async function buildSkillReferences(skillIds: string[]): Promise<SkillRef[]> {
  const skillRefs: SkillRef[] = [];
  for (const skillId of skillIds) {
    const skill = await skillRepository.findSkillById(skillId);
    if (skill && skill.is_active) {
      skillRefs.push({
        skill_id: skill.id,
        skill_name: skill.name,
        category_id: skill.category_id,
        years_of_experience: 0,
      });
    }
  }
  return skillRefs;
}

export async function createProject(
  employerId: string,
  input: CreateProjectInput
): Promise<ProjectServiceResult<ProjectEntity>> {
  // Validate attachments if provided
  if (input.attachments && input.attachments.length > 0) {
    const attachmentErrors = validateAttachments(input.attachments, { maxFiles: 10 });
    if (attachmentErrors.length > 0) {
      return {
        success: false,
        error: { 
          code: 'VALIDATION_ERROR', 
          message: 'Invalid attachments',
          details: attachmentErrors.map(e => e.message),
        },
      };
    }
  }

  const skillIds = input.requiredSkills.map(s => s.skillId);
  const skillValidation = await validateSkills(skillIds);
  
  if (!skillValidation.valid) {
    return {
      success: false,
      error: {
        code: 'INVALID_SKILL',
        message: 'One or more skill IDs are invalid or inactive',
        details: skillValidation.invalidIds,
      },
    };
  }

  const skillRefs = await buildSkillReferences(skillIds);

  // Validate rush fee percentage if provided
  if (input.isRush && input.rushFeePercentage !== undefined) {
    if (input.rushFeePercentage <= 0 || input.rushFeePercentage > 100) {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Rush fee percentage must be between 0.01 and 100' },
      };
    }
  }

  const projectInput = {
    id: generateId(),
    employer_id: employerId,
    title: input.title,
    description: input.description,
    required_skills: skillRefs,
    budget: input.budget,
    deadline: input.deadline,
    is_rush: input.isRush ?? false,
    rush_fee_percentage: input.rushFeePercentage ?? 25,
    status: 'open' as ProjectStatus,
    milestones: [],
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
  };

  const created = await projectRepository.createProject(projectInput);
  return { success: true, data: created };
}

export async function getProjectById(projectId: string): Promise<ProjectServiceResult<ProjectEntity>> {
  const project = await projectRepository.findProjectById(projectId);
  if (!project) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  return { success: true, data: project };
}

export async function updateProject(
  projectId: string,
  employerId: string,
  input: UpdateProjectInput
): Promise<ProjectServiceResult<ProjectEntity>> {
  const existingProject = await projectRepository.getProjectById(projectId);
  if (!existingProject) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  
  if (existingProject.employer_id !== employerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authorized to update this project' },
    };
  }

  const hasAccepted = await proposalRepository.hasAcceptedProposal(projectId);
  if (hasAccepted) {
    return {
      success: false,
      error: { code: 'PROJECT_LOCKED', message: 'Cannot update project with accepted proposals' },
    };
  }

  let skillRefs = existingProject.required_skills;
  if (input.requiredSkills) {
    const skillIds = input.requiredSkills.map(s => s.skillId);
    const skillValidation = await validateSkills(skillIds);
    
    if (!skillValidation.valid) {
      return {
        success: false,
        error: {
          code: 'INVALID_SKILL',
          message: 'One or more skill IDs are invalid or inactive',
          details: skillValidation.invalidIds,
        },
      };
    }
    skillRefs = await buildSkillReferences(skillIds);
  }

  const newBudget = input.budget ?? existingProject.budget;
  if (existingProject.milestones.length > 0) {
    const budgetValidation = validateMilestoneBudget(existingProject.milestones, newBudget);
    if (!budgetValidation.valid) {
      return {
        success: false,
        error: { code: 'MILESTONE_SUM_MISMATCH', message: budgetValidation.message ?? 'Milestone budget mismatch' },
      };
    }
  }

  // Validate project status transitions
  if (input.status) {
    const validTransitions: Record<string, string[]> = {
      draft: ['open', 'cancelled'],
      open: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],        // Terminal state - no transitions allowed
      cancelled: [],        // Terminal state - no transitions allowed
    };

    const currentStatus = existingProject.status;
    const allowedNextStatuses = validTransitions[currentStatus] ?? [];
    if (!allowedNextStatuses.includes(input.status)) {
      return {
        success: false,
        error: { 
          code: 'INVALID_STATUS_TRANSITION', 
          message: `Cannot transition project from "${currentStatus}" to "${input.status}". Allowed: ${allowedNextStatuses.join(', ') || 'none (terminal state)'}` 
        },
      };
    }
  }

  // Validate rush fee percentage if provided
  if (input.isRush && input.rushFeePercentage !== undefined) {
    if (input.rushFeePercentage <= 0 || input.rushFeePercentage > 100) {
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Rush fee percentage must be between 0.01 and 100' },
      };
    }
  }

  const updates: Partial<ProjectEntity> = {
    ...(input.title && { title: input.title }),
    ...(input.description && { description: input.description }),
    ...(input.requiredSkills && { required_skills: skillRefs }),
    ...(input.budget !== undefined && { budget: input.budget }),
    ...(input.deadline && { deadline: input.deadline }),
    ...(input.isRush !== undefined && { is_rush: input.isRush }),
    ...(input.rushFeePercentage !== undefined && { rush_fee_percentage: input.rushFeePercentage }),
    ...(input.status && { status: input.status }),
  };

  const updated = await projectRepository.updateProject(projectId, updates);
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update project' },
    };
  }

  return { success: true, data: updated };
}

export async function addMilestones(
  projectId: string,
  employerId: string,
  milestones: AddMilestoneInput[]
): Promise<ProjectServiceResult<ProjectEntity>> {
  const existingProject = await projectRepository.getProjectById(projectId);
  if (!existingProject || existingProject.employer_id !== employerId) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  const hasAccepted = await proposalRepository.hasAcceptedProposal(projectId);
  if (hasAccepted) {
    return {
      success: false,
      error: { code: 'PROJECT_LOCKED', message: 'Cannot modify milestones for project with accepted proposals' },
    };
  }

  const newMilestones: MilestoneEntity[] = milestones.map(m => ({
    id: generateId(),
    title: m.title,
    description: m.description,
    amount: m.amount,
    due_date: m.dueDate,
    status: 'pending' as MilestoneStatus,
  }));

  const allMilestones = [...existingProject.milestones, ...newMilestones];
  
  const budgetValidation = validateMilestoneBudget(allMilestones, existingProject.budget);
  if (!budgetValidation.valid) {
    return {
      success: false,
      error: { code: 'MILESTONE_SUM_MISMATCH', message: budgetValidation.message ?? 'Milestone budget mismatch' },
    };
  }

  const updated = await projectRepository.updateProject(projectId, { milestones: allMilestones });
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to add milestones' },
    };
  }

  return { success: true, data: updated };
}

export async function setMilestones(
  projectId: string,
  employerId: string,
  milestones: AddMilestoneInput[]
): Promise<ProjectServiceResult<ProjectEntity>> {
  const existingProject = await projectRepository.getProjectById(projectId);
  if (!existingProject || existingProject.employer_id !== employerId) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  const hasAccepted = await proposalRepository.hasAcceptedProposal(projectId);
  if (hasAccepted) {
    return {
      success: false,
      error: { code: 'PROJECT_LOCKED', message: 'Cannot modify milestones for project with accepted proposals' },
    };
  }

  const newMilestones: MilestoneEntity[] = milestones.map(m => ({
    id: generateId(),
    title: m.title,
    description: m.description,
    amount: m.amount,
    due_date: m.dueDate,
    status: 'pending' as MilestoneStatus,
  }));

  const budgetValidation = validateMilestoneBudget(newMilestones, existingProject.budget);
  if (!budgetValidation.valid) {
    return {
      success: false,
      error: { code: 'MILESTONE_SUM_MISMATCH', message: budgetValidation.message ?? 'Milestone budget mismatch' },
    };
  }

  const updated = await projectRepository.updateProject(projectId, { milestones: newMilestones });
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to set milestones' },
    };
  }

  return { success: true, data: updated };
}

export async function listProjectsByEmployer(
  employerId: string,
  options?: QueryOptions
): Promise<ProjectServiceResult<PaginatedResult<ProjectWithProposalCount>>> {
  const result = await projectRepository.getProjectsByEmployer(employerId, options);
  
  const projectIds = result.items.map(p => p.id);
  const proposalCounts = projectIds.length > 0
    ? await proposalRepository.getProposalCountsByProjects(projectIds)
    : new Map<string, number>();

  const projectsWithCounts: ProjectWithProposalCount[] = result.items.map((project) => ({
    ...project,
    proposalCount: proposalCounts.get(project.id) ?? 0,
  }));

  return { 
    success: true, 
    data: {
      items: projectsWithCounts,
      hasMore: result.hasMore,
      total: result.total,
    }
  };
}

export async function listOpenProjects(
  options?: QueryOptions
): Promise<ProjectServiceResult<PaginatedResult<ProjectEntity>>> {
  const result = await projectRepository.getAllOpenProjects(options);
  return { success: true, data: result };
}

export async function listProjectsByStatus(
  status: ProjectStatus,
  options?: QueryOptions
): Promise<ProjectServiceResult<PaginatedResult<ProjectEntity>>> {
  const result = await projectRepository.getProjectsByStatus(status, options);
  return { success: true, data: result };
}

export async function searchProjects(
  keyword: string,
  options?: QueryOptions
): Promise<ProjectServiceResult<PaginatedResult<ProjectEntity>>> {
  const result = await projectRepository.searchProjects(keyword, options);
  return { success: true, data: result };
}

export async function listProjectsBySkills(
  skillIds: string[],
  options?: QueryOptions
): Promise<ProjectServiceResult<PaginatedResult<ProjectEntity>>> {
  const result = await projectRepository.getProjectsBySkills(skillIds, options);
  return { success: true, data: result };
}

export async function listProjectsByBudgetRange(
  minBudget: number,
  maxBudget: number,
  options?: QueryOptions
): Promise<ProjectServiceResult<PaginatedResult<ProjectEntity>>> {
  const result = await projectRepository.getProjectsByBudgetRange(minBudget, maxBudget, options);
  return { success: true, data: result };
}

export async function listProjectsByCategory(
  categoryId: string,
  options?: QueryOptions
): Promise<ProjectServiceResult<PaginatedResult<ProjectEntity>>> {
  const result = await projectRepository.getProjectsByCategory(categoryId, options);
  return { success: true, data: result };
}

export async function listProjectsByMultipleCategories(
  categoryIds: string[],
  options?: QueryOptions
): Promise<ProjectServiceResult<PaginatedResult<ProjectEntity>>> {
  const result = await projectRepository.getProjectsByMultipleCategories(categoryIds, options);
  return { success: true, data: result };
}

export async function deleteProject(
  projectId: string,
  employerId: string
): Promise<ProjectServiceResult<boolean>> {
  const existingProject = await projectRepository.getProjectById(projectId);
  if (!existingProject || existingProject.employer_id !== employerId) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  const hasAccepted = await proposalRepository.hasAcceptedProposal(projectId);
  if (hasAccepted) {
    return {
      success: false,
      error: { code: 'PROJECT_LOCKED', message: 'Cannot delete project with accepted proposals' },
    };
  }

  const deleted = await projectRepository.deleteProject(projectId);
  return { success: true, data: deleted };
}
