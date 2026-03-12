import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

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
  tags: string[];
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
};

export class ProposalRepository extends BaseRepository<ProposalEntity> {
  constructor() {
    super(TABLES.PROPOSALS);
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
    const client = this.getClient();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select(`
        *,
        freelancer:users!proposals_freelancer_id_fkey(
          id,
          name,
          email
        )
      `, { count: 'exact' })
      .eq('project_id', projectId)
      .neq('status', 'withdrawn') // Exclude withdrawn proposals
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw new Error(`Failed to get proposals by project: ${error.message}`);
    
    return {
      items: (data ?? []) as ProposalEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async getProposalsByFreelancer(freelancerId: string): Promise<ProposalEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('freelancer_id', freelancerId)
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(`Failed to get proposals by freelancer: ${error.message}`);
    return (data ?? []) as ProposalEntity[];
  }

  async hasAcceptedProposal(projectId: string): Promise<boolean> {
    const client = this.getClient();
    const { count, error } = await client
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'accepted');
    
    if (error) throw new Error(`Failed to check accepted proposal: ${error.message}`);
    return (count ?? 0) > 0;
  }

  async getProposalCountByProject(projectId: string): Promise<number> {
    const client = this.getClient();
    const { count, error } = await client
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .neq('status', 'withdrawn'); // Exclude withdrawn proposals from count
    
    if (error) throw new Error(`Failed to get proposal count: ${error.message}`);
    return count ?? 0;
  }

  async getExistingProposal(projectId: string, freelancerId: string): Promise<ProposalEntity | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('project_id', projectId)
      .eq('freelancer_id', freelancerId)
      .neq('status', 'withdrawn') // Exclude withdrawn proposals
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get existing proposal: ${error.message}`);
    }
    return data as ProposalEntity;
  }
}

export const proposalRepository = new ProposalRepository();
