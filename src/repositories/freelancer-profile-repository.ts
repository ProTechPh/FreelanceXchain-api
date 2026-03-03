import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

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
    // Note: Freelancer skills now use name-based structure { name, years_of_experience }
    // not skill_id-based. This method is kept for backward compatibility but 
    // searchBySkills(skillNames) should be preferred.
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*');
    
    if (error) throw new Error(`Failed to get profiles by skill: ${error.message}`);
    
    // Filter in memory since JSONB contains won't match across different schema shapes
    const profiles = (data ?? []) as FreelancerProfileEntity[];
    return profiles.filter(profile =>
      profile.skills.some(skill => skill.name.toLowerCase() === skillId.toLowerCase())
    );
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

  async searchBySkills(skillNames: string[], options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Fetch ALL profiles, filter by skill, then paginate in memory.
    // This ensures total/hasMore reflect actual matched results.
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to search by skills: ${error.message}`);
    
    // Filter in memory for complex array matching (case-insensitive skill name search)
    const lowerSkillNames = skillNames.map(s => s.toLowerCase());
    const allMatched = (data ?? []).filter((profile: FreelancerProfileEntity) =>
      profile.skills.some(skill => lowerSkillNames.includes(skill.name.toLowerCase()))
    );

    const total = allMatched.length;
    const paginatedItems = allMatched.slice(offset, offset + limit);

    return {
      items: paginatedItems as FreelancerProfileEntity[],
      hasMore: offset + limit < total,
      total,
    };
  }

  async searchByKeyword(keyword: string, options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Sanitize keyword for PostgREST LIKE pattern to prevent injection
    const sanitizedKeyword = keyword
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .ilike('bio', `%${sanitizedKeyword}%`)
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
