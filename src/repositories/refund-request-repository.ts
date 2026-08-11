import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import type { ContractEntity } from './contract-repository.js';

type RefundRequestEntity = {
  id: string;
  contract_id: string;
  requested_by: string;
  amount: number;
  is_partial: boolean;
  reason: string;
  status: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejection_reason?: string;
  rejected_at?: string;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'refund_requests';

function mapDoc(doc: Record<string, unknown>): RefundRequestEntity {
  return fromAppwriteDoc<RefundRequestEntity>(doc);
}

type RefundWithContract = RefundRequestEntity & { contract?: ContractEntity | null };

export class RefundRequestRepository extends BaseRepository<RefundRequestEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async findPendingByContract(contractId: string): Promise<RefundRequestEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('contract_id', contractId),
          Query.equal('status', 'pending'),
          Query.limit(1),
        ]
      );
      return response.documents.length > 0 ? mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async findByContract(contractId: string): Promise<RefundRequestEntity[]> {
    return this.listWithQueries<RefundRequestEntity>(
      [
        Query.equal('contract_id', contractId),
        Query.orderDesc('created_at'),
      ],
      mapDoc
    );
  }

  async findWithContract(id: string): Promise<RefundWithContract | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, COLLECTION_ID, id);
      const refund = mapDoc(doc);

      let contract: ContractEntity | null = null;
      try {
        const contractDoc = await databases.getDocument(
          DATABASE_ID,
          'contracts',
          refund.contract_id
        );
        contract = fromAppwriteDoc<ContractEntity>(contractDoc);
      } catch {
        // Contract not found; return refund without it
      }

      return { ...refund, contract };
    } catch {
      return null;
    }
  }
}

export const refundRequestRepository = new RefundRequestRepository();
