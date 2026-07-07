import { BaseRepositoryAppwrite, type QueryOptions, type PaginatedResult } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type BlockchainTransactionEntity = {
  id: string;
  type: string;
  from_address: string;
  to_address: string;
  amount: string;
  data: string;
  timestamp: number;
  status: string;
  hash?: string;
  block_number?: number;
  gas_used?: string;
  confirm_at?: number;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'blockchain_transactions';

export class BlockchainTransactionRepository extends BaseRepositoryAppwrite<BlockchainTransactionEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getTransactionById(id: string): Promise<BlockchainTransactionEntity | null> {
    const doc = await this.getById(id);
    return doc ? this.mapDoc(doc as any) : null;
  }

  async createTransaction(data: Omit<BlockchainTransactionEntity, 'created_at' | 'updated_at'>): Promise<BlockchainTransactionEntity> {
    const doc = await this.create(data);
    return this.mapDoc(doc as any);
  }

  async updateTransaction(id: string, updates: Partial<BlockchainTransactionEntity>): Promise<BlockchainTransactionEntity | null> {
    const doc = await this.update(id, updates);
    return doc ? this.mapDoc(doc as any) : null;
  }

  async findByHash(hash: string): Promise<BlockchainTransactionEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('hash', hash), Query.limit(1)]
      );
      return response.documents.length > 0 ? this.mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async findConfirmable(txId: string): Promise<{ confirm_at?: number } | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, COLLECTION_ID, txId);
      return { confirm_at: (doc as any).confirm_at };
    } catch {
      return null;
    }
  }

  async getTransactionsByType(type: string, options?: QueryOptions): Promise<PaginatedResult<BlockchainTransactionEntity>> {
    return this.paginatedWithQueries<BlockchainTransactionEntity>(
      [Query.equal('type', type), Query.orderDesc('timestamp')],
      options?.limit ?? 20,
      options?.offset ?? 0,
      (doc) => this.mapDoc(doc)
    );
  }

  async getTransactionsByStatus(status: string): Promise<BlockchainTransactionEntity[]> {
    return this.listWithQueries<BlockchainTransactionEntity>(
      [Query.equal('status', status), Query.orderDesc('timestamp')],
      (doc) => this.mapDoc(doc)
    );
  }
}

export const blockchainTransactionRepository = new BlockchainTransactionRepository();
