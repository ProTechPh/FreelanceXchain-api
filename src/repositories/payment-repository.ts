import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { getErrorMessageOr } from '../utils/index.js';

type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
export type PaymentType = 'escrow_deposit' | 'milestone_release' | 'refund' | 'dispute_resolution';

type PaymentEntity = {
  id: string;
  contract_id: string;
  milestone_id: string | null;
  payer_id: string;
  payee_id: string;
  amount: number;
  currency: string;
  tx_hash: string | null;
  status: PaymentStatus;
  payment_type: PaymentType;
  created_at: string;
  updated_at: string;
};



const COLLECTION_ID = 'payments';

function mapPayment(doc: Record<string, unknown>): PaymentEntity {
  return fromAppwriteDoc<PaymentEntity>(doc);
}

class PaymentRepositoryClass extends BaseRepository<PaymentEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async findByContractId(contractId: string): Promise<PaymentEntity[]> {
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
      return response.documents.map(mapPayment);
    } catch (error) {
      throw new Error(`Failed to find payments: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async findByUserId(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ items: PaymentEntity[]; total: number; hasMore: boolean }> {
    const { limit = 20, offset = 0 } = options;
    try {
      // The payments collection has no `user_id` attribute — a payment
      // involves a user as payer (money out) or payee (money in). Match both.
      const userQuery = Query.or([
        Query.equal('payer_id', userId),
        Query.equal('payee_id', userId),
      ]);
      const countResponse = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          userQuery,
          Query.limit(1),
        ]
      );
      const total = countResponse.total;

      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          userQuery,
          Query.orderDesc('created_at'),
          Query.limit(limit),
          Query.offset(offset),
        ]
      );
      const items = response.documents.map(mapPayment);
      return { items, total, hasMore: items.length === limit };
    } catch (error) {
      throw new Error(`Failed to find payments: ${getErrorMessageOr(error, 'Unknown error')}`);
    }
  }

  async findByTxHash(txHash: string): Promise<PaymentEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('tx_hash', txHash),
          Query.limit(1),
        ]
      );
      if (response.documents.length === 0) return null;
      return mapPayment(response.documents[0]!);
    } catch {
      return null;
    }
  }

  async updateStatus(id: string, status: PaymentStatus): Promise<PaymentEntity | null> {
    return this.update(id, { status });
  }

  async getTotalEarnings(userId: string): Promise<number> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('payee_id', userId),
          Query.equal('status', 'completed'),
          Query.limit(1000),
        ]
      );
      return response.documents.reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);
    } catch {
      return 0;
    }
  }

  async getTotalSpent(userId: string): Promise<number> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('payer_id', userId),
          Query.equal('status', 'completed'),
          Query.limit(1000),
        ]
      );
      return response.documents.reduce((sum, doc) => sum + Number(doc.amount ?? 0), 0);
    } catch {
      return 0;
    }
  }
}

export const paymentRepository = new PaymentRepositoryClass();
