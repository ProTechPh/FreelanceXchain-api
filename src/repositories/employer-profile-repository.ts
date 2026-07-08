import { BaseRepositoryAppwrite } from './base-repository-appwrite.js';
import { Query } from '../config/appwrite.js';

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

const COLLECTION_ID = 'employer_profiles';

export class EmployerProfileRepository extends BaseRepositoryAppwrite<EmployerProfileEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createProfile(profile: Omit<EmployerProfileEntity, 'created_at' | 'updated_at'>): Promise<EmployerProfileEntity> {
    return this.create(profile);
  }

  async getProfileByUserId(userId: string): Promise<EmployerProfileEntity | null> {
    return this.findOne('user_id', userId);
  }

  async getProfilesByUserIds(userIds: string[]): Promise<Map<string, EmployerProfileEntity>> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return new Map();

    const docs = await this.listWithQueries([Query.equal('user_id', uniqueIds)]);
    const map = new Map<string, EmployerProfileEntity>();
    docs.forEach(doc => map.set(doc.user_id, doc));
    return map;
  }

  async updateProfile(id: string, updates: Partial<EmployerProfileEntity>): Promise<EmployerProfileEntity | null> {
    return this.update(id, updates);
  }
}

export const employerProfileRepository = new EmployerProfileRepository();
