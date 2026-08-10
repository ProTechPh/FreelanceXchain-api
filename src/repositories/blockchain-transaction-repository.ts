import { BaseRepository, type QueryOptions, type PaginatedResult, fromAppwriteDoc } from './base-repository.js';
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

export class BlockchainTransactionRepository extends BaseRepository<BlockchainTransactionEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getTransactionById(id: string): Promise<BlockchainTransactionEntity | null> {
    return this.getById(id);
  }

  async createTransaction(data: Omit<BlockchainTransactionEntity, 'created_at' | 'updated_at'>): Promise<BlockchainTransactionEntity> {
    return this.create(data);
  }

  async updateTransaction(id: string, updates: Partial<BlockchainTransactionEntity>): Promise<BlockchainTransactionEntity | null> {
    return this.update(id, updates);
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
      const { confirm_at } = fromAppwriteDoc<BlockchainTransactionEntity>(doc);
      return confirm_at !== undefined ? { confirm_at } : {};
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
