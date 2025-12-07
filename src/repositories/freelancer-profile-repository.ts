import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';
import { FreelancerProfile } from '../models/freelancer-profile.js';

export class FreelancerProfileRepository extends BaseRepository<FreelancerProfile> {
  constructor() {
    super(COLLECTIONS.FREELANCER_PROFILES);
  }

  async createProfile(profile: FreelancerProfile): Promise<FreelancerProfile> {
    return this.create(profile, profile.userId);
  }

  async getProfileById(id: string, userId: string): Promise<FreelancerProfile | null> {
    return this.getById(id, userId);
  }

  async getProfileByUserId(userId: string): Promise<FreelancerProfile | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.userId = @userId',
      parameters: [{ name: '@userId', value: userId }],
    };
    return this.findOne(querySpec);
  }

  async updateProfile(id: string, userId: string, updates: Partial<FreelancerProfile>): Promise<FreelancerProfile | null> {
    return this.update(id, userId, updates);
  }

  async deleteProfile(id: string, userId: string): Promise<boolean> {
    return this.delete(id, userId);
  }

  async getAllProfiles(): Promise<FreelancerProfile[]> {
    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.createdAt DESC',
    };
    return this.queryAll(querySpec);
  }

  async getProfilesBySkillId(skillId: string): Promise<FreelancerProfile[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(c.skills, { "skillId": @skillId }, true)',
      parameters: [{ name: '@skillId', value: skillId }],
    };
    return this.queryAll(querySpec);
  }

  async getAvailableProfiles(): Promise<FreelancerProfile[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.availability = @availability ORDER BY c.createdAt DESC',
      parameters: [{ name: '@availability', value: 'available' }],
    };
    return this.queryAll(querySpec);
  }

  async searchBySkills(skillIds: string[], options?: QueryOptions): Promise<PaginatedResult<FreelancerProfile>> {
    const querySpec = {
      query: `SELECT * FROM c WHERE EXISTS(
        SELECT VALUE s FROM s IN c.skills WHERE ARRAY_CONTAINS(@skillIds, s.skillId)
      ) ORDER BY c.createdAt DESC`,
      parameters: [{ name: '@skillIds', value: skillIds }],
    };
    return this.query(querySpec, options);
  }

  async searchByKeyword(keyword: string, options?: QueryOptions): Promise<PaginatedResult<FreelancerProfile>> {
    const querySpec = {
      query: `SELECT * FROM c WHERE (
        CONTAINS(LOWER(c.bio), @keyword)
      ) ORDER BY c.createdAt DESC`,
      parameters: [{ name: '@keyword', value: keyword.toLowerCase() }],
    };
    return this.query(querySpec, options);
  }

  async getAllProfilesPaginated(options?: QueryOptions): Promise<PaginatedResult<FreelancerProfile>> {
    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.createdAt DESC',
    };
    return this.query(querySpec, options);
  }
}

export const freelancerProfileRepository = new FreelancerProfileRepository();
