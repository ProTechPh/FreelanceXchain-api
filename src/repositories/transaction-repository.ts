import { BaseRepositoryAppwrite, type QueryOptions, type PaginatedResult } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type TransactionEntity = {
  id: string;
  contract_id?: string;
  milestone_id?: string;
  from_user_id?: string;
  to_user_id?: string;
  amount: number;
  type: string;
  status: string;
  transaction_hash?: string;
  metadata?: string;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'transactions';

function mapDoc(doc: Record<string, any>): TransactionEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as TransactionEntity;
}

export class TransactionRepository extends BaseRepositoryAppwrite<TransactionEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async findByUser(
    userId: string,
    options?: QueryOptions
  ): Promise<PaginatedResult<TransactionEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    const [fromTx, toTx] = await Promise.all([
      this.listWithQueries<TransactionEntity>(
        [Query.equal('from_user_id', userId), Query.orderDesc('created_at')],
        mapDoc
      ),
      this.listWithQueries<TransactionEntity>(
        [Query.equal('to_user_id', userId), Query.orderDesc('created_at')],
        mapDoc
      ),
    ]);

    const all = [...fromTx, ...toTx]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = all.length;
    const items = all.slice(offset, offset + limit);

    return {
      items,
      hasMore: offset + limit < total,
      total,
    };
  }

  async findByContract(contractId: string): Promise<TransactionEntity[]> {
    return this.listWithQueries<TransactionEntity>(
      [
        Query.equal('contract_id', contractId),
        Query.orderDesc('created_at'),
      ],
      mapDoc
    );
  }

  async findByUserCount(userId: string): Promise<number> {
    const [fromTx, toTx] = await Promise.all([
      databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.equal('from_user_id', userId),
        Query.limit(1),
      ]),
      databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.equal('to_user_id', userId),
        Query.limit(1),
      ]),
    ]);
    return fromTx.total + toTx.total;
  }
}

export const transactionRepository = new TransactionRepository();
