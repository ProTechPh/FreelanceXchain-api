import { BaseRepositoryPg } from './base-repository-pg.js';

export type SkillCategoryEntity = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export class SkillCategoryRepository extends BaseRepositoryPg<SkillCategoryEntity> {
  constructor() {
    super('skill_categories');
  }

  async createCategory(category: Omit<SkillCategoryEntity, 'created_at' | 'updated_at'>): Promise<SkillCategoryEntity> {
    return this.create(category);
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

  async getAllCategories(): Promise<SkillCategoryEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      ORDER BY name ASC
    `;
    
    try {
      const result = await this.pool.query(query);
      return result.rows as SkillCategoryEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get all categories: ${error.message}`);
    }
  }

  async getActiveCategories(): Promise<SkillCategoryEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true
      ORDER BY name ASC
    `;
    
    try {
      const result = await this.pool.query(query);
      return result.rows as SkillCategoryEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get active categories: ${error.message}`);
    }
  }

  async getCategoryByName(name: string): Promise<SkillCategoryEntity | null> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE name ILIKE $1
      LIMIT 1
    `;
    
    try {
      const result = await this.pool.query(query, [name]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to get category by name: ${error.message}`);
    }
  }
}

export const skillCategoryRepository = new SkillCategoryRepository();
