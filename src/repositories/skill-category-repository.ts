import { BaseRepository } from './base-repository.js';
import { Query } from '../config/appwrite.js';
import { getErrorMessageOr } from '../utils/index.js';
import { normalizeSkillName } from '../utils/skill-utils.js';

export type SkillCategoryEntity = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'skill_categories';

export class SkillCategoryRepository extends BaseRepository<SkillCategoryEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createCategory(category: Omit<SkillCategoryEntity, 'created_at' | 'updated_at'>): Promise<SkillCategoryEntity> {
    try {
      return await this.create(category);
    } catch (error) {
      throw new Error(`Failed to create: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getCategoryById(id: string): Promise<SkillCategoryEntity | null> {
    return this.getById(id);
  }

  async updateCategory(id: string, updates: Partial<SkillCategoryEntity>): Promise<SkillCategoryEntity | null> {
    return this.update(id, updates);
  }

  async deleteCategory(id: string): Promise<boolean> {
    return this.delete(id);
  }

  /**
   * Uses cursor pagination so the full taxonomy is not silently truncated at 1000 rows.
   */
  async getAllCategories(): Promise<SkillCategoryEntity[]> {
    try {
      return await this.fetchAll([Query.orderAsc('name')]);
    } catch (error) {
      throw new Error(`Failed to get all categories: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getActiveCategories(): Promise<SkillCategoryEntity[]> {
    try {
      return await this.fetchAll([
        Query.equal('is_active', true),
        Query.orderAsc('name'),
      ]);
    } catch (error) {
      throw new Error(`Failed to get active categories: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  /**
   * Find a category by name using the canonical normalized form so
   * padding/casing/unicode variants resolve to the same category.
   */
  async getCategoryByName(name: string): Promise<SkillCategoryEntity | null> {
    try {
      const all = await this.fetchAll([]);
      const normalized = normalizeSkillName(name);
      return all.find((c) => normalizeSkillName(c.name) === normalized) ?? null;
    } catch (error) {
      throw new Error(`Failed to get category by name: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }
}

export const skillCategoryRepository = new SkillCategoryRepository();
