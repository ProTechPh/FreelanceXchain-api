import { BaseRepository } from './base-repository.js';
import { Query } from '../config/appwrite.js';
import { getErrorMessageOr } from '../utils/index.js';

export type UserCustomSkillEntity = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  years_of_experience: number;
  category_name?: string | undefined;
  is_approved: boolean;
  suggested_for_global: boolean;
  created_at: string;
  updated_at: string;
};

export type SkillSuggestionEntity = {
  id: string;
  user_id: string;
  skill_name: string;
  skill_description: string;
  category_name?: string | undefined;
  suggested_by: string;
  times_requested: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
};

const USER_CUSTOM_SKILLS_COLLECTION = 'user_custom_skills';
const SKILL_SUGGESTIONS_COLLECTION = 'skill_suggestions';

class UserCustomSkillRepository extends BaseRepository<UserCustomSkillEntity> {
  constructor() {
    super(USER_CUSTOM_SKILLS_COLLECTION);
  }

  async createUserCustomSkill(skill: Omit<UserCustomSkillEntity, "created_at" | "updated_at">): Promise<UserCustomSkillEntity> {
    try {
      return await this.create(skill);
    } catch (error) {
      throw new Error(`Failed to create user custom skill: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getUserCustomSkills(userId: string): Promise<UserCustomSkillEntity[]> {
    try {
      return await this.listWithQueries([
        Query.equal('user_id', userId),
        Query.orderDesc('created_at'),
      ]);
    } catch (error) {
      throw new Error(`Failed to get user custom skills: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getUserCustomSkillById(id: string, userId: string): Promise<UserCustomSkillEntity | null> {
    try {
      const skill = await this.getById(id);
      if (!skill || skill.user_id !== userId) return null;
      return skill;
    } catch (error) {
      throw new Error(`Failed to get user custom skill: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async updateUserCustomSkill(
    id: string,
    userId: string,
    updates: Partial<Omit<UserCustomSkillEntity, "id" | "user_id" | "created_at" | "updated_at">>
  ): Promise<UserCustomSkillEntity | null> {
    try {
      const existing = await this.getById(id);
      if (!existing || existing.user_id !== userId) return null;
      return await this.update(id, updates);
    } catch (error) {
      throw new Error(`Failed to update user custom skill: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async deleteUserCustomSkill(id: string, userId: string): Promise<boolean> {
    try {
      const existing = await this.getById(id);
      if (!existing || existing.user_id !== userId) return false;
      return await this.delete(id);
    } catch (error) {
      throw new Error(`Failed to delete user custom skill: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async searchUserCustomSkills(userId: string, keyword: string): Promise<UserCustomSkillEntity[]> {
    try {
      const all = await this.listWithQueries([
        Query.equal('user_id', userId),
        Query.orderDesc('created_at'),
      ]);
      const lower = keyword.toLowerCase();
      return all.filter(s =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower)
      );
    } catch (error) {
      throw new Error(`Failed to search user custom skills: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }
}

class SkillSuggestionRepositoryAppwrite extends BaseRepository<SkillSuggestionEntity> {
  constructor() {
    super(SKILL_SUGGESTIONS_COLLECTION);
  }

  async createSkillSuggestion(suggestion: Omit<SkillSuggestionEntity, "created_at" | "updated_at">): Promise<SkillSuggestionEntity> {
    try {
      return await this.create(suggestion);
    } catch (error) {
      throw new Error(`Failed to create skill suggestion: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getSkillSuggestionByName(skillName: string): Promise<SkillSuggestionEntity | null> {
    try {
      return await this.findOne('skill_name', skillName);
    } catch (error) {
      throw new Error(`Failed to get skill suggestion: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async incrementSkillSuggestionCount(id: string): Promise<SkillSuggestionEntity | null> {
    try {
      const existing = await this.getById(id);
      if (!existing) return null;
      return await this.update(id, { times_requested: existing.times_requested + 1 });
    } catch (error) {
      throw new Error(`Failed to increment skill suggestion count: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async getPendingSkillSuggestions(): Promise<SkillSuggestionEntity[]> {
    try {
      return await this.listWithQueries([
        Query.equal('status', 'pending'),
        Query.orderDesc('times_requested'),
      ]);
    } catch (error) {
      throw new Error(`Failed to get pending skill suggestions: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async updateSkillSuggestionStatus(
    id: string,
    status: "approved" | "rejected"
  ): Promise<SkillSuggestionEntity | null> {
    try {
      return await this.update(id, { status });
    } catch (error) {
      throw new Error(`Failed to update skill suggestion status: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }
}

export const userCustomSkillRepository = new UserCustomSkillRepository();
export const skillSuggestionRepository = new SkillSuggestionRepositoryAppwrite();
