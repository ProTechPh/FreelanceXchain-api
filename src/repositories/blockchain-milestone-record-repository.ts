import { BaseRepositoryAppwrite, type QueryOptions, type PaginatedResult } from './base-repository-appwrite.js';
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

function mapDoc(doc: Record<string, any>): BlockchainMilestoneRecordEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as BlockchainMilestoneRecordEntity;
}

export class BlockchainMilestoneRecordRepository extends BaseRepositoryAppwrite<BlockchainMilestoneRecordEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getMilestoneRecordById(id: string): Promise<BlockchainMilestoneRecordEntity | null> {
    const doc = await this.getById(id);
    return doc ? mapDoc(doc as any) : null;
  }

  async createMilestoneRecord(data: Omit<BlockchainMilestoneRecordEntity, 'created_at' | 'updated_at'>): Promise<BlockchainMilestoneRecordEntity> {
    const doc = await this.create(data);
    return mapDoc(doc as any);
  }

  async updateMilestoneRecord(id: string, updates: Partial<BlockchainMilestoneRecordEntity>): Promise<BlockchainMilestoneRecordEntity | null> {
    const doc = await this.update(id, updates);
    return doc ? mapDoc(doc as any) : null;
  }

  async findByMilestoneIdHash(milestoneIdHash: string): Promise<BlockchainMilestoneRecordEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('milestone_id_hash', milestoneIdHash), Query.limit(1)]
      );
      return response.documents.length > 0 ? mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async findByWallet(walletAddress: string): Promise<BlockchainMilestoneRecordEntity[]> {
    return this.listWithQueries<BlockchainMilestoneRecordEntity>(
      [Query.equal('freelancer_wallet', walletAddress), Query.orderDesc('submitted_at')],
      mapDoc
    );
  }

  async getMilestonesByStatus(status: string, options?: QueryOptions): Promise<PaginatedResult<BlockchainMilestoneRecordEntity>> {
    return this.paginatedWithQueries<BlockchainMilestoneRecordEntity>(
      [Query.equal('status', status), Query.orderDesc('submitted_at')],
      options?.limit ?? 20,
      options?.offset ?? 0,
      mapDoc
    );
  }

  async getMilestonesByContract(contractIdHash: string): Promise<BlockchainMilestoneRecordEntity[]> {
    return this.listWithQueries<BlockchainMilestoneRecordEntity>(
      [Query.equal('contract_id_hash', contractIdHash), Query.orderAsc('submitted_at')],
      mapDoc
    );
  }
}

export const blockchainMilestoneRecordRepository = new BlockchainMilestoneRecordRepository();
