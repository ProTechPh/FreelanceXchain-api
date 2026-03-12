import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import { 
  createInMemoryStore, 
  createMockProposalRepository,
  createMockProjectRepository,
  createMockContractRepository,
  createMockEmployerProfileRepository
} from '../helpers/mock-repository-factory.js';
import { 
  createTestProposal, 
  createTestProject,
  createTestContract,
  createTestEmployerProfile
} from '../helpers/test-data-factory.js';

// Create stores and mocks
const proposalStore = createInMemoryStore();
const projectStore = createInMemoryStore();
const contractStore = createInMemoryStore();
const employerProfileStore = createInMemoryStore();
const reviewStore = createInMemoryStore();

const mockProposalRepo = createMockProposalRepository(proposalStore);
const mockProjectRepo = createMockProjectRepository(projectStore);
const mockContractRepo = createMockContractRepository(contractStore);
const mockEmployerProfileRepo = createMockEmployerProfileRepository(employerProfileStore);

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Mock repositories
jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: mockProposalRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: mockEmployerProfileRepo,
}));

// Mock review repository
const mockReviewRepo = {
  getAverageRating: jest.fn<any>().mockResolvedValue({ average: 0, count: 0 }),
};

jest.unstable_mockModule(resolveModule('src/repositories/review-repository.ts'), () => ({
  ReviewRepository: mockReviewRepo,
}));

// Import after mocking
const { getProposalWithEmployerHistory } = await import('../../services/proposal-service.js');

describe('Proposal Employer History - Unit Tests', () => {
  beforeEach(() => {
    proposalStore.clear();
    projectStore.clear();
    contractStore.clear();
    employerProfileStore.clear();
    reviewStore.clear();
    mockReviewRepo.getAverageRating.mockClear();
  });

  it('should return proposal with employer history', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-456';
    const projectId = 'project-789';
    const proposalId = 'proposal-001';

    // Create employer profile (store by user_id for mock)
    const employerProfile = createTestEmployerProfile({
      user_id: employerId,
      company_name: 'Tech Solutions Inc.',
      industry: 'Technology',
    });
    employerProfileStore.set(employerId, employerProfile); // Store by user_id

    // Create project
    const project = createTestProject({
      id: projectId,
      employer_id: employerId,
      title: 'E-commerce Website',
      status: 'open',
    });
    projectStore.set(project.id, project);

    // Create proposal
    const proposal = createTestProposal({
      id: proposalId,
      project_id: projectId,
      freelancer_id: freelancerId,
      proposed_rate: 5000,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    // Create completed contracts for employer
    const completedContract1 = createTestContract({
      id: 'contract-1',
      employer_id: employerId,
      status: 'completed',
    });
    const completedContract2 = createTestContract({
      id: 'contract-2',
      employer_id: employerId,
      status: 'completed',
    });
    const activeContract = createTestContract({
      id: 'contract-3',
      employer_id: employerId,
      status: 'active',
    });
    contractStore.set(completedContract1.id, completedContract1);
    contractStore.set(completedContract2.id, completedContract2);
    contractStore.set(activeContract.id, activeContract);

    // Mock review rating
    mockReviewRepo.getAverageRating.mockResolvedValue({
      average: 4.7,
      count: 12,
    });

    const result = await getProposalWithEmployerHistory(proposalId);

    expect(result.success).toBe(true);
    if (result.success) {
      // Verify proposal data
      expect(result.data.proposal.id).toBe(proposalId);
      expect(result.data.proposal.freelancerId).toBe(freelancerId);

      // Verify project data
      expect(result.data.project.id).toBe(projectId);
      expect(result.data.project.title).toBe('E-commerce Website');

      // Verify employer history
      expect(result.data.employerHistory).toBeDefined();
      expect(result.data.employerHistory.completedProjectsCount).toBe(2);
      expect(result.data.employerHistory.averageRating).toBe(4.7);
      expect(result.data.employerHistory.reviewCount).toBe(12);
      expect(result.data.employerHistory.companyName).toBe('Tech Solutions Inc.');
      expect(result.data.employerHistory.industry).toBe('Technology');
    }

    // Verify getAverageRating was called with correct employer ID
    expect(mockReviewRepo.getAverageRating).toHaveBeenCalledWith(employerId);
  });

  it('should return zero completed projects for new employer', async () => {
    const employerId = 'new-employer-123';
    const freelancerId = 'freelancer-456';
    const projectId = 'project-789';
    const proposalId = 'proposal-001';

    // Create employer profile (store by user_id for mock)
    const employerProfile = createTestEmployerProfile({
      user_id: employerId,
      company_name: 'New Startup LLC',
      industry: 'Startup',
    });
    employerProfileStore.set(employerId, employerProfile); // Store by user_id

    // Create project
    const project = createTestProject({
      id: projectId,
      employer_id: employerId,
      status: 'open',
    });
    projectStore.set(project.id, project);

    // Create proposal
    const proposal = createTestProposal({
      id: proposalId,
      project_id: projectId,
      freelancer_id: freelancerId,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    // No contracts for this employer

    // Mock review rating (no reviews)
    mockReviewRepo.getAverageRating.mockResolvedValue({
      average: 0,
      count: 0,
    });

    const result = await getProposalWithEmployerHistory(proposalId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employerHistory.completedProjectsCount).toBe(0);
      expect(result.data.employerHistory.averageRating).toBe(0);
      expect(result.data.employerHistory.reviewCount).toBe(0);
      expect(result.data.employerHistory.companyName).toBe('New Startup LLC');
    }
  });

  it('should filter only completed contracts', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-456';
    const projectId = 'project-789';
    const proposalId = 'proposal-001';

    // Create employer profile
    const employerProfile = createTestEmployerProfile({
      user_id: employerId,
    });
    employerProfileStore.set(employerProfile.id, employerProfile);

    // Create project
    const project = createTestProject({
      id: projectId,
      employer_id: employerId,
      status: 'open',
    });
    projectStore.set(project.id, project);

    // Create proposal
    const proposal = createTestProposal({
      id: proposalId,
      project_id: projectId,
      freelancer_id: freelancerId,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    // Create various contract statuses
    const completedContract = createTestContract({
      id: 'contract-completed',
      employer_id: employerId,
      status: 'completed',
    });
    const activeContract = createTestContract({
      id: 'contract-active',
      employer_id: employerId,
      status: 'active',
    });
    const disputedContract = createTestContract({
      id: 'contract-disputed',
      employer_id: employerId,
      status: 'disputed',
    });
    const cancelledContract = createTestContract({
      id: 'contract-cancelled',
      employer_id: employerId,
      status: 'cancelled',
    });

    contractStore.set(completedContract.id, completedContract);
    contractStore.set(activeContract.id, activeContract);
    contractStore.set(disputedContract.id, disputedContract);
    contractStore.set(cancelledContract.id, cancelledContract);

    // Mock review rating
    mockReviewRepo.getAverageRating.mockResolvedValue({
      average: 4.5,
      count: 5,
    });

    const result = await getProposalWithEmployerHistory(proposalId);

    expect(result.success).toBe(true);
    if (result.success) {
      // Only completed contracts should be counted
      expect(result.data.employerHistory.completedProjectsCount).toBe(1);
    }
  });

  it('should round average rating to 1 decimal place', async () => {
    const employerId = 'employer-123';
    const freelancerId = 'freelancer-456';
    const projectId = 'project-789';
    const proposalId = 'proposal-001';

    // Create employer profile
    const employerProfile = createTestEmployerProfile({
      user_id: employerId,
    });
    employerProfileStore.set(employerProfile.id, employerProfile);

    // Create project
    const project = createTestProject({
      id: projectId,
      employer_id: employerId,
      status: 'open',
    });
    projectStore.set(project.id, project);

    // Create proposal
    const proposal = createTestProposal({
      id: proposalId,
      project_id: projectId,
      freelancer_id: freelancerId,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    // Mock review rating with many decimal places
    mockReviewRepo.getAverageRating.mockResolvedValue({
      average: 4.666666666666667,
      count: 3,
    });

    const result = await getProposalWithEmployerHistory(proposalId);

    expect(result.success).toBe(true);
    if (result.success) {
      // Should be rounded to 1 decimal place
      expect(result.data.employerHistory.averageRating).toBe(4.7);
    }
  });

  it('should return error if proposal not found', async () => {
    const result = await getProposalWithEmployerHistory('non-existent-proposal');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toBe('Proposal not found');
    }
  });

  it('should return error if project not found', async () => {
    const proposalId = 'proposal-001';

    // Create proposal without project
    const proposal = createTestProposal({
      id: proposalId,
      project_id: 'non-existent-project',
      freelancer_id: 'freelancer-456',
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    const result = await getProposalWithEmployerHistory(proposalId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toBe('Project not found');
    }
  });

  it('should handle employer with high rating and many projects', async () => {
    const employerId = 'experienced-employer';
    const freelancerId = 'freelancer-456';
    const projectId = 'project-789';
    const proposalId = 'proposal-001';

    // Create employer profile (store by user_id for mock)
    const employerProfile = createTestEmployerProfile({
      user_id: employerId,
      company_name: 'Established Corp',
      industry: 'Enterprise',
    });
    employerProfileStore.set(employerId, employerProfile); // Store by user_id

    // Create project
    const project = createTestProject({
      id: projectId,
      employer_id: employerId,
      status: 'open',
    });
    projectStore.set(project.id, project);

    // Create proposal
    const proposal = createTestProposal({
      id: proposalId,
      project_id: projectId,
      freelancer_id: freelancerId,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    // Create 20 completed contracts (not 25, to match mock contract repo limit)
    for (let i = 1; i <= 20; i++) {
      const contract = createTestContract({
        id: `contract-${i}`,
        employer_id: employerId,
        status: 'completed',
      });
      contractStore.set(contract.id, contract);
    }

    // Mock high rating
    mockReviewRepo.getAverageRating.mockResolvedValue({
      average: 4.9,
      count: 20,
    });

    const result = await getProposalWithEmployerHistory(proposalId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employerHistory.completedProjectsCount).toBe(20);
      expect(result.data.employerHistory.averageRating).toBe(4.9);
      expect(result.data.employerHistory.reviewCount).toBe(20);
      expect(result.data.employerHistory.companyName).toBe('Established Corp');
    }
  });

  it('should handle employer with low rating', async () => {
    const employerId = 'low-rated-employer';
    const freelancerId = 'freelancer-456';
    const projectId = 'project-789';
    const proposalId = 'proposal-001';

    // Create employer profile
    const employerProfile = createTestEmployerProfile({
      user_id: employerId,
      company_name: 'Problematic Inc.',
      industry: 'Various',
    });
    employerProfileStore.set(employerProfile.id, employerProfile);

    // Create project
    const project = createTestProject({
      id: projectId,
      employer_id: employerId,
      status: 'open',
    });
    projectStore.set(project.id, project);

    // Create proposal
    const proposal = createTestProposal({
      id: proposalId,
      project_id: projectId,
      freelancer_id: freelancerId,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    // Create some completed contracts
    const contract1 = createTestContract({
      id: 'contract-1',
      employer_id: employerId,
      status: 'completed',
    });
    const contract2 = createTestContract({
      id: 'contract-2',
      employer_id: employerId,
      status: 'completed',
    });
    contractStore.set(contract1.id, contract1);
    contractStore.set(contract2.id, contract2);

    // Mock low rating
    mockReviewRepo.getAverageRating.mockResolvedValue({
      average: 2.3,
      count: 8,
    });

    const result = await getProposalWithEmployerHistory(proposalId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employerHistory.completedProjectsCount).toBe(2);
      expect(result.data.employerHistory.averageRating).toBe(2.3);
      expect(result.data.employerHistory.reviewCount).toBe(8);
      // Low rating should still be returned - client decides how to handle it
    }
  });

  it('should handle missing employer profile gracefully', async () => {
    const employerId = 'employer-no-profile';
    const freelancerId = 'freelancer-456';
    const projectId = 'project-789';
    const proposalId = 'proposal-001';

    // No employer profile created

    // Create project
    const project = createTestProject({
      id: projectId,
      employer_id: employerId,
      status: 'open',
    });
    projectStore.set(project.id, project);

    // Create proposal
    const proposal = createTestProposal({
      id: proposalId,
      project_id: projectId,
      freelancer_id: freelancerId,
      status: 'pending',
    });
    proposalStore.set(proposal.id, proposal);

    // Mock review rating
    mockReviewRepo.getAverageRating.mockResolvedValue({
      average: 4.0,
      count: 2,
    });

    const result = await getProposalWithEmployerHistory(proposalId);

    expect(result.success).toBe(true);
    if (result.success) {
      // Should handle missing profile gracefully
      expect(result.data.employerHistory.companyName).toBeUndefined();
      expect(result.data.employerHistory.industry).toBeUndefined();
      // But other data should still be present
      expect(result.data.employerHistory.averageRating).toBe(4.0);
      expect(result.data.employerHistory.reviewCount).toBe(2);
    }
  });
});
