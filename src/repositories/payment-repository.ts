import { BaseRepository, BaseEntity, PaginatedResult, QueryOptions } from './base-repository.js';
import { TABLES } from '../config/supabase.js';

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
export type PaymentType = 'escrow_deposit' | 'milestone_release' | 'refund' | 'dispute_resolution';

export type PaymentEntity = BaseEntity & {
  contract_id: string;
  milestone_id: string | null;
  payer_id: string;
  payee_id: string;
  amount: number;
  currency: string;
  tx_hash: string | null;
  status: PaymentStatus;
  payment_type: PaymentType;
};

export type CreatePaymentInput = Omit<PaymentEntity, 'id' | 'created_at' | 'updated_at'>;

class PaymentRepositoryClass extends BaseRepository<PaymentEntity> {
  constructor() {
    super(TABLES.PAYMENTS);
  }

  async findByContractId(contractId: string): Promise<PaymentEntity[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to find payments: ${error.message}`);
    return (data ?? []) as PaymentEntity[];
  }

  async findByUserId(userId: string, options?: QueryOptions): Promise<PaginatedResult<PaymentEntity>> {
    const client = this.getClient();
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const { data, error, count } = await client
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .or(`payer_id.eq.${userId},payee_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to find payments: ${error.message}`);

    return {
      items: (data ?? []) as PaymentEntity[],
      hasMore: count ? offset + limit < count : false,
      total: count ?? undefined,
    };
  }

  async findByTxHash(txHash: string): Promise<PaymentEntity | null> {
    return this.findOne('tx_hash', txHash);
  }

  async updateStatus(id: string, status: PaymentStatus, txHash?: string): Promise<PaymentEntity | null> {
    const updates: Partial<PaymentEntity> = { status };
    if (txHash) updates.tx_hash = txHash;
    return this.update(id, updates);
  }

  async getTotalEarnings(userId: string): Promise<number> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('amount')
      .eq('payee_id', userId)
      .eq('status', 'completed');

    if (error) throw new Error(`Failed to get earnings: ${error.message}`);
    return (data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  }

  async getTotalSpent(userId: string): Promise<number> {
    const client = this.getClient();
    const { data, error } = await client
      .from(this.tableName)
      .select('amount')
      .eq('payer_id', userId)
      .eq('status', 'completed');

    if (error) throw new Error(`Failed to get spent: ${error.message}`);
    return (data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  }
}

export const PaymentRepository = new PaymentRepositoryClass();
