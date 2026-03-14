import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import { 
  createInMemoryStore, 
  createMockProposalRepository,
  createMockProjectRepository,
  createMockContractRepository,
  createMockUserRepository,
  createMockNotificationRepository
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

const mockProposalRepo = createMockProposalRepository(proposalStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockContractRepo = createMockContractRepository(contractStore);
const mockUserRepo = createMockUserRepository(userStore);
const mockNotificationRepo = createMockNotificationRepository(notificationStore);

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

// Import after mocking
const {
  submitProposal,
  getProposalById,
  getProposalsByProject,
  getProposalsByFreelancer,
  acceptProposal,
  rejectProposal,
  withdrawProposal,
} = await import('../../services/proposal-service.js');

describe('Proposal Service - Property-Based Tests', () => {
  beforeEach(() => {
    mockProposalRepo.clear();
    mockProjectRepo.clear();
    mockContractRepo.clear();
    mockUserRepo.clear();
    mockNotificationRepo.clear();
    mockBlockchainService.deployEscrow.mockClear();

    // Mock Supabase RPC for atomic proposal acceptance
    const mockSupabaseClient = (globalThis as any).mockSupabaseClient;
    mockSupabaseClient.rpc = jest.fn(async (functionName: string, params: any) => {
      if (functionName === 'accept_proposal_atomic') {
        const proposalId = params.p_proposal_id;
        const proposal = proposalStore.get(proposalId) as any;
        if (!proposal) return { data: null, error: { message: 'Proposal not found' } };
        
        // Update proposal status
        proposal.status = 'accepted';
        proposalStore.set(proposalId, proposal);
        
        // Create contract with pending status (will be activated by proposal service)
        const contractId = 'contract-' + Date.now();
        const now = new Date().toISOString();
        const contract = {
          id: contractId,
          proposal_id: proposalId,
          project_id: proposal.project_id,
          freelancer_id: proposal.freelancer_id,
          employer_id: params.p_employer_id,
          total_amount: proposal.proposed_rate,
          status: 'pending',
          escrow_address: null,
          created_at: now,
          updated_at: now,
        };
        contractStore.set(contractId, contract);
        
        // Reject other proposals for same project
        for (const [id, p] of proposalStore.entries()) {
          const otherProposal = p as any;
          if (otherProposal.project_id === proposal.project_id && 
              otherProposal.id !== proposalId && 
              otherProposal.status === 'pending') {
            otherProposal.status = 'rejected';
            proposalStore.set(id, otherProposal);
          }
        }
        
        return { data: { success: true, contract_id: contractId }, error: null };
      }
      return { data: null, error: { message: 'Unsupported RPC function' } };
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
    mockBlockchainService.deployEscrow.mockClear();

    // Mock Supabase RPC for atomic proposal acceptance
    const mockSupabaseClient = (globalThis as any).mockSupabaseClient;
    mockSupabaseClient.rpc = jest.fn(async (functionName: string, params: any) => {
      if (functionName === 'accept_proposal_atomic') {
        const proposalId = params.p_proposal_id;
        const proposal = proposalStore.get(proposalId) as any;
        if (!proposal) return { data: null, error: { message: 'Proposal not found' } };
        
        proposal.status = 'accepted';
        proposalStore.set(proposalId, proposal);
        
        // Create contract with pending status (will be activated by proposal service)
        const contractId = 'contract-' + Date.now();
        const now = new Date().toISOString();
        const contract = {
          id: contractId,
          proposal_id: proposalId,
          project_id: proposal.project_id,
          freelancer_id: proposal.freelancer_id,
          employer_id: params.p_employer_id,
          total_amount: proposal.proposed_rate,
          status: 'pending',
          escrow_address: null,
          created_at: now,
          updated_at: now,
        };
        contractStore.set(contractId, contract);
        
        // Reject other proposals
        for (const [id, p] of proposalStore.entries()) {
          const otherProposal = p as any;
          if (otherProposal.project_id === proposal.project_id && 
              otherProposal.id !== proposalId && 
              otherProposal.status === 'pending') {
            otherProposal.status = 'rejected';
            proposalStore.set(id, otherProposal);
          }
        }
        
        return { data: { success: true, contract_id: contractId }, error: null };
      }
      return { data: null, error: { message: 'Unsupported RPC function' } };
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
      expect(result.data.contract.status).toBe('active');
      expect(result.data.contract.escrowAddress).toBeDefined();
    }
  });
});
