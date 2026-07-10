// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { createInMemoryStore, createMockContractRepository } from '../helpers/mock-repository-factory.js';
import { createTestContract } from '../helpers/test-data-factory.js';
import { assertHasTimestamps, assertIsValidId } from '../helpers/test-assertions.js';

// Create stores and mocks using shared utilities
const contractStore = createInMemoryStore();
const mockContractRepo = createMockContractRepository(contractStore);

// Dispute store and mock
const disputeStore = createInMemoryStore();
const mockDisputeRepo = {
  getDisputesByContract: jest.fn(async (contractId: string) => {
    const items = Array.from(disputeStore.values()).filter((d: any) => d.contract_id === contractId);
    return { items, hasMore: false, total: items.length };
  }),
};

// User store and mock
const userStore = createInMemoryStore();
const mockUserRepo = {
  getUserById: jest.fn(async (id: string) => {
    return userStore.get(id) ?? null;
  }),
};

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock the contract repository
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
  ContractRepository: jest.fn(),
}));

// Mock the dispute repository
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepo,
  DisputeRepository: jest.fn(),
}));

// Mock the user repository
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
  UserRepository: jest.fn(),
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
} = await import('../../services/contract-service.js');

const {
  getContractByProposalId,
  cancelPendingContract,
  getContractWalletAddresses,
} = await import('../../services/contract-service.js');

describe('Contract Service - Property-Based Tests', () => {
  beforeEach(() => {
    mockContractRepo.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 40: Contract retrieval**
   * **Validates: Requirements 7.1**
   * 
   * For any contract stored in the system, retrieving it by ID shall return
   * the same contract data.
   */
  it('Property 40: Contract retrieval', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (projectId, freelancerId, employerId) => {
          const contract = createTestContract({
            project_id: projectId,
            freelancer_id: freelancerId,
            employer_id: employerId,
            status: 'active',
          });
          contractStore.set(contract.id, contract);

          const retrieved = await getContractById(contract.id);

          expect(retrieved.success).toBe(true);
          if (retrieved.success) {
            expect(retrieved.data.id).toBe(contract.id);
            expect(retrieved.data.projectId).toBe(projectId);
            expect(retrieved.data.freelancerId).toBe(freelancerId);
            expect(retrieved.data.employerId).toBe(employerId);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 41: User contracts filtering**
   * **Validates: Requirements 7.2**
   * 
   * Retrieving contracts for a user shall return only contracts where the user
   * is either the freelancer or employer.
   */
  it('Property 41: User contracts filtering', async () => {
    const userId = 'test-user-id';
    const otherUserId = 'other-user-id';

    // Create contracts for test user (as freelancer)
    const contract1 = createTestContract({ freelancer_id: userId, employer_id: otherUserId });
    // Create contracts for test user (as employer)
    const contract2 = createTestContract({ freelancer_id: otherUserId, employer_id: userId });
    // Create contract for other user
    const contract3 = createTestContract({ freelancer_id: otherUserId, employer_id: 'another-user' });

    contractStore.set(contract1.id, contract1);
    contractStore.set(contract2.id, contract2);
    contractStore.set(contract3.id, contract3);

    const userContracts = await getUserContracts(userId);

    expect(userContracts.success).toBe(true);
    if (userContracts.success) {
      expect(userContracts.data.items).toHaveLength(2);
      expect(userContracts.data.items.some(c => c.id === contract1.id)).toBe(true);
      expect(userContracts.data.items.some(c => c.id === contract2.id)).toBe(true);
      expect(userContracts.data.items.some(c => c.id === contract3.id)).toBe(false);
    }
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 42: Contract status update**
   * **Validates: Requirements 7.3**
   * 
   * Updating a contract's status shall persist the new status.
   */
  it('Property 42: Contract status update', async () => {
    const contract = createTestContract({ status: 'pending', employer_id: 'employer-1' });
    contractStore.set(contract.id, contract);

    const updated = await updateContractStatus(contract.id, 'active', 'employer-1');

    expect(updated.success).toBe(true);
    if (updated.success) {
      expect(updated.data.status).toBe('active');
    }
    
    // Verify persistence
    const retrieved = await getContractById(contract.id);
    expect(retrieved.success).toBe(true);
    if (retrieved.success) {
      expect(retrieved.data.status).toBe('active');
    }
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 43: Escrow address assignment**
   * **Validates: Requirements 7.4**
   * 
   * Setting an escrow address for a contract shall persist the address.
   */
  it('Property 43: Escrow address assignment', async () => {
    const contract = createTestContract({ escrow_address: '', status: 'pending', employer_id: 'employer-1' });
    contractStore.set(contract.id, contract);
    const escrowAddress = '0x1234567890123456789012345678901234567890';

    const updated = await setEscrowAddress(contract.id, escrowAddress, 'employer-1');

    expect(updated.success).toBe(true);
    if (updated.success) {
      expect(updated.data.escrowAddress).toBe(escrowAddress);
    }
    
    // Verify persistence
    const retrieved = await getContractById(contract.id);
    expect(retrieved.success).toBe(true);
    if (retrieved.success) {
      expect(retrieved.data.escrowAddress).toBe(escrowAddress);
    }
  });
});

describe('Contract Service - Unit Tests', () => {
  beforeEach(() => {
    mockContractRepo.clear();
  });

  it('should get contract by ID', async () => {
    const contract = createTestContract();
    contractStore.set(contract.id, contract);

    const result = await getContractById(contract.id);

    expect(result.success).toBe(true);
    if (result.success) {
      assertIsValidId(result.data.id);
      expect(result.data.id).toBe(contract.id);
      assertHasTimestamps(result.data);
    }
  });

  it('should return error for non-existent contract', async () => {
    const result = await getContractById('non-existent-id');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should get contracts by freelancer', async () => {
    const freelancerId = 'freelancer-123';
    const contract1 = createTestContract({ freelancer_id: freelancerId });
    const contract2 = createTestContract({ freelancer_id: freelancerId });
    const contract3 = createTestContract({ freelancer_id: 'other-freelancer' });

    contractStore.set(contract1.id, contract1);
    contractStore.set(contract2.id, contract2);
    contractStore.set(contract3.id, contract3);

    const result = await getContractsByFreelancer(freelancerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items.every(c => c.freelancerId === freelancerId)).toBe(true);
    }
  });

  it('should get contracts by employer', async () => {
    const employerId = 'employer-123';
    const contract1 = createTestContract({ employer_id: employerId });
    const contract2 = createTestContract({ employer_id: employerId });
    const contract3 = createTestContract({ employer_id: 'other-employer' });

    contractStore.set(contract1.id, contract1);
    contractStore.set(contract2.id, contract2);
    contractStore.set(contract3.id, contract3);

    const result = await getContractsByEmployer(employerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
      expect(result.data.items.every(c => c.employerId === employerId)).toBe(true);
    }
  });

  it('should get contracts by project', async () => {
    const projectId = 'project-123';
    const contract1 = createTestContract({ project_id: projectId });
    const contract2 = createTestContract({ project_id: projectId });
    const contract3 = createTestContract({ project_id: 'other-project' });

    contractStore.set(contract1.id, contract1);
    contractStore.set(contract2.id, contract2);
    contractStore.set(contract3.id, contract3);

    const result = await getContractsByProject(projectId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data.every(c => c.projectId === projectId)).toBe(true);
    }
  });

  it('should update contract status', async () => {
    const contract = createTestContract({ status: 'pending', employer_id: 'employer-1' });
    contractStore.set(contract.id, contract);

    const updated = await updateContractStatus(contract.id, 'active', 'employer-1');

    expect(updated.success).toBe(true);
    if (updated.success) {
      expect(updated.data.status).toBe('active');
      // Note: updatedAt timestamp may be the same in fast test execution
    }
  });

  it('should return error when updating non-existent contract', async () => {
    const result = await updateContractStatus('non-existent-id', 'active', 'employer-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should set escrow address', async () => {
    const contract = createTestContract({ escrow_address: '', status: 'pending', employer_id: 'employer-1' });
    contractStore.set(contract.id, contract);
    const escrowAddress = '0xABCDEF1234567890123456789012345678901234';

    const updated = await setEscrowAddress(contract.id, escrowAddress, 'employer-1');

    expect(updated.success).toBe(true);
    if (updated.success) {
      expect(updated.data.escrowAddress).toBe(escrowAddress);
    }
  });

  it('should handle pagination for user contracts', async () => {
    const userId = 'user-123';

    // Create 10 contracts for the user
    for (let i = 0; i < 10; i++) {
      const contract = createTestContract({
        freelancer_id: userId,
        created_at: new Date(Date.now() - i * 1000).toISOString()
      });
      contractStore.set(contract.id, contract);
    }

    const page1 = await getUserContracts(userId, { limit: 5, offset: 0 });
    const page2 = await getUserContracts(userId, { limit: 5, offset: 5 });

    expect(page1.success).toBe(true);
    expect(page2.success).toBe(true);

    if (page1.success && page2.success) {
      expect(page1.data.items).toHaveLength(5);
      expect(page1.data.hasMore).toBe(true);
      expect(page1.data.total).toBe(10);

      expect(page2.data.items).toHaveLength(5);
      expect(page2.data.hasMore).toBe(false);
      expect(page2.data.total).toBe(10);

      // Verify no overlap
      const page1Ids = page1.data.items.map(c => c.id);
      const page2Ids = page2.data.items.map(c => c.id);
      expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
    }
  });
});

describe('Contract Service - Coverage Tests', () => {
  beforeEach(() => {
    mockContractRepo.clear();
    disputeStore.clear();
    userStore.clear();
  });

  // --- updateContractStatus: role-based UNAUTHORIZED (line 126) ---
  it('should return UNAUTHORIZED when party attempts transition they are not allowed for', async () => {
    const contract = createTestContract({
      status: 'pending',
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    // Freelancer is a valid party, but pending→active is employer-only
    const result = await updateContractStatus(contract.id, 'active', 'fl-1', 'freelancer');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  // --- updateContractStatus: UNAUTHORIZED (line 77) ---
  it('should return UNAUTHORIZED when userId is not a contract party', async () => {
    const contract = createTestContract({
      status: 'pending',
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    const result = await updateContractStatus(contract.id, 'active', 'random-user');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  // --- updateContractStatus: INVALID_STATUS_TRANSITION (line 93) ---
  it('should return INVALID_STATUS_TRANSITION for invalid transition', async () => {
    const contract = createTestContract({ status: 'completed', employer_id: 'employer-1' });
    contractStore.set(contract.id, contract);

    const result = await updateContractStatus(contract.id, 'active', 'employer-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
    }
  });

  // --- updateContractStatus: OPEN_DISPUTES_EXIST (lines 103-106) ---
  it('should return OPEN_DISPUTES_EXIST when resolving contract with open disputes', async () => {
    const contract = createTestContract({ status: 'disputed', employer_id: 'emp-1' });
    contractStore.set(contract.id, contract);

    disputeStore.set('dispute-1', {
      id: 'dispute-1',
      contract_id: contract.id,
      milestone_id: 'ms-1',
      initiator_id: 'user-1',
      reason: 'test',
      evidence: [],
      status: 'open',
      resolution: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await updateContractStatus(contract.id, 'resolved', 'admin-1', 'admin');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('OPEN_DISPUTES_EXIST');
    }
  });

  it('should return OPEN_DISPUTES_EXIST when resolving contract with under_review disputes', async () => {
    const contract = createTestContract({ status: 'disputed', employer_id: 'emp-1' });
    contractStore.set(contract.id, contract);

    disputeStore.set('dispute-2', {
      id: 'dispute-2',
      contract_id: contract.id,
      milestone_id: 'ms-1',
      initiator_id: 'user-1',
      reason: 'test',
      evidence: [],
      status: 'under_review',
      resolution: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await updateContractStatus(contract.id, 'resolved', 'admin-1', 'admin');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('OPEN_DISPUTES_EXIST');
    }
  });

  // --- updateContractStatus: UPDATE_FAILED (line 118) ---
  it('should return UPDATE_FAILED when contract status update returns null', async () => {
    const contract = createTestContract({ status: 'pending', employer_id: 'employer-1' });
    contractStore.set(contract.id, contract);

    mockContractRepo.updateContract.mockReturnValueOnce(Promise.resolve(null));

    const result = await updateContractStatus(contract.id, 'active', 'employer-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
    }
  });

  // --- setEscrowAddress: NOT_FOUND (line 134) ---
  it('should return NOT_FOUND when setting escrow on non-existent contract', async () => {
    const result = await setEscrowAddress('non-existent', '0x1234', 'employer-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  // --- setEscrowAddress: INVALID_STATUS (line 142) ---
  it('should return INVALID_STATUS when setting escrow on non-pending contract', async () => {
    const contract = createTestContract({ status: 'active', employer_id: 'employer-1' });
    contractStore.set(contract.id, contract);

    const result = await setEscrowAddress(contract.id, '0x1234', 'employer-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS');
    }
  });

  // --- setEscrowAddress: UNAUTHORIZED (line 149) ---
  it('should return UNAUTHORIZED when setting escrow with unauthorized userId', async () => {
    const contract = createTestContract({
      status: 'pending',
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    const result = await setEscrowAddress(contract.id, '0x1234', 'random-user');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  // --- setEscrowAddress: UPDATE_FAILED (line 157) ---
  it('should return UPDATE_FAILED when escrow update returns null', async () => {
    const contract = createTestContract({ status: 'pending', employer_id: 'employer-1' });
    contractStore.set(contract.id, contract);

    mockContractRepo.updateContract.mockReturnValueOnce(Promise.resolve(null));

    const result = await setEscrowAddress(contract.id, '0x1234', 'employer-1');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
    }
  });

  // --- getContractByProposalId: success (lines 169-176) ---
  it('should get contract by proposal ID', async () => {
    const contract = createTestContract({ proposal_id: 'prop-123' });
    contractStore.set(contract.id, contract);

    const result = await getContractByProposalId('prop-123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(contract.id);
    }
  });

  // --- getContractByProposalId: NOT_FOUND (lines 169-174) ---
  it('should return NOT_FOUND when no contract exists for proposal ID', async () => {
    const result = await getContractByProposalId('non-existent-prop');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  // --- cancelPendingContract: success (lines 183-218) ---
  it('should cancel a pending contract successfully', async () => {
    const contract = createTestContract({
      status: 'pending',
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    const result = await cancelPendingContract(contract.id, 'emp-1');

    expect(result.success).toBe(true);
  });

  it('should allow freelancer to cancel a pending contract', async () => {
    const contract = createTestContract({
      status: 'pending',
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    const result = await cancelPendingContract(contract.id, 'fl-1');

    expect(result.success).toBe(true);
  });

  // --- cancelPendingContract: NOT_FOUND ---
  it('should return NOT_FOUND when cancelling non-existent contract', async () => {
    const result = await cancelPendingContract('non-existent', 'user-1');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  // --- cancelPendingContract: INVALID_STATUS ---
  it('should return INVALID_STATUS when cancelling non-pending contract', async () => {
    const contract = createTestContract({ status: 'active', employer_id: 'emp-1' });
    contractStore.set(contract.id, contract);

    const result = await cancelPendingContract(contract.id, 'emp-1');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INVALID_STATUS');
  });

  // --- cancelPendingContract: UNAUTHORIZED ---
  it('should return UNAUTHORIZED when cancelling contract by unauthorized user', async () => {
    const contract = createTestContract({
      status: 'pending',
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    const result = await cancelPendingContract(contract.id, 'random-user');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('UNAUTHORIZED');
  });

  // --- cancelPendingContract: UPDATE_FAILED ---
  it('should return UPDATE_FAILED when cancel update returns null', async () => {
    const contract = createTestContract({
      status: 'pending',
      employer_id: 'emp-1',
    });
    contractStore.set(contract.id, contract);

    mockContractRepo.updateContract.mockReturnValueOnce(Promise.resolve(null));

    const result = await cancelPendingContract(contract.id, 'emp-1');

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('UPDATE_FAILED');
  });

  // --- getContractWalletAddresses: success (lines 225-255) ---
  it('should return wallet addresses for contract parties', async () => {
    const contract = createTestContract({
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    userStore.set('emp-1', { id: 'emp-1', wallet_address: '0xEmployerWallet' });
    userStore.set('fl-1', { id: 'fl-1', wallet_address: '0xFreelancerWallet' });

    const result = await getContractWalletAddresses(contract.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employerWallet).toBe('0xEmployerWallet');
      expect(result.data.freelancerWallet).toBe('0xFreelancerWallet');
    }
  });

  // --- getContractWalletAddresses: NOT_FOUND (lines 229-233) ---
  it('should return NOT_FOUND for wallet addresses of non-existent contract', async () => {
    const result = await getContractWalletAddresses('non-existent');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  // --- getContractWalletAddresses: MISSING_WALLET employer (lines 239-246) ---
  it('should return MISSING_WALLET when employer has no wallet address', async () => {
    const contract = createTestContract({
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    userStore.set('emp-1', { id: 'emp-1', wallet_address: '' });
    userStore.set('fl-1', { id: 'fl-1', wallet_address: '0xFreelancerWallet' });

    const result = await getContractWalletAddresses(contract.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MISSING_WALLET');
    }
  });

  // --- getContractWalletAddresses: MISSING_WALLET freelancer (lines 239-246) ---
  it('should return MISSING_WALLET when freelancer has no wallet address', async () => {
    const contract = createTestContract({
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    userStore.set('emp-1', { id: 'emp-1', wallet_address: '0xEmployerWallet' });
    userStore.set('fl-1', { id: 'fl-1', wallet_address: '' });

    const result = await getContractWalletAddresses(contract.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MISSING_WALLET');
    }
  });

  // --- getContractWalletAddresses: MISSING_WALLET both null (lines 239-246) ---
  it('should return MISSING_WALLET when employer user not found', async () => {
    const contract = createTestContract({
      employer_id: 'emp-1',
      freelancer_id: 'fl-1',
    });
    contractStore.set(contract.id, contract);

    // Only set freelancer, employer not in store -> getUserById returns null
    userStore.set('fl-1', { id: 'fl-1', wallet_address: '0xFreelancerWallet' });

    const result = await getContractWalletAddresses(contract.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('MISSING_WALLET');
    }
  });
});
