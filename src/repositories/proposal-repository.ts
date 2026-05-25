import { BaseRepositoryPg, PaginatedResult, QueryOptions } from './base-repository-pg.js';
import { FileAttachment } from '../utils/file-validator.js';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type ProposalEntity = {
  id: string;
  project_id: string;
  freelancer_id: string;
  cover_letter: string | null;
  attachments: FileAttachment[];
  proposed_rate: number;
  estimated_duration: number;
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
};

export class ProposalRepository extends BaseRepositoryPg<ProposalEntity> {
  constructor() {
    super('proposals');
  }

  async createProposal(proposal: Omit<ProposalEntity, 'created_at' | 'updated_at'>): Promise<ProposalEntity> {
    return this.create(proposal);
  }

  async getProposalById(id: string): Promise<ProposalEntity | null> {
    return this.getById(id);
  }

  async updateProposal(id: string, updates: Partial<ProposalEntity>): Promise<ProposalEntity | null> {
    return this.update(id, updates);
  }

  async findProposalById(id: string): Promise<ProposalEntity | null> {
    return this.getById(id);
  }

  async getProposalsByProject(projectId: string, options?: QueryOptions): Promise<PaginatedResult<ProposalEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const countQuery = `
      SELECT COUNT(*) FROM ${this.tableName} 
      WHERE project_id = $1 AND status != 'withdrawn'
    `;
    const countResult = await this.pool.query(countQuery, [projectId]);
    const total = parseInt(countResult.rows[0].count, 10);

    // Using a JOIN to get freelancer info
    const dataQuery = `
      SELECT p.*, 
             json_build_object('id', u.id, 'name', u.name, 'email', u.email) as freelancer
      FROM ${this.tableName} p
      JOIN users u ON p.freelancer_id = u.id
      WHERE p.project_id = $1 AND p.status != 'withdrawn'
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [projectId, limit, offset]);
      return {
        items: result.rows as ProposalEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get proposals by project: ${error.message}`);
    }
  }

  async getProposalsByFreelancer(freelancerId: string): Promise<ProposalEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE freelancer_id = $1
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query, [freelancerId]);
      return result.rows as ProposalEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get proposals by freelancer: ${error.message}`);
    }
  }

  async hasAcceptedProposal(projectId: string): Promise<boolean> {
    const query = `
      SELECT EXISTS (
        SELECT 1 FROM ${this.tableName} 
        WHERE project_id = $1 AND status = 'accepted'
      )
    `;
    
    try {
      const result = await this.pool.query(query, [projectId]);
      return result.rows[0].exists;
    } catch (error: any) {
      throw new Error(`Failed to check accepted proposal: ${error.message}`);
    }
  }

  async getAcceptedProposalCount(projectId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM ${this.tableName} 
      WHERE project_id = $1 AND status = 'accepted'
    `;
    
    try {
      const result = await this.pool.query(query, [projectId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error: any) {
      throw new Error(`Failed to get accepted proposal count: ${error.message}`);
    }
  }

  async getProposalCountByProject(projectId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM ${this.tableName} 
      WHERE project_id = $1 AND status != 'withdrawn'
    `;
    
    try {
      const result = await this.pool.query(query, [projectId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error: any) {
      throw new Error(`Failed to get proposal count: ${error.message}`);
    }
  }

  async getProposalCountsByProjects(projectIds: string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) return new Map();
    
    const query = `
      SELECT project_id, COUNT(*) as count 
      FROM ${this.tableName}
      WHERE project_id = ANY($1) AND status != 'withdrawn'
      GROUP BY project_id
    `;

    try {
      const result = await this.pool.query(query, [projectIds]);
      const counts = new Map<string, number>();
      for (const row of result.rows) {
        counts.set(row.project_id, parseInt(row.count, 10));
      }
      return counts;
    } catch (error: any) {
      throw new Error(`Failed to get proposal counts: ${error.message}`);
    }
  }

  async getExistingProposal(projectId: string, freelancerId: string): Promise<ProposalEntity | null> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE project_id = $1 AND freelancer_id = $2 AND status != 'withdrawn'
      LIMIT 1
    `;
    
    try {
      const result = await this.pool.query(query, [projectId, freelancerId]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to get existing proposal: ${error.message}`);
    }
  }
}

export const proposalRepository = new ProposalRepository();
