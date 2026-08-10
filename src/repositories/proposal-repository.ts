import { BaseRepository, type QueryOptions, type PaginatedResult, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { parseField } from '../utils/index.js';
import type { FileAttachment } from '../models/milestone.js';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type ProposalEntity = {
  id: string;
  project_id: string;
  freelancer_id: string;
  cover_letter: string | null;
  attachments: FileAttachment[];
  proposed_rate: number;
  estimated_duration: number;
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'proposals';

function normalizeProposal(proposal: ProposalEntity): ProposalEntity {
  return {
    ...proposal,
    attachments: parseField(proposal.attachments, []),
  };
}

function mapDoc(doc: Record<string, unknown>): ProposalEntity {
  return normalizeProposal(fromAppwriteDoc<ProposalEntity>(doc));
}

export class ProposalRepository extends BaseRepository<ProposalEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async createProposal(proposal: Omit<ProposalEntity, 'created_at' | 'updated_at'>): Promise<ProposalEntity> {
    const data: Record<string, unknown> = { ...proposal };
    if (data.attachments) data.attachments = JSON.stringify(data.attachments);
    return this.create(data as Omit<ProposalEntity, 'created_at' | 'updated_at'>);
  }

  async getProposalById(id: string): Promise<ProposalEntity | null> {
    const doc = await this.getById(id);
    return doc ? normalizeProposal(doc) : null;
  }

  async updateProposal(id: string, updates: Partial<ProposalEntity>): Promise<ProposalEntity | null> {
    const data: Record<string, unknown> = { ...updates };
    if (data.attachments) data.attachments = JSON.stringify(data.attachments);
    const doc = await this.update(id, data as Partial<ProposalEntity>);
    return doc ? normalizeProposal(doc) : null;
  }

  async findProposalById(id: string): Promise<ProposalEntity | null> {
    return this.getProposalById(id);
  }

  async getProposalsByProject(projectId: string, options?: QueryOptions): Promise<PaginatedResult<ProposalEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    return this.paginatedWithQueries<ProposalEntity>(
      [
        Query.equal('project_id', projectId),
        Query.notEqual('status', 'withdrawn'),
        Query.orderDesc('created_at'),
      ],
      limit,
      offset,
      mapDoc
    );
  }

  async getProposalsByFreelancer(freelancerId: string): Promise<ProposalEntity[]> {
    return this.listWithQueries<ProposalEntity>(
      [Query.equal('freelancer_id', freelancerId), Query.orderDesc('created_at')],
      mapDoc
    );
  }

  async hasAcceptedProposal(projectId: string): Promise<boolean> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('project_id', projectId), Query.equal('status', 'accepted'), Query.limit(1)]
      );
      return response.documents.length > 0;
    } catch {
      return false;
    }
  }

  async getAcceptedProposalCount(projectId: string): Promise<number> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('project_id', projectId), Query.equal('status', 'accepted'), Query.limit(1)]
      );
      return response.total;
    } catch {
      return 0;
    }
  }

  async getProposalCountByProject(projectId: string): Promise<number> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('project_id', projectId), Query.notEqual('status', 'withdrawn'), Query.limit(1)]
      );
      return response.total;
    } catch {
      return 0;
    }
  }

  async getProposalCountsByProjects(projectIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const counts = await Promise.all(
      projectIds.map(pid => this.getProposalCountByProject(pid))
    );
    projectIds.forEach((pid, index) => {
      map.set(pid, counts[index]!);
    });
    return map;
  }

  async getExistingProposal(projectId: string, freelancerId: string): Promise<ProposalEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [
          Query.equal('project_id', projectId),
          Query.equal('freelancer_id', freelancerId),
          Query.notEqual('status', 'withdrawn'),
          Query.limit(1),
        ]
      );
      return response.documents.length > 0 ? mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }
}

export const proposalRepository = new ProposalRepository();
