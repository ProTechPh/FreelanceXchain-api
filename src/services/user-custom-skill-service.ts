import { 
  UserCustomSkill, 
  CreateUserCustomSkillInput, 
  UpdateUserCustomSkillInput,
  SkillSuggestion 
} from '../models/user-custom-skill.js';
import { 
  userCustomSkillRepository, 
  UserCustomSkillEntity, 
  SkillSuggestionEntity 
} from '../repositories/user-custom-skill-repository.js';
import { generateId } from '../utils/id.js';
import { searchSkills } from './skill-service.js';

export type UserCustomSkillServiceError = {
  code: string;
  message: string;
  details?: string[];
};

export type UserCustomSkillServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: UserCustomSkillServiceError };

// Entity mapping functions
function mapUserCustomSkillFromEntity(entity: UserCustomSkillEntity): UserCustomSkill {
  return {
    id: entity.id,
    userId: entity.user_id,
    name: entity.name,
    description: entity.description,
    yearsOfExperience: entity.years_of_experience,
    categoryName: entity.category_name,
    isApproved: entity.is_approved,
    suggestedForGlobal: entity.suggested_for_global,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

function mapSkillSuggestionFromEntity(entity: SkillSuggestionEntity): SkillSuggestion {
  return {
    id: entity.id,
    userId: entity.user_id,
    skillName: entity.skill_name,
    skillDescription: entity.skill_description,
    categoryName: entity.category_name,
    suggestedBy: entity.suggested_by,
    timesRequested: entity.times_requested,
    status: entity.status,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

// User Custom Skill Operations

export async function createUserCustomSkill(
  userId: string,
  userName: string,
  input: CreateUserCustomSkillInput
): Promise<UserCustomSkillServiceResult<UserCustomSkill>> {
  // Check if skill already exists in global taxonomy
  const globalSkills = await searchSkills(input.name);
  const exactMatch = globalSkills.find((skill: any) => 
    skill.name.toLowerCase() === input.name.toLowerCase()
  );

  if (exactMatch) {
    return {
      success: false,
      error: { 
        code: 'SKILL_EXISTS_GLOBALLY', 
        message: `Skill "${input.name}" already exists in the global skill taxonomy. Use the existing skill instead.`,
        details: [`Existing skill ID: ${exactMatch.id}`, `Category: ${exactMatch.categoryName}`]
      },
    };
  }

  // Check if user already has this custom skill
  const existingUserSkills = await userCustomSkillRepository.getUserCustomSkills(userId);
  const duplicateSkill = existingUserSkills.find((skill: UserCustomSkillEntity) => 
    skill.name.toLowerCase() === input.name.toLowerCase()
  );

  if (duplicateSkill) {
    return {
      success: false,
      error: { 
        code: 'DUPLICATE_USER_SKILL', 
        message: `You already have a custom skill named "${input.name}".` 
      },
    };
  }

  const skillEntity: Omit<UserCustomSkillEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    user_id: userId,
    name: input.name.trim(),
    description: input.description.trim(),
    years_of_experience: input.yearsOfExperience,
    is_approved: false, // Custom skills start as unapproved
    suggested_for_global: input.suggestForGlobal ?? false,
  };

  // Only add category_name if it exists
  if (input.categoryName?.trim()) {
    (skillEntity as any).category_name = input.categoryName.trim();
  }

  try {
    const createdEntity = await userCustomSkillRepository.createUserCustomSkill(skillEntity);
    
    // If user wants to suggest this skill for global taxonomy
    if (input.suggestForGlobal) {
      await handleSkillSuggestion(userId, userName, input);
    }

    return { success: true, data: mapUserCustomSkillFromEntity(createdEntity) };
  } catch (error) {
    return {
      success: false,
      error: { 
        code: 'CREATE_FAILED', 
        message: 'Failed to create custom skill',
        details: [error instanceof Error ? error.message : 'Unknown error']
      },
    };
  }
}

export async function getUserCustomSkills(userId: string): Promise<UserCustomSkill[]> {
  const entities = await userCustomSkillRepository.getUserCustomSkills(userId);
  return entities.map(mapUserCustomSkillFromEntity);
}

export async function getUserCustomSkillById(
  id: string, 
  userId: string
): Promise<UserCustomSkillServiceResult<UserCustomSkill>> {
  const entity = await userCustomSkillRepository.getUserCustomSkillById(id, userId);
  if (!entity) {
    return {
      success: false,
      error: { code: 'SKILL_NOT_FOUND', message: 'Custom skill not found' },
    };
  }
  return { success: true, data: mapUserCustomSkillFromEntity(entity) };
}

export async function updateUserCustomSkill(
  id: string,
  userId: string,
  updates: UpdateUserCustomSkillInput
): Promise<UserCustomSkillServiceResult<UserCustomSkill>> {
  const existing = await userCustomSkillRepository.getUserCustomSkillById(id, userId);
  if (!existing) {
    return {
      success: false,
      error: { code: 'SKILL_NOT_FOUND', message: 'Custom skill not found' },
    };
  }

  // If updating name, check for duplicates
  if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
    const userSkills = await userCustomSkillRepository.getUserCustomSkills(userId);
    const duplicateSkill = userSkills.find((skill: UserCustomSkillEntity) => 
      skill.id !== id && skill.name.toLowerCase() === updates.name!.toLowerCase()
    );

    if (duplicateSkill) {
      return {
        success: false,
        error: { 
          code: 'DUPLICATE_USER_SKILL', 
          message: `You already have a custom skill named "${updates.name}".` 
        },
      };
    }
  }

  const entityUpdates: Partial<UserCustomSkillEntity> = {};
  if (updates.name !== undefined) entityUpdates.name = updates.name.trim();
  if (updates.description !== undefined) entityUpdates.description = updates.description.trim();
  if (updates.yearsOfExperience !== undefined) entityUpdates.years_of_experience = updates.yearsOfExperience;
  if (updates.categoryName !== undefined) entityUpdates.category_name = updates.categoryName?.trim();

  try {
    const updatedEntity = await userCustomSkillRepository.updateUserCustomSkill(id, userId, entityUpdates);
    if (!updatedEntity) {
      return {
        success: false,
        error: { code: 'UPDATE_FAILED', message: 'Failed to update custom skill' },
      };
    }
    return { success: true, data: mapUserCustomSkillFromEntity(updatedEntity) };
  } catch (error) {
    return {
      success: false,
      error: { 
        code: 'UPDATE_FAILED', 
        message: 'Failed to update custom skill',
        details: [error instanceof Error ? error.message : 'Unknown error']
      },
    };
  }
}

export async function deleteUserCustomSkill(
  id: string, 
  userId: string
): Promise<UserCustomSkillServiceResult<boolean>> {
  const existing = await userCustomSkillRepository.getUserCustomSkillById(id, userId);
  if (!existing) {
    return {
      success: false,
      error: { code: 'SKILL_NOT_FOUND', message: 'Custom skill not found' },
    };
  }

  try {
    await userCustomSkillRepository.deleteUserCustomSkill(id, userId);
    return { success: true, data: true };
  } catch (error) {
    return {
      success: false,
      error: { 
        code: 'DELETE_FAILED', 
        message: 'Failed to delete custom skill',
        details: [error instanceof Error ? error.message : 'Unknown error']
      },
    };
  }
}

export async function searchUserCustomSkills(
  userId: string, 
  keyword: string
): Promise<UserCustomSkill[]> {
  const entities = await userCustomSkillRepository.searchUserCustomSkills(userId, keyword);
  return entities.map(mapUserCustomSkillFromEntity);
}

// Skill Suggestion Operations

async function handleSkillSuggestion(
  userId: string,
  userName: string,
  skillInput: CreateUserCustomSkillInput
): Promise<void> {
  // Check if suggestion already exists
  const existingSuggestion = await userCustomSkillRepository.getSkillSuggestionByName(skillInput.name);
  
  if (existingSuggestion) {
    // Increment the request count
    await userCustomSkillRepository.incrementSkillSuggestionCount(existingSuggestion.id);
  } else {
    // Create new suggestion
    const suggestionEntity: Omit<SkillSuggestionEntity, 'created_at' | 'updated_at'> = {
      id: generateId(),
      user_id: userId,
      skill_name: skillInput.name.trim(),
      skill_description: skillInput.description.trim(),
      suggested_by: userName,
      times_requested: 1,
      status: 'pending',
    };

    // Only add category_name if it exists
    if (skillInput.categoryName?.trim()) {
      (suggestionEntity as any).category_name = skillInput.categoryName.trim();
    }

    await userCustomSkillRepository.createSkillSuggestion(suggestionEntity);
  }
}

export async function getPendingSkillSuggestions(): Promise<SkillSuggestion[]> {
  const entities = await userCustomSkillRepository.getPendingSkillSuggestions();
  return entities.map(mapSkillSuggestionFromEntity);
}

export async function updateSkillSuggestionStatus(
  id: string,
  status: 'approved' | 'rejected'
): Promise<UserCustomSkillServiceResult<SkillSuggestion>> {
  try {
    const updatedEntity = await userCustomSkillRepository.updateSkillSuggestionStatus(id, status);
    if (!updatedEntity) {
      return {
        success: false,
        error: { code: 'SUGGESTION_NOT_FOUND', message: 'Skill suggestion not found' },
      };
    }
    return { success: true, data: mapSkillSuggestionFromEntity(updatedEntity) };
  } catch (error) {
    return {
      success: false,
      error: { 
        code: 'UPDATE_FAILED', 
        message: 'Failed to update skill suggestion status',
        details: [error instanceof Error ? error.message : 'Unknown error']
      },
    };
  }
}