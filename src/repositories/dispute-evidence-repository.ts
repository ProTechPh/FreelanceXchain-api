import { BaseRepositoryAppwrite } from './base-repository-appwrite.js';
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

function mapDoc(doc: Record<string, any>): DisputeEvidenceEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as DisputeEvidenceEntity;
}

export class DisputeEvidenceRepository extends BaseRepositoryAppwrite<DisputeEvidenceEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getEvidenceById(id: string): Promise<DisputeEvidenceEntity | null> {
    const doc = await this.getById(id);
    return doc ? mapDoc(doc as any) : null;
  }

  async createEvidence(data: Omit<DisputeEvidenceEntity, 'created_at' | 'updated_at'>): Promise<DisputeEvidenceEntity> {
    const doc = await this.create(data);
    return mapDoc(doc as any);
  }

  async updateEvidence(id: string, updates: Partial<DisputeEvidenceEntity>): Promise<DisputeEvidenceEntity | null> {
    const doc = await this.update(id, updates);
    return doc ? mapDoc(doc as any) : null;
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
      return (doc as any).submitted_by ?? null;
    } catch {
      return null;
    }
  }
}

export const disputeEvidenceRepository = new DisputeEvidenceRepository();
