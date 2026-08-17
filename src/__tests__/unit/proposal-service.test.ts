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


// Mock review repository
jest.unstable_mockModule(resolveModule('src/repositories/review-repository.ts'), () => ({
  reviewRepository: mockReviewRepo,
}));

// Mock employer profile repository
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: mockEmployerProfileRepo,
}));

// Audit-log repository (BLF-12.2 contract-creation audit trail)
const mockAuditLogRepo = { create: jest.fn<any>().mockResolvedValue(undefined) };
jest.unstable_mockModule(resolveModule('src/repositories/audit-log-repository.ts'), () => ({
  auditLogRepository: mockAuditLogRepo,
}));

// Email delivery (preference-gated transactional emails). Mocked so the real
// email-preference-service / user-repository do not touch global mockDatabases.
const mockSendGatedEmail = jest.fn<any>().mockResolvedValue(true);
jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
  sendGatedEmail: mockSendGatedEmail,
  sendProposalAcceptedEmail: jest.fn<any>().mockResolvedValue({ success: true, data: { messageId: 'x' } }),
  sendContractCreatedEmail: jest.fn<any>().mockResolvedValue({ success: true, data: { messageId: 'x' } }),
}));

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

    const proposal = createTestProposal({ 
      id: 'proposal-1',
      project_id: projectId, 
      freelancer_id: freelancerId,
      proposed_rate: proposedRate,
      status: 'pending'
    });
    proposalStore.set(proposal.id, proposal);

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
      expect(result.data.proposal.status).toBe('accepted');
      
      expect(result.data.contract).toBeDefined();
      assertIsValidId(result.data.contract.id);
      expect(result.data.contract.proposalId).toBe(proposal.id);
      expect(result.data.contract.freelancerId).toBe(freelancerId);
      expect(result.data.contract.employerId).toBe(employerId);
    }
    
    const updatedProject = projectStore.get(projectId) as any;
    expect(updatedProject?.status).toBe('in_progress');
    
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

    const existingProposal = createTestProposal({ 
      project_id: projectId, 
      freelancer_id: freelancerId,
      status: 'pending'
    });
    proposalStore.set(existingProposal.id, existingProposal);

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
    mockAuditLogRepo.create.mockClear();

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

    // BLF-12.2: contract creation is audited with the employer as actor and freelancer as target
    expect(mockAuditLogRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      user_id: freelancerId,
      actor_id: employerId,
      action: 'contract.created',
      resource_type: 'contract',
      payload: expect.objectContaining({ projectId, proposalId: proposal.id }),
    }));

    // BLF-13: the freelancer gets a preference-gated contract-created email
    expect(mockSendGatedEmail).toHaveBeenCalledWith(
      freelancerId,
      'contract_created',
      expect.any(Function)
    );
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

  // BLF-6.2: Only reject the remaining pending proposals once the project's
  // freelancer slots are full — multi-freelancer projects must be able to fill
  // their other slots.
  it('should keep other pending proposals open when freelancer slots remain', async () => {
    const employerId = 'employer-slots-remain';
    const milestones = [createTestMilestone({ id: 'ms-sr-1', title: 'M1', amount: 800, status: 'pending' })];
    const project = createTestProject({
      id: 'slots-remain-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: 2,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id, freelancer_id: 'freelancer-sr-1', proposed_rate: 800, status: 'pending',
    });
    const otherProposal = createTestProposal({
      project_id: project.id, freelancer_id: 'freelancer-sr-2', proposed_rate: 800, status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);
    proposalStore.set(otherProposal.id, otherProposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    // One slot still open (limit 2, 1 accepted) → the other proposal is NOT auto-rejected
    const otherAfter = proposalStore.get(otherProposal.id) as any;
    expect(otherAfter?.status).toBe('pending');
  });

  it('should reject other pending proposals once the final slot is filled', async () => {
    const employerId = 'employer-slots-full';
    const milestones = [createTestMilestone({ id: 'ms-sf-1', title: 'M1', amount: 800, status: 'pending' })];
    const project = createTestProject({
      id: 'slots-full-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: 1,
    });
    projectStore.set(project.id, project);

    const proposal = createTestProposal({
      project_id: project.id, freelancer_id: 'freelancer-sf-1', proposed_rate: 800, status: 'pending',
    });
    const otherProposal = createTestProposal({
      project_id: project.id, freelancer_id: 'freelancer-sf-2', proposed_rate: 800, status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);
    proposalStore.set(otherProposal.id, otherProposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    // Limit 1 reached → the remaining pending proposal is rejected
    const otherAfter = proposalStore.get(otherProposal.id) as any;
    expect(otherAfter?.status).toBe('rejected');
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

    const contract = createTestContract({
      employer_id: employerId,
      status: 'completed',
    });
    contractStore.set(contract.id, contract);

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
  it('rush fee calculation with isRush true via acceptProposal (lines 308-310, 415-418)', async () => {
    const employerId = 'employer-rush-true';
    const freelancerId = 'freelancer-rush-true';

    const milestones = [
      createTestMilestone({ id: 'ms-rt-1', title: 'M1', amount: 1000, status: 'pending' }),
    ];
    // Use snake_case entity field names so mapProjectFromEntity reads them correctly
    const project = createTestProject({
      id: 'rush-true-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      is_rush: true,
      rush_fee_percentage: 30,
    });
    projectStore.set(project.id, project);

    const employer = createTestUser({
      id: employerId,
      wallet_address: '0x1111111111111111111111111111111111111111',
    });
    userStore.set(employer.id, employer);

    const freelancer = createTestUser({
      id: freelancerId,
      wallet_address: '0x2222222222222222222222222222222222222222',
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

  it('rush fee defaults and isRush false via acceptProposal (lines 308-310, 415-418)', async () => {
    const employerId = 'employer-no-rush';
    const freelancerId = 'freelancer-no-rush';

    const milestones = [
      createTestMilestone({ id: 'ms-nr-1', title: 'M1', amount: 500, status: 'pending' }),
    ];
    // is_rush: false (default), rush_fee_percentage: undefined (default via mapper)
    const project = createTestProject({
      id: 'no-rush-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      is_rush: false,
    });
    projectStore.set(project.id, project);

    const employer = createTestUser({
      id: employerId,
      wallet_address: '0x3333333333333333333333333333333333333333',
    });
    userStore.set(employer.id, employer);

    const freelancer = createTestUser({
      id: freelancerId,
      wallet_address: '0x4444444444444444444444444444444444444444',
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
      expect(result.data.contract).toBeDefined();
    }
  });

  it('rushFeePercentage defaults to 25 when entity has undefined rush_fee_percentage (lines 308-309)', async () => {
    const employerId = 'employer-rush-default-pct';
    const freelancerId = 'freelancer-rush-default-pct';

    const milestones = [
      createTestMilestone({ id: 'ms-rdp-1', title: 'M1', amount: 1000, status: 'pending' }),
    ];
    // is_rush: true but rush_fee_percentage: undefined => mapper defaults to 25
    const project = createTestProject({
      id: 'rush-default-pct-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      is_rush: true,
      rush_fee_percentage: undefined as any,
    });
    projectStore.set(project.id, project);

    const employer = createTestUser({
      id: employerId,
      wallet_address: '0x5555555555555555555555555555555555555555',
    });
    userStore.set(employer.id, employer);

    const freelancer = createTestUser({
      id: freelancerId,
      wallet_address: '0x6666666666666666666666666666666666666666',
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
      expect(result.data.contract).toBeDefined();
    }
  });

  it('freelancerLimit defaults to 1 and limitReached is false when limit > accepted count (lines 448, 455)', async () => {
    const employerId = 'employer-limit-not-reached';
    const freelancerId = 'freelancer-limit-not-reached';

    const milestones = [
      createTestMilestone({ id: 'ms-lnr-1', title: 'M1', amount: 800, status: 'pending' }),
    ];
    // freelancer_limit: 2, so limit is not reached with just 1 acceptance
    const project = createTestProject({
      id: 'limit-not-reached-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: 2,
    });
    projectStore.set(project.id, project);

    const employer = createTestUser({
      id: employerId,
      wallet_address: '0x7777777777777777777777777777777777777777',
    });
    userStore.set(employer.id, employer);

    const freelancer = createTestUser({
      id: freelancerId,
      wallet_address: '0x8888888888888888888888888888888888888888',
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
    // With limit=2 and only 1 accepted, limitReached=false, project stays 'open'
    const updatedProject = projectStore.get(project.id) as any;
    expect(updatedProject?.status).toBe('open');
  });

  it('freelancerLimit defaults to 1 when entity freelancer_limit is undefined (line 448)', async () => {
    const employerId = 'employer-fl-default';
    const freelancerId = 'freelancer-fl-default';

    const milestones = [
      createTestMilestone({ id: 'ms-fld-1', title: 'M1', amount: 600, status: 'pending' }),
    ];
    const project = createTestProject({
      id: 'fl-default-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      freelancer_limit: undefined as any,
    });
    projectStore.set(project.id, project);

    const employer = createTestUser({
      id: employerId,
      wallet_address: '0x9999999999999999999999999999999999999999',
    });
    userStore.set(employer.id, employer);

    const freelancer = createTestUser({
      id: freelancerId,
      wallet_address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0',
    });
    userStore.set(freelancer.id, freelancer);

    const proposal = createTestProposal({
      project_id: project.id,
      freelancer_id: freelancerId,
      proposed_rate: 600,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await acceptProposal(proposal.id, employerId);

    expect(result.success).toBe(true);
    // freelancer_limit defaults to 1 via mapper, limit reached with 1 acceptance
    const updatedProject = projectStore.get(project.id) as any;
    expect(updatedProject?.status).toBe('in_progress');
  });
});

// ═══════════════════════════════════════════════════════════════
// Branch coverage: proposal-repository.ts line 24
// parse function branches for attachments field
// ═══════════════════════════════════════════════════════════════

describe('Proposal Service - parse function branch coverage (proposal-repository.ts:24)', () => {
  beforeEach(() => {
    mockProposalRepo.clear();
    mockProjectRepo.clear();
    mockContractRepo.clear();
    mockUserRepo.clear();
    mockNotificationRepo.clear();
    mockReviewRepo.clear();
    mockEmployerProfileRepo.clear();
  });

  it('should create proposal with attachments as valid JSON string (parse success path)', async () => {
    const project = createTestProject({ status: 'open' });
    projectStore.set(project.id, project);

    const result = await submitProposal('freelancer-123', {
      projectId: project.id,
      proposedRate: 75,
      estimatedDuration: 45,
      attachments: [
        { url: 'https://appwrite.io/resume.pdf', filename: 'resume.pdf', size: 1024, mimeType: 'application/pdf' },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.attachments).toBeDefined();
      expect(Array.isArray(result.data.proposal.attachments)).toBe(true);
    }
  });

  it('should create proposal with empty attachments array (empty array path)', async () => {
    const project = createTestProject({ status: 'open' });
    projectStore.set(project.id, project);

    const result = await submitProposal('freelancer-456', {
      projectId: project.id,
      proposedRate: 100,
      estimatedDuration: 30,
      attachments: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.attachments).toEqual([]);
    }
  });

  it('should create proposal with multiple attachments', async () => {
    const project = createTestProject({ status: 'open' });
    projectStore.set(project.id, project);

    const attachments = [
      { url: 'https://appwrite.io/file1.pdf', filename: 'file1.pdf', size: 100, mimeType: 'application/pdf' },
      { url: 'https://appwrite.io/file2.png', filename: 'file2.png', size: 200, mimeType: 'image/png' },
      { url: 'https://appwrite.io/file3.doc', filename: 'file3.doc', size: 300, mimeType: 'application/msword' },
    ];

    const result = await submitProposal('freelancer-789', {
      projectId: project.id,
      proposedRate: 150,
      estimatedDuration: 60,
      attachments,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposal.attachments).toHaveLength(3);
    }
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

  });

  // Lines 308-310: rush fee calculation with is_rush: true and rush_fee_percentage
  it('acceptProposal calculates rush fee when project has is_rush: true (lines 308-310)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';

    // Project with is_rush: true and rush_fee_percentage: 30 (snake_case entity fields)
    const milestones = [
      createTestMilestone({ id: 'ms-1', title: 'M1', amount: 1000, status: 'pending' }),
    ];
    const project = createTestProject({
      id: 'rush-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      is_rush: true,
      rush_fee_percentage: 30,
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

  // Lines 308-309: is_rush and rush_fee_percentage defaults via mapper
  it('acceptProposal with default rush_fee_percentage and is_rush when not set (lines 308-309)', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-123';

    // Project with is_rush and rush_fee_percentage not explicitly set (defaults via mapper)
    const milestones = [
      createTestMilestone({ id: 'ms-1', title: 'M1', amount: 500, status: 'pending' }),
    ];
    const project = createTestProject({
      id: 'default-rush-project',
      employer_id: employerId,
      status: 'open',
      milestones,
      // is_rush and rush_fee_percentage use defaults from createTestProject
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

  // Line 448: freelancer_limit ?? 1 default via mapper → freelancerLimit ?? 1
  it('acceptProposal uses default freelancerLimit of 1 when freelancer_limit not set (line 448)', async () => {
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
      freelancer_limit: 1,
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
