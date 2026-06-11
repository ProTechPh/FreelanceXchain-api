import { BaseRepositoryAppwrite, type QueryOptions, type PaginatedResult } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import type { MilestoneStatus } from '../models/project.js';
export type { MilestoneStatus } from '../models/project.js';

type FileAttachment = { url: string; filename: string; size: number; mimeType: string };

export type MilestoneEntity = {
  id: string;
  title: string;
  description: string;
  amount: number;
  due_date: string;
  dueDate?: string;
  status: MilestoneStatus;
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

export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';

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

const COLLECTION_ID = 'projects';

function mapDoc(doc: Record<string, any>): ProjectEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  const parse = (val: any, fallback: any = undefined) => {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return fallback; }
    }
    return val;
  };
  return {
    id: $id,
    ...attrs,
    required_skills: parse(attrs.required_skills, []),
    milestones: parse(attrs.milestones, []),
    tags: parse(attrs.tags, []),
    attachments: parse(attrs.attachments, []),
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as ProjectEntity;
}

export class ProjectRepository extends BaseRepositoryAppwrite<ProjectEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createProject(project: Omit<ProjectEntity, 'created_at' | 'updated_at'>): Promise<ProjectEntity> {
    const data: Record<string, any> = { ...project };
    if (data.required_skills) data.required_skills = JSON.stringify(data.required_skills);
    if (data.milestones) data.milestones = JSON.stringify(data.milestones);
    if (data.tags) data.tags = JSON.stringify(data.tags);
    if (data.attachments) data.attachments = JSON.stringify(data.attachments);
    return this.create(data as any);
  }

  async getProjectById(id: string): Promise<ProjectEntity | null> {
    const doc = await this.getById(id);
    return doc ? mapDoc(doc as any) : null;
  }

  async updateProject(id: string, updates: Partial<ProjectEntity>): Promise<ProjectEntity | null> {
    const data: Record<string, any> = { ...updates };
    if (data.required_skills) data.required_skills = JSON.stringify(data.required_skills);
    if (data.milestones) data.milestones = JSON.stringify(data.milestones);
    if (data.tags) data.tags = JSON.stringify(data.tags);
    if (data.attachments) data.attachments = JSON.stringify(data.attachments);
    const doc = await this.update(id, data as any);
    return doc ? mapDoc(doc as any) : null;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async findProjectById(id: string): Promise<ProjectEntity | null> {
    return this.getProjectById(id);
  }

  async getProjectsByEmployer(employerId: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('employer_id', employerId)],
      limit,
      offset,
      mapDoc
    );
  }

  async getAllOpenProjects(options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('status', 'open')],
      limit,
      offset,
      mapDoc
    );
  }

  async getProjectsByStatus(status: ProjectStatus, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('status', status)],
      limit,
      offset,
      mapDoc
    );
  }

  async getProjectsBySkills(skillIds: string[], options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    // Appwrite doesn't support JSONB contains; filter in-memory
    const all = await this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('status', 'open'), Query.limit(1000)],
      1000,
      0,
      mapDoc
    );
    const filtered = all.items.filter(p =>
      skillIds.some(id => p.required_skills?.some(s => s.skill_id === id))
    );
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return {
      items: filtered.slice(offset, offset + limit),
      hasMore: offset + limit < filtered.length,
      total: filtered.length,
    };
  }

  async getProjectsByBudgetRange(minBudget: number, maxBudget: number, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const all = await this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('status', 'open'), Query.limit(1000)],
      1000,
      0,
      mapDoc
    );
    const filtered = all.items.filter(p => p.budget >= minBudget && p.budget <= maxBudget);
    return {
      items: filtered.slice(offset, offset + limit),
      hasMore: offset + limit < filtered.length,
      total: filtered.length,
    };
  }

  async searchProjects(keyword: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const all = await this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('status', 'open'), Query.limit(1000)],
      1000,
      0,
      mapDoc
    );
    const kw = keyword.toLowerCase();
    const filtered = all.items.filter(p =>
      p.title.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw)
    );
    return {
      items: filtered.slice(offset, offset + limit),
      hasMore: offset + limit < filtered.length,
      total: filtered.length,
    };
  }

  async getProjectsByCategory(categoryId: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const all = await this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('status', 'open'), Query.limit(1000)],
      1000,
      0,
      mapDoc
    );
    const filtered = all.items.filter(p =>
      p.required_skills?.some(s => s.category_id === categoryId)
    );
    return {
      items: filtered.slice(offset, offset + limit),
      hasMore: offset + limit < filtered.length,
      total: filtered.length,
    };
  }

  async getProjectsByMultipleCategories(categoryIds: string[], options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const all = await this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('status', 'open'), Query.limit(1000)],
      1000,
      0,
      mapDoc
    );
    const filtered = all.items.filter(p =>
      p.required_skills?.some(s => categoryIds.includes(s.category_id))
    );
    return {
      items: filtered.slice(offset, offset + limit),
      hasMore: offset + limit < filtered.length,
      total: filtered.length,
    };
  }
}

export const projectRepository = new ProjectRepository();
