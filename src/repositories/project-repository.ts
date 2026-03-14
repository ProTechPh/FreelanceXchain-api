import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { TABLES } from '../config/supabase.js';
import { FileAttachment } from '../utils/file-validator.js';

export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
export type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'disputed' | 'refunded';

export type MilestoneEntity = {
  id: string;
  title: string;
  description: string;
  amount: number;
  due_date: string;
  status: MilestoneStatus;
};

export type ProjectEntity = {
  id: string;
  employer_id: string;
  title: string;
  description: string;
  required_skills: { skill_id: string; skill_name: string; category_id: string; years_of_experience: number }[];
  budget: number;
  deadline: string;
  status: ProjectStatus;
  milestones: MilestoneEntity[];
  tags: string[];
  attachments: FileAttachment[];
  created_at: string;
  updated_at: string;
};

export class ProjectRepository extends BaseRepository<ProjectEntity> {
  constructor() {
    super(TABLES.PROJECTS);
  }

  async createProject(project: Omit<ProjectEntity, 'created_at' | 'updated_at'>): Promise<ProjectEntity> {
    return this.create(project);
  }

  async getProjectById(id: string): Promise<ProjectEntity | null> {
    return this.getById(id);
  }

  async updateProject(id: string, updates: Partial<ProjectEntity>): Promise<ProjectEntity | null> {
    return this.update(id, updates);
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async findProjectById(id: string): Promise<ProjectEntity | null> {
    return this.getById(id);
  }

  async getProjectsByEmployer(employerId: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('employer_id', employerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get projects by employer: ${error.message}`);
    
    return {
      items: (data ?? []) as ProjectEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getAllOpenProjects(options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get open projects: ${error.message}`);
    
    return {
      items: (data ?? []) as ProjectEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getProjectsByStatus(status: ProjectStatus, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get projects by status: ${error.message}`);
    
    return {
      items: (data ?? []) as ProjectEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getProjectsBySkills(skillIds: string[], options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Fetch ALL open projects (no range), filter by skill, then paginate in memory.
    // This ensures total/hasMore reflect actual matched results, not all open projects.
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get projects by skills: ${error.message}`);
    
    // Filter for skill matching in memory
    const allMatched = (data ?? []).filter((project: ProjectEntity) =>
      project.required_skills.some(skill => skillIds.includes(skill.skill_id))
    );

    const total = allMatched.length;
    const paginatedItems = allMatched.slice(offset, offset + limit);

    return {
      items: paginatedItems as ProjectEntity[],
      hasMore: offset + limit < total,
      total,
    };
  }

  async getProjectsByBudgetRange(minBudget: number, maxBudget: number, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('status', 'open')
      .gte('budget', minBudget)
      .lte('budget', maxBudget)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get projects by budget: ${error.message}`);
    
    return {
      items: (data ?? []) as ProjectEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async searchProjects(keyword: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Sanitize keyword for PostgREST filter: escape characters that have special
    // meaning in PostgREST filter strings (commas, dots, parentheses, backslashes, percent)
    const sanitized = keyword
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/,/g, '\\,')
      .replace(/\./g, '\\.')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('status', 'open')
      .or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to search projects: ${error.message}`);
    
    return {
      items: (data ?? []) as ProjectEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getAllProjects(): Promise<ProjectEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*');
    
    if (error) throw new Error(`Failed to get all projects: ${error.message}`);
    return (data ?? []) as ProjectEntity[];
  }

  async getProjectsByCategory(categoryId: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Fetch ALL open projects (no range), filter by category, then paginate in memory.
    // This ensures total/hasMore reflect actual matched results, not all open projects.
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get projects by category: ${error.message}`);
    
    // Filter for category matching in memory
    const allMatched = (data ?? []).filter((project: ProjectEntity) =>
      project.required_skills.some(skill => skill.category_id === categoryId)
    );

    const total = allMatched.length;
    const paginatedItems = allMatched.slice(offset, offset + limit);

    return {
      items: paginatedItems as ProjectEntity[],
      hasMore: offset + limit < total,
      total,
    };
  }

  async getProjectsByMultipleCategories(categoryIds: string[], options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Fetch ALL open projects (no range), filter by categories, then paginate in memory.
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get projects by categories: ${error.message}`);
    
    // Filter for category matching in memory
    const allMatched = (data ?? []).filter((project: ProjectEntity) =>
      project.required_skills.some(skill => categoryIds.includes(skill.category_id))
    );

    const total = allMatched.length;
    const paginatedItems = allMatched.slice(offset, offset + limit);

    return {
      items: paginatedItems as ProjectEntity[],
      hasMore: offset + limit < total,
      total,
    };
  }
}

export const projectRepository = new ProjectRepository();
