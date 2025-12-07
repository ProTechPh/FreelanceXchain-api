import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';
import { Proposal } from '../models/proposal.js';

export class ProposalRepository extends BaseRepository<Proposal> {
  constructor() {
    super(COLLECTIONS.PROPOSALS);
  }

  async createProposal(proposal: Proposal): Promise<Proposal> {
    return this.create(proposal, proposal.projectId);
  }

  async getProposalById(id: string, projectId: string): Promise<Proposal | null> {
    return this.getById(id, projectId);
  }

  async updateProposal(id: string, projectId: string, updates: Partial<Proposal>): Promise<Proposal | null> {
    return this.update(id, projectId, updates);
  }

  async findProposalById(id: string): Promise<Proposal | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }],
    };
    return this.findOne(querySpec);
  }

  async getProposalsByProject(projectId: string, options?: QueryOptions): Promise<PaginatedResult<Proposal>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.projectId = @projectId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@projectId', value: projectId }],
    };
    return this.query(querySpec, options);
  }

  async getProposalsByFreelancer(freelancerId: string): Promise<Proposal[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.freelancerId = @freelancerId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@freelancerId', value: freelancerId }],
    };
    return this.queryAll(querySpec);
  }

  async hasAcceptedProposal(projectId: string): Promise<boolean> {
    const querySpec = {
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.projectId = @projectId AND c.status = 'accepted'",
      parameters: [{ name: '@projectId', value: projectId }],
    };
    const result = await this.queryAll(querySpec);
    return (result[0] as unknown as number) > 0;
  }

  async getProposalCountByProject(projectId: string): Promise<number> {
    const querySpec = {
      query: 'SELECT VALUE COUNT(1) FROM c WHERE c.projectId = @projectId',
      parameters: [{ name: '@projectId', value: projectId }],
    };
    const result = await this.queryAll(querySpec);
    return (result[0] as unknown as number) || 0;
  }

  async getExistingProposal(projectId: string, freelancerId: string): Promise<Proposal | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.projectId = @projectId AND c.freelancerId = @freelancerId',
      parameters: [
        { name: '@projectId', value: projectId },
        { name: '@freelancerId', value: freelancerId },
      ],
    };
    return this.findOne(querySpec);
  }
}

export const proposalRepository = new ProposalRepository();
