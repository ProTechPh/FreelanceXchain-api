import { BaseRepositoryAppwrite, PaginatedResult, QueryOptions } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import type { DisputeStatus } from '../models/dispute.js';

export type { DisputeStatus };

export type EvidenceEntity = {
  id: string;
  submitter_id: string;
  type: 'text' | 'file' | 'link';
  content: string;
  submitted_at: string;
};

export type DisputeResolutionEntity = {
  decision: 'freelancer_favor' | 'employer_favor' | 'split';
  reasoning: string;
  resolved_by: string;
  resolved_at: string;
};

export type DisputeEntity = {
  id: string;
  contract_id: string;
  milestone_id: string;
  initiator_id: string;
  reason: string;
  evidence: EvidenceEntity[];
  status: DisputeStatus;
  resolution: DisputeResolutionEntity | null;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'disputes';

function mapDispute(doc: Record<string, any>): DisputeEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc as any;
  const result: Record<string, any> = {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  };
  if (typeof result.evidence === 'string') {
    result.evidence = JSON.parse(result.evidence);
  }
  if (typeof result.resolution === 'string') {
    result.resolution = JSON.parse(result.resolution);
  }
  return result as DisputeEntity;
}

export class DisputeRepository extends BaseRepositoryAppwrite<DisputeEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createDispute(dispute: Omit<DisputeEntity, 'created_at' | 'updated_at'>): Promise<DisputeEntity> {
    return this.create(dispute);
  }

  async getDisputeById(id: string): Promise<DisputeEntity | null> {
    return this.getById(id);
  }

  async updateDispute(id: string, updates: Partial<DisputeEntity>): Promise<DisputeEntity | null> {
    return this.update(id, updates);
  }

  async getDisputesByContract(contractId: string, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('contract_id', contractId),
          Query.orderDesc('created_at'),
          Query.limit(limit),
          Query.offset(offset),
        ]
      );
      return {
        items: response.documents.map(mapDispute),
        hasMore: response.documents.length === limit,
        total: response.total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }

  async getAllDisputesByContract(contractId: string): Promise<DisputeEntity[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('contract_id', contractId),
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      return response.documents.map(mapDispute);
    } catch {
      return [];
    }
  }

  async getDisputeByMilestone(milestoneId: string): Promise<DisputeEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('milestone_id', milestoneId),
          Query.notEqual('status', 'resolved'),
          Query.limit(1),
        ]
      );
      const doc = response.documents[0];
      return doc ? mapDispute(doc) : null;
    } catch {
      return null;
    }
  }

  async getDisputesByStatus(status: DisputeStatus, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('status', status),
          Query.orderDesc('created_at'),
          Query.limit(limit),
          Query.offset(offset),
        ]
      );
      return {
        items: response.documents.map(mapDispute),
        hasMore: response.documents.length === limit,
        total: response.total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }

  async getDisputesByInitiator(initiatorId: string, options?: QueryOptions): Promise<PaginatedResult<DisputeEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.equal('initiator_id', initiatorId),
          Query.orderDesc('created_at'),
          Query.limit(limit),
          Query.offset(offset),
        ]
      );
      return {
        items: response.documents.map(mapDispute),
        hasMore: response.documents.length === limit,
        total: response.total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }

  async getAllDisputes(options?: QueryOptions & { status?: string }): Promise<PaginatedResult<DisputeEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    try {
      const queries: any[] = [
        Query.orderDesc('created_at'),
        Query.limit(limit),
        Query.offset(offset),
      ];
      if (options?.status) {
        queries.unshift(Query.equal('status', options.status));
      }

      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        queries
      );
      return {
        items: response.documents.map(mapDispute),
        hasMore: response.documents.length === limit,
        total: response.total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }

  async getDisputesByUserId(userId: string, options?: QueryOptions & { status?: string }): Promise<PaginatedResult<DisputeEntity>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTION_ID,
        [
          Query.orderDesc('created_at'),
          Query.limit(1000),
        ]
      );
      let disputes = response.documents.map(mapDispute);
      if (options?.status) {
        disputes = disputes.filter(d => d.status === options.status);
      }
      const total = disputes.length;
      const items = disputes.slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < total,
        total,
      };
    } catch {
      return { items: [], hasMore: false, total: 0 };
    }
  }
}

export const disputeRepository = new DisputeRepository();
