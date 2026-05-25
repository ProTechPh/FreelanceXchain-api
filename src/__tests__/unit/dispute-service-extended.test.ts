// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockContractRepo = {
  getContractById: jest.fn<any>(),
  updateContract: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepo,
}));

const mockProjectRepo = {
  findProjectById: jest.fn<any>(),
  updateProject: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepo,
}));

const mockDisputeRepo = {
  createDispute: jest.fn<any>(),
  getDisputeById: jest.fn<any>(),
  getDisputeByMilestone: jest.fn<any>(),
  updateDispute: jest.fn<any>(),
  getAllDisputesByContract: jest.fn<any>(),
  getDisputesByStatus: jest.fn<any>(),
  getDisputesByInitiator: jest.fn<any>(),
  getAllDisputes: jest.fn<any>(),
  getDisputesByUserId: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepo,
}));

const mockUserRepo = {
  getUserById: jest.fn<any>(),
  getUsersByRole: jest.fn<any>(),
};
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepo,
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: jest.fn().mockReturnValue('generated-id'),
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapContractFromEntity: (e: any) => ({ ...e, employerId: e.employer_id, freelancerId: e.freelancer_id, projectId: e.project_id }),
  mapProjectFromEntity: (e: any) => ({ ...e }),
  mapMilestoneFromEntity: (e: any) => ({ ...e }),
  mapDisputeFromEntity: (e: any) => ({ ...e, contractId: e.contract_id, milestoneId: e.milestone_id, initiatorId: e.initiator_id }),
}));

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  createNotification: jest.fn().mockResolvedValue({ success: true, data: { id: 'n-1' } }),
  notifyDisputeCreated: jest.fn().mockResolvedValue(undefined),
  notifyDisputeResolved: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  sendNotificationToUser: jest.fn(),
  notificationEmitter: { emitToUser: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/services/dispute-registry.ts'), () => ({
  createDisputeOnBlockchain: jest.fn().mockResolvedValue(undefined),
  resolveDisputeOnBlockchain: jest.fn().mockResolvedValue(undefined),
  updateDisputeEvidence: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  disputeAgreement: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  getEscrowByContractId: jest.fn().mockResolvedValue(null),
  releaseMilestone: jest.fn().mockResolvedValue(undefined),
  refundMilestone: jest.fn().mockResolvedValue(undefined),
}));

describe('Dispute Service - Extended Coverage', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/dispute-service.js');
  };

  describe('createDispute', () => {
    it('should fail when contract not found', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce(null);

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'user-1', reason: 'Bad work' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when contract is not active', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'user-2', project_id: 'p-1', status: 'completed' });

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'user-1', reason: 'Bad work' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_CONTRACT_STATUS');
    });

    it('should fail when initiator is not part of contract', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'emp-1', freelancer_id: 'fl-1', project_id: 'p-1', status: 'active' });

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'outsider', reason: 'Bad work' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when project not found', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'user-2', project_id: 'p-1', status: 'active' });
      mockProjectRepo.findProjectById.mockResolvedValueOnce(null);

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'user-1', reason: 'Bad work' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when milestone not found', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'user-2', project_id: 'p-1', status: 'active' });
      mockProjectRepo.findProjectById.mockResolvedValueOnce({ id: 'p-1', milestones: [] });

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'user-1', reason: 'Bad work' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when milestone is already disputed', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'user-2', project_id: 'p-1', status: 'active' });
      mockProjectRepo.findProjectById.mockResolvedValueOnce({ id: 'p-1', milestones: [{ id: 'ms-1', status: 'disputed', title: 'Phase 1', amount: 500 }] });

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'user-1', reason: 'Bad work' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('ALREADY_DISPUTED');
    });

    it('should fail when milestone is approved', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'user-2', project_id: 'p-1', status: 'active' });
      mockProjectRepo.findProjectById.mockResolvedValueOnce({ id: 'p-1', milestones: [{ id: 'ms-1', status: 'approved', title: 'Phase 1', amount: 500 }] });

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'user-1', reason: 'Bad work' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should fail when milestone is pending', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'user-2', project_id: 'p-1', status: 'active' });
      mockProjectRepo.findProjectById.mockResolvedValueOnce({ id: 'p-1', milestones: [{ id: 'ms-1', status: 'pending', title: 'Phase 1', amount: 500 }] });

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'user-1', reason: 'Bad work' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should fail when duplicate dispute exists', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'user-2', project_id: 'p-1', status: 'active' });
      mockProjectRepo.findProjectById.mockResolvedValueOnce({ id: 'p-1', milestones: [{ id: 'ms-1', status: 'submitted', title: 'Phase 1', amount: 500 }] });
      mockDisputeRepo.getDisputeByMilestone.mockResolvedValueOnce({ id: 'd-existing', status: 'open' });

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'user-1', reason: 'Bad work' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_DISPUTE');
    });

    it('should create dispute successfully', async () => {
      const { createDispute } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'user-2', project_id: 'p-1', status: 'active' });
      mockProjectRepo.findProjectById.mockResolvedValueOnce({ id: 'p-1', title: 'Project', milestones: [{ id: 'ms-1', status: 'submitted', title: 'Phase 1', amount: 500 }] });
      mockDisputeRepo.getDisputeByMilestone.mockResolvedValueOnce(null);
      mockDisputeRepo.createDispute.mockResolvedValueOnce({ id: 'generated-id', contract_id: 'c-1', milestone_id: 'ms-1', initiator_id: 'user-1', reason: 'Bad work', status: 'open', evidence: [], resolution: null, created_at: '2025-01-01', updated_at: '2025-01-01' });
      mockUserRepo.getUserById.mockResolvedValue({ id: 'user-1', wallet_address: null });
      mockUserRepo.getUsersByRole.mockResolvedValue([]);
      mockProjectRepo.updateProject.mockResolvedValue({});
      mockContractRepo.updateContract.mockResolvedValue({});

      const result = await createDispute({ contractId: 'c-1', milestoneId: 'ms-1', initiatorId: 'user-1', reason: 'Bad work' });
      expect(result.success).toBe(true);
    });
  });

  describe('submitEvidence', () => {
    it('should fail when dispute not found', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepo.getDisputeById.mockResolvedValueOnce(null);

      const result = await submitEvidence({ disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'Evidence' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when dispute is resolved', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepo.getDisputeById.mockResolvedValueOnce({ id: 'd-1', status: 'resolved', contract_id: 'c-1' });

      const result = await submitEvidence({ disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'Evidence' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should fail when contract not found', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepo.getDisputeById.mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1' });
      mockContractRepo.getContractById.mockResolvedValueOnce(null);

      const result = await submitEvidence({ disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'Evidence' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when submitter is not part of contract', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepo.getDisputeById.mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1' });
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'emp-1', freelancer_id: 'fl-1' });

      const result = await submitEvidence({ disputeId: 'd-1', submitterId: 'outsider', type: 'text', content: 'Evidence' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should submit evidence successfully', async () => {
      const { submitEvidence } = await importModule();
      mockDisputeRepo.getDisputeById
        .mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1' })
        .mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1', evidence: [{ id: 'ev-1' }] });
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'fl-1' });
      mockPool.query.mockResolvedValueOnce({ rows: [{ result: true }] });
      mockUserRepo.getUserById.mockResolvedValue({ id: 'user-1', wallet_address: null });

      const result = await submitEvidence({ disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'Evidence' });
      expect(result.success).toBe(true);
    });
  });

  describe('resolveDispute', () => {
    it('should fail when resolver is not admin', async () => {
      const { resolveDispute } = await importModule();

      const result = await resolveDispute({ disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'Good work', resolvedBy: 'user-1', resolverRole: 'freelancer' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when dispute not found', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepo.getDisputeById.mockResolvedValueOnce(null);

      const result = await resolveDispute({ disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'Good work', resolvedBy: 'admin-1', resolverRole: 'admin' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when dispute is already resolved', async () => {
      const { resolveDispute } = await importModule();
      mockDisputeRepo.getDisputeById.mockResolvedValueOnce({ id: 'd-1', status: 'resolved', contract_id: 'c-1' });

      const result = await resolveDispute({ disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'Good work', resolvedBy: 'admin-1', resolverRole: 'admin' });
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('ALREADY_RESOLVED');
    });
  });

  describe('getDisputeById', () => {
    it('should return dispute when found', async () => {
      const { getDisputeById } = await importModule();
      mockDisputeRepo.getDisputeById.mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1', milestone_id: 'ms-1', initiator_id: 'user-1' });

      const result = await getDisputeById('d-1');
      expect(result.success).toBe(true);
    });

    it('should return NOT_FOUND when not found', async () => {
      const { getDisputeById } = await importModule();
      mockDisputeRepo.getDisputeById.mockResolvedValueOnce(null);

      const result = await getDisputeById('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('getDisputesByContract', () => {
    it('should return disputes for authorized user', async () => {
      const { getDisputesByContract } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'user-1', freelancer_id: 'user-2' });
      mockDisputeRepo.getAllDisputesByContract.mockResolvedValueOnce([{ id: 'd-1', contract_id: 'c-1', milestone_id: 'ms-1', initiator_id: 'user-1', status: 'open' }]);

      const result = await getDisputesByContract('c-1', 'user-1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should fail when contract not found', async () => {
      const { getDisputesByContract } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce(null);

      const result = await getDisputesByContract('nonexistent', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not part of contract', async () => {
      const { getDisputesByContract } = await importModule();
      mockContractRepo.getContractById.mockResolvedValueOnce({ id: 'c-1', employer_id: 'emp-1', freelancer_id: 'fl-1' });

      const result = await getDisputesByContract('c-1', 'outsider');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('getAllDisputes', () => {
    it('should return all disputes for admin', async () => {
      const { getAllDisputes } = await importModule();
      mockDisputeRepo.getAllDisputes.mockResolvedValueOnce({ items: [{ id: 'd-1', contract_id: 'c-1', milestone_id: 'ms-1', initiator_id: 'user-1', status: 'open' }], hasMore: false });

      const result = await getAllDisputes('admin-1', 'admin', { limit: 20 });
      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(1);
    });

    it('should return user disputes for non-admin', async () => {
      const { getAllDisputes } = await importModule();
      mockDisputeRepo.getDisputesByUserId.mockResolvedValueOnce({ items: [{ id: 'd-1', contract_id: 'c-1', milestone_id: 'ms-1', initiator_id: 'user-1', status: 'open' }], hasMore: true });

      const result = await getAllDisputes('user-1', 'freelancer', { limit: 10, offset: 0 });
      expect(result.success).toBe(true);
      expect(result.data.continuationToken).toBe('10');
    });

    it('should handle errors', async () => {
      const { getAllDisputes } = await importModule();
      mockDisputeRepo.getAllDisputes.mockRejectedValueOnce(new Error('DB error'));

      const result = await getAllDisputes('admin-1', 'admin');
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('FETCH_FAILED');
    });
  });
});
