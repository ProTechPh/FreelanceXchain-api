import { 
  Skill, 
  SkillCategory, 
  CreateSkillCategoryInput, 
  CreateSkillInput,
  SkillWithCategory,
  SkillTaxonomy 
} from '../models/skill.js';
import { skillCategoryRepository } from '../repositories/skill-category-repository.js';
import { skillRepository } from '../repositories/skill-repository.js';
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

  const category: SkillCategory = {
    id: generateId(),
    name: input.name,
    description: input.description,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const created = await skillCategoryRepository.createCategory(category);
  return { success: true, data: created };
}

export async function getCategoryById(id: string): Promise<SkillServiceResult<SkillCategory>> {
  const category = await skillCategoryRepository.getCategoryById(id);
  if (!category) {
    return {
      success: false,
      error: { code: 'CATEGORY_NOT_FOUND', message: `Category with id "${id}" not found` },
    };
  }
  return { success: true, data: category };
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

  const updated = await skillCategoryRepository.updateCategory(id, updates);
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update category' },
    };
  }
  return { success: true, data: updated };
}

export async function getAllCategories(): Promise<SkillCategory[]> {
  return skillCategoryRepository.getAllCategories();
}

export async function getActiveCategories(): Promise<SkillCategory[]> {
  return skillCategoryRepository.getActiveCategories();
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

  const skill: Skill = {
    id: generateId(),
    categoryId: input.categoryId,
    name: input.name,
    description: input.description,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const created = await skillRepository.createSkill(skill);
  return { success: true, data: created };
}

export async function getSkillById(id: string): Promise<SkillServiceResult<Skill>> {
  const skill = await skillRepository.findSkillById(id);
  if (!skill) {
    return {
      success: false,
      error: { code: 'SKILL_NOT_FOUND', message: `Skill with id "${id}" not found` },
    };
  }
  return { success: true, data: skill };
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

  if (updates.categoryId && updates.categoryId !== existing.categoryId) {
    const category = await skillCategoryRepository.getCategoryById(updates.categoryId);
    if (!category) {
      return {
        success: false,
        error: { code: 'CATEGORY_NOT_FOUND', message: `Category with id "${updates.categoryId}" not found` },
      };
    }
  }

  if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
    const categoryId = updates.categoryId ?? existing.categoryId;
    const duplicateSkill = await skillRepository.getSkillByNameInCategory(updates.name, categoryId);
    if (duplicateSkill) {
      return {
        success: false,
        error: { code: 'DUPLICATE_SKILL', message: `Skill with name "${updates.name}" already exists in this category` },
      };
    }
  }

  const updated = await skillRepository.updateSkill(id, existing.categoryId, updates);
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update skill' },
    };
  }
  return { success: true, data: updated };
}

export async function deprecateSkill(id: string): Promise<SkillServiceResult<Skill>> {
  const existing = await skillRepository.findSkillById(id);
  if (!existing) {
    return {
      success: false,
      error: { code: 'SKILL_NOT_FOUND', message: `Skill with id "${id}" not found` },
    };
  }

  const updated = await skillRepository.updateSkill(id, existing.categoryId, { isActive: false });
  if (!updated) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to deprecate skill' },
    };
  }
  return { success: true, data: updated };
}

export async function getAllSkills(): Promise<Skill[]> {
  return skillRepository.getAllSkills();
}

export async function getActiveSkills(): Promise<Skill[]> {
  return skillRepository.getActiveSkills();
}

export async function getSkillsByCategory(categoryId: string): Promise<Skill[]> {
  return skillRepository.getSkillsByCategory(categoryId);
}

export async function getActiveSkillsByCategory(categoryId: string): Promise<Skill[]> {
  return skillRepository.getActiveSkillsByCategory(categoryId);
}

export async function searchSkills(keyword: string): Promise<SkillWithCategory[]> {
  const skills = await skillRepository.searchSkillsByKeyword(keyword);
  const categories = await skillCategoryRepository.getAllCategories();
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  return skills.map(skill => ({
    ...skill,
    categoryName: categoryMap.get(skill.categoryId) ?? 'Unknown',
  }));
}

// Taxonomy Operations

export async function getFullTaxonomy(): Promise<SkillTaxonomy> {
  const categories = await skillCategoryRepository.getActiveCategories();
  const allSkills = await skillRepository.getActiveSkills();

  const skillsByCategory = new Map<string, Skill[]>();
  for (const skill of allSkills) {
    const existing = skillsByCategory.get(skill.categoryId) ?? [];
    existing.push(skill);
    skillsByCategory.set(skill.categoryId, existing);
  }

  return {
    categories: categories.map(category => ({
      ...category,
      skills: skillsByCategory.get(category.id) ?? [],
    })),
  };
}

export async function validateSkillIds(skillIds: string[]): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of skillIds) {
    const skill = await skillRepository.findSkillById(id);
    if (skill && skill.isActive) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }

  return { valid, invalid };
}
