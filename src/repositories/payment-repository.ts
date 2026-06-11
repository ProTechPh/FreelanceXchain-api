import { BaseRepositoryAppwrite, PaginatedResult, QueryOptions } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
export type PaymentType = 'escrow_deposit' | 'milestone_release' | 'refund' | 'dispute_resolution';

export type PaymentEntity = {
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

export type CreatePaymentInput = Omit<PaymentEntity, 'id' | 'created_at' | 'updated_at'>;

const COLLECTION_ID = 'payments';

function mapPayment(doc: any): PaymentEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as PaymentEntity;
}

class PaymentRepositoryClass extends BaseRepositoryAppwrite<PaymentEntity> {
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
    } catch (error: any) {
      throw new Error(`Failed to find payments: ${error.message}`);
    }
  }

  async findByUserId(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ items: PaymentEntity[]; total: number; hasMore: boolean }> {
    const { limit = 20, offset = 0 } = options;
    try {
      const countResponse = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.limit(1),
        ]
      );
      const total = countResponse.total;

      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.orderDesc('created_at'),
          Query.limit(limit),
          Query.offset(offset),
        ]
      );
      const items = response.documents.map(mapPayment);
      return { items, total, hasMore: items.length === limit };
    } catch (error: any) {
      throw new Error(`Failed to find payments: ${error.message}`);
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
      return mapPayment(response.documents[0]);
    } catch {
      return null;
    }
  }

  async updateStatus(id: string, status: PaymentStatus): Promise<PaymentEntity | null> {
    return this.update(id, { status } as Partial<PaymentEntity>);
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
      return response.documents.reduce((sum: number, doc: any) => sum + Number(doc.amount || 0), 0);
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
      return response.documents.reduce((sum: number, doc: any) => sum + Number(doc.amount || 0), 0);
    } catch {
      return 0;
    }
  }
}

export const PaymentRepository = new PaymentRepositoryClass();
