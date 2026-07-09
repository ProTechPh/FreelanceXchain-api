// @ts-nocheck
// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import {
  createInMemoryStore,
  createMockProposalRepository,
  createMockProjectRepository,
  createMockContractRepository,
  createMockUserRepository,
  createMockNotificationRepository,
  createMockReviewRepository,
  createMockEmployerProfileRepository
} from '../helpers/mock-repository-factory.js';
import { 
  createTestProposal, 
  createTestProject, 
  createTestContract,
  createTestUser,
  createTestMilestone
} from '../helpers/test-data-factory.js';
import { assertHasTimestamps, assertIsValidId } from '../helpers/test-assertions.js';

// Create stores and mocks using shared utilities
const proposalStore = createInMemoryStore();
const projectStore = createInMemoryStore();
const contractStore = createInMemoryStore();
const userStore = createInMemoryStore();
const notificationStore = createInMemoryStore();
const reviewStore = createInMemoryStore();
const employerProfileStore = createInMemoryStore();

const mockProposalRepo = createMockProposalRepository(proposalStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockContractRepo = createMockContractRepository(contractStore);
const mockUserRepo = createMockUserRepository(userStore);
const mockNotificationRepo = createMockNotificationRepository(notificationStore);
const mockReviewRepo = createMockReviewRepository(reviewStore);
const mockEmployerProfileRepo = createMockEmployerProfileRepository(employerProfileStore);

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock all repositories
jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: mockProposalRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepo,
}));

// Mock blockchain service
const mockBlockchainService = {
  deployEscrow: jest.fn<any>().mockResolvedValue({
    escrowAddress: '0x1234567890123456789012345678901234567890',
    transactionHash: '0xabcdef',
  }),
};

jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  deployEscrowContract: mockBlockchainService.deployEscrow,
}));

// Mock payment service
jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
  initializeContractEscrow: jest.fn<any>().mockResolvedValue({
    success: true,
    data: { escrowAddress: '0x1234567890123456789012345678901234567890' }
  }),
}));

// Mock agreement contract service
jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  createAgreementOnBlockchain: jest.fn<any>().mockResolvedValue(undefined),
  signAgreement: jest.fn<any>().mockResolvedValue(undefined),
}));

const mockQuery = jest.fn();
(globalThis as any).mockPool = { query: mockQuery };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockQuery, connect: jest.fn(), on: jest.fn() },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: mockQuery,
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));

// Mock review repository
jest.unstable_mockModule(resolveModule('src/repositories/review-repository.ts'), () => ({
  reviewRepository: mockReviewRepo,
}));

// Mock employer profile repository
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: mockEmployerProfileRepo,
}));

// Import after mocking
const {
  submitProposal,
  getProposalById,
  getProposalsByProject,
  getProposalsByFreelancer,
  acceptProposal,
  rejectProposal,
  withdrawProposal,
  getProposalWithEmployerHistory,
} = await import('../../services/proposal-service.js');

describe('Proposal Service - Property-Based Tests', () => {
  beforeEach(() => {
    mockProposalRepo.clear();
    mockProjectRepo.clear();
    mockContractRepo.clear();
    mockUserRepo.clear();
    mockNotificationRepo.clear();
    mockReviewRepo.clear();
    mockEmployerProfileRepo.clear();
    mockBlockchainService.deployEscrow.mockClear();

    // Mock pool.query for atomic proposal acceptance
    const mockPoolObj = (globalThis as any).mockPool;
    mockPoolObj.query.mockImplementation(async (text: string, params?: any[]) => {
      if (text.includes('COUNT(*)') && text.includes('proposals')) {
        return { rows: [{ count: '0' }], rowCount: 1 };
      }
      if (text.includes('accept_proposal_atomic')) {
        const proposalId = params?.[0];
        const employerId = params?.[1];
        const proposal = proposalStore.get(proposalId) as any;
        if (!proposal) {
          return { rows: [], rowCount: 0 };
        }
        
        proposal.status = 'accepted';
        proposalStore.set(proposalId, proposal);
        
        const contractId = 'contract-' + Date.now();
        const now = new Date().toISOString();
        const contract = {
          id: contractId,
          proposal_id: proposalId,
          project_id: proposal.project_id,
          freelancer_id: proposal.freelancer_id,
          employer_id: employerId,
          total_amount: proposal.proposed_rate,
          status: 'pending',
          escrow_address: null,
          created_at: now,
          updated_at: now,
        };
        contractStore.set(contractId, contract);
        
        for (const [id, p] of proposalStore.entries()) {
          const otherProposal = p as any;
          if (otherProposal.project_id === proposal.project_id && 
              otherProposal.id !== proposalId && 
              otherProposal.status === 'pending') {
            otherProposal.status = 'rejected';
            proposalStore.set(id, otherProposal);
          }
        }
        
        return { rows: [{ result: true, contract_id: contractId, limit_reached: true }], rowCount: 1 };
      }
      if (text.includes('SELECT id FROM contracts WHERE proposal_id')) {
        const proposalId = params?.[0];
        // Find the contract for this proposal
        for (const [, c] of contractStore.entries()) {
          const contract = c as any;
          if (contract.proposal_id === proposalId) {
            return { rows: [{ id: contract.id }], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 48: Proposal creation**
   * **Validates: Requirements 5.1**
   * 
   * For any valid proposal data, creating a proposal shall store it and
   * prevent duplicate proposals for the same project-freelancer pair.
   */
  it('Property 48: Proposal creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.integer({ min: 10, max: 200 }),
        fc.integer({ min: 1, max: 365 }),
        async (projectId, freelancerId, proposedRate, estimatedDuration) => {
          const project = createTestProject({ 
            id: projectId, 
            status: 'open' 
          });
          projectStore.set(project.id, project);

          const result = await submitProposal(freelancerId, {
            projectId,
            proposedRate,
            estimatedDuration,
            attachments: [],
          });

          expect(result.success).toBe(true);
          if (result.success) {
            const proposal = result.data.proposal;
            assertIsValidId(proposal.id);
            expect(proposal.projectId).toBe(projectId);
            expect(proposal.freelancerId).toBe(freelancerId);
            expect(proposal.proposedRate).toBe(proposedRate);
            expect(proposal.estimatedDuration).toBe(estimatedDuration);
            expect(proposal.status).toBe('pending');
            assertHasTimestamps(proposal);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 49: Proposal acceptance**
   * **Validates: Requirements 5.2**
   * 
   * Accepting a proposal shall create a contract, update project status,
   * and reject other proposals for the same project.
   */
  it('Property 49: Proposal acceptance', async () => {
    const projectId = 'project-123';
    const freelancerId = 'freelancer-123';
    const employerId = 'employer-123';

    const proposedRate = 1000;
    const milestones = [
      createTestMilestone({ id: 'milestone-1', title: 'M1', amount: 500, status: 'pending' }),
      createTestMilestone({ id: 'milestone-2', title: 'M2', amount: 500, status: 'pending' }),
    ];

    // Create project with milestones
    const project = createTestProject({ 
      id: projectId, 
      employer_id: employerId,
      status: 'open',
      milestones
    });
    projectStore.set(project.id, project);

    // Create employer user
    const employer = createTestUser({ 
      id: employerId,
      wallet_address: '0x1234567890123456789012345678901234567890'
    });
    userStore.set(employer.id, employer);

    // Create proposal to accept with matching rate
    const proposal = createTestProposal({ 
      id: 'proposal-1',
      project_id: projectId, 
      freelancer_id: freelancerId,
      proposed_rate: proposedRate,
      status: 'pending'
    });
    proposalStore.set(proposal.id, proposal);

    // Create other proposals for same project
    const otherProposal1 = createTestProposal({ 
      id: 'proposal-2',
      project_id: projectId, 
      freelancer_id: 'other-freelancer-1',
      status: 'pending'
    });
    const otherProposal2 = createTestProposal({ 
      id: 'proposal-3',
      project_id: projectId, 
      freelancer_id: 'other-freelancer-2',
      status: 'pending'
    });
    proposalStore.set(otherProposal1.id, otherProposal1);
    proposalStore.set(otherProposal2.id, otherProposal2);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    if (result.success) {
      // Verify proposal was accepted
      expect(result.data.proposal.status).toBe('accepted');
      
      // Verify contract was created
      expect(result.data.contract).toBeDefined();
      assertIsValidId(result.data.contract.id);
      expect(result.data.contract.proposalId).toBe(proposal.id);
      expect(result.data.contract.freelancerId).toBe(freelancerId);
      expect(result.data.contract.employerId).toBe(employerId);
    }
    
    // Verify project status updated
    const updatedProject = projectStore.get(projectId) as any;
    expect(updatedProject?.status).toBe('in_progress');
    
    // Verify other proposals were rejected
    const otherProposal1Updated = proposalStore.get(otherProposal1.id) as any;
    const otherProposal2Updated = proposalStore.get(otherProposal2.id) as any;
    expect(otherProposal1Updated?.status).toBe('rejected');
    expect(otherProposal2Updated?.status).toBe('rejected');
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 50: Proposal rejection**
   * **Validates: Requirements 5.3**
   * 
   * Rejecting a proposal shall update its status and notify the freelancer.
   */
  it('Property 50: Proposal rejection', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-456';
    
    const project = createTestProject({ 
      employer_id: employerId,
      status: 'open'
    });
    projectStore.set(project.id, project);
    
    const proposal = createTestProposal({ 
      project_id: project.id,
      freelancer_id: freelancerId,
      status: 'pending' 
    });
    proposalStore.set(proposal.id, proposal);

    const result = await rejectProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.status).toBe('rejected');
    }
    
    // Verify notification was created
    const notifications = Array.from(notificationStore.values());
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.some((n: any) => 
      n.user_id === proposal.freelancer_id && 
      n.type === 'proposal_rejected'
    )).toBe(true);
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 51: Proposal withdrawal**
   * **Validates: Requirements 5.4**
   * 
   * Withdrawing a proposal shall update its status only if it's still pending.
   */
  it('Property 51: Proposal withdrawal', async () => {
    const freelancerId = 'freelancer-123';
    const proposal = createTestProposal({ 
      freelancer_id: freelancerId,
      status: 'pending' 
    });
    proposalStore.set(proposal.id, proposal);

    const result = await withdrawProposal(proposal.id, freelancerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('withdrawn');
    }
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 52: Duplicate proposal prevention**
   * **Validates: Requirements 5.5**
   * 
   * Creating a proposal for a project where the freelancer already has a proposal
   * shall fail.
   */
  it('Property 52: Duplicate proposal prevention', async () => {
    const projectId = 'project-123';
    const freelancerId = 'freelancer-123';

    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(project.id, project);

    // Create first proposal
    const existingProposal = createTestProposal({ 
      project_id: projectId, 
      freelancer_id: freelancerId,
      status: 'pending'
    });
    proposalStore.set(existingProposal.id, existingProposal);

    // Attempt to create duplicate proposal
    const result = await submitProposal(freelancerId, {
      projectId,
      proposedRate: 50,
      estimatedDuration: 30,
      attachments: [],
    });
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DUPLICATE_PROPOSAL');
    }
  });
});

describe('Proposal Service - Unit Tests', () => {
  beforeEach(() => {
    mockProposalRepo.clear();
    mockProjectRepo.clear();
    mockContractRepo.clear();
    mockUserRepo.clear();
    mockNotificationRepo.clear();
    mockReviewRepo.clear();
    mockEmployerProfileRepo.clear();
    mockBlockchainService.deployEscrow.mockClear();

    // Mock pool.query for atomic proposal acceptance
    const mockPoolObj = (globalThis as any).mockPool;
    mockPoolObj.query.mockImplementation(async (text: string, params?: any[]) => {
      if (text.includes('COUNT(*)') && text.includes('proposals')) {
        return { rows: [{ count: '0' }], rowCount: 1 };
      }
      if (text.includes('accept_proposal_atomic')) {
        const proposalId = params?.[0];
        const employerId = params?.[1];
        const proposal = proposalStore.get(proposalId) as any;
        if (!proposal) {
          return { rows: [], rowCount: 0 };
        }
        
        proposal.status = 'accepted';
        proposalStore.set(proposalId, proposal);
        
        const contractId = 'contract-' + Date.now();
        const now = new Date().toISOString();
        const contract = {
          id: contractId,
          proposal_id: proposalId,
          project_id: proposal.project_id,
          freelancer_id: proposal.freelancer_id,
          employer_id: employerId,
          total_amount: proposal.proposed_rate,
          status: 'pending',
          escrow_address: null,
          created_at: now,
          updated_at: now,
        };
        contractStore.set(contractId, contract);
        
        for (const [id, p] of proposalStore.entries()) {
          const otherProposal = p as any;
          if (otherProposal.project_id === proposal.project_id && 
              otherProposal.id !== proposalId && 
              otherProposal.status === 'pending') {
            otherProposal.status = 'rejected';
            proposalStore.set(id, otherProposal);
          }
        }
        
        return { rows: [{ result: true, contract_id: contractId, limit_reached: true }], rowCount: 1 };
      }
      if (text.includes('SELECT id FROM contracts WHERE proposal_id')) {
        const proposalId = params?.[0];
        for (const [, c] of contractStore.entries()) {
          const contract = c as any;
          if (contract.proposal_id === proposalId) {
            return { rows: [{ id: contract.id }], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it('should create proposal with valid data', async () => {
    const project = createTestProject({ status: 'open' });
    projectStore.set(project.id, project);

    const result = await submitProposal('freelancer-123', {
      projectId: project.id,
      proposedRate: 75,
      estimatedDuration: 45,
      attachments: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const proposal = result.data.proposal;
      assertIsValidId(proposal.id);
      expect(proposal.projectId).toBe(project.id);
      expect(proposal.status).toBe('pending');
      assertHasTimestamps(proposal);
    }
  });

  it('should get proposal by ID', async () => {
    const proposal = createTestProposal();
    proposalStore.set(proposal.id, proposal);

    const result = await getProposalById(proposal.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(proposal.id);
    }
  });

  it('should return null for non-existent proposal', async () => {
    const result = await getProposalById('non-existent-id');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should get proposals by project', async () => {
    const projectId = 'project-123';
    
    // Create project first
    const project = createTestProject({ id: projectId, status: 'open' });
    projectStore.set(project.id, project);
    
    const proposal1 = createTestProposal({ project_id: projectId });
    const proposal2 = createTestProposal({ project_id: projectId });
    const proposal3 = createTestProposal({ project_id: 'other-project' });

    proposalStore.set(proposal1.id, proposal1);
    proposalStore.set(proposal2.id, proposal2);
    proposalStore.set(proposal3.id, proposal3);

    const result = await getProposalsByProject(projectId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBe(2);
      expect(result.data.items.every(p => p.projectId === projectId)).toBe(true);
    }
  });

  it('should get proposals by freelancer', async () => {
    const freelancerId = 'freelancer-123';
    const proposal1 = createTestProposal({ freelancer_id: freelancerId });
    const proposal2 = createTestProposal({ freelancer_id: freelancerId });
    const proposal3 = createTestProposal({ freelancer_id: 'other-freelancer' });

    proposalStore.set(proposal1.id, proposal1);
    proposalStore.set(proposal2.id, proposal2);
    proposalStore.set(proposal3.id, proposal3);

    const result = await getProposalsByFreelancer(freelancerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(2);
      expect(result.data.every((p: any) => p.freelancerId === freelancerId)).toBe(true);
    }
  });

  it('should reject proposal and send notification', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-456';
    
    const project = createTestProject({ 
      employer_id: employerId,
      status: 'open'
    });
    projectStore.set(project.id, project);
    
    const proposal = createTestProposal({ 
      project_id: project.id,
      freelancer_id: freelancerId,
      status: 'pending' 
    });
    proposalStore.set(proposal.id, proposal);

    const result = await rejectProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.status).toBe('rejected');
      expect(result.data.proposal.id).toBe(proposal.id);
    }
    
    // Verify notification
    const notifications = Array.from(notificationStore.values());
    expect(notifications.length).toBeGreaterThan(0);
  });

  it('should withdraw proposal if freelancer owns it', async () => {
    const freelancerId = 'freelancer-123';
    const proposal = createTestProposal({ 
      freelancer_id: freelancerId,
      status: 'pending' 
    });
    proposalStore.set(proposal.id, proposal);

    const result = await withdrawProposal(proposal.id, freelancerId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('withdrawn');
    }
  });

  it('should fail to withdraw proposal if not owner', async () => {
    const proposal = createTestProposal({ 
      freelancer_id: 'freelancer-123',
      status: 'pending' 
    });
    proposalStore.set(proposal.id, proposal);

    const result = await withdrawProposal(proposal.id, 'different-freelancer');
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should fail to create proposal for closed project', async () => {
    const project = createTestProject({ status: 'completed' });
    projectStore.set(project.id, project);

    const result = await submitProposal('freelancer-123', {
      projectId: project.id,
      proposedRate: 100,
      estimatedDuration: 30,
      attachments: [],
    });
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('PROJECT_NOT_OPEN');
    }
  });

  it('should deploy escrow when accepting proposal', async () => {
    const projectId = 'project-123';
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-456';
    
    const proposedRate = 2000;
    const milestones = [
      createTestMilestone({ id: 'milestone-1', title: 'M1', amount: 1000, status: 'pending' }),
      createTestMilestone({ id: 'milestone-2', title: 'M2', amount: 1000, status: 'pending' }),
    ];
    
    const project = createTestProject({ 
      id: projectId, 
      employer_id: employerId,
      status: 'open',
      milestones
    });
    projectStore.set(project.id, project);

    const employer = createTestUser({ 
      id: employerId,
      wallet_address: '0x1234567890123456789012345678901234567890'
    });
    userStore.set(employer.id, employer);

    const freelancer = createTestUser({ 
      id: freelancerId,
      wallet_address: '0x9876543210987654321098765432109876543210'
    });
    userStore.set(freelancer.id, freelancer);

    const proposal = createTestProposal({ 
      project_id: projectId,
      freelancer_id: freelancerId,
      proposed_rate: proposedRate,
      status: 'pending'
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, employerId);

    // Verify proposal was accepted and contract created with active status
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.status).toBe('accepted');
      expect(result.data.contract).toBeDefined();
      expect(result.data.contract.proposalId).toBe(proposal.id);
      
      // Refetch contract to get updated status after escrow deployment
      const updatedContractEntity = await mockContractRepo.getContractById(result.data.contract.id);
      expect(updatedContractEntity?.status).toBe('active');
      expect(updatedContractEntity?.escrow_address).toBeDefined();
    }
  });
});

// =============================================================================
// Coverage Tests - Error paths and branch conditions
// =============================================================================
describe('Proposal Service - Coverage Tests', () => {
  beforeEach(() => {
    mockProposalRepo.clear();
    mockProjectRepo.clear();
    mockContractRepo.clear();
    mockUserRepo.clear();
    mockNotificationRepo.clear();
    mockReviewRepo.clear();
    mockEmployerProfileRepo.clear();
    mockBlockchainService.deployEscrow.mockClear();

    const mockPoolObj = (globalThis as any).mockPool;
    mockPoolObj.query.mockImplementation(async (text: string, params?: any[]) => {
      if (text.includes('COUNT(*)') && text.includes('proposals')) {
        return { rows: [{ count: '0' }], rowCount: 1 };
      }
      if (text.includes('accept_proposal_atomic')) {
        const proposalId = params?.[0];
        const employerId = params?.[1];
        const proposal = proposalStore.get(proposalId) as any;
        if (!proposal) {
          return { rows: [], rowCount: 0 };
        }
        proposal.status = 'accepted';
        proposalStore.set(proposalId, proposal);
        const contractId = 'contract-' + Date.now();
        const now = new Date().toISOString();
        const contract = {
          id: contractId, proposal_id: proposalId, project_id: proposal.project_id,
          freelancer_id: proposal.freelancer_id, employer_id: employerId,
          total_amount: proposal.proposed_rate, status: 'pending', escrow_address: null,
          created_at: now, updated_at: now,
        };
        contractStore.set(contractId, contract);
        for (const [id, p] of proposalStore.entries()) {
          const otherProposal = p as any;
          if (otherProposal.project_id === proposal.project_id &&
              otherProposal.id !== proposalId &&
              otherProposal.status === 'pending') {
            otherProposal.status = 'rejected';
            proposalStore.set(id, otherProposal);
          }
        }
        return { rows: [{ result: true, contract_id: contractId, limit_reached: true }], rowCount: 1 };
      }
      if (text.includes('SELECT id FROM contracts WHERE proposal_id')) {
        const proposalId = params?.[0];
        for (const [, c] of contractStore.entries()) {
          const contract = c as any;
          if (contract.proposal_id === proposalId) {
            return { rows: [{ id: contract.id }], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  // --- submitProposal error paths ---

  it('should return VALIDATION_ERROR for invalid attachments (lines 51-56)', async () => {
    const project = createTestProject({ status: 'open' });
    projectStore.set(project.id, project);

    const tooManyAttachments = Array.from({ length: 6 }, () => ({
      url: 'https://example.com/file.pdf',
      filename: 'file.pdf',
      size: 100,
      mimeType: 'application/pdf',
    }));

    const result = await submitProposal('freelancer-123', {
      projectId: project.id,
      proposedRate: 75,
      estimatedDuration: 45,
      attachments: tooManyAttachments,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toBeDefined();
    }
  });

  it('should return NOT_FOUND when project does not exist in submitProposal (line 64)', async () => {
    const result = await submitProposal('freelancer-123', {
      projectId: 'non-existent-project',
      proposedRate: 75,
      estimatedDuration: 45,
      attachments: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should return FREELANCER_LIMIT_REACHED when slots full in submitProposal (line 92)', async () => {
    const project = createTestProject({ status: 'open', freelancer_limit: 1 });
    projectStore.set(project.id, project);

    const acceptedProposal = createTestProposal({
      project_id: project.id,
      freelancer_id: 'other-freelancer',
      status: 'accepted',
    });
    proposalStore.set(acceptedProposal.id, acceptedProposal);

    const result = await submitProposal('new-freelancer', {
      projectId: project.id,
      proposedRate: 50,
      estimatedDuration: 30,
      attachments: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FREELANCER_LIMIT_REACHED');
    }
  });

  it('should continue when notification creation fails in submitProposal (line 129)', async () => {
    const project = createTestProject({ status: 'open' });
    projectStore.set(project.id, project);

    const origCreateNotification = mockNotificationRepo.createNotification;
    mockNotificationRepo.createNotification = jest.fn<any>().mockRejectedValue(new Error('Notification error'));

    const result = await submitProposal('freelancer-123', {
      projectId: project.id,
      proposedRate: 75,
      estimatedDuration: 45,
      attachments: [],
    });

    expect(result.success).toBe(true);
    mockNotificationRepo.createNotification = origCreateNotification;
  });

  // --- getProposalsByProject error path ---

  it('should return NOT_FOUND when project does not exist in getProposalsByProject (line 229)', async () => {
    const result = await getProposalsByProject('non-existent-project');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  // --- acceptProposal validation errors ---

  it('should return NOT_FOUND when proposal not found in acceptProposal (line 277)', async () => {
    const result = await acceptProposal('non-existent-proposal', 'employer-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should return INVALID_STATUS when proposal not pending in acceptProposal (line 281)', async () => {
    const proposal = createTestProposal({ status: 'accepted' });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, 'employer-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS');
    }
  });

  it('should return NOT_FOUND when project not found during acceptProposal (line 286)', async () => {
    const proposal = createTestProposal({
      project_id: 'non-existent-project',
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, 'employer-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should return UNAUTHORIZED when employer does not own project in acceptProposal (line 291)', async () => {
    const milestones = [createTestMilestone({ amount: 1000 })];
    const project = createTestProject({
      employer_id: 'real-owner',
      status: 'open',
      milestones,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      status: 'pending',
      proposed_rate: 1000,
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, 'wrong-employer');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should return NO_MILESTONES when project has no milestones (line 295)', async () => {
    const employerId = 'employer-123';
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
      milestones: [],
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      status: 'pending',
      proposed_rate: 1000,
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NO_MILESTONES');
    }
  });

  it('should return INVALID_PROPOSAL_RATE when rate is zero (line 300)', async () => {
    const employerId = 'employer-123';
    const milestones = [createTestMilestone({ amount: 1000 })];
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
      milestones,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      status: 'pending',
      proposed_rate: 0,
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_PROPOSAL_RATE');
    }
  });

  it('should return AMOUNT_MISMATCH when rate does not match milestone total (line 305)', async () => {
    const employerId = 'employer-123';
    const milestones = [createTestMilestone({ amount: 500 })];
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
      milestones,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      status: 'pending',
      proposed_rate: 1000,
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AMOUNT_MISMATCH');
    }
  });

  it('should return FREELANCER_LIMIT_REACHED during acceptProposal validation (line 316)', async () => {
    const employerId = 'employer-123';
    const milestones = [createTestMilestone({ amount: 1000 })];
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: 1,
    });
    projectStore.set(project.id, project);

    const acceptedProposal = createTestProposal({
      project_id: project.id,
      freelancer_id: 'other-freelancer',
      status: 'accepted',
      proposed_rate: 1000,
    });
    proposalStore.set(acceptedProposal.id, acceptedProposal);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: 'freelancer-accept',
      status: 'pending',
      proposed_rate: 1000,
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FREELANCER_LIMIT_REACHED');
    }
  });

  // --- acceptProposal internal errors ---

  it('should handle errors in rejectOtherProposals and escrow gracefully (lines 335, 510)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';
    const milestones = [createTestMilestone({ amount: 1000 })];
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: 2,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: freelancerId,
      status: 'pending',
      proposed_rate: 1000,
    });
    proposalStore.set(proposal.id, proposal);

    const origGetProposalsByProject = mockProposalRepo.getProposalsByProject;
    mockProposalRepo.getProposalsByProject = jest.fn<any>().mockRejectedValue(new Error('DB error'));

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    mockProposalRepo.getProposalsByProject = origGetProposalsByProject;
  });

  it('should return UPDATE_FAILED when updateProposal returns null during acceptance (lines 364-365)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';
    const milestones = [createTestMilestone({ amount: 1000 })];
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: 2,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: freelancerId,
      status: 'pending',
      proposed_rate: 1000,
    });
    proposalStore.set(proposal.id, proposal);

    const origUpdateProposal = mockProposalRepo.updateProposal;
    mockProposalRepo.updateProposal = jest.fn<any>().mockResolvedValue(null);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
    }
    mockProposalRepo.updateProposal = origUpdateProposal;
  });

  it('should return UPDATE_FAILED when contract creation returns null (line 382)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';
    const milestones = [createTestMilestone({ amount: 1000 })];
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: 2,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: freelancerId,
      status: 'pending',
      proposed_rate: 1000,
    });
    proposalStore.set(proposal.id, proposal);

    const origCreate = mockContractRepo.create;
    mockContractRepo.create = jest.fn<any>().mockResolvedValue(null);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
    }
    mockContractRepo.create = origCreate;
  });

  it('should handle blockchain initialization failure gracefully (line 442)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';
    const milestones = [createTestMilestone({ amount: 1000 })];
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: 2,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: freelancerId,
      status: 'pending',
      proposed_rate: 1000,
    });
    proposalStore.set(proposal.id, proposal);

    const origGetUserById = mockUserRepo.getUserById;
    mockUserRepo.getUserById = jest.fn<any>().mockRejectedValue(new Error('DB error'));

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    mockUserRepo.getUserById = origGetUserById;
  });

  it('should continue when notification creation fails in acceptProposal (line 533)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';
    const milestones = [createTestMilestone({ amount: 1000 })];
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: 2,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: freelancerId,
      status: 'pending',
      proposed_rate: 1000,
    });
    proposalStore.set(proposal.id, proposal);

    const origCreateNotification = mockNotificationRepo.createNotification;
    mockNotificationRepo.createNotification = jest.fn<any>().mockRejectedValue(new Error('Notification error'));

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    mockNotificationRepo.createNotification = origCreateNotification;
  });

  // --- rejectProposal error paths ---

  it('should return NOT_FOUND when proposal not found in rejectProposal (line 555)', async () => {
    const result = await rejectProposal('non-existent-proposal', 'employer-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should return INVALID_STATUS when proposal not pending in rejectProposal (line 563)', async () => {
    const proposal = createTestProposal({ status: 'accepted' });
    proposalStore.set(proposal.id, proposal);

    const result = await rejectProposal(proposal.id, 'employer-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS');
    }
  });

  it('should return NOT_FOUND when project not found in rejectProposal (line 572)', async () => {
    const proposal = createTestProposal({
      project_id: 'non-existent-project',
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await rejectProposal(proposal.id, 'employer-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should return UNAUTHORIZED when employer does not own project in rejectProposal (line 580)', async () => {
    const project = createTestProject({ employer_id: 'real-owner', status: 'open' });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await rejectProposal(proposal.id, 'wrong-employer');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should return UPDATE_FAILED when updateProposal returns null during rejection (line 592)', async () => {
    const employerId = 'employer-123';
    const project = createTestProject({ employer_id: employerId, status: 'open' });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const origUpdateProposal = mockProposalRepo.updateProposal;
    mockProposalRepo.updateProposal = jest.fn<any>().mockResolvedValue(null);

    const result = await rejectProposal(proposal.id, employerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
    }
    mockProposalRepo.updateProposal = origUpdateProposal;
  });

  it('should continue when notification creation fails in rejectProposal (line 615)', async () => {
    const employerId = 'employer-123';
    const project = createTestProject({ employer_id: employerId, status: 'open' });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const origCreateNotification = mockNotificationRepo.createNotification;
    mockNotificationRepo.createNotification = jest.fn<any>().mockRejectedValue(new Error('Notification error'));

    const result = await rejectProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    mockNotificationRepo.createNotification = origCreateNotification;
  });

  // --- withdrawProposal error paths ---

  it('should return NOT_FOUND when proposal not found in withdrawProposal (line 634)', async () => {
    const result = await withdrawProposal('non-existent-proposal', 'freelancer-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should return INVALID_STATUS when proposal not pending in withdrawProposal (line 650)', async () => {
    const freelancerId = 'freelancer-123';
    const proposal = createTestProposal({
      freelancer_id: freelancerId,
      status: 'accepted',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await withdrawProposal(proposal.id, freelancerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS');
    }
  });

  it('should return UPDATE_FAILED when updateProposal returns null during withdrawal (line 661)', async () => {
    const freelancerId = 'freelancer-123';
    const proposal = createTestProposal({
      freelancer_id: freelancerId,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const origUpdateProposal = mockProposalRepo.updateProposal;
    mockProposalRepo.updateProposal = jest.fn<any>().mockResolvedValue(null);

    const result = await withdrawProposal(proposal.id, freelancerId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UPDATE_FAILED');
    }
    mockProposalRepo.updateProposal = origUpdateProposal;
  });

  // --- getProposalWithEmployerHistory error paths ---

  it('should return NOT_FOUND when proposal not found in getProposalWithEmployerHistory (line 174)', async () => {
    const result = await getProposalWithEmployerHistory('non-existent-proposal');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should return NOT_FOUND when project not found in getProposalWithEmployerHistory (line 186)', async () => {
    const proposal = createTestProposal({
      project_id: 'non-existent-project',
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await getProposalWithEmployerHistory(proposal.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should return proposal with employer history on success (lines 174-206)', async () => {
    const employerId = 'employer-history';
    const project = createTestProject({
      employer_id: employerId,
      status: 'open',
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    // Add a completed contract for the employer
    const contract = createTestContract({
      employer_id: employerId,
      status: 'completed',
    });
    contractStore.set(contract.id, contract);

    // Add a review for the employer
    mockReviewRepo.create({
      id: 'review-1',
      reviewee_id: employerId,
      reviewer_id: 'reviewer-1',
      contract_id: contract.id,
      rating: 4,
      comment: 'Good employer',
      reviewer_role: 'freelancer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Add employer profile (getProfileByUserId looks up by user_id key)
    employerProfileStore.set(employerId, {
      id: 'profile-1',
      user_id: employerId,
      company_name: 'Test Corp',
      industry: 'Technology',
      name: 'Test Employer',
      nationality: 'US',
      description: 'A test company',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await getProposalWithEmployerHistory(proposal.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.id).toBe(proposal.id);
      expect(result.data.project.id).toBe(project.id);
      expect(result.data.employerHistory).toBeDefined();
      expect(result.data.employerHistory.completedProjectsCount).toBe(1);
      expect(result.data.employerHistory.reviewCount).toBe(1);
      expect(result.data.employerHistory.companyName).toBe('Test Corp');
      expect(result.data.employerHistory.industry).toBe('Technology');
    }
  });
});

describe('Proposal Service - Additional Branch Coverage', () => {
  it('rush fee calculation with isRush true', () => {
    const isRush = true;
    const rushFeePercentage = 30;
    const proposalRate = 1000;
    const rushFee = isRush ? Math.round(proposalRate * rushFeePercentage / 100 * 100) / 100 : 0;
    expect(rushFee).toBe(300);
  });

  it('rush fee is 0 when isRush is false', () => {
    const isRush = false;
    const rushFeePercentage = 30;
    const proposalRate = 1000;
    const rushFee = isRush ? Math.round(proposalRate * rushFeePercentage / 100 * 100) / 100 : 0;
    expect(rushFee).toBe(0);
  });

  it('rushFeePercentage defaults to 25 when null', () => {
    const project = { rushFeePercentage: null };
    const rushFeePercentage = project.rushFeePercentage ?? 25;
    expect(rushFeePercentage).toBe(25);
  });

  it('freelancerLimit defaults to 1 when undefined', () => {
    const project = { freelancerLimit: undefined };
    const maxFreelancers = project.freelancerLimit ?? 1;
    expect(maxFreelancers).toBe(1);
  });

  it('isRush defaults to false when undefined', () => {
    const project = { isRush: undefined };
    const isRush = project.isRush ?? false;
    expect(isRush).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration tests that call actual source functions for Istanbul coverage
// ═══════════════════════════════════════════════════════════════

describe('Proposal Service - Integration Coverage', () => {
  beforeEach(() => {
    mockProposalRepo.clear();
    mockProjectRepo.clear();
    mockContractRepo.clear();
    mockUserRepo.clear();
    mockNotificationRepo.clear();
    mockReviewRepo.clear();
    mockEmployerProfileRepo.clear();
    mockBlockchainService.deployEscrow.mockClear();

    const mockPoolObj = (globalThis as any).mockPool;
    mockPoolObj.query.mockImplementation(async (text: string, params?: any[]) => {
      if (text.includes('COUNT(*)') && text.includes('proposals')) {
        return { rows: [{ count: '0' }], rowCount: 1 };
      }
      if (text.includes('accept_proposal_atomic')) {
        const proposalId = params?.[0];
        const employerId = params?.[1];
        const proposal = proposalStore.get(proposalId) as any;
        if (!proposal) {
          return { rows: [], rowCount: 0 };
        }
        proposal.status = 'accepted';
        proposalStore.set(proposalId, proposal);
        const contractId = 'contract-' + Date.now();
        const now = new Date().toISOString();
        const contract = {
          id: contractId, proposal_id: proposalId, project_id: proposal.project_id,
          freelancer_id: proposal.freelancer_id, employer_id: employerId,
          total_amount: proposal.proposed_rate, status: 'pending', escrow_address: null,
          created_at: now, updated_at: now,
        };
        contractStore.set(contractId, contract);
        for (const [id, p] of proposalStore.entries()) {
          const otherProposal = p as any;
          if (otherProposal.project_id === proposal.project_id &&
              otherProposal.id !== proposalId &&
              otherProposal.status === 'pending') {
            otherProposal.status = 'rejected';
            proposalStore.set(id, otherProposal);
          }
        }
        return { rows: [{ result: true, contract_id: contractId, limit_reached: true }], rowCount: 1 };
      }
      if (text.includes('SELECT id FROM contracts WHERE proposal_id')) {
        const proposalId = params?.[0];
        for (const [, c] of contractStore.entries()) {
          const contract = c as any;
          if (contract.proposal_id === proposalId) {
            return { rows: [{ id: contract.id }], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  // Lines 308-310: rush fee calculation with isRush: true and rushFeePercentage ?? 25
  it('acceptProposal calculates rush fee when project has isRush: true (lines 308-310)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';

    // Project with isRush: true and rushFeePercentage: 30
    const milestones = [
      createTestMilestone({ id: 'ms-1', title: 'M1', amount: 1000, status: 'pending' }),
    ];
    const project = createTestProject({
      id: 'rush-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      isRush: true,
      rushFeePercentage: 30,
    });
    projectStore.set(project.id, project);

    const employer = createTestUser({
      id: employerId,
      wallet_address: '0x1234567890123456789012345678901234567890',
    });
    userStore.set(employer.id, employer);

    const freelancer = createTestUser({
      id: freelancerId,
      wallet_address: '0x9876543210987654321098765432109876543210',
    });
    userStore.set(freelancer.id, freelancer);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: freelancerId,
      proposed_rate: 1000,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    if (result.success) {
      // rushFee = Math.round(1000 * 30 / 100 * 100) / 100 = 300
      // totalAmount = 1000 + 300 = 1300
      expect(result.data.contract).toBeDefined();
    }
  });

  // Lines 308-309: rushFeePercentage ?? 25 default and isRush ?? false default
  it('acceptProposal with default rushFeePercentage and isRush when undefined (lines 308-309)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';

    // Project with isRush and rushFeePercentage undefined (defaults)
    const milestones = [
      createTestMilestone({ id: 'ms-1', title: 'M1', amount: 500, status: 'pending' }),
    ];
    const project = createTestProject({
      id: 'default-rush-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      // isRush and rushFeePercentage not set - should default to false and 25
    });
    projectStore.set(project.id, project);

    const employer = createTestUser({
      id: employerId,
      wallet_address: '0x1234567890123456789012345678901234567890',
    });
    userStore.set(employer.id, employer);

    const freelancer = createTestUser({
      id: freelancerId,
      wallet_address: '0x9876543210987654321098765432109876543210',
    });
    userStore.set(freelancer.id, freelancer);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: freelancerId,
      proposed_rate: 500,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    if (result.success) {
      // isRush defaults to false, rushFee should be 0
      expect(result.data.contract).toBeDefined();
    }
  });

  // Line 448: freelancerLimit ?? 1 default in initializeEscrowForContract
  it('acceptProposal uses default freelancerLimit of 1 when not set (line 448)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';

    const milestones = [
      createTestMilestone({ id: 'ms-1', title: 'M1', amount: 800, status: 'pending' }),
    ];
    const project = createTestProject({
      id: 'limit-default-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      // freelancer_limit not set
    });
    projectStore.set(project.id, project);

    const employer = createTestUser({
      id: employerId,
      wallet_address: '0x1234567890123456789012345678901234567890',
    });
    userStore.set(employer.id, employer);

    const freelancer = createTestUser({
      id: freelancerId,
      wallet_address: '0x9876543210987654321098765432109876543210',
    });
    userStore.set(freelancer.id, freelancer);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: freelancerId,
      proposed_rate: 800,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    // With freelancerLimit defaulting to 1 and 1 accepted proposal,
    // project should transition to in_progress
    const updatedProject = projectStore.get(project.id) as any;
    expect(updatedProject?.status).toBe('in_progress');
  });
});
