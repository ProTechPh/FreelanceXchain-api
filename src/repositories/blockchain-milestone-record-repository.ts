import { BaseRepository, type QueryOptions, type PaginatedResult } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type BlockchainMilestoneRecordEntity = {
  id: string;
  milestone_id_hash: string;
  contract_id_hash: string;
  work_hash: string;
  freelancer_wallet: string;
  employer_wallet: string;
  amount: number;
  status: string;
  submitted_at: number;
  completed_at?: number;
  title: string;
  transaction_hash: string;
  block_number: number;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'blockchain_milestones';

export class BlockchainMilestoneRecordRepository extends BaseRepository<BlockchainMilestoneRecordEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getMilestoneRecordById(id: string): Promise<BlockchainMilestoneRecordEntity | null> {
    return this.getById(id);
  }

  async createMilestoneRecord(data: Omit<BlockchainMilestoneRecordEntity, 'created_at' | 'updated_at'>): Promise<BlockchainMilestoneRecordEntity> {
    return this.create(data);
  }

  async updateMilestoneRecord(id: string, updates: Partial<BlockchainMilestoneRecordEntity>): Promise<BlockchainMilestoneRecordEntity | null> {
    return this.update(id, updates);
  }

  async findByMilestoneIdHash(milestoneIdHash: string): Promise<BlockchainMilestoneRecordEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('milestone_id_hash', milestoneIdHash), Query.limit(1)]
      );
      return response.documents.length > 0 ? this.mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async findByWallet(walletAddress: string): Promise<BlockchainMilestoneRecordEntity[]> {
    return this.listWithQueries<BlockchainMilestoneRecordEntity>(
      [Query.equal('freelancer_wallet', walletAddress), Query.orderDesc('submitted_at')],
      (doc) => this.mapDoc(doc)
    );
  }

  async getMilestonesByStatus(status: string, options?: QueryOptions): Promise<PaginatedResult<BlockchainMilestoneRecordEntity>> {
    return this.paginatedWithQueries<BlockchainMilestoneRecordEntity>(
      [Query.equal('status', status), Query.orderDesc('submitted_at')],
      options?.limit ?? 20,
      options?.offset ?? 0,
      (doc) => this.mapDoc(doc)
    );
  }

  async getMilestonesByContract(contractIdHash: string): Promise<BlockchainMilestoneRecordEntity[]> {
    return this.listWithQueries<BlockchainMilestoneRecordEntity>(
      [Query.equal('contract_id_hash', contractIdHash), Query.orderAsc('submitted_at')],
      (doc) => this.mapDoc(doc)
    );
  }
}

export const blockchainMilestoneRecordRepository = new BlockchainMilestoneRecordRepository();
