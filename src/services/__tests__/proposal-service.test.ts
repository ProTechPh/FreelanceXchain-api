import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { ProposalEntity } from '../../repositories/proposal-repository';
import { ContractEntity } from '../../repositories/contract-repository';
import { ProjectEntity, ProjectStatus } from '../../repositories/project-repository';
import { generateId } from '../../utils/id';

// In-memory stores for testing
let proposalStore: Map<string, ProposalEntity> = new Map();
let contractStore: Map<string, ContractEntity> = new Map();
let projectStore: Map<string, ProjectEntity> = new Map();

// Mock the repositories before importing proposal-service
jest.unstable_mockModule('../../repositories/proposal-repository.js', () => ({
  proposalRepository: {
    createProposal: jest.fn(async (proposal: ProposalEntity) => {
      proposalStore.set(proposal.id, proposal);
      return proposal;
    }),
    findProposalById: jest.fn(async (id: string) => {
      return proposalStore.get(id) ?? null;
    }),
    getExistingProposal: jest.fn(async (projectId: string, freelancerId: string) => {
      for (const proposal of proposalStore.values()) {
        if (proposal.project_id === projectId && proposal.freelancer_id === freelancerId) {
          return proposal;
        }
      }
      return null;
    }),
    updateProposal: jest.fn(async (id: string, updates: Partial<ProposalEntity>) => {
      const existing = proposalStore.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      proposalStore.set(id, updated);
      return updated;
    }),
    getProposalsByProject: jest.fn(async (projectId: string) => {
      const proposals = Array.from(proposalStore.values()).filter(p => p.project_id === projectId);
      return { items: proposals, hasMore: false };
    }),
    getProposalsByFreelancer: jest.fn(async (freelancerId: string) => {
      return Array.from(proposalStore.values()).filter(p => p.freelancer_id === freelancerId);
    }),
  },
  ProposalRepository: jest.fn(),
}));


jest.unstable_mockModule('../../repositories/contract-repository.js', () => ({
  contractRepository: {
    createContract: jest.fn(async (contract: ContractEntity) => {
      contractStore.set(contract.id, contract);
      return contract;
    }),
    getContractById: jest.fn(async (id: string) => {
      return contractStore.get(id) ?? null;
    }),
    findContractByProposalId: jest.fn(async (proposalId: string) => {
      for (const contract of contractStore.values()) {
        if (contract.proposal_id === proposalId) return contract;
      }
      return null;
    }),
  },
  ContractRepository: jest.fn(),
}));

jest.unstable_mockModule('../../repositories/project-repository.js', () => ({
  projectRepository: {
    findProjectById: jest.fn(async (id: string) => {
      return projectStore.get(id) ?? null;
    }),
    updateProject: jest.fn(async (id: string, updates: Partial<ProjectEntity>) => {
      const existing = projectStore.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
      projectStore.set(id, updated);
      return updated;
    }),
  },
  ProjectRepository: jest.fn(),
}));

jest.unstable_mockModule('../../repositories/notification-repository.js', () => ({
  notificationRepository: {
    createNotification: jest.fn(async (notification: Record<string, unknown>) => {
      const now = new Date().toISOString();
      return { ...notification, created_at: now, updated_at: now };
    }),
  },
  NotificationRepository: jest.fn(),
}));

// Mock user repository for acceptProposal
jest.unstable_mockModule('../../repositories/user-repository.js', () => ({
  userRepository: {
    getUserById: jest.fn(async () => ({
      id: 'user-1',
      wallet_address: '0x' + 'a'.repeat(40),
    })),
  },
  UserRepository: jest.fn(),
}));

// Mock agreement contract for acceptProposal
jest.unstable_mockModule('../agreement-contract.js', () => ({
  createAgreementOnBlockchain: jest.fn(async () => ({ transactionHash: '0x123' })),
  signAgreement: jest.fn(async () => ({ transactionHash: '0x456' })),
}));

// Import after mocking
const { submitProposal, acceptProposal, rejectProposal } = await import('../proposal-service.js');

// Custom arbitraries for property-based testing
const validCoverLetterArbitrary = () =>
  fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10);

const validProposedRateArbitrary = () =>
  fc.integer({ min: 10, max: 10000 });

const validEstimatedDurationArbitrary = () =>
  fc.integer({ min: 1, max: 365 });


// Helper to create a test project
function createTestProject(employerId: string, status: ProjectStatus = 'open'): ProjectEntity {
  const project: ProjectEntity = {
    id: generateId(),
    employer_id: employerId,
    title: 'Test Project',
    description: 'A test project description',
    required_skills: [],
    budget: 5000,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status,
    milestones: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  projectStore.set(project.id, project);
  return project;
}

describe('Proposal Service - Property Tests', () => {
  beforeEach(() => {
    proposalStore.clear();
    contractStore.clear();
    projectStore.clear();
  });

  /**
   * **Feature: blockchain-freelance-marketplace, Property 14: Proposal creation**
   * **Validates: Requirements 5.1**
   * 
   * For any valid proposal submitted by a freelancer for a project,
   * the proposal shall be created and a notification shall be generated for the employer.
   */
  it('Property 14: Proposal creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        validCoverLetterArbitrary(),
        validProposedRateArbitrary(),
        validEstimatedDurationArbitrary(),
        async (freelancerId, employerId, coverLetter, proposedRate, estimatedDuration) => {
          // Clear stores for each test case
          proposalStore.clear();
          contractStore.clear();
          projectStore.clear();

          // Create a project for the employer
          const project = createTestProject(employerId);

          const input = {
            projectId: project.id,
            coverLetter,
            proposedRate,
            estimatedDuration,
          };

          const result = await submitProposal(freelancerId, input);

          // Should succeed
          expect(result.success).toBe(true);

          if (result.success) {
            // Verify proposal was created with correct data
            expect(result.data.proposal.projectId).toBe(project.id);
            expect(result.data.proposal.freelancerId).toBe(freelancerId);
            expect(result.data.proposal.coverLetter).toBe(coverLetter);
            expect(result.data.proposal.proposedRate).toBe(proposedRate);
            expect(result.data.proposal.estimatedDuration).toBe(estimatedDuration);
            expect(result.data.proposal.status).toBe('pending');

            // Verify notification was generated for employer
            expect(result.data.notification).toBeDefined();
            expect(result.data.notification.userId).toBe(employerId);
            expect(result.data.notification.type).toBe('proposal_received');
            expect(result.data.notification.data.proposalId).toBe(result.data.proposal.id);
            expect(result.data.notification.data.projectId).toBe(project.id);

            // Verify proposal exists in store
            expect(proposalStore.has(result.data.proposal.id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 15: Duplicate proposal rejection**
   * **Validates: Requirements 5.2**
   * 
   * For any freelancer who has already submitted a proposal for a project,
   * attempting to submit another proposal for the same project shall be rejected
   * with a duplicate proposal error.
   */
  it('Property 15: Duplicate proposal rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        validCoverLetterArbitrary(),
        validProposedRateArbitrary(),
        validEstimatedDurationArbitrary(),
        validCoverLetterArbitrary(),
        validProposedRateArbitrary(),
        validEstimatedDurationArbitrary(),
        async (
          freelancerId,
          employerId,
          coverLetter1,
          proposedRate1,
          estimatedDuration1,
          coverLetter2,
          proposedRate2,
          estimatedDuration2
        ) => {
          // Clear stores for each test case
          proposalStore.clear();
          contractStore.clear();
          projectStore.clear();

          // Create a project for the employer
          const project = createTestProject(employerId);

          // First proposal should succeed
          const firstInput = {
            projectId: project.id,
            coverLetter: coverLetter1,
            proposedRate: proposedRate1,
            estimatedDuration: estimatedDuration1,
          };

          const firstResult = await submitProposal(freelancerId, firstInput);
          expect(firstResult.success).toBe(true);

          const proposalCountAfterFirst = proposalStore.size;
          expect(proposalCountAfterFirst).toBe(1);

          // Second proposal from same freelancer should fail
          const secondInput = {
            projectId: project.id,
            coverLetter: coverLetter2,
            proposedRate: proposedRate2,
            estimatedDuration: estimatedDuration2,
          };

          const secondResult = await submitProposal(freelancerId, secondInput);

          // Should be a duplicate proposal error
          expect(secondResult.success).toBe(false);

          if (!secondResult.success) {
            expect(secondResult.error.code).toBe('DUPLICATE_PROPOSAL');
          }

          // No new proposal should be created
          expect(proposalStore.size).toBe(proposalCountAfterFirst);
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 16: Contract creation on proposal acceptance**
   * **Validates: Requirements 5.3**
   * 
   * For any accepted proposal, a contract shall be created linking
   * the correct freelancer, employer, and project IDs.
   */
  it('Property 16: Contract creation on proposal acceptance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        validCoverLetterArbitrary(),
        validProposedRateArbitrary(),
        validEstimatedDurationArbitrary(),
        async (freelancerId, employerId, coverLetter, proposedRate, estimatedDuration) => {
          // Clear stores for each test case
          proposalStore.clear();
          contractStore.clear();
          projectStore.clear();

          // Create a project for the employer
          const project = createTestProject(employerId);

          // Submit a proposal
          const input = {
            projectId: project.id,
            coverLetter,
            proposedRate,
            estimatedDuration,
          };

          const submitResult = await submitProposal(freelancerId, input);
          expect(submitResult.success).toBe(true);

          if (!submitResult.success) return;

          const proposalId = submitResult.data.proposal.id;

          // Accept the proposal
          const acceptResult = await acceptProposal(proposalId, employerId);

          // Should succeed
          expect(acceptResult.success).toBe(true);

          if (acceptResult.success) {
            // Verify proposal status was updated
            expect(acceptResult.data.proposal.status).toBe('accepted');

            // Verify contract was created with correct data
            const contract = acceptResult.data.contract;
            expect(contract).toBeDefined();
            expect(contract.projectId).toBe(project.id);
            expect(contract.proposalId).toBe(proposalId);
            expect(contract.freelancerId).toBe(freelancerId);
            expect(contract.employerId).toBe(employerId);
            expect(contract.totalAmount).toBe(project.budget);
            expect(contract.status).toBe('active');

            // Verify contract exists in store
            expect(contractStore.has(contract.id)).toBe(true);

            // Verify notification was generated for freelancer
            expect(acceptResult.data.notification).toBeDefined();
            expect(acceptResult.data.notification.userId).toBe(freelancerId);
            expect(acceptResult.data.notification.type).toBe('proposal_accepted');
            expect(acceptResult.data.notification.data.contractId).toBe(contract.id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: blockchain-freelance-marketplace, Property 17: Proposal status update on rejection**
   * **Validates: Requirements 5.5**
   * 
   * For any rejected proposal, the proposal status shall be updated to 'rejected'
   * and a notification shall be created for the freelancer.
   */
  it('Property 17: Proposal status update on rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        validCoverLetterArbitrary(),
        validProposedRateArbitrary(),
        validEstimatedDurationArbitrary(),
        async (freelancerId, employerId, coverLetter, proposedRate, estimatedDuration) => {
          // Clear stores for each test case
          proposalStore.clear();
          contractStore.clear();
          projectStore.clear();

          // Create a project for the employer
          const project = createTestProject(employerId);

          // Submit a proposal
          const input = {
            projectId: project.id,
            coverLetter,
            proposedRate,
            estimatedDuration,
          };

          const submitResult = await submitProposal(freelancerId, input);
          expect(submitResult.success).toBe(true);

          if (!submitResult.success) return;

          const proposalId = submitResult.data.proposal.id;

          // Reject the proposal
          const rejectResult = await rejectProposal(proposalId, employerId);

          // Should succeed
          expect(rejectResult.success).toBe(true);

          if (rejectResult.success) {
            // Verify proposal status was updated to 'rejected'
            expect(rejectResult.data.proposal.status).toBe('rejected');

            // Verify the proposal in store has updated status
            const storedProposal = proposalStore.get(proposalId);
            expect(storedProposal?.status).toBe('rejected');

            // Verify notification was generated for freelancer
            expect(rejectResult.data.notification).toBeDefined();
            expect(rejectResult.data.notification.userId).toBe(freelancerId);
            expect(rejectResult.data.notification.type).toBe('proposal_rejected');
            expect(rejectResult.data.notification.data.proposalId).toBe(proposalId);
            expect(rejectResult.data.notification.data.projectId).toBe(project.id);

            // Verify no contract was created
            expect(contractStore.size).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
