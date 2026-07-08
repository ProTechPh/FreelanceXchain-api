import { BaseRepository, type QueryOptions, type PaginatedResult } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type BlockchainRatingEntity = {
  id: string;
  contract_id: string;
  rater_id: string;
  ratee_id: string;
  rating: number;
  comment: string;
  timestamp: number;
  transaction_hash: string;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'blockchain_ratings';

export class BlockchainRatingRepository extends BaseRepository<BlockchainRatingEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getRatingById(id: string): Promise<BlockchainRatingEntity | null> {
    const doc = await this.getById(id);
    return doc ? this.mapDoc(doc as any) : null;
  }

  async createRating(data: Omit<BlockchainRatingEntity, 'created_at' | 'updated_at'>): Promise<BlockchainRatingEntity> {
    const doc = await this.create(data);
    return this.mapDoc(doc as any);
  }

  async updateRating(id: string, updates: Partial<BlockchainRatingEntity>): Promise<BlockchainRatingEntity | null> {
    const doc = await this.update(id, updates);
    return doc ? this.mapDoc(doc as any) : null;
  }

  async findByRatee(rateeId: string, options?: QueryOptions): Promise<PaginatedResult<BlockchainRatingEntity>> {
    return this.paginatedWithQueries<BlockchainRatingEntity>(
      [Query.equal('ratee_id', rateeId), Query.orderDesc('timestamp')],
      options?.limit ?? 20,
      options?.offset ?? 0,
      (doc) => this.mapDoc(doc)
    );
  }

  async findByRater(raterId: string, options?: QueryOptions): Promise<PaginatedResult<BlockchainRatingEntity>> {
    return this.paginatedWithQueries<BlockchainRatingEntity>(
      [Query.equal('rater_id', raterId), Query.orderDesc('timestamp')],
      options?.limit ?? 20,
      options?.offset ?? 0,
      (doc) => this.mapDoc(doc)
    );
  }

  async findByContractAndRater(contractId: string, raterId: string): Promise<BlockchainRatingEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [
          Query.equal('contract_id', contractId),
          Query.equal('rater_id', raterId),
          Query.limit(1),
        ]
      );
      return response.documents.length > 0 ? this.mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }
}

export const blockchainRatingRepository = new BlockchainRatingRepository();
