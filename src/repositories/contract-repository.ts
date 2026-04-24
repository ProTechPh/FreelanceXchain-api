import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { TABLES } from '../config/supabase.js';
import type { ContractStatus } from '../models/contract.js';

export type { ContractStatus };

export type ContractEntity = {
  id: string;
  project_id: string;
  proposal_id: string;
  freelancer_id: string;
  employer_id: string;
  escrow_address: string;
  total_amount: number;
  status: ContractStatus;
  created_at: string;
  updated_at: string;
};

export class ContractRepository extends BaseRepository<ContractEntity> {
  constructor() {
    super(TABLES.CONTRACTS);
  }

  async createContract(contract: Omit<ContractEntity, 'created_at' | 'updated_at'>): Promise<ContractEntity> {
    return this.create(contract);
  }

  async getContractById(id: string): Promise<ContractEntity | null> {
    return this.getById(id);
  }

  async getContractByIdWithRelations(id: string): Promise<any | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select(`
        *,
        project:projects(id, title, description, deadline, milestones),
        freelancer:users!contracts_freelancer_id_fkey(
          id, 
          email, 
          role, 
          name,
          freelancer_profile:freelancer_profiles(bio, hourly_rate, skills, experience, availability)
        ),
        employer:users!contracts_employer_id_fkey(
          id, 
          email, 
          role, 
          name,
          employer_profile:employer_profiles(company_name, description, industry)
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get contract with relations: ${error.message}`);
    }
    
    return data;
  }

  async updateContract(id: string, updates: Partial<ContractEntity>): Promise<ContractEntity | null> {
    return this.update(id, updates);
  }

  async findContractByProposalId(proposalId: string): Promise<ContractEntity | null> {
    return this.findOne('proposal_id', proposalId);
  }


  async getContractsByFreelancer(freelancerId: string, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('freelancer_id', freelancerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get contracts by freelancer: ${error.message}`);
    
    return {
      items: (data ?? []) as ContractEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getContractsByEmployer(employerId: string, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('employer_id', employerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get contracts by employer: ${error.message}`);
    
    return {
      items: (data ?? []) as ContractEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getContractsByProject(projectId: string): Promise<ContractEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get contracts by project: ${error.message}`);
    return (data ?? []) as ContractEntity[];
  }

  async getContractsByStatus(status: ContractStatus, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get contracts by status: ${error.message}`);
    
    return {
      items: (data ?? []) as ContractEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getUserContracts(userId: string, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*, project:projects(id, title, description, deadline, milestones)', { count: 'exact' })
      .or(`freelancer_id.eq.${userId},employer_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get user contracts: ${error.message}`);
    
    return {
      items: (data ?? []) as ContractEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getAllContracts(): Promise<ContractEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get all contracts: ${error.message}`);
    return (data ?? []) as ContractEntity[];
  }
}

export const contractRepository = new ContractRepository();
