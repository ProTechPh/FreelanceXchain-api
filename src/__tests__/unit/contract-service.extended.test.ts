import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { createInMemoryStore, createMockContractRepository } from '../helpers/mock-repository-factory.js';
import { createTestContract } from '../helpers/test-data-factory.js';
import { generateId } from '../../utils/id.js';

const contractStore = createInMemoryStore();
const disputeStore = createInMemoryStore();

const mockContractRepo = createMockContractRepository(contractStore);

const mockDisputeRepo = {
  getDisputesByContract: jest.fn<any>(async (contractId: string) => {
    const items = Array.from(disputeStore.values()).filter(
      (d: any) => d.contract_id === contractId,
    );
    return { items, hasMore: false, total: items.length };
  }),
  createDispute: jest.fn<any>(async (d: any) => d),
  getDisputeById: jest.fn<any>(async () => null),
  getAllDisputesByContract: jest.fn<any>(async () => []),
};

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: { getUserById: jest.fn<any>(async () => null) },
}));


const {
  updateContractStatus,
  setEscrowAddress,
  getContractByProposalId,
} = await import('../../services/contract-service.js');

describe('Contract Service - Extended Coverage', () => {
  beforeEach(() => {
    contractStore.clear();
    disputeStore.clear();
    jest.clearAllMocks();

    mockDisputeRepo.getDisputesByContract.mockImplementation(async (contractId: string) => {
      const items = Array.from(disputeStore.values()).filter(
        (d: any) => d.contract_id === contractId,
      );
      return { items, hasMore: false, total: items.length };
    });
  });

  // ──────────────────────────────────────────────────────────
  // updateContractStatus – missing branches
  // ──────────────────────────────────────────────────────────
  describe('updateContractStatus', () => {
    it('should return INVALID_STATUS_TRANSITION for invalid transition', async () => {
      const contract = createTestContract({ status: 'completed' });
      contractStore.set(contract.id, contract);

      const result = await updateContractStatus(contract.id, 'active');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should return INVALID_STATUS_TRANSITION from cancelled to active', async () => {
      const contract = createTestContract({ status: 'cancelled' });
      contractStore.set(contract.id, contract);

      const result = await updateContractStatus(contract.id, 'active');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should return OPEN_DISPUTES_EXIST when resolving a disputed contract with open disputes', async () => {
      const contract = createTestContract({ status: 'disputed' });
      contractStore.set(contract.id, contract);

      const openDispute = {
        id: generateId(),
        contract_id: contract.id,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      disputeStore.set(openDispute.id, openDispute);

      const result = await updateContractStatus(contract.id, 'resolved');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('OPEN_DISPUTES_EXIST');
    });

    it('should return OPEN_DISPUTES_EXIST when dispute is under review', async () => {
      const contract = createTestContract({ status: 'disputed' });
      contractStore.set(contract.id, contract);

      const underReviewDispute = {
        id: generateId(),
        contract_id: contract.id,
        status: 'under_review',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      disputeStore.set(underReviewDispute.id, underReviewDispute);

      const result = await updateContractStatus(contract.id, 'resolved');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('OPEN_DISPUTES_EXIST');
    });

    it('should allow resolving disputed contract when all disputes are closed', async () => {
      const contract = createTestContract({ status: 'disputed' });
      contractStore.set(contract.id, contract);

      const closedDispute = {
        id: generateId(),
        contract_id: contract.id,
        status: 'resolved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      disputeStore.set(closedDispute.id, closedDispute);

      const result = await updateContractStatus(contract.id, 'resolved');

      expect(result.success).toBe(true);
    });

    it('should return UPDATE_FAILED when the repository fails to update', async () => {
      const contract = createTestContract({ status: 'pending' });
      contractStore.set(contract.id, contract);

      (mockContractRepo.updateContract as any).mockResolvedValueOnce(null);

      const result = await updateContractStatus(contract.id, 'active');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should allow transitioning from pending to active', async () => {
      const contract = createTestContract({ status: 'pending' });
      contractStore.set(contract.id, contract);

      const result = await updateContractStatus(contract.id, 'active');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.status).toBe('active');
    });

    it('should allow transitioning from active to completed', async () => {
      const contract = createTestContract({ status: 'active' });
      contractStore.set(contract.id, contract);

      const result = await updateContractStatus(contract.id, 'completed');

      expect(result.success).toBe(true);
    });

    it('should allow transitioning from active to disputed', async () => {
      const contract = createTestContract({ status: 'active' });
      contractStore.set(contract.id, contract);

      const result = await updateContractStatus(contract.id, 'disputed');

      expect(result.success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // setEscrowAddress – missing branches
  // ──────────────────────────────────────────────────────────
  describe('setEscrowAddress', () => {
    it('should return NOT_FOUND when contract does not exist', async () => {
      const result = await setEscrowAddress('nonexistent', '0x' + 'a'.repeat(40));

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UPDATE_FAILED when the repository fails to update', async () => {
      const contract = createTestContract({ status: 'pending' });
      contractStore.set(contract.id, contract);

      (mockContractRepo.updateContract as any).mockResolvedValueOnce(null);

      const result = await setEscrowAddress(contract.id, '0x' + 'a'.repeat(40));

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should successfully update the escrow address', async () => {
      const contract = createTestContract({ status: 'pending' });
      contractStore.set(contract.id, contract);

      const escrowAddress = '0x' + 'a'.repeat(40);
      const result = await setEscrowAddress(contract.id, escrowAddress);

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.escrowAddress).toBe(escrowAddress);
    });
  });

  // ──────────────────────────────────────────────────────────
  // getContractByProposalId – NOT_FOUND branch
  // ──────────────────────────────────────────────────────────
  describe('getContractByProposalId', () => {
    it('should return NOT_FOUND when no contract exists for the proposal', async () => {
      const result = await getContractByProposalId('nonexistent-proposal');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return the contract when one exists for the proposal', async () => {
      const proposalId = generateId();
      const contract = createTestContract({ proposal_id: proposalId, status: 'active' });
      contractStore.set(contract.id, contract);

      const result = await getContractByProposalId(proposalId);

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.id).toBe(contract.id);
    });
  });
});
