import { pool } from '../config/database.js';

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

export class UserCustomSkillRepository {
  async createUserCustomSkill(skill: Omit<UserCustomSkillEntity, "created_at" | "updated_at">): Promise<UserCustomSkillEntity> {
    const now = new Date().toISOString();
    const keys = Object.keys(skill);
    const values = Object.values(skill);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const query = `
      INSERT INTO user_custom_skills (${columns}, created_at, updated_at)
      VALUES (${placeholders}, $${keys.length + 1}, $${keys.length + 1})
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [...values, now]);
      return result.rows[0];
    } catch (error: any) {
      throw new Error(`Failed to create user custom skill: ${error.message}`);
    }
  }

  async getUserCustomSkills(userId: string): Promise<UserCustomSkillEntity[]> {
    const query = `
      SELECT * FROM user_custom_skills 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await pool.query(query, [userId]);
      return result.rows as UserCustomSkillEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get user custom skills: ${error.message}`);
    }
  }

  async getUserCustomSkillById(id: string, userId: string): Promise<UserCustomSkillEntity | null> {
    const query = `
      SELECT * FROM user_custom_skills 
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `;
    
    try {
      const result = await pool.query(query, [id, userId]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to get user custom skill: ${error.message}`);
    }
  }

  async updateUserCustomSkill(
    id: string, 
    userId: string, 
    updates: Partial<Omit<UserCustomSkillEntity, "id" | "user_id" | "created_at" | "updated_at">>
  ): Promise<UserCustomSkillEntity | null> {
    const now = new Date().toISOString();
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');

    const query = `
      UPDATE user_custom_skills 
      SET ${setClause}, updated_at = $1
      WHERE id = $${keys.length + 2} AND user_id = $${keys.length + 3}
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [now, ...values, id, userId]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to update user custom skill: ${error.message}`);
    }
  }

  async deleteUserCustomSkill(id: string, userId: string): Promise<boolean> {
    const query = `DELETE FROM user_custom_skills WHERE id = $1 AND user_id = $2`;
    
    try {
      const result = await pool.query(query, [id, userId]);
      return (result.rowCount ?? 0) > 0;
    } catch (error: any) {
      throw new Error(`Failed to delete user custom skill: ${error.message}`);
    }
  }

  async searchUserCustomSkills(userId: string, keyword: string): Promise<UserCustomSkillEntity[]> {
    const pattern = `%${keyword}%`;
    const query = `
      SELECT * FROM user_custom_skills 
      WHERE user_id = $1 AND (name ILIKE $2 OR description ILIKE $2)
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await pool.query(query, [userId, pattern]);
      return result.rows as UserCustomSkillEntity[];
    } catch (error: any) {
      throw new Error(`Failed to search user custom skills: ${error.message}`);
    }
  }

  async createSkillSuggestion(suggestion: Omit<SkillSuggestionEntity, "created_at" | "updated_at">): Promise<SkillSuggestionEntity> {
    const now = new Date().toISOString();
    const keys = Object.keys(suggestion);
    const values = Object.values(suggestion);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.join(', ');

    const query = `
      INSERT INTO skill_suggestions (${columns}, created_at, updated_at)
      VALUES (${placeholders}, $${keys.length + 1}, $${keys.length + 1})
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [...values, now]);
      return result.rows[0];
    } catch (error: any) {
      throw new Error(`Failed to create skill suggestion: ${error.message}`);
    }
  }

  async getSkillSuggestionByName(skillName: string): Promise<SkillSuggestionEntity | null> {
    const query = `SELECT * FROM skill_suggestions WHERE skill_name = $1 LIMIT 1`;
    
    try {
      const result = await pool.query(query, [skillName]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to get skill suggestion: ${error.message}`);
    }
  }

  async incrementSkillSuggestionCount(id: string): Promise<SkillSuggestionEntity | null> {
    const query = `
      UPDATE skill_suggestions 
      SET times_requested = times_requested + 1, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to increment skill suggestion count: ${error.message}`);
    }
  }

  async getPendingSkillSuggestions(): Promise<SkillSuggestionEntity[]> {
    const query = `
      SELECT * FROM skill_suggestions 
      WHERE status = 'pending' 
      ORDER BY times_requested DESC
    `;
    
    try {
      const result = await pool.query(query);
      return result.rows as SkillSuggestionEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get pending skill suggestions: ${error.message}`);
    }
  }

  async updateSkillSuggestionStatus(
    id: string, 
    status: "approved" | "rejected"
  ): Promise<SkillSuggestionEntity | null> {
    const query = `
      UPDATE skill_suggestions 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [status, id]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to update skill suggestion status: ${error.message}`);
    }
  }
}

export const userCustomSkillRepository = new UserCustomSkillRepository();
