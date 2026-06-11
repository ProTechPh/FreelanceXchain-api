import { BaseRepositoryAppwrite } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type SkillCategoryEntity = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'skill_categories';

export class SkillCategoryRepository extends BaseRepositoryAppwrite<SkillCategoryEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createCategory(category: Omit<SkillCategoryEntity, 'created_at' | 'updated_at'>): Promise<SkillCategoryEntity> {
    try {
      return await this.create(category);
    } catch (error: any) {
      throw new Error(`Failed to create: ${error.message}`);
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
      return response.documents.map((doc: any) => {
        const { $id, $createdAt, $updatedAt, ...attrs } = doc;
        return {
          id: $id,
          ...attrs,
          created_at: attrs.created_at ?? $createdAt,
          updated_at: attrs.updated_at ?? $updatedAt,
        } as SkillCategoryEntity;
      });
    } catch (error: any) {
      throw new Error(`Failed to get all categories: ${error.message}`);
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
      return response.documents.map((doc: any) => {
        const { $id, $createdAt, $updatedAt, ...attrs } = doc;
        return {
          id: $id,
          ...attrs,
          created_at: attrs.created_at ?? $createdAt,
          updated_at: attrs.updated_at ?? $updatedAt,
        } as SkillCategoryEntity;
      });
    } catch (error: any) {
      throw new Error(`Failed to get active categories: ${error.message}`);
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
        (d: any) => d.name?.toLowerCase() === name.toLowerCase()
      );
      if (!doc) return null;
      const { $id, $createdAt, $updatedAt, ...attrs } = doc as any;
      return {
        id: $id,
        ...attrs,
        created_at: attrs.created_at ?? $createdAt,
        updated_at: attrs.updated_at ?? $updatedAt,
      } as SkillCategoryEntity;
    } catch (error: any) {
      throw new Error(`Failed to get category by name: ${error.message}`);
    }
  }
}

export const skillCategoryRepository = new SkillCategoryRepository();
