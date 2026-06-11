// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockDisputeRepository = {
  getDisputeById: jest.fn<any>(),
  createDispute: jest.fn<any>(),
  updateDispute: jest.fn<any>(),
  getDisputeByMilestone: jest.fn<any>(),
  getAllDisputesByContract: jest.fn<any>(),
  getDisputesByStatus: jest.fn<any>(),
  getDisputesByInitiator: jest.fn<any>(),
  getAllDisputes: jest.fn<any>(),
  getDisputesByUserId: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepository,
}));

const mockContractRepository = {
  getContractById: jest.fn<any>(),
  updateContract: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

const mockProjectRepository = {
  findProjectById: jest.fn<any>(),
  updateProject: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockUserRepository = {
  getUserById: jest.fn<any>(),
  getUsersByRole: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
}));

const mockClientQuery = jest.fn<any>().mockImplementation(async (text: string, params?: any[]) => {
  if (typeof text === 'string' && text.includes('SELECT id FROM project_milestones')) {
    return { rows: [{ id: params?.[0] || 'm-1' }], rowCount: 1 };
  }
  if (typeof text === 'string' && text.includes('SELECT id FROM disputes WHERE milestone_id')) {
    return { rows: [], rowCount: 0 };
  }
  return { rows: [], rowCount: 0 };
});
const mockClient = {
  query: mockClientQuery,
  release: jest.fn(),
};

const coverageDisputeStore = new Map<string, any>();

const mockPool = { query: jest.fn<any>().mockImplementation(async (text: string, params?: any[]) => {
  if (typeof text === 'string' && text.includes('SELECT * FROM disputes') && text.includes('FOR UPDATE')) {
    const disputeId = params?.[0];
    const dispute = coverageDisputeStore.get(disputeId);
    if (dispute) return { rows: [dispute], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }
  return { rows: [], rowCount: 0 };
}), connect: jest.fn<any>().mockResolvedValue(mockClient) };
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
  mapContractFromEntity: (entity: any) => ({
    ...entity,
    freelancerId: entity.freelancer_id,
    employerId: entity.employer_id,
    projectId: entity.project_id,
  }),
  mapProjectFromEntity: (entity: any) => ({ ...entity }),
  mapMilestoneFromEntity: (entity: any) => ({ ...entity }),
  mapDisputeFromEntity: (entity: any) => ({ ...entity, contractId: entity.contract_id }),
}));

const mockGetEscrowByContractId = jest.fn<any>();
const mockReleaseMilestone = jest.fn<any>();
const mockRefundMilestone = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/escrow-contract.ts'), () => ({
  getEscrowByContractId: mockGetEscrowByContractId,
  releaseMilestone: mockReleaseMilestone,
  refundMilestone: mockRefundMilestone,
}));

const mockCreateDisputeOnBlockchain = jest.fn<any>();
const mockUpdateDisputeEvidence = jest.fn<any>();
const mockResolveDisputeOnBlockchain = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/dispute-registry.ts'), () => ({
  createDisputeOnBlockchain: mockCreateDisputeOnBlockchain,
  updateDisputeEvidence: mockUpdateDisputeEvidence,
  resolveDisputeOnBlockchain: mockResolveDisputeOnBlockchain,
}));

const mockDisputeAgreement = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/agreement-contract.ts'), () => ({
  disputeAgreement: mockDisputeAgreement,
}));

const mockNotifyDisputeCreated = jest.fn<any>();
const mockNotifyDisputeResolved = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  notifyDisputeCreated: mockNotifyDisputeCreated,
  notifyDisputeResolved: mockNotifyDisputeResolved,
}));

const {
  createDispute,
  submitEvidence,
  resolveDispute,
  getDisputeById,
  getDisputesByContract,
  getOpenDisputes,
  getDisputesByInitiator,
  getAllDisputes,
} = await import('../../services/dispute-service.js');

describe('Dispute Service - Coverage2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    coverageDisputeStore.clear();
    // Re-apply pool.query mock implementation after clearAllMocks
    mockPool.query.mockImplementation(async (text: string, params?: any[]) => {
      if (typeof text === 'string' && text.includes('SELECT * FROM disputes') && text.includes('FOR UPDATE')) {
        const disputeId = params?.[0];
        const dispute = coverageDisputeStore.get(disputeId);
        if (dispute) return { rows: [dispute], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    mockClientQuery.mockImplementation(async (text: string, params?: any[]) => {
      if (typeof text === 'string' && text.includes('SELECT id FROM project_milestones')) {
        return { rows: [{ id: params?.[0] || 'm-1' }], rowCount: 1 };
      }
      if (typeof text === 'string' && text.includes('SELECT id FROM disputes WHERE milestone_id')) {
        const milestoneId = params?.[0];
        for (const dispute of coverageDisputeStore.values()) {
          if (dispute.milestone_id === milestoneId && dispute.status !== 'resolved') {
            return { rows: [{ id: dispute.id }], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  describe('createDispute', () => {
    it('should return NOT_FOUND when contract does not exist', async () => {
      mockContractRepository.getContractById.mockResolvedValue(null);

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'user-1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return INVALID_CONTRACT_STATUS for non-active contract', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'completed', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_CONTRACT_STATUS');
    });

    it('should return UNAUTHORIZED when initiator is not part of contract', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'outsider', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return NOT_FOUND when project does not exist', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue(null);

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return NOT_FOUND when milestone does not exist', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', milestones: [{ id: 'm-other', status: 'submitted' }],
      });

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return ALREADY_DISPUTED when milestone is already disputed', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', milestones: [{ id: 'm-1', status: 'disputed' }],
      });

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ALREADY_DISPUTED');
    });

    it('should return INVALID_STATUS for approved milestone', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', milestones: [{ id: 'm-1', status: 'approved' }],
      });

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return INVALID_STATUS for pending milestone', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', milestones: [{ id: 'm-1', status: 'pending' }],
      });

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return DUPLICATE_DISPUTE when active dispute exists', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', milestones: [{ id: 'm-1', status: 'submitted', amount: 100, title: 'MS1' }],
      });
      // Pre-populate store with an existing active dispute for this milestone
      coverageDisputeStore.set('d-existing', { id: 'd-existing', milestone_id: 'm-1', status: 'open' });
      mockDisputeRepository.getDisputeByMilestone.mockResolvedValue({ id: 'd-existing', status: 'open' });

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DUPLICATE_DISPUTE');
    });

    it('should create dispute successfully with blockchain recording', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', title: 'Test Project', milestones: [{ id: 'm-1', status: 'submitted', amount: 100, title: 'MS1' }],
      });
      mockDisputeRepository.getDisputeByMilestone.mockResolvedValue(null);
      mockDisputeRepository.createDispute.mockResolvedValue({
        id: 'generated-id', contract_id: 'c-1', milestone_id: 'm-1',
        initiator_id: 'emp-1', reason: 'test', evidence: [], status: 'open',
        resolution: null, created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'emp-1', wallet_address: '0x123' });
      mockUserRepository.getUsersByRole.mockResolvedValue([]);
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockNotifyDisputeCreated.mockResolvedValue(undefined);

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(true);
    });

    it('should handle blockchain error gracefully during dispute creation', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', title: 'Test Project', milestones: [{ id: 'm-1', status: 'submitted', amount: 100, title: 'MS1' }],
      });
      mockDisputeRepository.getDisputeByMilestone.mockResolvedValue(null);
      mockDisputeRepository.createDispute.mockResolvedValue({
        id: 'generated-id', contract_id: 'c-1', milestone_id: 'm-1',
        initiator_id: 'emp-1', reason: 'test', evidence: [], status: 'open',
        resolution: null, created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'emp-1', wallet_address: '0x123' });
      mockCreateDisputeOnBlockchain.mockRejectedValue(new Error('Blockchain error'));
      mockUserRepository.getUsersByRole.mockResolvedValue([]);
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockNotifyDisputeCreated.mockResolvedValue(undefined);

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(true);
    });

    it('should handle admin notification error gracefully', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', title: 'Test Project', milestones: [{ id: 'm-1', status: 'submitted', amount: 100, title: 'MS1' }],
      });
      mockDisputeRepository.getDisputeByMilestone.mockResolvedValue(null);
      mockDisputeRepository.createDispute.mockResolvedValue({
        id: 'generated-id', contract_id: 'c-1', milestone_id: 'm-1',
        initiator_id: 'emp-1', reason: 'test', evidence: [], status: 'open',
        resolution: null, created_at: '2025-01-01', updated_at: '2025-01-01',
      });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'emp-1', wallet_address: null });
      mockUserRepository.getUsersByRole.mockRejectedValue(new Error('DB error'));
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockNotifyDisputeCreated.mockResolvedValue(undefined);

      const result = await createDispute({
        contractId: 'c-1', milestoneId: 'm-1', initiatorId: 'emp-1', reason: 'test',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('submitEvidence - additional paths', () => {
    it('should submit evidence successfully and update blockchain', async () => {
      mockDisputeRepository.getDisputeById
        .mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1' })
        .mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1', evidence: [{ id: 'e-1' }] });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'user-1', freelancer_id: 'free-1' });
      mockPool.query.mockResolvedValue({ rows: [{ result: true }] });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'user-1', wallet_address: '0x123' });

      const result = await submitEvidence({
        disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(true);
      expect(mockUpdateDisputeEvidence).toHaveBeenCalled();
    });

    it('should handle blockchain evidence update error gracefully', async () => {
      mockDisputeRepository.getDisputeById
        .mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1' })
        .mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1', evidence: [{ id: 'e-1' }] });
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'user-1', freelancer_id: 'free-1' });
      mockPool.query.mockResolvedValue({ rows: [{ result: true }] });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'user-1', wallet_address: '0x123' });
      mockUpdateDisputeEvidence.mockRejectedValue(new Error('Blockchain error'));

      const result = await submitEvidence({
        disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(true);
    });

    it('should return UPDATE_FAILED when updated dispute cannot be retrieved', async () => {
      mockDisputeRepository.getDisputeById
        .mockResolvedValueOnce({ id: 'd-1', status: 'open', contract_id: 'c-1' })
        .mockResolvedValueOnce(null);
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'user-1', freelancer_id: 'free-1' });
      mockPool.query.mockResolvedValue({ rows: [{ result: true }] });

      const result = await submitEvidence({
        disputeId: 'd-1', submitterId: 'user-1', type: 'text', content: 'evidence',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('resolveDispute - additional paths', () => {
    const setupResolveDispute = () => {
      const disputeData = {
        id: 'd-1', status: 'open', contract_id: 'c-1', milestone_id: 'm-1',
      };
      mockDisputeRepository.getDisputeById.mockResolvedValue(disputeData);
      coverageDisputeStore.set('d-1', disputeData);
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', title: 'Test', milestones: [{ id: 'm-1', status: 'disputed', amount: 100, title: 'MS1' }],
      });
    };

    it('should return NOT_FOUND when contract not found during resolve', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue({
        id: 'd-1', status: 'open', contract_id: 'c-1', milestone_id: 'm-1',
      });
      mockContractRepository.getContractById.mockResolvedValue(null);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return NOT_FOUND when project not found during resolve', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue({
        id: 'd-1', status: 'open', contract_id: 'c-1', milestone_id: 'm-1',
      });
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue(null);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return NOT_FOUND when milestone not found during resolve', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue({
        id: 'd-1', status: 'open', contract_id: 'c-1', milestone_id: 'm-1',
      });
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', title: 'Test', milestones: [{ id: 'm-other', status: 'disputed' }],
      });

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNSUPPORTED_DECISION for split decision', async () => {
      setupResolveDispute();

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'split', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNSUPPORTED_DECISION');
    });

    it('should resolve in freelancer favor with escrow release', async () => {
      setupResolveDispute();
      mockGetEscrowByContractId.mockResolvedValue({ address: '0xescrow', employerAddress: '0xemp' });
      mockReleaseMilestone.mockResolvedValue(undefined);
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockDisputeRepository.updateDispute.mockResolvedValue({
        id: 'd-1', status: 'resolved', contract_id: 'c-1', milestone_id: 'm-1',
        resolution: { decision: 'freelancer_favor' },
      });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'admin-1', wallet_address: '0xadmin' });
      mockNotifyDisputeResolved.mockResolvedValue(undefined);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(true);
      expect(mockReleaseMilestone).toHaveBeenCalledWith('0xescrow', 'm-1', '0xemp');
    });

    it('should resolve in employer favor with escrow refund', async () => {
      setupResolveDispute();
      mockGetEscrowByContractId.mockResolvedValue({ address: '0xescrow', employerAddress: '0xemp' });
      mockRefundMilestone.mockResolvedValue(undefined);
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockDisputeRepository.updateDispute.mockResolvedValue({
        id: 'd-1', status: 'resolved', contract_id: 'c-1', milestone_id: 'm-1',
        resolution: { decision: 'employer_favor' },
      });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'admin-1', wallet_address: '0xadmin' });
      mockNotifyDisputeResolved.mockResolvedValue(undefined);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'employer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(true);
      expect(mockRefundMilestone).toHaveBeenCalledWith('0xescrow', 'm-1', '0xemp');
    });

    it('should handle no escrow record gracefully', async () => {
      setupResolveDispute();
      mockGetEscrowByContractId.mockResolvedValue(null);
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockDisputeRepository.updateDispute.mockResolvedValue({
        id: 'd-1', status: 'resolved', contract_id: 'c-1', milestone_id: 'm-1',
        resolution: { decision: 'freelancer_favor' },
      });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'admin-1', wallet_address: null });
      mockNotifyDisputeResolved.mockResolvedValue(undefined);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(true);
    });

    it('should handle no escrow with employer_favor decision (line 427)', async () => {
      setupResolveDispute();
      mockGetEscrowByContractId.mockResolvedValue(null);
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockDisputeRepository.updateDispute.mockResolvedValue({
        id: 'd-1', status: 'resolved', contract_id: 'c-1', milestone_id: 'm-1',
        resolution: { decision: 'employer_favor' },
      });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'admin-1', wallet_address: null });
      mockNotifyDisputeResolved.mockResolvedValue(undefined);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'employer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(true);
    });

    it('should set contract to active when not all milestones done (line 476)', async () => {
      // Setup with multiple milestones - one disputed (being resolved), one still pending
      const disputeData = {
        id: 'd-1', status: 'open', contract_id: 'c-1', milestone_id: 'm-1',
      };
      mockDisputeRepository.getDisputeById.mockResolvedValue(disputeData);
      coverageDisputeStore.set('d-1', disputeData);
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', title: 'Test', milestones: [
          { id: 'm-1', status: 'disputed', amount: 100, title: 'MS1' },
          { id: 'm-2', status: 'pending', amount: 200, title: 'MS2' }, // not done
        ],
      });
      mockGetEscrowByContractId.mockResolvedValue(null);
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockDisputeRepository.updateDispute.mockResolvedValue({
        id: 'd-1', status: 'resolved', contract_id: 'c-1', milestone_id: 'm-1',
        resolution: { decision: 'freelancer_favor' },
      });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'admin-1', wallet_address: null });
      mockNotifyDisputeResolved.mockResolvedValue(undefined);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(true);
      // Contract should be set to 'active' since m-2 is still pending
      expect(mockContractRepository.updateContract).toHaveBeenCalledWith(
        'c-1', expect.objectContaining({ status: 'active' })
      );
    });

    it('should return PAYMENT_FAILED when escrow operation throws', async () => {
      setupResolveDispute();
      mockGetEscrowByContractId.mockRejectedValue(new Error('Escrow error'));

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('PAYMENT_FAILED');
    });

    it('should return UPDATE_FAILED when dispute update fails', async () => {
      setupResolveDispute();
      mockGetEscrowByContractId.mockResolvedValue({ address: '0xescrow', employerAddress: '0xemp' });
      mockReleaseMilestone.mockResolvedValue(undefined);
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockDisputeRepository.updateDispute.mockResolvedValue(null);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UPDATE_FAILED');
    });

    it('should mark contract completed when all milestones done', async () => {
      const disputeData = {
        id: 'd-1', status: 'open', contract_id: 'c-1', milestone_id: 'm-1',
      };
      mockDisputeRepository.getDisputeById.mockResolvedValue(disputeData);
      coverageDisputeStore.set('d-1', disputeData);
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', employer_id: 'emp-1', freelancer_id: 'free-1', project_id: 'p-1',
      });
      mockProjectRepository.findProjectById.mockResolvedValue({
        id: 'p-1', title: 'Test', milestones: [
          { id: 'm-1', status: 'disputed', amount: 100, title: 'MS1' },
          { id: 'm-2', status: 'approved', amount: 200, title: 'MS2' },
        ],
      });
      mockGetEscrowByContractId.mockResolvedValue({ address: '0xescrow', employerAddress: '0xemp' });
      mockReleaseMilestone.mockResolvedValue(undefined);
      mockProjectRepository.updateProject.mockResolvedValue(true);
      mockContractRepository.updateContract.mockResolvedValue(true);
      mockDisputeRepository.updateDispute.mockResolvedValue({
        id: 'd-1', status: 'resolved', contract_id: 'c-1', milestone_id: 'm-1',
        resolution: { decision: 'freelancer_favor' },
      });
      mockUserRepository.getUserById.mockResolvedValue({ id: 'admin-1', wallet_address: null });
      mockNotifyDisputeResolved.mockResolvedValue(undefined);

      const result = await resolveDispute({
        disputeId: 'd-1', decision: 'freelancer_favor', reasoning: 'test', resolvedBy: 'admin-1', resolverRole: 'admin',
      });
      expect(result.success).toBe(true);
      expect(mockContractRepository.updateContract).toHaveBeenCalledWith('c-1', { status: 'completed' });
    });
  });

  describe('getDisputeById', () => {
    it('should return NOT_FOUND when dispute does not exist', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue(null);
      const result = await getDisputeById('d-1');
      expect(result.success).toBe(false);
    });

    it('should return dispute on success', async () => {
      mockDisputeRepository.getDisputeById.mockResolvedValue({ id: 'd-1', status: 'open' });
      const result = await getDisputeById('d-1');
      expect(result.success).toBe(true);
    });
  });

  describe('getDisputesByContract', () => {
    it('should return NOT_FOUND when contract does not exist', async () => {
      mockContractRepository.getContractById.mockResolvedValue(null);
      const result = await getDisputesByContract('c-1', 'user-1');
      expect(result.success).toBe(false);
    });

    it('should return UNAUTHORIZED when user is not part of contract', async () => {
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'emp-1', freelancer_id: 'free-1' });
      const result = await getDisputesByContract('c-1', 'outsider');
      expect(result.success).toBe(false);
    });

    it('should return disputes on success', async () => {
      mockContractRepository.getContractById.mockResolvedValue({ employer_id: 'user-1', freelancer_id: 'free-1' });
      mockDisputeRepository.getAllDisputesByContract.mockResolvedValue([{ id: 'd-1' }]);
      const result = await getDisputesByContract('c-1', 'user-1');
      expect(result.success).toBe(true);
    });
  });

  describe('getOpenDisputes', () => {
    it('should return combined open and under_review disputes', async () => {
      mockDisputeRepository.getDisputesByStatus
        .mockResolvedValueOnce({ items: [{ id: 'd-1', status: 'open' }] })
        .mockResolvedValueOnce({ items: [{ id: 'd-2', status: 'under_review' }] });
      const result = await getOpenDisputes();
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.length).toBe(2);
    });
  });

  describe('getDisputesByInitiator', () => {
    it('should return disputes by initiator', async () => {
      mockDisputeRepository.getDisputesByInitiator.mockResolvedValue({ items: [{ id: 'd-1' }] });
      const result = await getDisputesByInitiator('user-1');
      expect(result.success).toBe(true);
    });
  });

  describe('getAllDisputes', () => {
    it('should return all disputes for admin', async () => {
      mockDisputeRepository.getAllDisputes.mockResolvedValue({ items: [{ id: 'd-1' }], hasMore: false });
      const result = await getAllDisputes('admin-1', 'admin', { limit: 10, offset: 0 });
      expect(result.success).toBe(true);
    });

    it('should return user disputes for non-admin', async () => {
      mockDisputeRepository.getDisputesByUserId.mockResolvedValue({ items: [{ id: 'd-1' }], hasMore: true });
      const result = await getAllDisputes('user-1', 'freelancer', { limit: 10, offset: 0, status: 'open' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.continuationToken).toBe('10');
    });

    it('should return FETCH_FAILED on error', async () => {
      mockDisputeRepository.getAllDisputes.mockRejectedValue(new Error('DB error'));
      const result = await getAllDisputes('admin-1', 'admin');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('FETCH_FAILED');
    });
  });
});
