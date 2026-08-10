import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { getErrorMessageOr } from '../utils/index.js';

export type SkillCategoryEntity = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'skill_categories';

export class SkillCategoryRepository extends BaseRepository<SkillCategoryEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createCategory(category: Omit<SkillCategoryEntity, 'created_at' | 'updated_at'>): Promise<SkillCategoryEntity> {
    try {
      return await this.create(category);
    } catch (error) {
      throw new Error(`Failed to create: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getCategoryById(id: string): Promise<SkillCategoryEntity | null> {
    return this.getById(id);
  }

  async updateCategory(id: string, updates: Partial<SkillCategoryEntity>): Promise<SkillCategoryEntity | null> {
    return this.update(id, updates);
  }

  async deleteCategory(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async getAllCategories(): Promise<SkillCategoryEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.orderAsc('name'),
          Query.limit(1000),
        ]
      );
      return response.documents.map(doc => fromAppwriteDoc<SkillCategoryEntity>(doc));
    } catch (error) {
      throw new Error(`Failed to get all categories: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getActiveCategories(): Promise<SkillCategoryEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('is_active', true),
          Query.orderAsc('name'),
          Query.limit(1000),
        ]
      );
      return response.documents.map(doc => fromAppwriteDoc<SkillCategoryEntity>(doc));
    } catch (error) {
      throw new Error(`Failed to get active categories: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getCategoryByName(name: string): Promise<SkillCategoryEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.limit(1000),
        ]
      );
      const doc = response.documents.find(
        d => typeof d.name === 'string' && d.name.toLowerCase() === name.toLowerCase()
      );
      if (!doc) return null;
      return fromAppwriteDoc<SkillCategoryEntity>(doc);
    } catch (error) {
      throw new Error(`Failed to get category by name: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }
}

export const skillCategoryRepository = new SkillCategoryRepository();
