import { BaseRepositoryPg } from './base-repository-pg.js';

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

export class RushUpgradeRequestRepository extends BaseRepositoryPg<RushUpgradeRequestEntity> {
  constructor() {
    super('rush_upgrade_requests');
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
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE contract_id = $1
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query, [contractId]);
      return result.rows as RushUpgradeRequestEntity[];
    } catch (error: any) {
      throw new Error(`Failed to get rush upgrade requests by contract: ${error.message}`);
    }
  }

  async getPendingRequestByContract(contractId: string): Promise<RushUpgradeRequestEntity | null> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE contract_id = $1 AND status IN ('pending', 'counter_offered')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    try {
      const result = await this.pool.query(query, [contractId]);
      return result.rows[0] || null;
    } catch (error: any) {
      throw new Error(`Failed to get pending rush upgrade request: ${error.message}`);
    }
  }
}

export const rushUpgradeRequestRepository = new RushUpgradeRequestRepository();
