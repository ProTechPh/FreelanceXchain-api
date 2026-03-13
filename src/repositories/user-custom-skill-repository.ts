import { getSupabaseServiceClient } from "../config/supabase.js";

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
    const { data, error } = await getSupabaseServiceClient()
      .from("user_custom_skills")
      .insert(skill)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create user custom skill: ${error.message}`);
    }

    return data;
  }

  async getUserCustomSkills(userId: string): Promise<UserCustomSkillEntity[]> {
    const { data, error } = await getSupabaseServiceClient()
      .from("user_custom_skills")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get user custom skills: ${error.message}`);
    }

    return data || [];
  }

  async getUserCustomSkillById(id: string, userId: string): Promise<UserCustomSkillEntity | null> {
    const { data, error } = await getSupabaseServiceClient()
      .from("user_custom_skills")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get user custom skill: ${error.message}`);
    }

    return data;
  }

  async updateUserCustomSkill(
    id: string, 
    userId: string, 
    updates: Partial<Omit<UserCustomSkillEntity, "id" | "user_id" | "created_at" | "updated_at">>
  ): Promise<UserCustomSkillEntity | null> {
    const { data, error } = await getSupabaseServiceClient()
      .from("user_custom_skills")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to update user custom skill: ${error.message}`);
    }

    return data;
  }

  async deleteUserCustomSkill(id: string, userId: string): Promise<boolean> {
    const { error } = await getSupabaseServiceClient()
      .from("user_custom_skills")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Failed to delete user custom skill: ${error.message}`);
    }

    return true;
  }

  async searchUserCustomSkills(userId: string, keyword: string): Promise<UserCustomSkillEntity[]> {
    const { data, error } = await getSupabaseServiceClient()
      .from("user_custom_skills")
      .select("*")
      .eq("user_id", userId)
      .or(`name.ilike.%${keyword}%,description.ilike.%${keyword}%`)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to search user custom skills: ${error.message}`);
    }

    return data || [];
  }

  async createSkillSuggestion(suggestion: Omit<SkillSuggestionEntity, "created_at" | "updated_at">): Promise<SkillSuggestionEntity> {
    const { data, error } = await getSupabaseServiceClient()
      .from("skill_suggestions")
      .insert(suggestion)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create skill suggestion: ${error.message}`);
    }

    return data;
  }

  async getSkillSuggestionByName(skillName: string): Promise<SkillSuggestionEntity | null> {
    const { data, error } = await getSupabaseServiceClient()
      .from("skill_suggestions")
      .select("*")
      .eq("skill_name", skillName)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(`Failed to get skill suggestion: ${error.message}`);
    }

    return data;
  }

  async incrementSkillSuggestionCount(id: string): Promise<SkillSuggestionEntity | null> {
    const supabase = getSupabaseServiceClient();
    
    // First get the current suggestion
    const { data: current, error: fetchError } = await supabase
      .from("skill_suggestions")
      .select("times_requested")
      .eq("id", id)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch skill suggestion: ${fetchError.message}`);
    }

    // Then update with incremented count
    const { data, error } = await supabase
      .from("skill_suggestions")
      .update({ times_requested: current.times_requested + 1 })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to increment skill suggestion count: ${error.message}`);
    }

    return data;
  }

  async getPendingSkillSuggestions(): Promise<SkillSuggestionEntity[]> {
    const { data, error } = await getSupabaseServiceClient()
      .from("skill_suggestions")
      .select("*")
      .eq("status", "pending")
      .order("times_requested", { ascending: false });

    if (error) {
      throw new Error(`Failed to get pending skill suggestions: ${error.message}`);
    }

    return data || [];
  }

  async updateSkillSuggestionStatus(
    id: string, 
    status: "approved" | "rejected"
  ): Promise<SkillSuggestionEntity | null> {
    const { data, error } = await getSupabaseServiceClient()
      .from("skill_suggestions")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update skill suggestion status: ${error.message}`);
    }

    return data;
  }
}

export const userCustomSkillRepository = new UserCustomSkillRepository();
