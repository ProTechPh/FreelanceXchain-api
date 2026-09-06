import { 
  Skill, 
  SkillCategory, 
  mapSkillFromEntity,
  mapSkillCategoryFromEntity,
} from '../utils/entity-mapper.js';
import { 
  CreateSkillCategoryInput, 
  CreateSkillInput,
  SkillWithCategory,
  SkillTaxonomy 
} from '../models/skill.js';
import { skillCategoryRepository, SkillCategoryEntity } from '../repositories/skill-category-repository.js';
import { skillRepository, SkillEntity } from '../repositories/skill-repository.js';
import { generateId } from '../utils/id.js';
import { skillCache } from '../utils/cache.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';

function clearSkillCache(): void {
  if (typeof skillCache?.clear === 'function') {
    skillCache.clear();
  }
}

export async function createCategory(input: CreateSkillCategoryInput): Promise<ServiceResult<SkillCategory>> {
  const existingCategory = await skillCategoryRepository.getCategoryByName(input.name);
  if (existingCategory) {
    return errorResult('DUPLICATE_CATEGORY', `Category with name "${input.name}" already exists`);
  }

  const categoryEntity: Omit<SkillCategoryEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    name: input.name,
    description: input.description,
    is_active: true,
  };

  const createdEntity = await skillCategoryRepository.createCategory(categoryEntity);
  clearSkillCache();
  return successResult(mapSkillCategoryFromEntity(createdEntity));
}

export async function getCategoryById(id: string): Promise<ServiceResult<SkillCategory>> {
  const categoryEntity = await skillCategoryRepository.getCategoryById(id);
  if (!categoryEntity) {
    return errorResult('CATEGORY_NOT_FOUND', `Category with id "${id}" not found`);
  }
  return successResult(mapSkillCategoryFromEntity(categoryEntity));
}


export async function updateCategory(
  id: string, 
  updates: Partial<CreateSkillCategoryInput>
): Promise<ServiceResult<SkillCategory>> {
  const existing = await skillCategoryRepository.getCategoryById(id);
  if (!existing) {
    return errorResult('CATEGORY_NOT_FOUND', `Category with id "${id}" not found`);
  }

  if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicateCategory = await skillCategoryRepository.getCategoryByName(updates.name);
    if (duplicateCategory) {
      return errorResult('DUPLICATE_CATEGORY', `Category with name "${updates.name}" already exists`);
    }
  }

  const updatedEntity = await skillCategoryRepository.updateCategory(id, updates);
  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update category');
  }
  clearSkillCache();
  return successResult(mapSkillCategoryFromEntity(updatedEntity));
}

export async function getAllCategories(): Promise<SkillCategory[]> {
  const cached = typeof skillCache?.get === 'function' ? skillCache.get('all_categories') : undefined;
  if (cached) return cached as SkillCategory[];
  const entities = await skillCategoryRepository.getAllCategories();
  const result = entities.map(mapSkillCategoryFromEntity);
  if (typeof skillCache?.set === 'function') {
    skillCache.set('all_categories', result);
  }
  return result;
}

export async function getActiveCategories(): Promise<SkillCategory[]> {
  const cached = typeof skillCache?.get === 'function' ? skillCache.get('active_categories') : undefined;
  if (cached) return cached as SkillCategory[];
  const entities = await skillCategoryRepository.getActiveCategories();
  const result = entities.map(mapSkillCategoryFromEntity);
  if (typeof skillCache?.set === 'function') {
    skillCache.set('active_categories', result);
  }
  return result;
}

// Skill Operations

export async function createSkill(input: CreateSkillInput): Promise<ServiceResult<Skill>> {
  const category = await skillCategoryRepository.getCategoryById(input.categoryId);
  if (!category) {
    return errorResult('CATEGORY_NOT_FOUND', `Category with id "${input.categoryId}" not found`);
  }

  const existingSkill = await skillRepository.getSkillByNameInCategory(input.name, input.categoryId);
  if (existingSkill) {
    return errorResult('DUPLICATE_SKILL', `Skill with name "${input.name}" already exists in this category`);
  }

  const skillEntity: Omit<SkillEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    category_id: input.categoryId,
    name: input.name,
    description: input.description,
    is_active: true,
  };

  const createdEntity = await skillRepository.createSkill(skillEntity);
  clearSkillCache();
  return successResult(mapSkillFromEntity(createdEntity));
}

export async function getSkillById(id: string): Promise<ServiceResult<Skill>> {
  const skillEntity = await skillRepository.findSkillById(id);
  if (!skillEntity) {
    return errorResult('SKILL_NOT_FOUND', `Skill with id "${id}" not found`);
  }
  return successResult(mapSkillFromEntity(skillEntity));
}

export async function updateSkill(
  id: string,
  updates: Partial<CreateSkillInput>
): Promise<ServiceResult<Skill>> {
  const existing = await skillRepository.findSkillById(id);
  if (!existing) {
    return errorResult('SKILL_NOT_FOUND', `Skill with id "${id}" not found`);
  }

  if (updates.categoryId && updates.categoryId !== existing.category_id) {
    const category = await skillCategoryRepository.getCategoryById(updates.categoryId);
    if (!category) {
      return errorResult('CATEGORY_NOT_FOUND', `Category with id "${updates.categoryId}" not found`);
    }
  }

  if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
    const categoryId = updates.categoryId ?? existing.category_id;
    const duplicateSkill = await skillRepository.getSkillByNameInCategory(updates.name, categoryId);
    if (duplicateSkill) {
      return errorResult('DUPLICATE_SKILL', `Skill with name "${updates.name}" already exists in this category`);
    }
  }

  const entityUpdates: Partial<SkillEntity> = {};
  if (updates.categoryId !== undefined) entityUpdates.category_id = updates.categoryId;
  if (updates.name !== undefined) entityUpdates.name = updates.name;
  if (updates.description !== undefined) entityUpdates.description = updates.description;

  const updatedEntity = await skillRepository.updateSkill(id, entityUpdates);
  /* istanbul ignore next */
  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update skill');
  }
  clearSkillCache();
  return successResult(mapSkillFromEntity(updatedEntity));
}

export async function deprecateSkill(id: string): Promise<ServiceResult<Skill>> {
  const existing = await skillRepository.findSkillById(id);
  if (!existing) {
    return errorResult('SKILL_NOT_FOUND', `Skill with id "${id}" not found`);
  }

  const updatedEntity = await skillRepository.updateSkill(id, { is_active: false });
  if (!updatedEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to deprecate skill');
  }
  clearSkillCache();
  return successResult(mapSkillFromEntity(updatedEntity));
}

export async function getAllSkills(): Promise<Skill[]> {
  const cached = typeof skillCache?.get === 'function' ? skillCache.get('all_skills') : undefined;
  if (cached) return cached as Skill[];
  const entities = await skillRepository.getAllSkills();
  const result = entities.map(mapSkillFromEntity);
  if (typeof skillCache?.set === 'function') {
    skillCache.set('all_skills', result);
  }
  return result;
}

export async function getActiveSkills(): Promise<Skill[]> {
  const cached = typeof skillCache?.get === 'function' ? skillCache.get('active_skills') : undefined;
  if (cached) return cached as Skill[];
  const entities = await skillRepository.getActiveSkills();
  const result = entities.map(mapSkillFromEntity);
  if (typeof skillCache?.set === 'function') {
    skillCache.set('active_skills', result);
  }
  return result;
}

export async function getSkillsByCategory(categoryId: string): Promise<Skill[]> {
  const entities = await skillRepository.getSkillsByCategory(categoryId);
  return entities.map(mapSkillFromEntity);
}

export async function getActiveSkillsByCategory(categoryId: string): Promise<Skill[]> {
  const entities = await skillRepository.getActiveSkillsByCategory(categoryId);
  return entities.map(mapSkillFromEntity);
}

export async function searchSkills(keyword: string): Promise<SkillWithCategory[]> {
  const [skillEntities, categoryEntities] = await Promise.all([
    skillRepository.searchSkillsByKeyword(keyword),
    skillCategoryRepository.getAllCategories(),
  ]);
  const categoryMap = new Map(categoryEntities.map(c => [c.id, c.name]));

  return skillEntities.map(entity => {
    const skill = mapSkillFromEntity(entity);
    return {
      ...skill,
      categoryName: categoryMap.get(skill.categoryId) ?? 'Unknown',
    };
  });
}

// Taxonomy Operations

export async function getFullTaxonomy(): Promise<SkillTaxonomy> {
  const cached = typeof skillCache?.get === 'function' ? skillCache.get('full_taxonomy') : undefined;
  if (cached) return cached as SkillTaxonomy;

  const [categoryEntities, allSkillEntities] = await Promise.all([
    skillCategoryRepository.getActiveCategories(),
    skillRepository.getActiveSkills(),
  ]);

  const skillsByCategory = new Map<string, Skill[]>();
  for (const entity of allSkillEntities) {
    const skill = mapSkillFromEntity(entity);
    const existing = skillsByCategory.get(skill.categoryId) ?? [];
    existing.push(skill);
    skillsByCategory.set(skill.categoryId, existing);
  }

  const taxonomy: SkillTaxonomy = {
    categories: categoryEntities.map(entity => {
      const category = mapSkillCategoryFromEntity(entity);
      return {
        ...category,
        skills: skillsByCategory.get(category.id) ?? [],
      };
    }),
  };

  if (typeof skillCache?.set === 'function') {
    skillCache.set('full_taxonomy', taxonomy);
  }
  return taxonomy;
}

export async function validateSkillIds(skillIds: string[]): Promise<{ valid: string[]; invalid: string[] }> {
  if (skillIds.length === 0) {
    return { valid: [], invalid: [] };
  }

  // Batch lookup in a single query instead of one query per ID (N+1).
  const uniqueIds = [...new Set(skillIds)];
  const entities = await skillRepository.findSkillsByIds(uniqueIds);
  const validIds = new Set(entities.filter((e) => e.is_active).map((e) => e.id));

  return {
    valid: skillIds.filter((id) => validIds.has(id)),
    invalid: skillIds.filter((id) => !validIds.has(id)),
  };
}
