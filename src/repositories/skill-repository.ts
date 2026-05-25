import { BaseRepositoryPg } from './base-repository-pg.js';

export type SkillCategoryEntity = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SkillEntity = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export class SkillRepository extends BaseRepositoryPg<SkillEntity> {
  constructor() {
    super('skills');
  }

  async createSkill(skill: Omit<SkillEntity, 'created_at' | 'updated_at'>): Promise<SkillEntity> {
    return this.create(skill);
  }

  async getSkillById(id: string): Promise<SkillEntity | null> {
    return this.getById(id);
  }

  async findSkillById(id: string): Promise<SkillEntity | null> {
    return this.getById(id);
  }

  async updateSkill(id: string, updates: Partial<SkillEntity>): Promise<SkillEntity | null> {
    return this.update(id, updates);
  }

  async deleteSkill(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async getAllSkills(): Promise<SkillEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      ORDER BY name ASC
    `;
    
    try {
      const result = await this.pool.query(query);
      return result.rows as SkillEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get all skills: ${error.message}`);
    }
  }

  async getActiveSkills(): Promise<SkillEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true
      ORDER BY name ASC
    `;
    
    try {
      const result = await this.pool.query(query);
      return result.rows as SkillEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get active skills: ${error.message}`);
    }
  }

  async getSkillsByCategory(categoryId: string): Promise<SkillEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE category_id = $1
      ORDER BY name ASC
    `;
    
    try {
      const result = await this.pool.query(query, [categoryId]);
      return result.rows as SkillEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get skills by category: ${error.message}`);
    }
  }

  async getActiveSkillsByCategory(categoryId: string): Promise<SkillEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE category_id = $1 AND is_active = true
      ORDER BY name ASC
    `;
    
    try {
      const result = await this.pool.query(query, [categoryId]);
      return result.rows as SkillEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get active skills by category: ${error.message}`);
    }
  }

  async searchSkillsByKeyword(keyword: string): Promise<SkillEntity[]> {
    const pattern = `%${keyword}%`;
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = true AND (name ILIKE $1 OR description ILIKE $1)
      ORDER BY name ASC
    `;
    
    try {
      const result = await this.pool.query(query, [pattern]);
      return result.rows as SkillEntity[];
    } catch (error: any) {
      throw new Error(`Failed to search skills: ${error.message}`);
    }
  }

  async getSkillByNameInCategory(name: string, categoryId: string): Promise<SkillEntity | null> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE category_id = $1 AND name ILIKE $2
      LIMIT 1
    `;
    
    try {
      const result = await this.pool.query(query, [categoryId, name]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to get skill by name in category: ${error.message}`);
    }
  }
}

export const skillRepository = new SkillRepository();
