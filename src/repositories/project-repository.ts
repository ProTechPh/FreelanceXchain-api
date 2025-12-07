import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';
import { Project } from '../models/project.js';

export class ProjectRepository extends BaseRepository<Project> {
  constructor() {
    super(COLLECTIONS.PROJECTS);
  }

  async createProject(project: Project): Promise<Project> {
    return this.create(project, project.employerId);
  }

  async getProjectById(id: string, employerId: string): Promise<Project | null> {
    return this.getById(id, employerId);
  }

  async updateProject(id: string, employerId: string, updates: Partial<Project>): Promise<Project | null> {
    return this.update(id, employerId, updates);
  }

  async deleteProject(id: string, employerId: string): Promise<boolean> {
    return this.delete(id, employerId);
  }

  async findProjectById(id: string): Promise<Project | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }],
    };
    return this.findOne(querySpec);
  }

  async getProjectsByEmployer(employerId: string, options?: QueryOptions): Promise<PaginatedResult<Project>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.employerId = @employerId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@employerId', value: employerId }],
    };
    return this.query(querySpec, options);
  }


  async getAllOpenProjects(options?: QueryOptions): Promise<PaginatedResult<Project>> {
    const querySpec = {
      query: "SELECT * FROM c WHERE c.status = 'open' ORDER BY c.createdAt DESC",
    };
    return this.query(querySpec, options);
  }

  async getProjectsByStatus(status: string, options?: QueryOptions): Promise<PaginatedResult<Project>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.status = @status ORDER BY c.createdAt DESC',
      parameters: [{ name: '@status', value: status }],
    };
    return this.query(querySpec, options);
  }

  async getProjectsBySkills(skillIds: string[], options?: QueryOptions): Promise<PaginatedResult<Project>> {
    const querySpec = {
      query: `SELECT * FROM c WHERE c.status = 'open' AND EXISTS(
        SELECT VALUE s FROM s IN c.requiredSkills WHERE ARRAY_CONTAINS(@skillIds, s.skillId)
      ) ORDER BY c.createdAt DESC`,
      parameters: [{ name: '@skillIds', value: skillIds }],
    };
    return this.query(querySpec, options);
  }

  async getProjectsByBudgetRange(minBudget: number, maxBudget: number, options?: QueryOptions): Promise<PaginatedResult<Project>> {
    const querySpec = {
      query: `SELECT * FROM c WHERE c.status = 'open' AND c.budget >= @minBudget AND c.budget <= @maxBudget ORDER BY c.createdAt DESC`,
      parameters: [
        { name: '@minBudget', value: minBudget },
        { name: '@maxBudget', value: maxBudget },
      ],
    };
    return this.query(querySpec, options);
  }

  async searchProjects(keyword: string, options?: QueryOptions): Promise<PaginatedResult<Project>> {
    const querySpec = {
      query: `SELECT * FROM c WHERE c.status = 'open' AND (
        CONTAINS(LOWER(c.title), @keyword) OR CONTAINS(LOWER(c.description), @keyword)
      ) ORDER BY c.createdAt DESC`,
      parameters: [{ name: '@keyword', value: keyword.toLowerCase() }],
    };
    return this.query(querySpec, options);
  }
}

export const projectRepository = new ProjectRepository();
