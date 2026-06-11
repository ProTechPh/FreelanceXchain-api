import { BaseRepositoryAppwrite } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

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

const COLLECTION_ID = 'rush_upgrade_requests';

export class RushUpgradeRequestRepository extends BaseRepositoryAppwrite<RushUpgradeRequestEntity> {
  constructor() {
    super(COLLECTION_ID);
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
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('contract_id', contractId),
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      return response.documents.map((doc: any) => {
        const { $id, $createdAt, $updatedAt, ...attrs } = doc;
        return {
          id: $id,
          ...attrs,
          created_at: attrs.created_at ?? $createdAt,
          updated_at: attrs.updated_at ?? $updatedAt,
        } as RushUpgradeRequestEntity;
      });
    } catch {
      return [];
    }
  }

  async getPendingRequestByContract(contractId: string): Promise<RushUpgradeRequestEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('contract_id', contractId),
          Query.equal('status', ['pending', 'counter_offered']),
          Query.orderDesc('created_at'),
          Query.limit(1),
        ]
      );
      if (response.documents.length === 0) return null;
      const doc = response.documents[0];
      const { $id, $createdAt, $updatedAt, ...attrs } = doc as any;
      return {
        id: $id,
        ...attrs,
        created_at: attrs.created_at ?? $createdAt,
        updated_at: attrs.updated_at ?? $updatedAt,
      } as RushUpgradeRequestEntity;
    } catch {
      return null;
    }
  }
}

export const rushUpgradeRequestRepository = new RushUpgradeRequestRepository();
