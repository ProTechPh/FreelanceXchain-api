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

export type SkillServiceError = {
  code: string;
  message: string;
};

export type SkillServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: SkillServiceError };

// Category Operations

export async function createCategory(input: CreateSkillCategoryInput): Promise<SkillServiceResult<SkillCategory>> {
  const existingCategory = await skillCategoryRepository.getCategoryByName(input.name);
  if (existingCategory) {
    return {
      success: false,
      error: { code: 'DUPLICATE_CATEGORY', message: `Category with name "${input.name}" already exists` },
    };
  }

  const categoryEntity: Omit<SkillCategoryEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    name: input.name,
    description: input.description,
    is_active: true,
  };

  const createdEntity = await skillCategoryRepository.createCategory(categoryEntity);
  return { success: true, data: mapSkillCategoryFromEntity(createdEntity) };
}

export async function getCategoryById(id: string): Promise<SkillServiceResult<SkillCategory>> {
  const categoryEntity = await skillCategoryRepository.getCategoryById(id);
  if (!categoryEntity) {
    return {
      success: false,
      error: { code: 'CATEGORY_NOT_FOUND', message: `Category with id "${id}" not found` },
    };
  }
  return { success: true, data: mapSkillCategoryFromEntity(categoryEntity) };
}


export async function updateCategory(
  id: string, 
  updates: Partial<CreateSkillCategoryInput>
): Promise<SkillServiceResult<SkillCategory>> {
  const existing = await skillCategoryRepository.getCategoryById(id);
  if (!existing) {
    return {
      success: false,
      error: { code: 'CATEGORY_NOT_FOUND', message: `Category with id "${id}" not found` },
    };
  }

  if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicateCategory = await skillCategoryRepository.getCategoryByName(updates.name);
    if (duplicateCategory) {
      return {
        success: false,
        error: { code: 'DUPLICATE_CATEGORY', message: `Category with name "${updates.name}" already exists` },
      };
    }
  }

  const updatedEntity = await skillCategoryRepository.updateCategory(id, updates);
  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update category' },
    };
  }
  return { success: true, data: mapSkillCategoryFromEntity(updatedEntity) };
}

export async function getAllCategories(): Promise<SkillCategory[]> {
  const entities = await skillCategoryRepository.getAllCategories();
  return entities.map(mapSkillCategoryFromEntity);
}

export async function getActiveCategories(): Promise<SkillCategory[]> {
  const entities = await skillCategoryRepository.getActiveCategories();
  return entities.map(mapSkillCategoryFromEntity);
}

// Skill Operations

export async function createSkill(input: CreateSkillInput): Promise<SkillServiceResult<Skill>> {
  const category = await skillCategoryRepository.getCategoryById(input.categoryId);
  if (!category) {
    return {
      success: false,
      error: { code: 'CATEGORY_NOT_FOUND', message: `Category with id "${input.categoryId}" not found` },
    };
  }

  const existingSkill = await skillRepository.getSkillByNameInCategory(input.name, input.categoryId);
  if (existingSkill) {
    return {
      success: false,
      error: { code: 'DUPLICATE_SKILL', message: `Skill with name "${input.name}" already exists in this category` },
    };
  }

  const skillEntity: Omit<SkillEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    category_id: input.categoryId,
    name: input.name,
    description: input.description,
    is_active: true,
  };

  const createdEntity = await skillRepository.createSkill(skillEntity);
  return { success: true, data: mapSkillFromEntity(createdEntity) };
}

export async function getSkillById(id: string): Promise<SkillServiceResult<Skill>> {
  const skillEntity = await skillRepository.findSkillById(id);
  if (!skillEntity) {
    return {
      success: false,
      error: { code: 'SKILL_NOT_FOUND', message: `Skill with id "${id}" not found` },
    };
  }
  return { success: true, data: mapSkillFromEntity(skillEntity) };
}

export async function updateSkill(
  id: string,
  updates: Partial<CreateSkillInput>
): Promise<SkillServiceResult<Skill>> {
  const existing = await skillRepository.findSkillById(id);
  if (!existing) {
    return {
      success: false,
      error: { code: 'SKILL_NOT_FOUND', message: `Skill with id "${id}" not found` },
    };
  }

  if (updates.categoryId && updates.categoryId !== existing.category_id) {
    const category = await skillCategoryRepository.getCategoryById(updates.categoryId);
    if (!category) {
      return {
        success: false,
        error: { code: 'CATEGORY_NOT_FOUND', message: `Category with id "${updates.categoryId}" not found` },
      };
    }
  }

  if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
    const categoryId = updates.categoryId ?? existing.category_id;
    const duplicateSkill = await skillRepository.getSkillByNameInCategory(updates.name, categoryId);
    if (duplicateSkill) {
      return {
        success: false,
        error: { code: 'DUPLICATE_SKILL', message: `Skill with name "${updates.name}" already exists in this category` },
      };
    }
  }

  const entityUpdates: Partial<SkillEntity> = {};
  if (updates.categoryId !== undefined) entityUpdates.category_id = updates.categoryId;
  if (updates.name !== undefined) entityUpdates.name = updates.name;
  if (updates.description !== undefined) entityUpdates.description = updates.description;

  const updatedEntity = await skillRepository.updateSkill(id, entityUpdates);
  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update skill' },
    };
  }
  return { success: true, data: mapSkillFromEntity(updatedEntity) };
}

export async function deprecateSkill(id: string): Promise<SkillServiceResult<Skill>> {
  const existing = await skillRepository.findSkillById(id);
  if (!existing) {
    return {
      success: false,
      error: { code: 'SKILL_NOT_FOUND', message: `Skill with id "${id}" not found` },
    };
  }

  const updatedEntity = await skillRepository.updateSkill(id, { is_active: false });
  if (!updatedEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to deprecate skill' },
    };
  }
  return { success: true, data: mapSkillFromEntity(updatedEntity) };
}

export async function getAllSkills(): Promise<Skill[]> {
  const entities = await skillRepository.getAllSkills();
  return entities.map(mapSkillFromEntity);
}

export async function getActiveSkills(): Promise<Skill[]> {
  const entities = await skillRepository.getActiveSkills();
  return entities.map(mapSkillFromEntity);
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
  const skillEntities = await skillRepository.searchSkillsByKeyword(keyword);
  const categoryEntities = await skillCategoryRepository.getAllCategories();
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
  const categoryEntities = await skillCategoryRepository.getActiveCategories();
  const allSkillEntities = await skillRepository.getActiveSkills();

  const skillsByCategory = new Map<string, Skill[]>();
  for (const entity of allSkillEntities) {
    const skill = mapSkillFromEntity(entity);
    const existing = skillsByCategory.get(skill.categoryId) ?? [];
    existing.push(skill);
    skillsByCategory.set(skill.categoryId, existing);
  }

  return {
    categories: categoryEntities.map(entity => {
      const category = mapSkillCategoryFromEntity(entity);
      return {
        ...category,
        skills: skillsByCategory.get(category.id) ?? [],
      };
    }),
  };
}

export async function validateSkillIds(skillIds: string[]): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of skillIds) {
    const skillEntity = await skillRepository.findSkillById(id);
    if (skillEntity && skillEntity.is_active) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }

  return { valid, invalid };
}
