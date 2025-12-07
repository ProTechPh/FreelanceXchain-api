import { BaseRepository } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';
import { EmployerProfile } from '../models/employer-profile.js';

export class EmployerProfileRepository extends BaseRepository<EmployerProfile> {
  constructor() {
    super(COLLECTIONS.EMPLOYER_PROFILES);
  }

  async createProfile(profile: EmployerProfile): Promise<EmployerProfile> {
    return this.create(profile, profile.userId);
  }

  async getProfileById(id: string, userId: string): Promise<EmployerProfile | null> {
    return this.getById(id, userId);
  }

  async getProfileByUserId(userId: string): Promise<EmployerProfile | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.userId = @userId',
      parameters: [{ name: '@userId', value: userId }],
    };
    return this.findOne(querySpec);
  }

  async updateProfile(id: string, userId: string, updates: Partial<EmployerProfile>): Promise<EmployerProfile | null> {
    return this.update(id, userId, updates);
  }

  async deleteProfile(id: string, userId: string): Promise<boolean> {
    return this.delete(id, userId);
  }

  async getAllProfiles(): Promise<EmployerProfile[]> {
    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.createdAt DESC',
    };
    return this.queryAll(querySpec);
  }

  async getProfilesByIndustry(industry: string): Promise<EmployerProfile[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.industry = @industry ORDER BY c.createdAt DESC',
      parameters: [{ name: '@industry', value: industry }],
    };
    return this.queryAll(querySpec);
  }
}

export const employerProfileRepository = new EmployerProfileRepository();
