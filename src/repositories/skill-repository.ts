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

export type SkillEntity = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export class SkillRepository extends BaseRepository<SkillEntity> {
  constructor() {
    super(TABLES.SKILLS);
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
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw new Error(`Failed to get all skills: ${error.message}`);
    return (data ?? []) as SkillEntity[];
  }

  async getActiveSkills(): Promise<SkillEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    
    if (error) throw new Error(`Failed to get active skills: ${error.message}`);
    return (data ?? []) as SkillEntity[];
  }

  async getSkillsByCategory(categoryId: string): Promise<SkillEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('category_id', categoryId)
      .order('name', { ascending: true });
    
    if (error) throw new Error(`Failed to get skills by category: ${error.message}`);
    return (data ?? []) as SkillEntity[];
  }

  async getActiveSkillsByCategory(categoryId: string): Promise<SkillEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    
    if (error) throw new Error(`Failed to get active skills by category: ${error.message}`);
    return (data ?? []) as SkillEntity[];
  }

  async searchSkillsByKeyword(keyword: string): Promise<SkillEntity[]> {
    const client = this.getClient();

    // Sanitize keyword for PostgREST filter: escape special characters
    const sanitized = keyword
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/,/g, '\\,')
      .replace(/\./g, '\\.')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
      .order('name', { ascending: true });
    
    if (error) throw new Error(`Failed to search skills: ${error.message}`);
    return (data ?? []) as SkillEntity[];
  }

  async getSkillByNameInCategory(name: string, categoryId: string): Promise<SkillEntity | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('category_id', categoryId)
      .ilike('name', name)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get skill by name in category: ${error.message}`);
    }
    return data as SkillEntity;
  }
}

export const skillRepository = new SkillRepository();
