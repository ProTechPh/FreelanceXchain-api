import { BaseRepository } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';
import { SkillCategory } from '../models/skill.js';

export class SkillCategoryRepository extends BaseRepository<SkillCategory> {
  constructor() {
    super(COLLECTIONS.SKILL_CATEGORIES);
  }

  async createCategory(category: SkillCategory): Promise<SkillCategory> {
    return this.create(category, category.id);
  }

  async getCategoryById(id: string): Promise<SkillCategory | null> {
    return this.getById(id, id);
  }

  async updateCategory(id: string, updates: Partial<SkillCategory>): Promise<SkillCategory | null> {
    return this.update(id, id, updates);
  }

  async deleteCategory(id: string): Promise<boolean> {
    return this.delete(id, id);
  }

  async getAllCategories(): Promise<SkillCategory[]> {
    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.name',
    };
    return this.queryAll(querySpec);
  }

  async getActiveCategories(): Promise<SkillCategory[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.isActive = true ORDER BY c.name',
    };
    return this.queryAll(querySpec);
  }

  async getCategoryByName(name: string): Promise<SkillCategory | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE LOWER(c.name) = @name',
      parameters: [{ name: '@name', value: name.toLowerCase() }],
    };
    return this.findOne(querySpec);
  }
}

export const skillCategoryRepository = new SkillCategoryRepository();
