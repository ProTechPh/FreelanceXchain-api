import { BaseRepository, PaginatedResult, QueryOptions, fromAppwriteDoc } from './base-repository.js';
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

function normalizeSkills(value: unknown): FreelancerProfileEntity['skills'] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (typeof candidate === 'string') {
      const name = candidate.trim();
      return name ? [{ name, years_of_experience: 0 }] : [];
    }
    if (!candidate || typeof candidate !== 'object') return [];

    const skill = candidate as Record<string, unknown>;
    const nameValue = [skill.name, skill.skillName, skill.skill_name]
      .find(item => typeof item === 'string' && item.trim());
    if (typeof nameValue !== 'string') return [];

    const yearsValue = skill.years_of_experience ?? skill.yearsOfExperience;
    const years = typeof yearsValue === 'number' && Number.isFinite(yearsValue) && yearsValue >= 0
      ? yearsValue
      : 0;
    return [{ name: nameValue.trim(), years_of_experience: years }];
  });
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableStringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') return value;
    if (value === null) return null;
  }
  return null;
}

function uniqueExperienceId(
  experience: Record<string, unknown>,
  index: number,
  usedIds: Set<string>,
): string {
  const persistedId = [experience.id, experience.experienceId, experience.experience_id]
    .find(value => typeof value === 'string' && value.trim());
  let id = typeof persistedId === 'string' ? persistedId.trim() : '';

  if (!id || usedIds.has(id)) {
    const baseId = `legacy-experience-${index}`;
    id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
  }

  usedIds.add(id);
  return id;
}

function normalizeExperience(value: unknown): FreelancerProfileEntity['experience'] {
  if (!Array.isArray(value)) return [];

  const usedIds = new Set<string>();
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const experience = candidate as Record<string, unknown>;

    return [{
      id: uniqueExperienceId(experience, index, usedIds),
      title: stringValue(experience.title),
      company: stringValue(experience.company),
      description: stringValue(experience.description),
      start_date: stringValue(experience.start_date ?? experience.startDate),
      end_date: nullableStringValue(experience.end_date, experience.endDate),
    }];
  });
}

function normalizeProfileEntity(entity: FreelancerProfileEntity): FreelancerProfileEntity {
  return {
    ...entity,
    skills: normalizeSkills(entity.skills),
    experience: normalizeExperience(entity.experience),
  };
}

function mapProfile(doc: Record<string, unknown>): FreelancerProfileEntity {
  const result = fromAppwriteDoc<Record<string, unknown>>(doc);
  if (typeof result.skills === 'string') {
    result.skills = JSON.parse(result.skills);
  }
  if (typeof result.experience === 'string') {
    result.experience = JSON.parse(result.experience);
  }
  return normalizeProfileEntity(result as FreelancerProfileEntity);
}

export class FreelancerProfileRepository extends BaseRepository<FreelancerProfileEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createProfile(profile: Omit<FreelancerProfileEntity, 'created_at' | 'updated_at'>): Promise<FreelancerProfileEntity> {
    return normalizeProfileEntity(await this.create(profile));
  }

  async getProfileByUserId(userId: string): Promise<FreelancerProfileEntity | null> {
    const profile = await this.findOne('user_id', userId);
    return profile ? normalizeProfileEntity(profile) : null;
  }

  async updateProfile(id: string, updates: Partial<FreelancerProfileEntity>): Promise<FreelancerProfileEntity | null> {
    const profile = await this.update(id, updates);
    return profile ? normalizeProfileEntity(profile) : null;
  }

  async getAvailableProfiles(): Promise<FreelancerProfileEntity[]> {
    try {
      // fetchAll (cursor pagination) instead of Query.limit(1000): AI matching
      // silently ignored available freelancers past the first 1000.
      const profiles = await this.fetchAll([
        Query.equal('availability', 'available'),
        Query.orderDesc('created_at'),
      ]);
      return profiles.map(normalizeProfileEntity);
    } catch {
      return [];
    }
  }

  async searchBySkills(skillNames: string[], options?: QueryOptions): Promise<PaginatedResult<FreelancerProfileEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const lowerSkillNames = skillNames.map(s => s.toLowerCase());

    try {
      // fetchAll instead of Query.limit(1000): the in-memory filter below only
      // saw the newest 1000 profiles, so older freelancers were unreachable by
      // skill search and total/hasMore were computed from the truncated slice.
      const allProfiles = (await this.fetchAll([Query.orderDesc('created_at')])).map(normalizeProfileEntity);
      const lowerSkillNameSet = new Set(lowerSkillNames);
      const filtered = allProfiles.filter(profile =>
        profile.skills.some(skill => lowerSkillNameSet.has(skill.name.toLowerCase()))
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
      // fetchAll instead of Query.limit(1000): same truncation class as
      // searchBySkills — the keyword filter only saw the newest 1000 profiles.
      const allProfiles = (await this.fetchAll([Query.orderDesc('created_at')])).map(normalizeProfileEntity);
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
    const result = await this.queryPaginated(options, 'created_at', false);
    return { ...result, items: result.items.map(normalizeProfileEntity) };
  }

  /**
   * Filtered profile search for saved-search notifications.
   * Only query-able primitive values are passed to Appwrite's Query.equal.
   * Errors propagate to the caller.
   */
  async findByFilters(filters: Record<string, unknown>, limit: number): Promise<FreelancerProfileEntity[]> {
    const queries: string[] = [Query.limit(limit)];
    const ALLOWED_COLUMNS = new Set(['status', 'budget', 'category', 'title']);

    for (const [key, value] of Object.entries(filters)) {
      if (!ALLOWED_COLUMNS.has(key)) continue;
      if (
        value !== undefined &&
        value !== null &&
        (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value))
      ) {
        queries.push(Query.equal(key, value));
      }
    }

    const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, queries);
    return response.documents.map(mapProfile);
  }
}

export const freelancerProfileRepository = new FreelancerProfileRepository();
