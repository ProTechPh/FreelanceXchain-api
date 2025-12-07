export type SkillCategory = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Skill = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

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
