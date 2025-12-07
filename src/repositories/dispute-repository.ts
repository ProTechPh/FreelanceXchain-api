import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';
import { Dispute, DisputeStatus } from '../models/dispute.js';

export class DisputeRepository extends BaseRepository<Dispute> {
  constructor() {
    super(COLLECTIONS.DISPUTES);
  }

  async createDispute(dispute: Dispute): Promise<Dispute> {
    return this.create(dispute, dispute.contractId);
  }

  async getDisputeById(id: string, contractId: string): Promise<Dispute | null> {
    return this.getById(id, contractId);
  }

  async updateDispute(id: string, contractId: string, updates: Partial<Dispute>): Promise<Dispute | null> {
    return this.update(id, contractId, updates);
  }

  async findDisputeById(id: string): Promise<Dispute | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }],
    };
    return this.findOne(querySpec);
  }

  async getDisputesByContract(contractId: string, options?: QueryOptions): Promise<PaginatedResult<Dispute>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.contractId = @contractId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@contractId', value: contractId }],
    };
    return this.query(querySpec, options);
  }

  async getAllDisputesByContract(contractId: string): Promise<Dispute[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.contractId = @contractId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@contractId', value: contractId }],
    };
    return this.queryAll(querySpec);
  }

  async getDisputeByMilestone(milestoneId: string): Promise<Dispute | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.milestoneId = @milestoneId',
      parameters: [{ name: '@milestoneId', value: milestoneId }],
    };
    return this.findOne(querySpec);
  }


  async getDisputesByStatus(status: DisputeStatus, options?: QueryOptions): Promise<PaginatedResult<Dispute>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.status = @status ORDER BY c.createdAt DESC',
      parameters: [{ name: '@status', value: status }],
    };
    return this.query(querySpec, options);
  }

  async getDisputesByInitiator(initiatorId: string, options?: QueryOptions): Promise<PaginatedResult<Dispute>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.initiatorId = @initiatorId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@initiatorId', value: initiatorId }],
    };
    return this.query(querySpec, options);
  }

  async getOpenDisputes(options?: QueryOptions): Promise<PaginatedResult<Dispute>> {
    const querySpec = {
      query: "SELECT * FROM c WHERE c.status = 'open' OR c.status = 'under_review' ORDER BY c.createdAt DESC",
      parameters: [],
    };
    return this.query(querySpec, options);
  }
}

export const disputeRepository = new DisputeRepository();
