import { BaseRepository } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

export type MilestoneEntity = {
  id: string;
  contract_id: string;
  project_id: string;
  title: string;
  description: string;
  amount: number;
  due_date: string;
  status: string;
  deliverable_files?: string;
  submitted_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  revision_count: number;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'milestones';

function mapDoc(doc: Record<string, any>): MilestoneEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as MilestoneEntity;
}

export class MilestoneRepository extends BaseRepository<MilestoneEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async findByContract(contractId: string): Promise<MilestoneEntity[]> {
    return this.listWithQueries<MilestoneEntity>(
      [
        Query.equal('contract_id', contractId),
        Query.orderAsc('due_date'),
      ],
      mapDoc
    );
  }

  async findByProjectAndMilestoneId(
    projectId: string,
    milestoneId: string
  ): Promise<MilestoneEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('project_id', projectId),
          Query.equal('$id', milestoneId),
          Query.limit(1),
        ]
      );
      return response.documents.length > 0 ? mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }
}

export const milestoneRepository = new MilestoneRepository();
