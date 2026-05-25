import { BaseRepositoryPg, PaginatedResult, QueryOptions } from './base-repository-pg.js';

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

class PaymentRepositoryClass extends BaseRepositoryPg<PaymentEntity> {
  constructor() {
    super('payments');
  }

  async findByContractId(contractId: string): Promise<PaymentEntity[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE contract_id = $1
      ORDER BY created_at DESC
    `;
    
    try {
      const result = await this.pool.query(query, [contractId]);
      return result.rows as PaymentEntity[];
    } catch (error: any) {
      throw new Error(`Failed to find payments: ${error.message}`);
    }
  }

  async findByUserId(userId: string, options?: QueryOptions): Promise<PaginatedResult<PaymentEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const countQuery = `SELECT COUNT(*) FROM ${this.tableName} WHERE payer_id = $1 OR payee_id = $1`;
    const countResult = await this.pool.query(countQuery, [userId]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM ${this.tableName}
      WHERE payer_id = $1 OR payee_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    try {
      const result = await this.pool.query(dataQuery, [userId, limit, offset]);
      return {
        items: result.rows as PaymentEntity[],
        hasMore: offset + limit < total,
        total,
      };
    } catch (error: any) {
      throw new Error(`Failed to find payments: ${error.message}`);
    }
  }

  async findByTxHash(txHash: string): Promise<PaymentEntity | null> {
    return this.findOne('tx_hash', txHash);
  }

  async updateStatus(id: string, status: PaymentStatus, txHash?: string): Promise<PaymentEntity | null> {
    const updates: Partial<PaymentEntity> = { status };
    /* istanbul ignore next */
    if (txHash) updates.tx_hash = txHash;
    return this.update(id, updates);
  }

  async getTotalEarnings(userId: string): Promise<number> {
    const query = `
      SELECT SUM(amount) as total 
      FROM ${this.tableName} 
      WHERE payee_id = $1 AND status = 'completed'
    `;
    
    try {
      const result = await this.pool.query(query, [userId]);
      return result.rows[0].total ? parseFloat(result.rows[0].total) : 0;
    } catch (error: any) {
      throw new Error(`Failed to get earnings: ${error.message}`);
    }
  }

  async getTotalSpent(userId: string): Promise<number> {
    const query = `
      SELECT SUM(amount) as total 
      FROM ${this.tableName} 
      WHERE payer_id = $1 AND status = 'completed'
    `;
    
    try {
      const result = await this.pool.query(query, [userId]);
      return result.rows[0].total ? parseFloat(result.rows[0].total) : 0;
    } catch (error: any) {
      throw new Error(`Failed to get spent: ${error.message}`);
    }
  }
}

export const PaymentRepository = new PaymentRepositoryClass();
