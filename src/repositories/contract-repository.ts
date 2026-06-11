import { BaseRepositoryAppwrite, type QueryOptions, type PaginatedResult } from './base-repository-appwrite.js';
import { databases, DATABASE_ID, Query } from '../config/appwrite.js';

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

function mapDoc(doc: Record<string, any>): ContractEntity {
  const { $id, $createdAt, $updatedAt, ...attrs } = doc;
  return {
    id: $id,
    ...attrs,
    created_at: attrs.created_at ?? $createdAt,
    updated_at: attrs.updated_at ?? $updatedAt,
  } as ContractEntity;
}

export class ContractRepository extends BaseRepositoryAppwrite<ContractEntity> {
  constructor() {
    super(COLLECTION_ID);
  }

  async getContractById(id: string): Promise<ContractEntity | null> {
    const doc = await this.getById(id);
    return doc ? mapDoc(doc as any) : null;
  }

  async getContractByIdWithRelations(id: string): Promise<any | null> {
    try {
      const doc = await databases.getDocument(DATABASE_ID, COLLECTION_ID, id);
      const contract = mapDoc(doc as any);

      // Fetch related entities
      const [projectDoc, freelancerDoc, employerDoc] = await Promise.all([
        databases.getDocument(DATABASE_ID, 'projects', contract.project_id).catch(() => null),
        databases.getDocument(DATABASE_ID, 'users', contract.freelancer_id).catch(() => null),
        databases.getDocument(DATABASE_ID, 'users', contract.employer_id).catch(() => null),
      ]);

      let freelancerProfile = null;
      if (freelancerDoc) {
        try {
          const resp = await databases.listDocuments(DATABASE_ID, 'freelancer_profiles', [
            Query.equal('user_id', contract.freelancer_id),
            Query.limit(1),
          ]);
          freelancerProfile = resp.documents[0] ?? null;
        } catch { /* ignore */ }
      }

      let employerProfile = null;
      if (employerDoc) {
        try {
          const resp = await databases.listDocuments(DATABASE_ID, 'employer_profiles', [
            Query.equal('user_id', contract.employer_id),
            Query.limit(1),
          ]);
          employerProfile = resp.documents[0] ?? null;
        } catch { /* ignore */ }
      }

      const mapUser = (d: any) => d ? { id: d.$id, name: d.name, email: d.email } : null;

      return {
        ...contract,
        project: projectDoc ? { id: projectDoc.$id, title: (projectDoc as any).title, description: (projectDoc as any).description } : null,
        freelancer: {
          ...mapUser(freelancerDoc),
          profile: freelancerProfile ? {
            id: freelancerProfile.$id,
            hourly_rate: (freelancerProfile as any).hourly_rate,
            skills: typeof (freelancerProfile as any).skills === 'string' ? JSON.parse((freelancerProfile as any).skills) : (freelancerProfile as any).skills,
          } : null,
        },
        employer: {
          ...mapUser(employerDoc),
          profile: employerProfile ? {
            id: employerProfile.$id,
            company_name: (employerProfile as any).company_name,
            industry: (employerProfile as any).industry,
          } : null,
        },
      };
    } catch {
      return null;
    }
  }

  async updateContract(id: string, updates: Partial<ContractEntity>): Promise<ContractEntity | null> {
    const doc = await this.update(id, updates);
    return doc ? mapDoc(doc as any) : null;
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
    // Appwrite doesn't support OR in queries; combine both
    const [freelancer, employer] = await Promise.all([
      this.paginatedWithQueries<ContractEntity>(
        [Query.equal('freelancer_id', userId), Query.orderDesc('created_at')],
        options?.limit ?? 20,
        options?.offset ?? 0,
        mapDoc
      ),
      this.paginatedWithQueries<ContractEntity>(
        [Query.equal('employer_id', userId), Query.orderDesc('created_at')],
        options?.limit ?? 20,
        options?.offset ?? 0,
        mapDoc
      ),
    ]);

    const all = [...freelancer.items, ...employer.items]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return {
      items: all.slice(0, options?.limit ?? 20),
      hasMore: all.length > (options?.limit ?? 20),
      total: all.length,
    };
  }
}

export const contractRepository = new ContractRepository();
