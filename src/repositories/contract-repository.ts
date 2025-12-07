import { BaseRepository, PaginatedResult, QueryOptions } from './base-repository.js';
import { COLLECTIONS } from '../config/database.js';
import { Contract, ContractStatus } from '../models/contract.js';

export class ContractRepository extends BaseRepository<Contract> {
  constructor() {
    super(COLLECTIONS.CONTRACTS);
  }

  async createContract(contract: Contract): Promise<Contract> {
    return this.create(contract, contract.id);
  }

  async getContractById(id: string): Promise<Contract | null> {
    return this.getById(id, id);
  }

  async updateContract(id: string, updates: Partial<Contract>): Promise<Contract | null> {
    return this.update(id, id, updates);
  }

  async findContractByProposalId(proposalId: string): Promise<Contract | null> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.proposalId = @proposalId',
      parameters: [{ name: '@proposalId', value: proposalId }],
    };
    return this.findOne(querySpec);
  }

  async getContractsByFreelancer(freelancerId: string, options?: QueryOptions): Promise<PaginatedResult<Contract>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.freelancerId = @freelancerId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@freelancerId', value: freelancerId }],
    };
    return this.query(querySpec, options);
  }

  async getContractsByEmployer(employerId: string, options?: QueryOptions): Promise<PaginatedResult<Contract>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.employerId = @employerId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@employerId', value: employerId }],
    };
    return this.query(querySpec, options);
  }

  async getContractsByProject(projectId: string): Promise<Contract[]> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.projectId = @projectId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@projectId', value: projectId }],
    };
    return this.queryAll(querySpec);
  }


  async getContractsByStatus(status: ContractStatus, options?: QueryOptions): Promise<PaginatedResult<Contract>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.status = @status ORDER BY c.createdAt DESC',
      parameters: [{ name: '@status', value: status }],
    };
    return this.query(querySpec, options);
  }

  async getUserContracts(userId: string, options?: QueryOptions): Promise<PaginatedResult<Contract>> {
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.freelancerId = @userId OR c.employerId = @userId ORDER BY c.createdAt DESC',
      parameters: [{ name: '@userId', value: userId }],
    };
    return this.query(querySpec, options);
  }
}

export const contractRepository = new ContractRepository();
