import { BaseRepositoryPg, PaginatedResult, QueryOptions } from './base-repository-pg.js';
import type { ContractStatus } from '../models/contract.js';

export type { ContractStatus };

export type ContractEntity = {
  id: string;
  project_id: string;
  proposal_id: string;
  freelancer_id: string;
  employer_id: string;
  escrow_address: string;
  base_amount: number;
  rush_fee: number;
  total_amount: number;
  status: ContractStatus;
  created_at: string;
  updated_at: string;
};

export class ContractRepository extends BaseRepositoryPg<ContractEntity> {
  constructor() {
    super('contracts');
  }

  async createContract(contract: Omit<ContractEntity, 'created_at' | 'updated_at'>): Promise<ContractEntity> {
    return this.create(contract);
  }

  async getContractById(id: string): Promise<ContractEntity | null> {
    return this.getById(id);
  }

  async getContractByIdWithRelations(id: string): Promise<any | null> {
    const query = `
      SELECT 
        c.*,
        json_build_object(
          'id', p.id,
          'title', p.title,
          'description', p.description,
          'deadline', p.deadline,
          'milestones', p.milestones
        ) as project,
        json_build_object(
          'id', f.id,
          'email', f.email,
          'role', f.role,
          'name', f.name,
          'freelancer_profile', json_build_object(
            'bio', fp.bio,
            'hourly_rate', fp.hourly_rate,
            'skills', fp.skills,
            'experience', fp.experience,
            'availability', fp.availability
          )
        ) as freelancer,
        json_build_object(
          'id', e.id,
          'email', e.email,
          'role', e.role,
          'name', e.name,
          'employer_profile', json_build_object(
            'company_name', ep.company_name,
            'description', ep.description,
            'industry', ep.industry
          )
        ) as employer
      FROM contracts c
      JOIN projects p ON c.project_id = p.id
      JOIN users f ON c.freelancer_id = f.id
      LEFT JOIN freelancer_profiles fp ON f.id = fp.user_id
      JOIN users e ON c.employer_id = e.id
      LEFT JOIN employer_profiles ep ON e.id = ep.user_id
      WHERE c.id = $1
    `;
    
    try {
      const result = await this.pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to get contract with relations: ${error.message}`);
    }
  }

  async updateContract(id: string, updates: Partial<ContractEntity>): Promise<ContractEntity | null> {
    return this.update(id, updates);
  }

  async findContractByProposalId(proposalId: string): Promise<ContractEntity | null> {
    return this.findOne('proposal_id', proposalId);
  }

  async getContractsByFreelancer(freelancerId: string, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE freelancer_id = $1`;
    const countResult = await this.pool.query(countQuery, [freelancerId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE freelancer_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [freelancerId, limit, offset]);
      return {
        items: result.rows as ContractEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get contracts by freelancer: ${error.message}`);
    }
  }

  async getContractsByEmployer(employerId: string, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
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
        items: result.rows as ContractEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get contracts by employer: ${error.message}`);
    }
  }

  async getContractsByProject(projectId: string): Promise<ContractEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE project_id = $1
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query, [projectId]);
      return result.rows as ContractEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get contracts by project: ${error.message}`);
    }
  }

  async getContractsByStatus(status: ContractStatus, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
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
        items: result.rows as ContractEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get contracts by status: ${error.message}`);
    }
  }

  async getUserContracts(userId: string, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE freelancer_id = $1 OR employer_id = $1`;
    const countResult = await this.pool.query(countQuery, [userId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT c.*, 
             json_build_object(
               'id', p.id,
               'title', p.title,
               'description', p.description,
               'deadline', p.deadline,
               'milestones', p.milestones
             ) as project
      FROM contracts c
      JOIN projects p ON c.project_id = p.id
      WHERE c.freelancer_id = $1 OR c.employer_id = $1
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [userId, limit, offset]);
      return {
        items: result.rows as ContractEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get user contracts: ${error.message}`);
    }
  }

  async getAllContracts(): Promise<ContractEntity[]> {
    return this.queryAll();
  }
}

export const contractRepository = new ContractRepository();
