import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

export type FreelancerProfileEntity = {
  id: string;
  user_id: string;
  bio: string;
  hourly_rate: number;
  skills: { skill_id: string; skill_name: string; category_id: string; years_of_experience: number }[];
  experience: { id: string; title: string; company: string; description: string; start_date: string; end_date: string | null }[];
  availability: 'available' | 'busy' | 'unavailable';
  created_at: string;
  updated_at: string;
};

export class FreelancerProfileRepository extends BaseRepository<FreelancerProfileEntity> {
  constructor() {
    super(TABLES.FREELANCER_PROFILES);
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
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .contains('skills', [{ skill_id: skillId }]);
    
    if (error) throw new Error(`Failed to get profiles by skill: ${error.message}`);
    return (data ?? []) as FreelancerProfileEntity[];
  }

  async getAvailableProfiles(): Promise<FreelancerProfileEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('availability', 'available')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get available profiles: ${error.message}`);
    return (data ?? []) as FreelancerProfileEntity[];
  }

  async searchBySkills(skillIds: string[], options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Use overlaps for array containment check
    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to search by skills: ${error.message}`);
    
    // Filter in memory for complex array matching (Supabase limitation)
    const filtered = (data ?? []).filter((profile: FreelancerProfileEntity) =>
      profile.skills.some(skill => skillIds.includes(skill.skill_id))
    );

    return {
      items: filtered as FreelancerProfileEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async searchByKeyword(keyword: string, options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .ilike('bio', `%${keyword}%`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to search by keyword: ${error.message}`);
    
    return {
      items: (data ?? []) as FreelancerProfileEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getAllProfilesPaginated(options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    return this.queryPaginated(options, 'created_at', false);
  }
}

export const freelancerProfileRepository = new FreelancerProfileRepository();
