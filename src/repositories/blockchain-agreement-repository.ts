import { BaseRepository, type QueryOptions, type PaginatedResult } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type BlockchainAgreementEntity = {
  id: string;
  contract_id_hash: string;
  terms_hash: string;
  employer_wallet: string;
  freelancer_wallet: string;
  total_amount: number;
  milestone_count: number;
  status: string;
  employer_signed_at?: number;
  freelancer_signed_at?: number;
  created_at_ts: number;
  transaction_hash: string;
  block_number: number;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'blockchain_agreements';

export class BlockchainAgreementRepository extends BaseRepository<BlockchainAgreementEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getAgreementById(id: string): Promise<BlockchainAgreementEntity | null> {
    const doc = await this.getById(id);
    return doc ? this.mapDoc(doc as any) : null;
  }

  async createAgreement(data: Omit<BlockchainAgreementEntity, 'created_at' | 'updated_at'>): Promise<BlockchainAgreementEntity> {
    const doc = await this.create(data);
    return this.mapDoc(doc as any);
  }

  async updateAgreement(id: string, updates: Partial<BlockchainAgreementEntity>): Promise<BlockchainAgreementEntity | null> {
    const doc = await this.update(id, updates);
    return doc ? this.mapDoc(doc as any) : null;
  }

  async findByContractIdHash(contractIdHash: string): Promise<BlockchainAgreementEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('contract_id_hash', contractIdHash), Query.limit(1)]
      );
      return response.documents.length > 0 ? this.mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async findByWallet(walletAddress: string): Promise<BlockchainAgreementEntity[]> {
    const [employerResults, freelancerResults] = await Promise.all([
      this.listWithQueries<BlockchainAgreementEntity>(
        [Query.equal('employer_wallet', walletAddress), Query.orderDesc('created_at_ts')],
        (doc) => this.mapDoc(doc)
      ),
      this.listWithQueries<BlockchainAgreementEntity>(
        [Query.equal('freelancer_wallet', walletAddress), Query.orderDesc('created_at_ts')],
        (doc) => this.mapDoc(doc)
      ),
    ]);

    const all = [...employerResults, ...freelancerResults]
      .sort((a, b) => b.created_at_ts - a.created_at_ts);

    // Deduplicate by id
    const seen = new Set<string>();
    return all.filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }

  async getAgreementsByStatus(status: string, options?: QueryOptions): Promise<PaginatedResult<BlockchainAgreementEntity>> {
    return this.paginatedWithQueries<BlockchainAgreementEntity>(
      [Query.equal('status', status), Query.orderDesc('created_at_ts')],
      options?.limit ?? 20,
      options?.offset ?? 0,
      (doc) => this.mapDoc(doc)
    );
  }
}

export const blockchainAgreementRepository = new BlockchainAgreementRepository();
