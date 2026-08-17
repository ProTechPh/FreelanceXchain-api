import { 
  UserCustomSkill, 
  CreateUserCustomSkillInput, 
  UpdateUserCustomSkillInput,
  SkillSuggestion 
} from '../models/user-custom-skill.js';
import { 
  userCustomSkillRepository, 
  skillSuggestionRepository,
  UserCustomSkillEntity, 
  SkillSuggestionEntity 
} from '../repositories/user-custom-skill-repository.js';
import { generateId } from '../utils/id.js';
import { normalizeSkillName } from '../utils/skill-utils.js';
import { logger } from '../config/logger.js';
import { skillRepository, SkillEntity } from '../repositories/skill-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

// Anti-spam: a user may hold at most this many custom skills, so the global
// suggestion queue cannot be flooded by one account.
const MAX_USER_CUSTOM_SKILLS = 50;

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
    requesterIds: Array.isArray(entity.requester_ids) ? entity.requester_ids : [],
    status: entity.status,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}


export async function createUserCustomSkill(
  userId: string,
  userName: string,
  input: CreateUserCustomSkillInput
): Promise<ServiceResult<UserCustomSkill>> {
  const trimmedName = input.name.trim();
  const normalizedName = normalizeSkillName(trimmedName);

  // Check if skill already exists in global taxonomy.
  // Compare canonical forms so " React ", "REACT", "Ｒｅａｃｔ" all resolve
  // to the existing "React" skill instead of sneaking a duplicate through.
  // Fail-closed: a DB read failure surfaces as CREATE_FAILED instead of
  // letting the duplicate check silently pass.
  let globalMatch: SkillEntity | null = null;
  try {
    globalMatch = await skillRepository.getSkillByNameNormalized(trimmedName);
  } catch (error) {
    return errorResult('CREATE_FAILED', 'Failed to create custom skill', [error instanceof Error ? error.message : 'Unknown error']);
  }

  if (globalMatch) {
    return errorResult('SKILL_EXISTS_GLOBALLY', `Skill "${trimmedName}" already exists in the global skill taxonomy. Use the existing skill instead.`, [`Existing skill ID: ${globalMatch.id}`]);
  }

  let existingUserSkills: UserCustomSkillEntity[];
  try {
    existingUserSkills = await userCustomSkillRepository.getUserCustomSkills(userId);
  } catch (error) {
    return errorResult('CREATE_FAILED', 'Failed to create custom skill', [error instanceof Error ? error.message : 'Unknown error']);
  }

  // Anti-spam cap: stop one account from flooding the admin suggestion queue
  if (existingUserSkills.length >= MAX_USER_CUSTOM_SKILLS) {
    return errorResult('TOO_MANY_CUSTOM_SKILLS', `You can have at most ${MAX_USER_CUSTOM_SKILLS} custom skills. Remove an existing one before adding another.`);
  }

  const duplicateSkill = existingUserSkills.find((skill: UserCustomSkillEntity) =>
    normalizeSkillName(skill.name) === normalizedName
  );

  if (duplicateSkill) {
    return errorResult('DUPLICATE_USER_SKILL', `You already have a custom skill named "${trimmedName}".`);
  }

  const skillEntity: Omit<UserCustomSkillEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    user_id: userId,
    name: trimmedName,
    description: input.description.trim(),
    years_of_experience: input.yearsOfExperience,
    is_approved: false, // Custom skills start as unapproved
    suggested_for_global: input.suggestForGlobal ?? false,
  };

  if (input.categoryName?.trim()) {
    skillEntity.category_name = input.categoryName.trim();
  }

  try {
    const createdEntity = await userCustomSkillRepository.createUserCustomSkill(skillEntity);
    
    // If user wants to suggest this skill for global taxonomy
    if (input.suggestForGlobal) {
      try {
        await handleSkillSuggestion(userId, userName, { ...input, name: trimmedName });
      } catch (suggestionError) {
        // Non-fatal: the skill row is already committed. Reporting failure for
        // data that was written would mislead the client, so log and continue.
        logger.error('Failed to create skill suggestion', suggestionError, {
          userId,
          skillName: trimmedName,
        });
      }
    }

    return successResult(mapUserCustomSkillFromEntity(createdEntity));
  } catch (error) {
    return errorResult('CREATE_FAILED', 'Failed to create custom skill', [error instanceof Error ? error.message : 'Unknown error']);
  }
}

export async function getUserCustomSkills(userId: string): Promise<UserCustomSkill[]> {
  const entities = await userCustomSkillRepository.getUserCustomSkills(userId);
  return entities.map(mapUserCustomSkillFromEntity);
}

export async function getUserCustomSkillById(
  id: string, 
  userId: string
): Promise<ServiceResult<UserCustomSkill>> {
  const entity = await userCustomSkillRepository.getUserCustomSkillById(id, userId);
  if (!entity) {
    return errorResult('SKILL_NOT_FOUND', 'Custom skill not found');
  }
  return successResult(mapUserCustomSkillFromEntity(entity));
}

export async function updateUserCustomSkill(
  id: string,
  userId: string,
  updates: UpdateUserCustomSkillInput
): Promise<ServiceResult<UserCustomSkill>> {
  const existing = await userCustomSkillRepository.getUserCustomSkillById(id, userId);
  if (!existing) {
    return errorResult('SKILL_NOT_FOUND', 'Custom skill not found');
  }

  // If updating name, check for duplicates against BOTH the user's own skills
  // and the global taxonomy (canonical comparison). Renaming a custom skill
  // to a name that already exists globally is rejected, same as creation.
  if (updates.name && normalizeSkillName(updates.name) !== normalizeSkillName(existing.name)) {
    const newName = updates.name.trim();

    // Fail-closed global check (same as creation): DB errors surface as UPDATE_FAILED.
    let globalMatch: SkillEntity | null = null;
    try {
      globalMatch = await skillRepository.getSkillByNameNormalized(newName);
    } catch (error) {
      return errorResult('UPDATE_FAILED', 'Failed to update custom skill', [error instanceof Error ? error.message : 'Unknown error']);
    }

    if (globalMatch) {
      return errorResult('SKILL_EXISTS_GLOBALLY', `Skill "${newName}" already exists in the global skill taxonomy. Use the existing skill instead.`);
    }

    let userSkills: UserCustomSkillEntity[];
    try {
      userSkills = await userCustomSkillRepository.getUserCustomSkills(userId);
    } catch (error) {
      return errorResult('UPDATE_FAILED', 'Failed to update custom skill', [error instanceof Error ? error.message : 'Unknown error']);
    }

    const duplicateSkill = userSkills.find((skill: UserCustomSkillEntity) =>
      skill.id !== id && normalizeSkillName(skill.name) === normalizeSkillName(newName)
    );

    if (duplicateSkill) {
      return errorResult('DUPLICATE_USER_SKILL', `You already have a custom skill named "${newName}".`);
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
      return errorResult('UPDATE_FAILED', 'Failed to update custom skill');
    }
    return successResult(mapUserCustomSkillFromEntity(updatedEntity));
  } catch (error) {
    /* istanbul ignore next */
    return errorResult('UPDATE_FAILED', 'Failed to update custom skill', [error instanceof Error ? error.message : 'Unknown error']);
  }
}

export async function deleteUserCustomSkill(
  id: string, 
  userId: string
): Promise<ServiceResult<boolean>> {
  const existing = await userCustomSkillRepository.getUserCustomSkillById(id, userId);
  if (!existing) {
    return errorResult('SKILL_NOT_FOUND', 'Custom skill not found');
  }

  try {
    await userCustomSkillRepository.deleteUserCustomSkill(id, userId);
    return successResult(true);
  } catch (error) {
    /* istanbul ignore next */
    return errorResult('DELETE_FAILED', 'Failed to delete custom skill', [error instanceof Error ? error.message : 'Unknown error']);
  }
}

export async function searchUserCustomSkills(
  userId: string, 
  keyword: string
): Promise<UserCustomSkill[]> {
  const entities = await userCustomSkillRepository.searchUserCustomSkills(userId, keyword);
  return entities.map(mapUserCustomSkillFromEntity);
}


async function handleSkillSuggestion(
  userId: string,
  userName: string,
  skillInput: CreateUserCustomSkillInput
): Promise<void> {
  // Check if a normalized-equivalent suggestion already exists, so
  // "React", " react", and "REACT" bump one queue entry instead of creating
  // three separate suggestion rows for admins to triage.
  const existingSuggestion = await skillSuggestionRepository.getSkillSuggestionByName(skillInput.name);
  
  if (existingSuggestion) {
    // Record this user's request. BLF-skill.3: the counter only increments
    // when this user hasn't already requested it, so deleting and re-creating
    // the same skill cannot inflate the suggestion's popularity.
    await skillSuggestionRepository.recordSuggestionRequest(existingSuggestion.id, userId);
  } else {
    const suggestionEntity: Omit<SkillSuggestionEntity, 'created_at' | 'updated_at'> = {
      id: generateId(),
      user_id: userId,
      skill_name: skillInput.name.trim(),
      skill_description: skillInput.description.trim(),
      suggested_by: userName,
      times_requested: 1,
      requester_ids: [userId],
      status: 'pending',
    };

    if (skillInput.categoryName?.trim()) {
      suggestionEntity.category_name = skillInput.categoryName.trim();
    }

    await skillSuggestionRepository.createSkillSuggestion(suggestionEntity);
  }
}

export async function getPendingSkillSuggestions(): Promise<SkillSuggestion[]> {
  const entities = await skillSuggestionRepository.getPendingSkillSuggestions();
  return entities.map(mapSkillSuggestionFromEntity);
}

export async function updateSkillSuggestionStatus(
  id: string,
  status: 'approved' | 'rejected'
): Promise<ServiceResult<SkillSuggestion>> {
  try {
    const updatedEntity = await skillSuggestionRepository.updateSkillSuggestionStatus(id, status);
    if (!updatedEntity) {
      return errorResult('SUGGESTION_NOT_FOUND', 'Skill suggestion not found');
    }
    return successResult(mapSkillSuggestionFromEntity(updatedEntity));
  } catch (error) {
    /* istanbul ignore next */
    return errorResult('UPDATE_FAILED', 'Failed to update skill suggestion status', [error instanceof Error ? error.message : 'Unknown error']);
  }
}