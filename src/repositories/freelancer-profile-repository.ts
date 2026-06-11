import { BaseRepositoryAppwrite, PaginatedResult, QueryOptions } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

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

const COLLECTION_ID = 'freelancer_profiles';

function mapProfile(doc: Record<string, any>): FreelancerProfileEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc as any;
  const result: Record<string, any> = {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  };
  if (typeof result.skills === 'string') {
    result.skills = JSON.parse(result.skills);
  }
  if (typeof result.experience === 'string') {
    result.experience = JSON.parse(result.experience);
  }
  return result as FreelancerProfileEntity;
}

export class FreelancerProfileRepository extends BaseRepositoryAppwrite<FreelancerProfileEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createProfile(profile: Omit<FreelancerProfileEntity, 'created_at' | 'updated_at'>): Promise<FreelancerProfileEntity> {
    return this.create(profile);
  }

  async getProfileByUserId(userId: string): Promise<FreelancerProfileEntity | null> {
    return this.findOne('user_id', userId);
  }

  async updateProfile(id: string, updates: Partial<FreelancerProfileEntity>): Promise<FreelancerProfileEntity | null> {
    return this.update(id, updates);
  }

  async getAvailableProfiles(): Promise<FreelancerProfileEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('availability', 'available'),
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      return response.documents.map(mapProfile);
    } catch {
      return [];
    }
  }

  async searchBySkills(skillNames: string[], options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const lowerSkillNames = skillNames.map(s => s.toLowerCase());

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      const allProfiles = response.documents.map(mapProfile);
      const filtered = allProfiles.filter(profile =>
        profile.skills.some(skill => lowerSkillNames.includes(skill.name.toLowerCase()))
      );
      const total = filtered.length;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < total,
        total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }

  async searchByKeyword(keyword: string, options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      const allProfiles = response.documents.map(mapProfile);
      const lowerKeyword = keyword.toLowerCase();
      const filtered = allProfiles.filter(profile =>
        profile.bio.toLowerCase().includes(lowerKeyword)
      );
      const total = filtered.length;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < total,
        total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }

  async getAllProfilesPaginated(options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    return this.queryPaginated(options, 'created_at', false);
  }
}

export const freelancerProfileRepository = new FreelancerProfileRepository();
