import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { ContractEntity, ContractStatus } from '../../repositories/contract-repository.js';
import { generateId } from '../../utils/id.js';
// In-memory store for testing
let contractStore: Map<string, ContractEntity> = new Map();
const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
// Mock the contract repository
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    getContractById: jest.fn(async (id: string) => {
      return contractStore.get(id) || null;
    }),
    getContractByIdWithRelations: jest.fn(async (id: string) => {
      return contractStore.get(id) || null;
    }),
    getUserContracts: jest.fn(async (userId: string, options?: any) => {
      const contracts = Array.from(contractStore.values())
        .filter(c => c.freelancer_id === userId || c.employer_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;
      return {
        items: contracts.slice(offset, offset + limit),
        hasMore: (offset + limit) < contracts.length,
        total: contracts.length,
      };
    }),
    getContractsByFreelancer: jest.fn(async (freelancerId: string, options?: any) => {
      const contracts = Array.from(contractStore.values())
        .filter(c => c.freelancer_id === freelancerId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;
      return {
        items: contracts.slice(offset, offset + limit),
        hasMore: (offset + limit) < contracts.length,
        total: contracts.length,
      };
    }),
    getContractsByEmployer: jest.fn(async (employerId: string, options?: any) => {
      const contracts = Array.from(contractStore.values())
        .filter(c => c.employer_id === employerId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;
      return {
        items: contracts.slice(offset, offset + limit),
        hasMore: (offset + limit) < contracts.length,
        total: contracts.length,
      };
    }),
    getContractsByProject: jest.fn(async (projectId: string) => {
      return Array.from(contractStore.values()).filter(c => c.project_id === projectId);
    }),
    updateContract: jest.fn(async (id: string, updates: Partial<ContractEntity>) => {
      const contract = contractStore.get(id);
      if (!contract) return null;
      const updated = { ...contract, ...updates, updated_at: new Date().toISOString() };
      contractStore.set(id, updated);
      return updated;
    }),
    findContractByProposalId: jest.fn(async (proposalId: string) => {
      return Array.from(contractStore.values()).find(c => c.proposal_id === proposalId) || null;
    }),
  },
  ContractRepository: jest.fn(),
  ContractEntity: {} as ContractEntity,
  ContractStatus: {} as ContractStatus,
}));
// Import after mocking
const {
  getContractById,
  getUserContracts,
  getContractsByFreelancer,
  getContractsByEmployer,
  getContractsByProject,
  updateContractStatus,
  setEscrowAddress,
  getContractByProposalId,
} = await import('../contract-service.js');
// Helper to create test contract
function createTestContract(overrides: Partial<ContractEntity> = {}): ContractEntity {
  const now = new Date().toISOString();
  const contract: ContractEntity = {
    id: generateId(),
    project_id: generateId(),
    proposal_id: generateId(),
    freelancer_id: 'freelancer-1',
    employer_id: 'employer-1',
    escrow_address: '0x' + '0'.repeat(40),
    total_amount: 1000,
    status: 'active',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  contractStore.set(contract.id, contract);
  return contract;
}
// Custom arbitraries for property-based testing
const validEscrowAddressArbitrary = () =>
  fc.hexaString({ minLength: 40, maxLength: 40 }).map(h => '0x' + h);
describe('Contract Service', () => {
  beforeEach(() => {
    // Clear store before each test
    contractStore.clear();
  });
  describe('getContractById', () => {
    it('should retrieve contract by ID successfully', async () => {
      const contract = createTestContract();
      const result = await getContractById(contract.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(contract.id);
        expect(result.data.projectId).toBe(contract.project_id);
        expect(result.data.freelancerId).toBe(contract.freelancer_id);
        expect(result.data.employerId).toBe(contract.employer_id);
      }
    });
    it('should fail when contract does not exist', async () => {
      const result = await getContractById('non-existent-id');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('not found');
      }
    });
    it('should retrieve contract with all fields correctly mapped', async () => {
      const contract = createTestContract({
        total_amount: 5000,
        status: 'completed',
        escrow_address: '0xabcdef' + '0'.repeat(34),
      });
      const result = await getContractById(contract.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalAmount).toBe(5000);
        expect(result.data.status).toBe('completed');
        expect(result.data.escrowAddress).toBe('0xabcdef' + '0'.repeat(34));
      }
    });
  });
  describe('getUserContracts', () => {
    it('should retrieve contracts where user is freelancer', async () => {
      const userId = 'user-1';
      createTestContract({ freelancer_id: userId });
      createTestContract({ freelancer_id: userId });
      createTestContract({ freelancer_id: 'other-user' });
      const result = await getUserContracts(userId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
      }
    });
    it('should retrieve contracts where user is employer', async () => {
      const userId = 'user-1';
      createTestContract({ employer_id: userId });
      createTestContract({ employer_id: userId });
      const result = await getUserContracts(userId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
      }
    });
    it('should retrieve contracts where user is both freelancer and employer', async () => {
      const userId = 'user-1';
      createTestContract({ freelancer_id: userId });
      createTestContract({ employer_id: userId });
      const result = await getUserContracts(userId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
      }
    });
    it('should support pagination', async () => {
      const userId = 'user-1';
      for (let i = 0; i < 10; i++) {
        createTestContract({ freelancer_id: userId });
      }
      const result = await getUserContracts(userId, { limit: 5, offset: 0 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(5);
        expect(result.data.total).toBe(10);
        expect(result.data.hasMore).toBe(true);
      }
    });
    it('should return empty result for user with no contracts', async () => {
      const result = await getUserContracts('user-with-no-contracts');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
        expect(result.data.total).toBe(0);
      }
    });
  });
  describe('getContractsByFreelancer', () => {
    it('should retrieve contracts for freelancer', async () => {
      const freelancerId = 'freelancer-1';
      createTestContract({ freelancer_id: freelancerId });
      createTestContract({ freelancer_id: freelancerId });
      createTestContract({ freelancer_id: 'other-freelancer' });
      const result = await getContractsByFreelancer(freelancerId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
        expect(result.data.items.every(c => c.freelancerId === freelancerId)).toBe(true);
      }
    });
    it('should support pagination', async () => {
      const freelancerId = 'freelancer-1';
      for (let i = 0; i < 15; i++) {
        createTestContract({ freelancer_id: freelancerId });
      }
      const result = await getContractsByFreelancer(freelancerId, { limit: 10, offset: 0 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(10);
        expect(result.data.total).toBe(15);
        expect(result.data.hasMore).toBe(true);
      }
    });
    it('should return empty result for freelancer with no contracts', async () => {
      const result = await getContractsByFreelancer('freelancer-with-no-contracts');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
      }
    });
  });
  describe('getContractsByEmployer', () => {
    it('should retrieve contracts for employer', async () => {
      const employerId = 'employer-1';
      createTestContract({ employer_id: employerId });
      createTestContract({ employer_id: employerId });
      createTestContract({ employer_id: 'other-employer' });
      const result = await getContractsByEmployer(employerId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
        expect(result.data.items.every(c => c.employerId === employerId)).toBe(true);
      }
    });
    it('should support pagination', async () => {
      const employerId = 'employer-1';
      for (let i = 0; i < 20; i++) {
        createTestContract({ employer_id: employerId });
      }
      const result = await getContractsByEmployer(employerId, { limit: 10, offset: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(10);
        expect(result.data.total).toBe(20);
      }
    });
    it('should return empty result for employer with no contracts', async () => {
      const result = await getContractsByEmployer('employer-with-no-contracts');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
      }
    });
  });
  describe('getContractsByProject', () => {
    it('should retrieve all contracts for a project', async () => {
      const projectId = 'project-1';
      createTestContract({ project_id: projectId });
      createTestContract({ project_id: projectId });
      createTestContract({ project_id: 'other-project' });
      const result = await getContractsByProject(projectId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data.every(c => c.projectId === projectId)).toBe(true);
      }
    });
    it('should return empty array for project with no contracts', async () => {
      const result = await getContractsByProject('project-with-no-contracts');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
    it('should return contracts with different statuses', async () => {
      const projectId = 'project-1';
      createTestContract({ project_id: projectId, status: 'active' });
      createTestContract({ project_id: projectId, status: 'completed' });
      createTestContract({ project_id: projectId, status: 'disputed' });
      const result = await getContractsByProject(projectId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        const statuses = result.data.map(c => c.status);
        expect(statuses).toContain('active');
        expect(statuses).toContain('completed');
        expect(statuses).toContain('disputed');
      }
    });
  });
  describe('updateContractStatus', () => {
    it('should update status from active to completed', async () => {
      const contract = createTestContract({ status: 'active' });
      const result = await updateContractStatus(contract.id, 'completed');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('completed');
      }
    });
    it('should update status from active to disputed', async () => {
      const contract = createTestContract({ status: 'active' });
      const result = await updateContractStatus(contract.id, 'disputed');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('disputed');
      }
    });
    it('should update status from active to cancelled', async () => {
      const contract = createTestContract({ status: 'active' });
      const result = await updateContractStatus(contract.id, 'cancelled');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('cancelled');
      }
    });
    it('should fail status update from disputed to active', async () => {
      const contract = createTestContract({ status: 'disputed' });
      const result = await updateContractStatus(contract.id, 'active');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
      }
    });
    it('should update status from disputed to completed', async () => {
      const contract = createTestContract({ status: 'disputed' });
      const result = await updateContractStatus(contract.id, 'completed');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('completed');
      }
    });
    it('should update status from disputed to cancelled', async () => {
      const contract = createTestContract({ status: 'disputed' });
      const result = await updateContractStatus(contract.id, 'cancelled');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('cancelled');
      }
    });
    it('should fail to update from completed to any status', async () => {
      const contract = createTestContract({ status: 'completed' });
      const result = await updateContractStatus(contract.id, 'active');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
        expect(result.error.message).toContain('completed');
      }
    });
    it('should fail to update from cancelled to any status', async () => {
      const contract = createTestContract({ status: 'cancelled' });
      const result = await updateContractStatus(contract.id, 'active');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
        expect(result.error.message).toContain('cancelled');
      }
    });
    it('should fail when contract does not exist', async () => {
      const result = await updateContractStatus('non-existent-id', 'completed');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
    it('should fail for invalid transition from active to active', async () => {
      const contract = createTestContract({ status: 'active' });
      const result = await updateContractStatus(contract.id, 'active');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
      }
    });
    it('should test all valid transitions systematically', async () => {
      const validTransitions: Array<[ContractStatus, ContractStatus]> = [
        ['active', 'completed'],
        ['active', 'disputed'],
        ['active', 'cancelled'],
        ['disputed', 'completed'],
        ['disputed', 'cancelled'],
      ];
      for (const [fromStatus, toStatus] of validTransitions) {
        contractStore.clear();
        const contract = createTestContract({ status: fromStatus });
        const result = await updateContractStatus(contract.id, toStatus);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(toStatus);
        }
      }
    });
    it('should test all invalid transitions systematically', async () => {
      const invalidTransitions: Array<[ContractStatus, ContractStatus]> = [
        ['active', 'active'],
        ['completed', 'active'],
        ['completed', 'disputed'],
        ['completed', 'cancelled'],
        ['completed', 'completed'],
        ['cancelled', 'active'],
        ['cancelled', 'disputed'],
        ['cancelled', 'completed'],
        ['cancelled', 'cancelled'],
        ['disputed', 'active'],
        ['disputed', 'disputed'],
      ];
      for (const [fromStatus, toStatus] of invalidTransitions) {
        contractStore.clear();
        const contract = createTestContract({ status: fromStatus });
        const result = await updateContractStatus(contract.id, toStatus);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
        }
      }
    });
  });
  describe('setEscrowAddress', () => {
    it('should set escrow address successfully', async () => {
      const contract = createTestContract({ escrow_address: '0x' + '0'.repeat(40) });
      const newAddress = '0xabcdef' + '1'.repeat(34);
      const result = await setEscrowAddress(contract.id, newAddress);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.escrowAddress).toBe(newAddress);
      }
    });
    it('should fail when contract does not exist', async () => {
      const result = await setEscrowAddress('non-existent-id', '0x' + '1'.repeat(40));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
    it('should handle various escrow address formats (property-based)', async () => {
      await fc.assert(
        fc.asyncProperty(validEscrowAddressArbitrary(), async (address) => {
          contractStore.clear();
          const contract = createTestContract();
          const result = await setEscrowAddress(contract.id, address);
          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.data.escrowAddress).toBe(address);
          }
        }),
        { numRuns: 20 }
      );
    });
    it('should update escrow address multiple times', async () => {
      const contract = createTestContract();
      const address1 = '0x' + '1'.repeat(40);
      const address2 = '0x' + '2'.repeat(40);
      const address3 = '0x' + '3'.repeat(40);
      await setEscrowAddress(contract.id, address1);
      await setEscrowAddress(contract.id, address2);
      const result = await setEscrowAddress(contract.id, address3);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.escrowAddress).toBe(address3);
      }
    });
    it('should handle uppercase and lowercase addresses', async () => {
      const contract = createTestContract();
      const address = '0xAbCdEf' + '1'.repeat(34);
      const result = await setEscrowAddress(contract.id, address);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.escrowAddress).toBe(address);
      }
    });
  });
  describe('getContractByProposalId', () => {
    it('should retrieve contract by proposal ID', async () => {
      const proposalId = 'proposal-1';
      const contract = createTestContract({ proposal_id: proposalId });
      const result = await getContractByProposalId(proposalId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(contract.id);
        expect(result.data.proposalId).toBe(proposalId);
      }
    });
    it('should fail when no contract exists for proposal', async () => {
      const result = await getContractByProposalId('non-existent-proposal');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('proposal');
      }
    });
    it('should return first contract when multiple exist (edge case)', async () => {
      const proposalId = 'proposal-1';
      createTestContract({ proposal_id: proposalId });
      createTestContract({ proposal_id: proposalId });
      const result = await getContractByProposalId(proposalId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.proposalId).toBe(proposalId);
      }
    });
  });
  describe('Edge Cases and Error Handling', () => {
    it('should handle contracts with very large amounts', async () => {
      const contract = createTestContract({ total_amount: 999999999 });
      const result = await getContractById(contract.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalAmount).toBe(999999999);
      }
    });
    it('should handle contracts with zero amount', async () => {
      const contract = createTestContract({ total_amount: 0 });
      const result = await getContractById(contract.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalAmount).toBe(0);
      }
    });
    it('should handle multiple status updates in sequence', async () => {
      const contract = createTestContract({ status: 'active' });
      await updateContractStatus(contract.id, 'disputed');
      const result = await updateContractStatus(contract.id, 'completed');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('completed');
      }
    });
    it('should handle pagination with offset beyond total', async () => {
      const userId = 'user-1';
      createTestContract({ freelancer_id: userId });
      createTestContract({ freelancer_id: userId });
      const result = await getUserContracts(userId, { limit: 10, offset: 100 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(0);
        expect(result.data.total).toBe(2);
        expect(result.data.hasMore).toBe(false);
      }
    });
    it('should handle concurrent contract retrievals', async () => {
      const contract1 = createTestContract();
      const contract2 = createTestContract();
      const contract3 = createTestContract();
      const results = await Promise.all([
        getContractById(contract1.id),
        getContractById(contract2.id),
        getContractById(contract3.id),
      ]);
      expect(results.every(r => r.success)).toBe(true);
    });
    it('should preserve other fields when updating status', async () => {
      const contract = createTestContract({
        total_amount: 5000,
        escrow_address: '0xspecial' + '0'.repeat(32),
      });
      const result = await updateContractStatus(contract.id, 'completed');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalAmount).toBe(5000);
        expect(result.data.escrowAddress).toBe('0xspecial' + '0'.repeat(32));
      }
    });
    it('should preserve other fields when setting escrow address', async () => {
      const contract = createTestContract({
        status: 'active',
        total_amount: 3000,
      });
      const result = await setEscrowAddress(contract.id, '0x' + '9'.repeat(40));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('active');
        expect(result.data.totalAmount).toBe(3000);
      }
    });
  });
});

