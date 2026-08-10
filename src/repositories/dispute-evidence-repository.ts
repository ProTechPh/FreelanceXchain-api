import { BaseRepository, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type DisputeEvidenceEntity = {
  id: string;
  dispute_id: string;
  submitted_by: string;
  evidence_type: string;
  file_url?: string;
  description: string;
  verified_by?: string;
  verified_at?: string;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'dispute_evidence';

function mapDoc(doc: Record<string, unknown>): DisputeEvidenceEntity {
  return fromAppwriteDoc<DisputeEvidenceEntity>(doc);
}

export class DisputeEvidenceRepository extends BaseRepository<DisputeEvidenceEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getEvidenceById(id: string): Promise<DisputeEvidenceEntity | null> {
    return this.getById(id);
  }

  async createEvidence(data: Omit<DisputeEvidenceEntity, 'created_at' | 'updated_at'>): Promise<DisputeEvidenceEntity> {
    return this.create(data);
  }

  async updateEvidence(id: string, updates: Partial<DisputeEvidenceEntity>): Promise<DisputeEvidenceEntity | null> {
    return this.update(id, updates);
  }

  async deleteEvidence(id: string): Promise<boolean> {
    return this.delete(id);
  }

  async findByDispute(disputeId: string): Promise<DisputeEvidenceEntity[]> {
    return this.listWithQueries<DisputeEvidenceEntity>(
      [Query.equal('dispute_id', disputeId), Query.orderAsc('created_at')],
      mapDoc
    );
  }

  async findOwnerById(id: string): Promise<string | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, COLLECTION_ID, id);
      return fromAppwriteDoc<DisputeEvidenceEntity>(doc).submitted_by ?? null;
    } catch {
      return null;
    }
  }
}

export const disputeEvidenceRepository = new DisputeEvidenceRepository();
