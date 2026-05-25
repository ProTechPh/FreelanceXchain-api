import { BaseRepositoryPg, PaginatedResult, QueryOptions } from './base-repository-pg.js';
import type { DisputeStatus } from '../models/dispute.js';

export type { DisputeStatus };

export type EvidenceEntity = {
  id: string;
  submitter_id: string;
  type: 'text' | 'file' | 'link';
  content: string;
  submitted_at: string;
};

export type DisputeResolutionEntity = {
  decision: 'freelancer_favor' | 'employer_favor' | 'split';
  reasoning: string;
  resolved_by: string;
  resolved_at: string;
};

export type DisputeEntity = {
  id: string;
  contract_id: string;
  milestone_id: string;
  initiator_id: string;
  reason: string;
  evidence: EvidenceEntity[];
  status: DisputeStatus;
  resolution: DisputeResolutionEntity | null;
  created_at: string;
  updated_at: string;
};

export class DisputeRepository extends BaseRepositoryPg<DisputeEntity> {
  constructor() {
    super('disputes');
  }

  async createDispute(dispute: Omit<DisputeEntity, 'created_at' | 'updated_at'>): Promise<DisputeEntity> {
    return this.create(dispute);
  }

  async getDisputeById(id: string): Promise<DisputeEntity | null> {
    return this.getById(id);
  }

  async updateDispute(id: string, updates: Partial<DisputeEntity>): Promise<DisputeEntity | null> {
    return this.update(id, updates);
  }

  async getDisputesByContract(contractId: string, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE contract_id = $1`;
    const countResult = await this.pool.query(countQuery, [contractId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE contract_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [contractId, limit, offset]);
      return {
        items: result.rows as DisputeEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get disputes by contract: ${error.message}`);
    }
  }

  async getAllDisputesByContract(contractId: string): Promise<DisputeEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE contract_id = $1
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query, [contractId]);
      return result.rows as DisputeEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get all disputes by contract: ${error.message}`);
    }
  }

  async getDisputeByMilestone(milestoneId: string): Promise<DisputeEntity | null> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE milestone_id = $1 AND status != 'resolved'
      LIMIT 1
    `;
    
    try {
      const result = await this.pool.query(query, [milestoneId]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to get dispute by milestone: ${error.message}`);
    }
  }

  async getDisputesByStatus(status: DisputeStatus, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
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
        items: result.rows as DisputeEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get disputes by status: ${error.message}`);
    }
  }

  async getDisputesByInitiator(initiatorId: string, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE initiator_id = $1`;
    const countResult = await this.pool.query(countQuery, [initiatorId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE initiator_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [initiatorId, limit, offset]);
      return {
        items: result.rows as DisputeEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get disputes by initiator: ${error.message}`);
    }
  }

  async getAllDisputes(options?: QueryOptions & { status?: string }): Promise<PaginatedResult<DisputeEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    let countQuery = `SELECT COUNT(*) FROM ${this.tableName}`;
    let dataQuery = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];

    if (options?.status) {
      countQuery += ` WHERE status = $1`;
      dataQuery += ` WHERE status = $1`;
      params.push(options.status);
    }

    dataQuery += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    try {
      const countResult = await this.pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count, 10);
      
      const result = await this.pool.query(dataQuery, [...params, limit, offset]);
      
      return {
        items: result.rows as DisputeEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get all disputes: ${error.message}`);
    }
  }

  async getDisputesByUserId(userId: string, options?: QueryOptions & { status?: string }): Promise<PaginatedResult<DisputeEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    let whereClause = `
      WHERE d.initiator_id = $1 
         OR c.employer_id = $1 
         OR c.freelancer_id = $1
    `;
    const params: any[] = [userId];

    if (options?.status) {
      whereClause += ` AND d.status = $2`;
      params.push(options.status);
    }

    const countQuery = `
      SELECT COUNT(*) FROM ${this.tableName} d
      JOIN contracts c ON d.contract_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT d.* FROM ${this.tableName} d
      JOIN contracts c ON d.contract_id = c.id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    
    try {
      const countResult = await this.pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count, 10);
      
      const result = await this.pool.query(dataQuery, [...params, limit, offset]);
      
      return {
        items: result.rows as DisputeEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to get disputes by user: ${error.message}`);
    }
  }
}

export const disputeRepository = new DisputeRepository();
