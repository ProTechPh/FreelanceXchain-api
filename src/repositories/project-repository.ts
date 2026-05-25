import { BaseRepositoryPg, PaginatedResult, QueryOptions } from './base-repository-pg.js';
import { FileAttachment } from '../utils/file-validator.js';
export type { ProjectStatus, MilestoneStatus } from '../models/project.js';
import type { ProjectStatus, MilestoneStatus } from '../models/project.js';

export type MilestoneEntity = {
  id: string;
  title: string;
  description: string;
  amount: number;
  due_date: string;
  status: MilestoneStatus;
  dueDate?: string;
  contract_id?: string;
  contractId?: string;
  deliverable_files?: FileAttachment[];
  deliverableFiles?: FileAttachment[];
  submitted_at?: string;
  submittedAt?: string;
  approved_at?: string;
  approvedAt?: string;
  rejected_at?: string;
  rejectedAt?: string;
  completed_at?: string;
  completedAt?: string;
  rejection_reason?: string | null;
  rejectionReason?: string | null;
  revision_count?: number;
  revisionCount?: number;
  notes?: string;
};

export type ProjectEntity = {
  id: string;
  employer_id: string;
  title: string;
  description: string;
  required_skills: { skill_id: string; skill_name: string; category_id: string; years_of_experience: number }[];
  budget: number;
  deadline: string;
  is_rush: boolean;
  rush_fee_percentage: number;
  status: ProjectStatus;
  milestones: MilestoneEntity[];
  freelancer_limit: number;
  tags: string[];
  attachments: FileAttachment[];
  created_at: string;
  updated_at: string;
};

export class ProjectRepository extends BaseRepositoryPg<ProjectEntity> {
  constructor() {
    super('projects');
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
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE employer_id = $1`;
    const countResult = await this.pool.query(countQuery, [employerId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE employer_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [employerId, limit, offset]);
      return {
        items: result.rows as ProjectEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get projects by employer: ${error.message}`);
    }
  }

  async getAllOpenProjects(options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE status = 'open'`;
    const countResult = await this.pool.query(countQuery);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'open'
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [limit, offset]);
      return {
        items: result.rows as ProjectEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get open projects: ${error.message}`);
    }
  }

  async getProjectsByStatus(status: ProjectStatus, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE status = $1`;
    const countResult = await this.pool.query(countQuery, [status]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE status = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [status, limit, offset]);
      return {
        items: result.rows as ProjectEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get projects by status: ${error.message}`);
    }
  }

  async getProjectsBySkills(skillIds: string[], options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // In PostgreSQL, querying JSONB for skill existence
    const countQuery = `
      SELECT COUNT(*) FROM ${this.tableName} 
      WHERE status = 'open' AND required_skills @> $1
    `;
    const skillsJson = JSON.stringify(skillIds.map(id => ({ skill_id: id })));
    const countResult = await this.pool.query(countQuery, [skillsJson]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'open' AND required_skills @> $3
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [limit, offset, skillsJson]);
      return {
        items: result.rows as ProjectEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get projects by skills: ${error.message}`);
    }
  }

  async getProjectsByBudgetRange(minBudget: number, maxBudget: number, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE status = 'open' AND budget >= $1 AND budget <= $2`;
    const countResult = await this.pool.query(countQuery, [minBudget, maxBudget]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'open' AND budget >= $1 AND budget <= $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [minBudget, maxBudget, limit, offset]);
      return {
        items: result.rows as ProjectEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get projects by budget: ${error.message}`);
    }
  }

  async searchProjects(keyword: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const pattern = `%${keyword}%`;

    const countQuery = `
      SELECT COUNT(*) FROM ${this.tableName} 
      WHERE status = 'open' AND (title ILIKE $1 OR description ILIKE $1)
    `;
    const countResult = await this.pool.query(countQuery, [pattern]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'open' AND (title ILIKE $1 OR description ILIKE $1)
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [pattern, limit, offset]);
      return {
        items: result.rows as ProjectEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to search projects: ${error.message}`);
    }
  }

  async getAllProjects(): Promise<ProjectEntity[]> {
    return this.queryAll();
  }

  async getProjectsByCategory(categoryId: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    
    // Using JSONB path query for category_id existence in the required_skills array
    const queryJson = JSON.stringify([{ category_id: categoryId }]);
    
    const countQuery = `
      SELECT COUNT(*) FROM ${this.tableName} 
      WHERE status = 'open' AND required_skills @> $1
    `;
    const countResult = await this.pool.query(countQuery, [queryJson]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE status = 'open' AND required_skills @> $3
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [limit, offset, queryJson]);
      return {
        items: result.rows as ProjectEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get projects by category: ${error.message}`);
    }
  }

  async getProjectsByMultipleCategories(categoryIds: string[], options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Complex JSONB filtering for multiple categories - using EXISTS in subquery or JSONB arrows
    const dataQuery = `
      SELECT *, COUNT(*) OVER() as total_count FROM ${this.tableName}
      WHERE status = 'open' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(required_skills) as skill
        WHERE skill->>'category_id' = ANY($1)
      )
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const result = await this.pool.query(dataQuery, [categoryIds, limit, offset]);
      const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
      
      return {
        items: result.rows as ProjectEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get projects by categories: ${error.message}`);
    }
  }
}

export const projectRepository = new ProjectRepository();
