import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository';
import { TABLES } from '../config/supabase';

export type DisputeStatus = 'open' | 'under_review' | 'resolved';

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

export class DisputeRepository extends BaseRepository<DisputeEntity> {
  constructor() {
    super(TABLES.DISPUTES);
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

  async findDisputeById(id: string): Promise<DisputeEntity | null> {
    return this.getById(id);
  }

  async getDisputesByContract(contractId: string, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get disputes by contract: ${error.message}`);
    
    return {
      items: (data ?? []) as DisputeEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getAllDisputesByContract(contractId: string): Promise<DisputeEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get all disputes by contract: ${error.message}`);
    return (data ?? []) as DisputeEntity[];
  }

  async getDisputeByMilestone(milestoneId: string): Promise<DisputeEntity | null> {
    return this.findOne('milestone_id', milestoneId);
  }

  async getDisputesByStatus(status: DisputeStatus, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get disputes by status: ${error.message}`);
    
    return {
      items: (data ?? []) as DisputeEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getDisputesByInitiator(initiatorId: string, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('initiator_id', initiatorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get disputes by initiator: ${error.message}`);
    
    return {
      items: (data ?? []) as DisputeEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getAllDisputes(options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get all disputes: ${error.message}`);
    
    return {
      items: (data ?? []) as DisputeEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getDisputesByUserId(userId: string, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Get disputes where user is initiator OR part of the contract
    const { data: disputes, error, count } = await client
      .from(this.tableName)
      .select(`
        *,
        contracts!inner(employer_id, freelancer_id)
      `, { count: 'exact' })
      .or(`initiator_id.eq.${userId},contracts.employer_id.eq.${userId},contracts.freelancer_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get disputes by user: ${error.message}`);
    
    return {
      items: (disputes ?? []) as DisputeEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }
}

export const disputeRepository = new DisputeRepository();
