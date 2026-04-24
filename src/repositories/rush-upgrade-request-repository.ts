import { BaseRepository } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

export type RushUpgradeRequestStatus = 'pending' | 'accepted' | 'declined' | 'counter_offered' | 'expired';

export type RushUpgradeRequestEntity = {
  id: string;
  contract_id: string;
  requested_by: string;
  proposed_percentage: number;
  counter_percentage: number | null;
  status: RushUpgradeRequestStatus;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

export class RushUpgradeRequestRepository extends BaseRepository<RushUpgradeRequestEntity> {
  constructor() {
    super(TABLES.RUSH_UPGRADE_REQUESTS);
  }

  async createRequest(request: Omit<RushUpgradeRequestEntity, 'created_at' | 'updated_at'>): Promise<RushUpgradeRequestEntity> {
    return this.create(request);
  }

  async getRequestById(id: string): Promise<RushUpgradeRequestEntity | null> {
    return this.getById(id);
  }

  async updateRequest(id: string, updates: Partial<RushUpgradeRequestEntity>): Promise<RushUpgradeRequestEntity | null> {
    return this.update(id, updates);
  }

  async getRequestsByContract(contractId: string): Promise<RushUpgradeRequestEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to get rush upgrade requests by contract: ${error.message}`);
    return (data ?? []) as RushUpgradeRequestEntity[];
  }

  async getPendingRequestByContract(contractId: string): Promise<RushUpgradeRequestEntity | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('contract_id', contractId)
      .in('status', ['pending', 'counter_offered'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to get pending rush upgrade request: ${error.message}`);
    return data as RushUpgradeRequestEntity | null;
  }
}

export const rushUpgradeRequestRepository = new RushUpgradeRequestRepository();
