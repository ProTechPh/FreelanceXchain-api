import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { getErrorMessageOr, toEthUnits } from '../utils/index.js';

type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
export type PaymentType = 'escrow_deposit' | 'milestone_release' | 'refund' | 'dispute_resolution' | 'rush_fee';

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
      return await this.fetchAll([
        Query.equal('contract_id', contractId),
        Query.orderDesc('$createdAt'),
      ]);
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

  /**
   * Total completed payments received (payee side), in ETH units. Counts every
   * record type that moves money between the parties — milestone releases,
   * refunds returned to the user, dispute-resolution legs, and rush fees.
   * escrow_deposit records are excluded: the deposit is the escrow-funding trace
   * (the payee never actually receives it), and its disposition is captured by
   * the release/refund/dispute legs — counting it would double-count releases
   * for the freelancer and funding-plus-refunds for the employer. Amounts are
   * normalized via toEthUnits so milestone_release records (stored as
   * wei-as-Number) count correctly. Returns `null` when the query fails so a
   * caller can distinguish "unavailable" from a genuine zero.
   */
  async getTotalEarnings(userId: string): Promise<number | null> {
    try {
      const payments = await this.fetchAll([
        Query.equal('payee_id', userId),
        Query.equal('status', 'completed'),
      ]);
      return payments
        .filter(p => p.payment_type !== 'escrow_deposit')
        .reduce((sum, p) => sum + toEthUnits(Number(p.amount ?? 0), p.payment_type), 0);
    } catch {
      return null;
    }
  }

  /**
   * Total completed payments made (payer side), in ETH units. Counts every
   * record type that moves money between the parties — milestone releases paid
   * out on the user's behalf, refunds returned, dispute-resolution legs, and
   * rush fees. escrow_deposit records are excluded (see getTotalEarnings for
   * the rationale — the funding trace is not a payment between parties).
   * Amounts are normalized via toEthUnits so milestone_release records (stored
   * as wei-as-Number) count correctly. Returns `null` when the query fails so a
   * caller can distinguish "unavailable" from a genuine zero.
   */
  async getTotalSpent(userId: string): Promise<number | null> {
    try {
      const payments = await this.fetchAll([
        Query.equal('payer_id', userId),
        Query.equal('status', 'completed'),
      ]);
      return payments
        .filter(p => p.payment_type !== 'escrow_deposit')
        .reduce((sum, p) => sum + toEthUnits(Number(p.amount ?? 0), p.payment_type), 0);
    } catch {
      return null;
    }
  }
}

export const paymentRepository = new PaymentRepositoryClass();
