import { BaseRepository, type QueryOptions, type PaginatedResult, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { parseField, getErrorMessageOr } from '../utils/index.js';
import type { MilestoneStatus, FileAttachment } from '../models/milestone.js';
export type { MilestoneStatus } from '../models/milestone.js';

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

/** Extract the skill IDs from a project's required_skills for the indexed array attribute. */
function toSkillIds(requiredSkills: ProjectEntity['required_skills'] | undefined): string[] {
  return (requiredSkills ?? []).map(s => s.skill_id).filter(Boolean);
}

function normalizeProject(project: ProjectEntity): ProjectEntity {
  return {
    ...project,
    required_skills: parseField(project.required_skills, []),
    milestones: parseField(project.milestones, []),
    tags: parseField(project.tags, []),
    attachments: parseField(project.attachments, []),
  };
}

function mapDoc(doc: Record<string, unknown>): ProjectEntity {
  return normalizeProject(fromAppwriteDoc<ProjectEntity>(doc));
}

export class ProjectRepository extends BaseRepository<ProjectEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createProject(project: Omit<ProjectEntity, 'created_at' | 'updated_at'>): Promise<ProjectEntity> {
    const data: Record<string, unknown> = { ...project };
    if (data.required_skills) data.required_skills = JSON.stringify(data.required_skills);
    if (data.milestones) data.milestones = JSON.stringify(data.milestones);
    if (data.tags) data.tags = JSON.stringify(data.tags);
    if (data.attachments) data.attachments = JSON.stringify(data.attachments);
    // Parallel array attribute so skills can be filtered at the DB level
    // (Query.equal on array attributes) instead of scanning the collection.
    data.required_skill_ids = toSkillIds(project.required_skills);
    return this.create(data as Omit<ProjectEntity, 'created_at' | 'updated_at'>);
  }

  async getProjectById(id: string): Promise<ProjectEntity | null> {
    const doc = await this.getById(id);
    return doc ? normalizeProject(doc) : null;
  }

  async updateProject(id: string, updates: Partial<ProjectEntity>): Promise<ProjectEntity | null> {
    const data: Record<string, unknown> = { ...updates };
    if (data.required_skills) data.required_skills = JSON.stringify(data.required_skills);
    if (data.milestones) data.milestones = JSON.stringify(data.milestones);
    if (data.tags) data.tags = JSON.stringify(data.tags);
    if (data.attachments) data.attachments = JSON.stringify(data.attachments);
    if (updates.required_skills) data.required_skill_ids = toSkillIds(updates.required_skills);
    const doc = await this.update(id, data as Partial<ProjectEntity>);
    return doc ? normalizeProject(doc) : null;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async findProjectById(id: string): Promise<ProjectEntity | null> {
    return this.getProjectById(id);
  }

  /**
   * Batch-fetch projects by ID in a single query (kills the N+1 pattern used by
   * favorites enrichment). Projects that no longer exist are simply absent.
   */
  async getProjectsByIds(ids: string[]): Promise<ProjectEntity[]> {
    if (ids.length === 0) return [];
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [Query.equal('$id', ids), Query.limit(ids.length)]
      );
      return response.documents.map(mapDoc);
    } catch (error) {
      // Throw (like user-repository's getUsersByIds) so favorites enrichment
      // surfaces the failure as an error instead of silently dropping targets.
      throw new Error(`Failed to get projects by ids: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
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

  /** Count an employer's projects by status (e.g. dashboard open-projects count). */
  async countProjectsByEmployerAndStatus(employerId: string, status: ProjectStatus): Promise<number> {
    return this.countWithQueries([Query.equal('employer_id', employerId), Query.equal('status', status)]);
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
    // required_skill_ids is an array attribute kept in sync on write, so skill
    // filtering happens in the database (Query.equal on arrays) with pagination.
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('status', 'open'), Query.equal('required_skill_ids', skillIds)],
      limit,
      offset,
      mapDoc
    );
  }

  async getProjectsByBudgetRange(minBudget: number, maxBudget: number, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return this.paginatedWithQueries<ProjectEntity>(
      [Query.equal('status', 'open'), Query.between('budget', minBudget, maxBudget)],
      limit,
      offset,
      mapDoc
    );
  }

  async searchProjects(keyword: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    // Keyword matching is title OR description. Separate `contains` queries are
    // ANDed by Appwrite, so the OR is expressed as a single Query.or — one DB
    // round-trip with real server-side pagination (no fetch-all + in-memory
    // fallback). `contains` is case-insensitive, matching the app's search
    // semantics. Requires Appwrite >= 1.5 (Cloud and current self-hosted).
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return this.paginatedWithQueries<ProjectEntity>(
      [
        Query.equal('status', 'open'),
        Query.or([
          Query.contains('title', keyword),
          Query.contains('description', keyword),
        ]),
      ],
      limit,
      offset,
      mapDoc
    );
  }

  async getProjectsByCategory(categoryId: string, options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const all = await this.fetchAllOpenProjects();
    const filtered = all.filter(p =>
      p.required_skills?.some(s => s.category_id === categoryId)
    );
    return this.paginateFiltered(filtered, options);
  }

  async getProjectsByMultipleCategories(categoryIds: string[], options?: QueryOptions): Promise<PaginatedResult<ProjectEntity>> {
    const all = await this.fetchAllOpenProjects();
    const categoryIdSet = new Set(categoryIds);
    const filtered = all.filter(p =>
      p.required_skills?.some(s => categoryIdSet.has(s.category_id))
    );
    return this.paginateFiltered(filtered, options);
  }

  /**
   * Fetch ALL open projects using cursor-based pagination.
   *
   * The in-memory filter methods (skill/category/budget/keyword) can't push
   * their predicates down to Appwrite (no JSON contains/range on JSON attrs),
   * so they need the complete open-project set. Using fetchAll (instead of the
   * previous `Query.limit(1000)` page) keeps those results exact past 1000 docs.
   * Returns [] on a transient DB failure so callers keep their empty-page
   * contract instead of throwing. Note: a mid-loop fetch failure discards any
   * pages already fetched (the whole result becomes []), matching the previous
   * single-query behavior where any error produced an empty page.
   */
  private async fetchAllOpenProjects(): Promise<ProjectEntity[]> {
    try {
      return await this.fetchAll([Query.equal('status', 'open')]);
    } catch {
      return [];
    }
  }

  /** Apply offset/limit pagination to an in-memory filtered result set. */
  private paginateFiltered(filtered: ProjectEntity[], options?: QueryOptions): PaginatedResult<ProjectEntity> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return {
      items: filtered.slice(offset, offset + limit),
      hasMore: offset + limit < filtered.length,
      total: filtered.length,
    };
  }

  /**
   * Open projects, capped at `limit`. Errors propagate to the caller (scheduler job).
   */
  async listOpenProjects(limit: number): Promise<ProjectEntity[]> {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [
        Query.equal('status', 'open'),
        Query.limit(limit),
      ]
    );
    return response.documents.map(mapDoc);
  }

  /**
   * Every project, capped at `limit`. Errors propagate to the caller.
   */
  async listAllProjects(limit: number): Promise<ProjectEntity[]> {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [Query.limit(limit)]
    );
    return response.documents.map(mapDoc);
  }

  /**
   * Most recently created open projects. Errors propagate to the caller.
   */
  async listRecentOpenProjects(limit: number): Promise<ProjectEntity[]> {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_ID,
      [
        Query.equal('status', 'open'),
        Query.orderDesc('created_at'),
        Query.limit(limit),
      ]
    );
    return response.documents.map(mapDoc);
  }

  /**
   * Filtered project search for saved-search notifications.
   * Only query-able primitive values are passed to Appwrite's Query.equal.
   * Errors propagate to the caller.
   */
  async findByFilters(filters: Record<string, unknown>, limit: number): Promise<ProjectEntity[]> {
    const queries: string[] = [Query.limit(limit)];
    const ALLOWED_COLUMNS = new Set(['status', 'budget', 'category', 'title']);

    for (const [key, value] of Object.entries(filters)) {
      if (!ALLOWED_COLUMNS.has(key)) continue;
      if (
        value !== undefined &&
        value !== null &&
        (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value))
      ) {
        queries.push(Query.equal(key, value));
      }
    }

    const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, queries);
    return response.documents.map(mapDoc);
  }
}

export const projectRepository = new ProjectRepository();
