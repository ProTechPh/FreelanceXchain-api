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

export class SkillRepository extends BaseRepositoryAppwrite<SkillEntity> {
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
        } as SkillEntity;
      });
    } catch {
      return [];
    }
  }

  async getActiveSkills(): Promise<SkillEntity[]> {
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
        } as SkillEntity;
      });
    } catch {
      return [];
    }
  }

  async getSkillsByCategory(categoryId: string): Promise<SkillEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('category_id', categoryId),
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
        } as SkillEntity;
      });
    } catch {
      return [];
    }
  }

  async getActiveSkillsByCategory(categoryId: string): Promise<SkillEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('category_id', categoryId),
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
        } as SkillEntity;
      });
    } catch {
      return [];
    }
  }

  async searchSkillsByKeyword(keyword: string): Promise<SkillEntity[]> {
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
      const lowerKeyword = keyword.toLowerCase();
      return response.documents
        .map((doc: any) => {
          const { $id, $createdAt, $updatedAt, ...attrs } = doc;
          return {
            id: $id,
            ...attrs,
            created_at: attrs.created_at ?? $createdAt,
            updated_at: attrs.updated_at ?? $updatedAt,
          } as SkillEntity;
        })
        .filter(skill =>
          skill.name.toLowerCase().includes(lowerKeyword) ||
          skill.description.toLowerCase().includes(lowerKeyword)
        );
    } catch {
      return [];
    }
  }

  async getSkillByNameInCategory(name: string, categoryId: string): Promise<SkillEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('category_id', categoryId),
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
      } as SkillEntity;
    } catch {
      return null;
    }
  }
}

export const skillRepository = new SkillRepository();
