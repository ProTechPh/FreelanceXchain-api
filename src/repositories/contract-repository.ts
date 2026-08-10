import type { Models } from 'node-appwrite';
import { BaseRepository, type QueryOptions, type PaginatedResult, fromAppwriteDoc } from './base-repository.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';
import { safeJsonParse } from '../utils/index.js';

export type ContractStatus = 'pending' | 'active' | 'completed' | 'disputed' | 'resolved' | 'cancelled';

export type ContractEntity = {
  id: string;
  project_id: string;
  proposal_id: string;
  freelancer_id: string;
  employer_id: string;
  escrow_address: string;
  base_amount: number;
  rush_fee: number;
  total_amount: number;
  status: ContractStatus;
  created_at: string;
  updated_at: string;
};

const COLLECTION_ID = 'contracts';

function mapDoc(doc: Record<string, unknown>): ContractEntity {
  return fromAppwriteDoc<ContractEntity>(doc);
}

/**
 * Contract plus the relational fields populated by `getContractByIdWithRelations`.
 * Shapes match the repository's real output (singular `profile` object); every
 * relational field stays optional since related docs may be missing.
 * Kept in sync with `ContractRelations` in src/utils/entity-mapper.ts (which
 * additionally allows `project.deadline`/`project.milestones` from other producers).
 */
export type ContractWithRelations = ContractEntity & {
  project?: {
    id?: string;
    title?: string | undefined;
    description?: string | undefined;
  } | null;
  freelancer?: {
    id?: string;
    name?: string | undefined;
    email?: string | undefined;
    profile?: {
      id?: string;
      hourly_rate?: number | undefined;
      skills?: unknown;
    } | null;
  };
  employer?: {
    id?: string;
    name?: string | undefined;
    email?: string | undefined;
    profile?: {
      id?: string;
      company_name?: string | undefined;
      industry?: string | undefined;
    } | null;
  };
};

// The SDK only types $-prefixed metadata on `Models.Document`; real document
// attributes are untyped, so read them through a plain record.
function docAttrs(doc: Models.Document | null): Record<string, unknown> {
  return doc ? (doc as unknown as Record<string, unknown>) : {};
}

// Appwrite documents expose attributes through an index signature typed `unknown`;
// narrow the values we actually read instead of casting the whole document.
function strField(doc: Models.Document | null, key: string): string | undefined {
  const value = docAttrs(doc)[key];
  return typeof value === 'string' ? value : undefined;
}

function numField(doc: Models.Document | null, key: string): number | undefined {
  const value = docAttrs(doc)[key];
  return typeof value === 'number' ? value : undefined;
}

export class ContractRepository extends BaseRepository<ContractEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getContractById(id: string): Promise<ContractEntity | null> {
    return this.getById(id);
  }

  async getContractByIdWithRelations(id: string): Promise<ContractWithRelations | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, COLLECTION_ID, id);
      const contract = mapDoc(doc);

      // Fetch related entities
      const [projectDoc, freelancerDoc, employerDoc] = await Promise.all([
        databases.getDocument(DATABASE_ID, 'projects', contract.project_id).catch(() => null),
        databases.getDocument(DATABASE_ID, 'users', contract.freelancer_id).catch(() => null),
        databases.getDocument(DATABASE_ID, 'users', contract.employer_id).catch(() => null),
      ]);

      let freelancerProfile: Models.Document | null = null;
      if (freelancerDoc) {
        try {
          const resp = await databases.listDocuments(DATABASE_ID, 'freelancer_profiles', [
            Query.equal('user_id', contract.freelancer_id),
            Query.limit(1),
          ]);
          freelancerProfile = resp.documents[0] ?? null;
        } catch { /* ignore */ }
      }

      let employerProfile: Models.Document | null = null;
      if (employerDoc) {
        try {
          const resp = await databases.listDocuments(DATABASE_ID, 'employer_profiles', [
            Query.equal('user_id', contract.employer_id),
            Query.limit(1),
          ]);
          employerProfile = resp.documents[0] ?? null;
        } catch { /* ignore */ }
      }

      const mapUser = (d: Models.Document | null) =>
        d ? { id: d.$id, name: strField(d, 'name'), email: strField(d, 'email') } : null;

      return {
        ...contract,
        project: projectDoc ? {
          id: projectDoc.$id,
          title: strField(projectDoc, 'title'),
          description: strField(projectDoc, 'description'),
        } : null,
        freelancer: {
          ...mapUser(freelancerDoc),
          profile: freelancerProfile ? {
            id: freelancerProfile.$id,
            hourly_rate: numField(freelancerProfile, 'hourly_rate'),
            skills: safeJsonParse(docAttrs(freelancerProfile).skills),
          } : null,
        },
        employer: {
          ...mapUser(employerDoc),
          profile: employerProfile ? {
            id: employerProfile.$id,
            company_name: strField(employerProfile, 'company_name'),
            industry: strField(employerProfile, 'industry'),
          } : null,
        },
      };
    } catch {
      return null;
    }
  }

  async updateContract(id: string, updates: Partial<ContractEntity>): Promise<ContractEntity | null> {
    return this.update(id, updates);
  }

  async findContractByProposalId(proposalId: string): Promise<ContractEntity | null> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, COLLECTION_ID,
        [Query.equal('proposal_id', proposalId), Query.limit(1)]
      );
      return response.documents.length > 0 ? mapDoc(response.documents[0]!) : null;
    } catch {
      return null;
    }
  }

  async getContractsByFreelancer(freelancerId: string, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
    return this.paginatedWithQueries<ContractEntity>(
      [Query.equal('freelancer_id', freelancerId), Query.orderDesc('created_at')],
      options?.limit ?? 20,
      options?.offset ?? 0,
      mapDoc
    );
  }

  async getContractsByEmployer(employerId: string, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
    return this.paginatedWithQueries<ContractEntity>(
      [Query.equal('employer_id', employerId), Query.orderDesc('created_at')],
      options?.limit ?? 20,
      options?.offset ?? 0,
      mapDoc
    );
  }

  async getContractsByProject(projectId: string): Promise<ContractEntity[]> {
    return this.listWithQueries<ContractEntity>(
      [Query.equal('project_id', projectId), Query.orderDesc('created_at')],
      mapDoc
    );
  }

  async getUserContracts(userId: string, options?: QueryOptions): Promise<PaginatedResult<ContractEntity>> {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;

    // Appwrite doesn't support OR in queries; combine both
    // Fetch all contracts for both roles without pagination, then merge and paginate
    const [freelancer, employer] = await Promise.all([
      this.listWithQueries<ContractEntity>(
        [Query.equal('freelancer_id', userId), Query.orderDesc('created_at')],
        mapDoc
      ),
      this.listWithQueries<ContractEntity>(
        [Query.equal('employer_id', userId), Query.orderDesc('created_at')],
        mapDoc
      ),
    ]);

    const all = [...freelancer, ...employer]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = all.length;
    const items = all.slice(offset, offset + limit);

    return {
      items,
      hasMore: offset + limit < total,
      total,
    };
  }
}

export const contractRepository = new ContractRepository();
