import { BaseRepositoryPg } from './base-repository-pg.js';

export type EmployerProfileEntity = {
  id: string;
  user_id: string;
  name: string | null;
  nationality: string | null;
  company_name: string;
  description: string;
  industry: string;
  created_at: string;
  updated_at: string;
};

export class EmployerProfileRepository extends BaseRepositoryPg<EmployerProfileEntity> {
  constructor() {
    super('employer_profiles');
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
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE industry = $1
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query, [industry]);
      return result.rows as EmployerProfileEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get profiles by industry: ${error.message}`);
    }
  }
}

export const employerProfileRepository = new EmployerProfileRepository();
