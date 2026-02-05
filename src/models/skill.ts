// Re-export types from entity-mapper for backward compatibility
export type { Skill, SkillCategory, SkillReference } from '../utils/entity-mapper';
import type { Skill, SkillCategory } from '../utils/entity-mapper';

export type CreateSkillCategoryInput = {
  name: string;
  description: string;
};

export type CreateSkillInput = {
  categoryId: string;
  name: string;
  description: string;
};

export type SkillWithCategory = Skill & {
  categoryName: string;
};

export type SkillTaxonomy = {
  categories: Array<SkillCategory & { skills: Skill[] }>;
};
