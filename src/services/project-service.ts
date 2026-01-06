import { projectRepository, ProjectEntity, MilestoneEntity, ProjectStatus, MilestoneStatus } from '../repositories/project-repository.js';
import { proposalRepository } from '../repositories/proposal-repository.js';
import { skillRepository } from '../repositories/skill-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';
import { generateId } from '../utils/id.js';

export type CreateProjectInput = {
  title: string;
  description: string;
  requiredSkills: { skillId: string }[];
  budget: number;
  deadline: string;
};

export type UpdateProjectInput = {
  title?: string;
  description?: string;
  requiredSkills?: { skillId: string }[];
  budget?: number;
  deadline?: string;
  status?: ProjectStatus;
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

export type ProjectServiceError = {
  code: string;
  message: string;
  details?: string[];
};

export type ProjectServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ProjectServiceError };

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

  const projectInput = {
    id: generateId(),
    employer_id: employerId,
    title: input.title,
    description: input.description,
    required_skills: skillRefs,
    budget: input.budget,
    deadline: input.deadline,
    status: 'open' as ProjectStatus,
    milestones: [],
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

  const updates: Partial<ProjectEntity> = {
    ...(input.title && { title: input.title }),
    ...(input.description && { description: input.description }),
    ...(input.requiredSkills && { required_skills: skillRefs }),
    ...(input.budget !== undefined && { budget: input.budget }),
    ...(input.deadline && { deadline: input.deadline }),
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
  
  const projectsWithCounts: ProjectWithProposalCount[] = await Promise.all(
    result.items.map(async (project) => {
      const proposalCount = await proposalRepository.getProposalCountByProject(project.id);
      return { ...project, proposalCount };
    })
  );

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
