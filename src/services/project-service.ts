import { projectRepository, ProjectEntity, MilestoneEntity, ProjectStatus, MilestoneStatus } from '../repositories/project-repository.js';
import { proposalRepository } from '../repositories/proposal-repository.js';
import { skillRepository, SkillEntity } from '../repositories/skill-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/types.js';
import { generateId } from '../utils/id.js';
import { FileAttachment, validateAttachments } from '../utils/file-validator.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

type CreateProjectInput = {
  title: string;
  description: string;
  requiredSkills: { skillId: string }[];
  budget: number;
  deadline: string;
  isRush?: boolean;
  rushFeePercentage?: number;
  freelancerLimit?: number;
  tags?: string[];
  attachments?: FileAttachment[];
};

type UpdateProjectInput = {
  title?: string;
  description?: string;
  requiredSkills?: { skillId: string }[];
  budget?: number;
  deadline?: string;
  isRush?: boolean;
  rushFeePercentage?: number;
  freelancerLimit?: number;
  status?: ProjectStatus;
  tags?: string[];
  attachments?: FileAttachment[];
};

type AddMilestoneInput = {
  title: string;
  description: string;
  amount: number;
  dueDate: string;
};

type ProjectWithProposalCount = ProjectEntity & {
  proposalCount: number;
};

async function addProposalCounts(
  result: PaginatedResult<ProjectEntity>
): Promise<PaginatedResult<ProjectWithProposalCount>> {
  const projectIds = result.items.map(project => project.id);
  const proposalCounts = projectIds.length > 0
    ? await proposalRepository.getProposalCountsByProjects(projectIds)
    : new Map<string, number>();

  return {
    ...result,
    items: result.items.map(project => ({
      ...project,
      proposalCount: proposalCounts.get(project.id) ?? 0,
    })),
  };
}

type SkillRef = { skill_id: string; skill_name: string; category_id: string; years_of_experience: number };

function validateMilestoneBudget(milestones: MilestoneEntity[], totalBudget: number): { valid: boolean; message?: string } {
  const milestoneSum = milestones.reduce((sum, m) => sum + m.amount, 0);
  if (Math.abs(milestoneSum - totalBudget) > 0.01) {
    return {
      valid: false,
      message: `Milestone amounts sum (${milestoneSum}) must equal total budget (${totalBudget})`,
    };
  }
  return { valid: true };
}

// Batch skill lookups: a single query for all IDs instead of one query per ID
// (previously validateSkills + buildSkillReferences issued 2N queries per
// create/update — both walked the same list separately). The active list is
// fetched ONCE and shared between validation and reference building, so a
// second, independent query can never diverge from the validation result.
async function fetchActiveSkillsByIds(skillIds: string[]): Promise<SkillEntity[]> {
  const skills = await skillRepository.findSkillsByIds([...new Set(skillIds)]);
  return skills.filter((s) => s.is_active);
}

async function validateSkills(
  skillIds: string[],
  activeSkills?: SkillEntity[]
): Promise<{ valid: boolean; invalidIds: string[] }> {
  const active = activeSkills ?? (await fetchActiveSkillsByIds(skillIds));
  const activeIds = new Set(active.map((s) => s.id));
  const invalidIds = skillIds.filter((skillId) => !activeIds.has(skillId));
  return { valid: invalidIds.length === 0, invalidIds };
}

async function buildSkillReferences(skillIds: string[], activeSkills?: SkillEntity[]): Promise<SkillRef[]> {
  const active = activeSkills ?? (await fetchActiveSkillsByIds(skillIds));
  return active.map((skill) => ({
    skill_id: skill.id,
    skill_name: skill.name,
    category_id: skill.category_id,
    years_of_experience: 0,
  }));
}

export async function createProject(
  employerId: string,
  input: CreateProjectInput
): Promise<ServiceResult<ProjectEntity>> {
  // Validate attachments if provided
  if (input.attachments && input.attachments.length > 0) {
    const attachmentErrors = validateAttachments(input.attachments, { maxFiles: 10 });
    if (attachmentErrors.length > 0) {
      return errorResult('VALIDATION_ERROR', 'Invalid attachments', attachmentErrors.map(e => e.message));
    }
  }

  const skillIds = input.requiredSkills.map(s => s.skillId);
  // Fetch once, share between validation and reference building
  const activeSkills = await fetchActiveSkillsByIds(skillIds);
  const skillValidation = await validateSkills(skillIds, activeSkills);
  
  if (!skillValidation.valid) {
    return errorResult('INVALID_SKILL', 'One or more skill IDs are invalid or inactive', skillValidation.invalidIds);
  }

  const skillRefs = await buildSkillReferences(skillIds, activeSkills);

  // Validate rush fee percentage if provided
  if (input.isRush && input.rushFeePercentage !== undefined) {
    if (input.rushFeePercentage <= 0 || input.rushFeePercentage > 100) {
      return errorResult('VALIDATION_ERROR', 'Rush fee percentage must be between 0.01 and 100');
    }
  }

  // Validate freelancer limit
  if (input.freelancerLimit !== undefined && (input.freelancerLimit < 1 || !Number.isInteger(input.freelancerLimit))) {
    return errorResult('VALIDATION_ERROR', 'Freelancer limit must be a positive integer (minimum 1)');
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
    freelancer_limit: input.freelancerLimit ?? 1,
    status: 'open' as ProjectStatus,
    milestones: [],
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
  };

  const created = await projectRepository.createProject(projectInput);
  return successResult(created);
}

export async function getProjectById(projectId: string): Promise<ServiceResult<ProjectWithProposalCount>> {
  const project = await projectRepository.findProjectById(projectId);
  if (!project) {
    return errorResult('NOT_FOUND', 'Project not found');
  }
  const proposalCount = await proposalRepository.getProposalCountByProject(projectId);
  return successResult({ ...project, proposalCount });
}

export async function updateProject(
  projectId: string,
  employerId: string,
  input: UpdateProjectInput
): Promise<ServiceResult<ProjectEntity>> {
  const existingProject = await projectRepository.getProjectById(projectId);
  if (!existingProject) {
    return errorResult('NOT_FOUND', 'Project not found');
  }
  
  if (existingProject.employer_id !== employerId) {
    return errorResult('UNAUTHORIZED', 'Not authorized to update this project');
  }

  const hasAccepted = await proposalRepository.hasAcceptedProposal(projectId);
  if (hasAccepted) {
    return errorResult('PROJECT_LOCKED', 'Cannot update project with accepted proposals');
  }

  let skillRefs = existingProject.required_skills;
  if (input.requiredSkills) {
    const skillIds = input.requiredSkills.map(s => s.skillId);
    // Fetch once, share between validation and reference building
    const activeSkills = await fetchActiveSkillsByIds(skillIds);
    const skillValidation = await validateSkills(skillIds, activeSkills);
    
    if (!skillValidation.valid) {
      return errorResult('INVALID_SKILL', 'One or more skill IDs are invalid or inactive', skillValidation.invalidIds);
    }
    skillRefs = await buildSkillReferences(skillIds, activeSkills);
  }

  const newBudget = input.budget ?? existingProject.budget;
  if (existingProject.milestones.length > 0) {
    const budgetValidation = validateMilestoneBudget(existingProject.milestones, newBudget);
    if (!budgetValidation.valid) {
      return errorResult('MILESTONE_SUM_MISMATCH', budgetValidation.message ?? 'Milestone budget mismatch');
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
      return errorResult('INVALID_STATUS_TRANSITION', `Cannot transition project from "${currentStatus}" to "${input.status}". Allowed: ${allowedNextStatuses.join(', ') || 'none (terminal state)'}`);
    }
  }

  // Validate rush fee percentage if provided
  if (input.isRush && input.rushFeePercentage !== undefined) {
    if (input.rushFeePercentage <= 0 || input.rushFeePercentage > 100) {
      return errorResult('VALIDATION_ERROR', 'Rush fee percentage must be between 0.01 and 100');
    }
  }

  // Validate freelancer limit if provided
  if (input.freelancerLimit !== undefined && (input.freelancerLimit < 1 || !Number.isInteger(input.freelancerLimit))) {
    return errorResult('VALIDATION_ERROR', 'Freelancer limit must be a positive integer (minimum 1)');
  }

  const updates: Partial<ProjectEntity> = {
    ...(input.title && { title: input.title }),
    ...(input.description && { description: input.description }),
    ...(input.requiredSkills && { required_skills: skillRefs }),
    ...(input.budget !== undefined && { budget: input.budget }),
    ...(input.deadline && { deadline: input.deadline }),
    ...(input.isRush !== undefined && { is_rush: input.isRush }),
    ...(input.rushFeePercentage !== undefined && { rush_fee_percentage: input.rushFeePercentage }),
    ...(input.freelancerLimit !== undefined && { freelancer_limit: input.freelancerLimit }),
    ...(input.status && { status: input.status }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.attachments !== undefined && { attachments: input.attachments }),
  };

  const updated = await projectRepository.updateProject(projectId, updates);
  if (!updated) {
    return errorResult('UPDATE_FAILED', 'Failed to update project');
  }

  return successResult(updated);
}

export async function addMilestones(
  projectId: string,
  employerId: string,
  milestones: AddMilestoneInput[]
): Promise<ServiceResult<ProjectEntity>> {
  const existingProject = await projectRepository.getProjectById(projectId);
  if (!existingProject || existingProject.employer_id !== employerId) {
    return errorResult('NOT_FOUND', 'Project not found');
  }

  const hasAccepted = await proposalRepository.hasAcceptedProposal(projectId);
  if (hasAccepted) {
    return errorResult('PROJECT_LOCKED', 'Cannot modify milestones for project with accepted proposals');
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
    return errorResult('MILESTONE_SUM_MISMATCH', budgetValidation.message ?? 'Milestone budget mismatch');
  }

  const updated = await projectRepository.updateProject(projectId, { milestones: allMilestones });
  if (!updated) {
    return errorResult('UPDATE_FAILED', 'Failed to add milestones');
  }

  return successResult(updated);
}

export async function setMilestones(
  projectId: string,
  employerId: string,
  milestones: AddMilestoneInput[]
): Promise<ServiceResult<ProjectEntity>> {
  const existingProject = await projectRepository.getProjectById(projectId);
  if (!existingProject || existingProject.employer_id !== employerId) {
    return errorResult('NOT_FOUND', 'Project not found');
  }

  const hasAccepted = await proposalRepository.hasAcceptedProposal(projectId);
  if (hasAccepted) {
    return errorResult('PROJECT_LOCKED', 'Cannot modify milestones for project with accepted proposals');
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
    return errorResult('MILESTONE_SUM_MISMATCH', budgetValidation.message ?? 'Milestone budget mismatch');
  }

  const updated = await projectRepository.updateProject(projectId, { milestones: newMilestones });
  if (!updated) {
    return errorResult('UPDATE_FAILED', 'Failed to set milestones');
  }

  return successResult(updated);
}

export async function listProjectsByEmployer(
  employerId: string,
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<ProjectWithProposalCount>>> {
  const result = await projectRepository.getProjectsByEmployer(employerId, options);
  
  const projectIds = result.items.map(p => p.id);
  const proposalCounts = projectIds.length > 0
    ? await proposalRepository.getProposalCountsByProjects(projectIds)
    : new Map<string, number>();

  const projectsWithCounts: ProjectWithProposalCount[] = result.items.map((project) => ({
    ...project,
    proposalCount: proposalCounts.get(project.id) ?? 0,
  }));

  return successResult({
    items: projectsWithCounts,
    hasMore: result.hasMore,
    total: result.total,
  });
}

export async function listOpenProjects(
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<ProjectWithProposalCount>>> {
  const result = await projectRepository.getAllOpenProjects(options);
  return successResult(await addProposalCounts(result));
}

export async function searchProjects(
  keyword: string,
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<ProjectWithProposalCount>>> {
  const result = await projectRepository.searchProjects(keyword, options);
  return successResult(await addProposalCounts(result));
}

export async function listProjectsBySkills(
  skillIds: string[],
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<ProjectWithProposalCount>>> {
  const result = await projectRepository.getProjectsBySkills(skillIds, options);
  return successResult(await addProposalCounts(result));
}

export async function listProjectsByBudgetRange(
  minBudget: number,
  maxBudget: number,
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<ProjectWithProposalCount>>> {
  const result = await projectRepository.getProjectsByBudgetRange(minBudget, maxBudget, options);
  return successResult(await addProposalCounts(result));
}

export async function listProjectsByCategory(
  categoryId: string,
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<ProjectWithProposalCount>>> {
  const result = await projectRepository.getProjectsByCategory(categoryId, options);
  return successResult(await addProposalCounts(result));
}

export async function listProjectsByMultipleCategories(
  categoryIds: string[],
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<ProjectWithProposalCount>>> {
  const result = await projectRepository.getProjectsByMultipleCategories(categoryIds, options);
  return successResult(await addProposalCounts(result));
}

export type CategoryStat = {
  categoryId: string;
  categoryName: string;
  projectCount: number;
  totalBudget: number;
};

/**
 * Aggregate open projects into per-category statistics (project count and total
 * budget). Extracted from the route so the aggregation logic is testable and the
 * route stays thin.
 */
export async function getProjectCategoryStats(
  limit = 100
): Promise<ServiceResult<{ categories: CategoryStat[] }>> {
  try {
    const clampedLimit = Math.max(1, Math.min(limit, 10000));
    const result = await listOpenProjects({ limit: clampedLimit, offset: 0 });

    if (!result.success) {
      return errorResult('INTERNAL_ERROR', 'Failed to retrieve project statistics');
    }

    const categoryStats = new Map<string, CategoryStat>();

    for (const project of result.data.items) {
      for (const skill of project.required_skills ?? []) {
        const key = skill.category_id;
        if (!categoryStats.has(key)) {
          categoryStats.set(key, {
            categoryId: skill.category_id,
            categoryName: skill.skill_name || skill.category_id,
            projectCount: 0,
            totalBudget: 0,
          });
        }

        const stats = categoryStats.get(key)!;
        stats.projectCount += 1;
        stats.totalBudget += Number(project.budget) || 0;
      }
    }

    return successResult({ categories: Array.from(categoryStats.values()) });
  } catch (error) {
    logger.error('Failed to get project category statistics', { error });
    return errorResult('INTERNAL_ERROR', 'Failed to retrieve project statistics');
  }
}

export async function deleteProject(
  projectId: string,
  employerId: string
): Promise<ServiceResult<boolean>> {
  const existingProject = await projectRepository.getProjectById(projectId);
  if (!existingProject || existingProject.employer_id !== employerId) {
    return errorResult('NOT_FOUND', 'Project not found');
  }

  const hasAccepted = await proposalRepository.hasAcceptedProposal(projectId);
  if (hasAccepted) {
    return errorResult('PROJECT_LOCKED', 'Cannot delete project with accepted proposals');
  }

  const deleted = await projectRepository.deleteProject(projectId);
  return successResult(deleted);
}
