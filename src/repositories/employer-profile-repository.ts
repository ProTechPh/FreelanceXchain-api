import { BaseRepository } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

export type EmployerProfileEntity = {
  id: string;
  user_id: string;
  company_name: string;
  description: string;
  industry: string;
  created_at: string;
  updated_at: string;
};

export class EmployerProfileRepository extends BaseRepository<EmployerProfileEntity> {
  constructor() {
    super(TABLES.EMPLOYER_PROFILES);
  }

  async createProfile(profile: Omit<EmployerProfileEntity, 'created_at' | 'updated_at'>): Promise<EmployerProfileEntity> {
    return this.create(profile);
  }

  async getProfileById(id: string): Promise<EmployerProfileEntity | null> {
    return this.getById(id);
  }

  async getProfileByUserId(userId: string): Promise<EmployerProfileEntity | null> {
    return this.findOne('user_id', userId);
  }

  async updateProfile(id: string, updates: Partial<EmployerProfileEntity>): Promise<EmployerProfileEntity | null> {
    return this.update(id, updates);
  }

  async deleteProfile(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async getAllProfiles(): Promise<EmployerProfileEntity[]> {
    return this.queryAll('created_at', false);
  }

  async getProfilesByIndustry(industry: string): Promise<EmployerProfileEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('industry', industry)
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get profiles by industry: ${error.message}`);
    return (data ?? []) as EmployerProfileEntity[];
  }
}

export const employerProfileRepository = new EmployerProfileRepository();
