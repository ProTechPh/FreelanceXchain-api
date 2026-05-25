import { BaseRepositoryPg, PaginatedResult, QueryOptions } from './base-repository-pg.js';

export type FreelancerProfileEntity = {
  id: string;
  user_id: string;
  name: string | null;
  nationality: string | null;
  bio: string;
  hourly_rate: number;
  skills: { name: string; years_of_experience: number }[];
  experience: { id: string; title: string; company: string; description: string; start_date: string; end_date: string | null }[];
  availability: 'available' | 'busy' | 'unavailable';
  created_at: string;
  updated_at: string;
};

export class FreelancerProfileRepository extends BaseRepositoryPg<FreelancerProfileEntity> {
  constructor() {
    super('freelancer_profiles');
  }

  async createProfile(profile: Omit<FreelancerProfileEntity, 'created_at' | 'updated_at'>): Promise<FreelancerProfileEntity> {
    return this.create(profile);
  }

  async getProfileById(id: string): Promise<FreelancerProfileEntity | null> {
    return this.getById(id);
  }

  async getProfileByUserId(userId: string): Promise<FreelancerProfileEntity | null> {
    return this.findOne('user_id', userId);
  }

  async updateProfile(id: string, updates: Partial<FreelancerProfileEntity>): Promise<FreelancerProfileEntity | null> {
    return this.update(id, updates);
  }

  async deleteProfile(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async getAllProfiles(): Promise<FreelancerProfileEntity[]> {
    return this.queryAll('created_at', false);
  }

  async getProfilesBySkillId(skillId: string): Promise<FreelancerProfileEntity[]> {
    // Note: Freelancer skills use name-based structure { name, years_of_experience }
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(skills) as skill
        WHERE LOWER(skill->>'name') = LOWER($1)
      )
    `;
    
    try {
      const result = await this.pool.query(query, [skillId]);
      return result.rows as FreelancerProfileEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get profiles by skill: ${error.message}`);
    }
  }

  async getAvailableProfiles(): Promise<FreelancerProfileEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE availability = 'available'
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query);
      return result.rows as FreelancerProfileEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get available profiles: ${error.message}`);
    }
  }

  async searchBySkills(skillNames: string[], options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const lowerSkillNames = skillNames.map(s => s.toLowerCase());

    const dataQuery = `
      SELECT *, COUNT(*) OVER() as total_count FROM ${this.tableName}
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(skills) as skill
        WHERE LOWER(skill->>'name') = ANY($1)
      )
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const result = await this.pool.query(dataQuery, [lowerSkillNames, limit, offset]);
      const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
      
      return {
        items: result.rows as FreelancerProfileEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to search by skills: ${error.message}`);
    }
  }

  async searchByKeyword(keyword: string, options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const pattern = `%${keyword}%`;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE bio ILIKE $1`;
    const countResult = await this.pool.query(countQuery, [pattern]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE bio ILIKE $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [pattern, limit, offset]);
      return {
        items: result.rows as FreelancerProfileEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to search by keyword: ${error.message}`);
    }
  }

  async getAllProfilesPaginated(options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    return this.queryPaginated(options, 'created_at', false);
  }
}

export const freelancerProfileRepository = new FreelancerProfileRepository();
