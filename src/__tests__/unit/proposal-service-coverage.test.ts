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
};

jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: mockProposalRepository,
}));

const mockProjectRepository = {
  findProjectById: jest.fn<any>(),
  updateProject: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockContractRepository = {
  getContractById: jest.fn<any>(),
  getContractsByEmployer: jest.fn<any>(),
  updateContract: jest.fn<any>(),
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
  mapProjectFromEntity: (entity: any) => ({ ...entity, employerId: entity.employer_id }),
  mapContractFromEntity: (entity: any) => ({ ...entity }),
}));

jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  createAgreementOnBlockchain: jest.fn<any>(),
  signAgreement: jest.fn<any>(),
}));

const {
  getProposalById,
  getProposalsByProject,
  acceptProposal,
  rejectProposal,
} = await import('../../services/proposal-service.js');

describe('Proposal Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Lines 129-131: getProposalById - not found
  describe('getProposalById', () => {
    it('should return NOT_FOUND when proposal does not exist', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue(null);

      const result = await getProposalById('prop-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  // Lines 229-233: getProposalsByProject - project not found
  describe('getProposalsByProject', () => {
    it('should return NOT_FOUND when project does not exist', async () => {
      mockProjectRepository.findProjectById.mockResolvedValue(null);

      const result = await getProposalsByProject('proj-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  // Lines 266-270: acceptProposal - proposal not found
  describe('acceptProposal', () => {
    it('should return NOT_FOUND when proposal does not exist', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue(null);

      const result = await acceptProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    // Lines 274-278: invalid status
    it('should return INVALID_STATUS when proposal is not pending', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({ id: 'prop-1', status: 'accepted', project_id: 'p-1' });

      const result = await acceptProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    // Lines 404-406: project not found
    it('should return NOT_FOUND when project does not exist', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({ id: 'prop-1', status: 'pending', project_id: 'p-1' });
      mockProjectRepository.findProjectById.mockResolvedValue(null);

      const result = await acceptProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    // Lines 451-453: unauthorized
    it('should return UNAUTHORIZED when employer does not own project', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({ id: 'prop-1', status: 'pending', project_id: 'p-1' });
      mockProjectRepository.findProjectById.mockResolvedValue({ id: 'p-1', employer_id: 'other-emp', milestones: [] });

      const result = await acceptProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    // Lines 472-476: no milestones
    it('should return NO_MILESTONES when project has no milestones', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({ id: 'prop-1', status: 'pending', project_id: 'p-1', proposed_rate: 1000 });
      mockProjectRepository.findProjectById.mockResolvedValue({ id: 'p-1', employer_id: 'emp-1', milestones: [] });

      const result = await acceptProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NO_MILESTONES');
    });

    // Lines 480-484: invalid proposal rate
    it('should return INVALID_PROPOSAL_RATE when rate is zero', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({ id: 'prop-1', status: 'pending', project_id: 'p-1', proposed_rate: 0 });
      mockProjectRepository.findProjectById.mockResolvedValue({ id: 'p-1', employer_id: 'emp-1', milestones: [{ amount: 500 }] });

      const result = await acceptProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_PROPOSAL_RATE');
    });

    // Lines 532-534: RPC failed
    it('should return UPDATE_FAILED when RPC fails', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({ id: 'prop-1', status: 'pending', project_id: 'p-1', proposed_rate: 1000, freelancer_id: 'f-1' });
      mockProjectRepository.findProjectById.mockResolvedValue({ id: 'p-1', employer_id: 'emp-1', milestones: [{ title: 'MS1', amount: 1000 }] });
      mockPool.query.mockResolvedValue({ rows: [{ result: false }] });

      const result = await acceptProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  // rejectProposal
  describe('rejectProposal', () => {
    it('should return NOT_FOUND when proposal does not exist', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue(null);

      const result = await rejectProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return INVALID_STATUS when proposal is not pending', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({ id: 'prop-1', status: 'accepted', project_id: 'p-1' });

      const result = await rejectProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return UNAUTHORIZED when employer does not own project', async () => {
      mockProposalRepository.findProposalById.mockResolvedValue({ id: 'prop-1', status: 'pending', project_id: 'p-1' });
      mockProjectRepository.findProjectById.mockResolvedValue({ id: 'p-1', employer_id: 'other-emp' });

      const result = await rejectProposal('prop-1', 'emp-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });
  });
});
