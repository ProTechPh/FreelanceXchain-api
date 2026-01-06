import { BaseRepository } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

export type SkillCategoryEntity = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export class SkillCategoryRepository extends BaseRepository<SkillCategoryEntity> {
  constructor() {
    super(TABLES.SKILL_CATEGORIES);
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
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw new Error(`Failed to get all categories: ${error.message}`);
    return (data ?? []) as SkillCategoryEntity[];
  }

  async getActiveCategories(): Promise<SkillCategoryEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    
    if (error) throw new Error(`Failed to get active categories: ${error.message}`);
    return (data ?? []) as SkillCategoryEntity[];
  }

  async getCategoryByName(name: string): Promise<SkillCategoryEntity | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .ilike('name', name)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get category by name: ${error.message}`);
    }
    return data as SkillCategoryEntity;
  }
}

export const skillCategoryRepository = new SkillCategoryRepository();
