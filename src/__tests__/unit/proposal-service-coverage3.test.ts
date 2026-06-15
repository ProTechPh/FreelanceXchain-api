// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockProposalRepository = {
  findProposalById: jest.fn<any>(),
  createProposal: jest.fn<any>(),
  updateProposal: jest.fn<any>(),
  getProposalsByProject: jest.fn<any>(),
  getProposalsByFreelancer: jest.fn<any>(),
  getAcceptedProposalCount: jest.fn<any>(),
  getExistingProposal: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: mockProposalRepository,
}));

const mockProjectRepository = {
  findProjectById: jest.fn<any>(),
  updateProject: jest.fn<any>(),
  getAllOpenProjects: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockContractRepository = {
  getContractById: jest.fn<any>(),
  getContractsByEmployer: jest.fn<any>(),
  updateContract: jest.fn<any>(),
  create: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

const mockUserRepository = {
  getUserById: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
}));

const mockNotificationRepository = {
  createNotification: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepository,
}));

const mockPool = { query: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProposalFromEntity: (entity: any) => ({ ...entity, freelancerId: entity.freelancer_id, projectId: entity.project_id }),
  mapProjectFromEntity: (entity: any) => ({
    ...entity,
    employerId: entity.employer_id,
    freelancerLimit: entity.freelancer_limit,
    isRush: entity.is_rush,
    rushFeePercentage: entity.rush_fee_percentage,
  }),
  mapContractFromEntity: (entity: any) => ({ ...entity, proposalId: entity.proposal_id, freelancerId: entity.freelancer_id, employerId: entity.employer_id }),
}));

jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  createAgreementOnBlockchain: jest.fn<any>().mockResolvedValue(undefined),
  signAgreement: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(resolveModule('src/utils/file-validator.ts'), () => ({
  validateAttachments: jest.fn<any>().mockReturnValue([]),
  FileAttachment: {},
}));

const {
  acceptProposal,
  submitProposal,
} = await import('../../services/proposal-service.js');

describe('Proposal Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationRepository.createNotification.mockResolvedValue({ success: true });
  });

  // L333, L334: FREELANCER_LIMIT_REACHED
  describe('acceptProposal - FREELANCER_LIMIT_REACHED (L333, L334)', () => {
    it('should return FREELANCER_LIMIT_REACHED when limit is already reached', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({
        id: 'p-1', status: 'pending', project_id: 'proj-1', proposed_rate: 1000, freelancer_id: 'f-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'proj-1', employer_id: 'emp-1', milestones: [{ title: 'M1', amount: 1000 }],
        freelancer_limit: 2,
      });
      mockProposalRepository.getAcceptedProposalCount.mockResolvedValue(2);

      const result = await acceptProposal('p-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FREELANCER_LIMIT_REACHED');
      }
    });
  });

  // L370, L371: UPDATE_FAILED when contract creation returns null
  describe('acceptProposal - contract creation failed (L370, L371)', () => {
    it('should return UPDATE_FAILED when contractRepository.create returns null', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({
        id: 'p-1', status: 'pending', project_id: 'proj-1', proposed_rate: 1000, freelancer_id: 'f-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'proj-1', employer_id: 'emp-1', milestones: [{ title: 'M1', amount: 1000 }],
        freelancer_limit: 1,
      });
      mockProposalRepository.getAcceptedProposalCount.mockResolvedValue(0);
      mockProposalRepository.updateProposal.mockResolvedValue({
        id: 'p-1', status: 'accepted', project_id: 'proj-1', proposed_rate: 1000, freelancer_id: 'f-1',
      });
      mockContractRepository.create.mockResolvedValue(null);

      const result = await acceptProposal('p-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('UPDATE_FAILED');
        expect(result.error.message).toBe('Proposal accepted but no contract was created');
      }
    });
  });

  // L389: catch block for rejecting other proposals
  describe('acceptProposal - reject other proposals catch (L389)', () => {
    it('should continue when rejecting other proposals throws', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({
        id: 'p-1', status: 'pending', project_id: 'proj-1', proposed_rate: 1000, freelancer_id: 'f-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'proj-1', employer_id: 'emp-1', milestones: [{ title: 'M1', amount: 1000 }],
        freelancer_limit: 1,
      });
      mockProposalRepository.getAcceptedProposalCount.mockResolvedValue(0);
      mockProposalRepository.updateProposal.mockResolvedValue({
        id: 'p-1', status: 'accepted', project_id: 'proj-1', proposed_rate: 1000, freelancer_id: 'f-1',
      });
      mockContractRepository.create.mockResolvedValue({
        id: 'c-1', status: 'pending', project_id: 'proj-1', proposal_id: 'p-1', freelancer_id: 'f-1', employer_id: 'emp-1',
      });
      // First call to getProposalsByProject (inside try/catch) throws
      mockProposalRepository.getProposalsByProject.mockRejectedValueOnce(new Error('DB error'));
      // Second call (line 449, for project status update) succeeds
      mockProposalRepository.getProposalsByProject.mockResolvedValue({
        items: [{ id: 'p-1', status: 'accepted', project_id: 'proj-1', freelancer_id: 'f-1' }],
        hasMore: false, total: 1,
      });
      mockUserRepository.getUserById.mockResolvedValue(null);

      const result = await acceptProposal('p-1', 'emp-1');
      expect(result.success).toBe(true);
    });
  });

  // L455: project.milestones?.map - covered when milestones exist and limit is reached
  describe('acceptProposal - milestones with limit reached (L455)', () => {
    it('should set first milestone to in_progress when limit is reached', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({
        id: 'p-1', status: 'pending', project_id: 'proj-1', proposed_rate: 1000, freelancer_id: 'f-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'proj-1', employer_id: 'emp-1', milestones: [{ title: 'M1', amount: 1000, dueDate: '2025-12-31' }],
        freelancer_limit: 1,
      });
      mockProposalRepository.getAcceptedProposalCount.mockResolvedValue(0);
      mockProposalRepository.updateProposal.mockResolvedValue({
        id: 'p-1', status: 'accepted', project_id: 'proj-1', proposed_rate: 1000, freelancer_id: 'f-1',
      });
      mockContractRepository.create.mockResolvedValue({
        id: 'c-1', status: 'pending', project_id: 'proj-1', proposal_id: 'p-1', freelancer_id: 'f-1', employer_id: 'emp-1',
      });
      // Second call returns 1 accepted (limit reached)
      mockProposalRepository.getProposalsByProject.mockResolvedValue({
        items: [{ id: 'p-1', status: 'accepted', project_id: 'proj-1', freelancer_id: 'f-1' }],
        hasMore: false, total: 1,
      });
      mockUserRepository.getUserById.mockResolvedValue(null);

      const result = await acceptProposal('p-1', 'emp-1');
      expect(result.success).toBe(true);
      // Should update project status to in_progress
      expect(mockProjectRepository.updateProject).toHaveBeenCalledWith(
        'proj-1',
        expect.objectContaining({ status: 'in_progress' })
      );
    });
  });
});
