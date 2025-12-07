import { BaseRepository } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';
import { Skill } from '../models/skill.js';

export class SkillRepository extends BaseRepository<Skill> {
  constructor() {
    super(COLLECTIONS.SKILLS);
  }

  async createSkill(skill: Skill): Promise<Skill> {
    return this.create(skill, skill.categoryId);
  }

  async getSkillById(id: string, categoryId: string): Promise<Skill | null> {
    return this.getById(id, categoryId);
  }

  async updateSkill(id: string, categoryId: string, updates: Partial<Skill>): Promise<Skill | null> {
    return this.update(id, categoryId, updates);
  }

  async deleteSkill(id: string, categoryId: string): Promise<boolean> {
    return this.delete(id, categoryId);
  }

  async getAllSkills(): Promise<Skill[]> {
    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.name',
    };
    return this.queryAll(querySpec);
  }

  async getActiveSkills(): Promise<Skill[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.isActive = true ORDER BY c.name',
    };
    return this.queryAll(querySpec);
  }

  async getSkillsByCategory(categoryId: string): Promise<Skill[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.categoryId = @categoryId ORDER BY c.name',
      parameters: [{ name: '@categoryId', value: categoryId }],
    };
    return this.queryAll(querySpec);
  }

  async getActiveSkillsByCategory(categoryId: string): Promise<Skill[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.categoryId = @categoryId AND c.isActive = true ORDER BY c.name',
      parameters: [{ name: '@categoryId', value: categoryId }],
    };
    return this.queryAll(querySpec);
  }

  async searchSkillsByKeyword(keyword: string): Promise<Skill[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.isActive = true AND (CONTAINS(LOWER(c.name), @keyword) OR CONTAINS(LOWER(c.description), @keyword)) ORDER BY c.name',
      parameters: [{ name: '@keyword', value: keyword.toLowerCase() }],
    };
    return this.queryAll(querySpec);
  }

  async getSkillByNameInCategory(name: string, categoryId: string): Promise<Skill | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.categoryId = @categoryId AND LOWER(c.name) = @name',
      parameters: [
        { name: '@categoryId', value: categoryId },
        { name: '@name', value: name.toLowerCase() },
      ],
    };
    return this.findOne(querySpec);
  }

  async findSkillById(id: string): Promise<Skill | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }],
    };
    return this.findOne(querySpec);
  }
}

export const skillRepository = new SkillRepository();
