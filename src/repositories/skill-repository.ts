import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { normalizeSkillName } from '../utils/skill-utils.js';

export type SkillCategoryEntity = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SkillEntity = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'skills';

export class SkillRepository extends BaseRepository<SkillEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createSkill(skill: Omit<SkillEntity, 'created_at' | 'updated_at'>): Promise<SkillEntity> {
    return this.create(skill);
  }

  async findSkillById(id: string): Promise<SkillEntity | null> {
    return this.getById(id);
  }

  async updateSkill(id: string, updates: Partial<SkillEntity>): Promise<SkillEntity | null> {
    return this.update(id, updates);
  }

  async getAllSkills(): Promise<SkillEntity[]> {
    try {
      return await this.fetchAll([Query.orderAsc('name')]);
    } catch {
      return [];
    }
  }

  async getActiveSkills(): Promise<SkillEntity[]> {
    try {
      return await this.fetchAll([
        Query.equal('is_active', true),
        Query.orderAsc('name'),
      ]);
    } catch {
      return [];
    }
  }

  async getSkillsByCategory(categoryId: string): Promise<SkillEntity[]> {
    try {
      return await this.fetchAll([
        Query.equal('category_id', categoryId),
        Query.orderAsc('name'),
      ]);
    } catch {
      return [];
    }
  }

  async getActiveSkillsByCategory(categoryId: string): Promise<SkillEntity[]> {
    try {
      return await this.fetchAll([
        Query.equal('category_id', categoryId),
        Query.equal('is_active', true),
        Query.orderAsc('name'),
      ]);
    } catch {
      return [];
    }
  }

  /**
   * Search active skills by keyword in name or description.
   * Uses cursor pagination so results are not silently truncated at 1000 rows.
   */
  async searchSkillsByKeyword(keyword: string): Promise<SkillEntity[]> {
    try {
      const all = await this.fetchAll([
        Query.equal('is_active', true),
        Query.orderAsc('name'),
      ]);
      const lowerKeyword = keyword.toLowerCase();
      return all.filter(
        (skill) =>
          skill.name.toLowerCase().includes(lowerKeyword) ||
          skill.description.toLowerCase().includes(lowerKeyword)
      );
    } catch {
      return [];
    }
  }

  /**
   * Find a skill by name within a category, comparing with the canonical
   * normalized form so padding/casing/unicode variants resolve to the same skill.
   */
  async getSkillByNameInCategory(name: string, categoryId: string): Promise<SkillEntity | null> {
    try {
      const all = await this.fetchAll([Query.equal('category_id', categoryId)]);
      const normalized = normalizeSkillName(name);
      return all.find((s) => normalizeSkillName(s.name) === normalized) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Fail-closed exact-name lookup for the global-taxonomy duplicate check.
   * Unlike searchSkillsByKeyword (which swallows DB errors and returns []),
   * this method PROPAGATES read failures so a DB hiccup can never make a
   * duplicate check silently pass.
   */
  async getSkillByNameNormalized(name: string): Promise<SkillEntity | null> {
    const all = await this.fetchAll([Query.equal('is_active', true)]);
    const normalized = normalizeSkillName(name);
    return all.find((s) => normalizeSkillName(s.name) === normalized) ?? null;
  }

  /**
   * Batch-fetch skills by their document IDs in a single query.
   * Used by validateSkillIds to avoid an N+1 query per ID.
   */
  async findSkillsByIds(ids: string[]): Promise<SkillEntity[]> {
    if (ids.length === 0) return [];
    // listWithQueries already swallows database errors and returns [].
    return this.listWithQueries([Query.equal('$id', ids)]);
  }

  /**
   * Like findSkillsByIds, but REJECTS on database errors instead of returning
   * an empty array. Used by search paths that must distinguish "no skills
   * matched" from "taxonomy lookup failed" so degraded matching is observable
   * (the caller decides how to warn/fall back).
   */
  async findSkillsByIdsStrict(ids: string[]): Promise<SkillEntity[]> {
    if (ids.length === 0) return [];
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [Query.equal('$id', ids)]
    );
    return response.documents.map(doc => fromAppwriteDoc<SkillEntity>(doc));
  }
}

export const skillRepository = new SkillRepository();
