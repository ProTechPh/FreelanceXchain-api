import { BaseRepository, type QueryOptions, type PaginatedResult } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type BlockchainDisputeRecordEntity = {
  id: string;
  dispute_id_hash: string;
  contract_id_hash: string;
  milestone_id_hash: string;
  evidence_hash?: string;
  initiator_wallet: string;
  freelancer_wallet: string;
  employer_wallet: string;
  arbiter_wallet?: string;
  amount: number;
  outcome: string;
  reasoning?: string;
  created_at_ts: number;
  resolved_at?: number;
  transaction_hash: string;
  block_number: number;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'blockchain_dispute_records';

export class BlockchainDisputeRecordRepository extends BaseRepository<BlockchainDisputeRecordEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getDisputeRecordById(id: string): Promise<BlockchainDisputeRecordEntity | null> {
    const doc = await this.getById(id);
    return doc ? this.mapDoc(doc as any) : null;
  }

  async createDisputeRecord(data: Omit<BlockchainDisputeRecordEntity, 'created_at' | 'updated_at'>): Promise<BlockchainDisputeRecordEntity> {
    const doc = await this.create(data);
    return this.mapDoc(doc as any);
  }

  async updateDisputeRecord(id: string, updates: Partial<BlockchainDisputeRecordEntity>): Promise<BlockchainDisputeRecordEntity | null> {
    const doc = await this.update(id, updates);
    return doc ? this.mapDoc(doc as any) : null;
  }

  async findByDisputeIdHash(disputeIdHash: string): Promise<BlockchainDisputeRecordEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('dispute_id_hash', disputeIdHash), Query.limit(1)]
      );
      return response.documents.length > 0 ? this.mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async findByWallet(walletAddress: string): Promise<BlockchainDisputeRecordEntity[]> {
    const [freelancerResults, employerResults] = await Promise.all([
      this.listWithQueries<BlockchainDisputeRecordEntity>(
        [Query.equal('freelancer_wallet', walletAddress), Query.orderDesc('created_at_ts')],
        (doc) => this.mapDoc(doc)
      ),
      this.listWithQueries<BlockchainDisputeRecordEntity>(
        [Query.equal('employer_wallet', walletAddress), Query.orderDesc('created_at_ts')],
        (doc) => this.mapDoc(doc)
      ),
    ]);

    const all = [...freelancerResults, ...employerResults]
      .sort((a, b) => b.created_at_ts - a.created_at_ts);

    // Deduplicate by id
    const seen = new Set<string>();
    return all.filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }

  async getDisputesByOutcome(outcome: string, options?: QueryOptions): Promise<PaginatedResult<BlockchainDisputeRecordEntity>> {
    return this.paginatedWithQueries<BlockchainDisputeRecordEntity>(
      [Query.equal('outcome', outcome), Query.orderDesc('created_at_ts')],
      options?.limit ?? 20,
      options?.offset ?? 0,
      (doc) => this.mapDoc(doc)
    );
  }
}

export const blockchainDisputeRecordRepository = new BlockchainDisputeRecordRepository();
