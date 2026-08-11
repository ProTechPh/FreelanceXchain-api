// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockCreateNotification = jest.fn<any>().mockResolvedValue({ success: true, data: { id: 'notif-1' } });
const mockSendNotificationToUser = jest.fn<any>().mockReturnValue({ success: true });

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  createNotification: mockCreateNotification,
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  sendNotificationToUser: mockSendNotificationToUser,
  notificationEmitter: { emitToUser: jest.fn() },
}));

const mockContractRepository = {
  getContractById: jest.fn(),
  updateContract: jest.fn(),
  getContractsByFreelancer: jest.fn(),
  getContractsByEmployer: jest.fn(),
  getContractsByProject: jest.fn(),
  getUserContracts: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

const mockProjectRepository = {
  findProjectById: jest.fn(),
  updateProject: jest.fn(),
  getProjectById: jest.fn(),
  createProject: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

const mockDisputeRepository = {
  createDispute: jest.fn<any>().mockResolvedValue({ id: 'dispute-1' }),
  getById: jest.fn(),
  findByContract: jest.fn(),
  update: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/dispute-repository.ts'), () => ({
  disputeRepository: mockDisputeRepository,
}));

// Audit-log repository (BLF-12.2 milestone audit trail)
const mockAuditLogRepo = { create: jest.fn() };
jest.unstable_mockModule(resolveModule('src/repositories/audit-log-repository.ts'), () => ({
  auditLogRepository: mockAuditLogRepo,
}));

const now = () => new Date().toISOString();

function makeContract(overrides = {}) {
  return {
    id: 'c-1',
    project_id: 'p-1',
    freelancer_id: 'freelancer-1',
    employer_id: 'employer-1',
    status: 'active',
    ...overrides,
  };
}

function makeProject(milestones, overrides = {}) {
  return {
    id: 'p-1',
    title: 'Project',
    milestones,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

function makeMilestone(overrides = {}) {
  return {
    id: 'ms-1',
    title: 'Design Phase',
    description: 'Design',
    amount: 500,
    due_date: '2025-01-01',
    status: 'pending',
    revision_count: 0,
    ...overrides,
  };
}

describe('Milestone Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContractRepository.getUserContracts.mockReset();
    mockProjectRepository.findProjectById.mockReset();
    mockProjectRepository.updateProject.mockReset();
    mockContractRepository.getContractById.mockReset();
    mockAuditLogRepo.create.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/milestone-service.js');
  };

  describe('getMilestoneById', () => {
    it('should return milestone with contract when found', async () => {
      const { getMilestoneById } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'pending' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));

      const result = await getMilestoneById('ms-1', 'freelancer-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.milestone).toEqual(expect.objectContaining({
          id: 'ms-1',
          contract_id: 'c-1',
          project_id: 'p-1',
        }));
        expect(result.data.contract).toEqual(contract);
      }
    });

    it('should return NOT_FOUND when the project document is missing', async () => {
      const { getMilestoneById } = await importModule();

      const contract = makeContract();
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      // Project document deleted/missing — the milestone cannot be located
      mockProjectRepository.findProjectById.mockResolvedValueOnce(null);

      const result = await getMilestoneById('ms-1', 'freelancer-1');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should find the milestone across multiple user contracts', async () => {
      const { getMilestoneById } = await importModule();

      const contractA = makeContract({ id: 'c-1', project_id: 'p-1' });
      const contractB = makeContract({ id: 'c-2', project_id: 'p-2' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contractA, contractB], total: 2 });
      // First contract's project has no matching milestone (continue branch)
      mockProjectRepository.findProjectById
        .mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-other' })]))
        .mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-1' })], { id: 'p-2' }));

      const result = await getMilestoneById('ms-1', 'freelancer-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contract.id).toBe('c-2');
        expect(result.data.milestone.project_id).toBe('p-2');
      }
    });

    it('should return NOT_FOUND when milestone does not exist in any of the user contracts', async () => {
      const { getMilestoneById } = await importModule();

      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await getMilestoneById('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const { getMilestoneById } = await importModule();

      mockContractRepository.getUserContracts.mockRejectedValueOnce(new Error('DB error'));

      const result = await getMilestoneById('ms-1', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });

    it('should return UNAUTHORIZED when no userId provided', async () => {
      const { getMilestoneById } = await importModule();

      const result = await getMilestoneById('ms-1');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('submitMilestone', () => {
    it('should submit milestone successfully', async () => {
      const { submitMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'pending' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));
      mockProjectRepository.updateProject.mockResolvedValueOnce(
        makeProject([{ ...milestone, status: 'submitted', submitted_at: now() }])
      );

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [{ filename: 'f1.pdf', url: 'http://x/f1.pdf', size: 1, mimeType: 'application/pdf' }],
      });

      expect(result.success).toBe(true);
      expect(mockProjectRepository.updateProject).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({
          milestones: expect.arrayContaining([
            expect.objectContaining({ id: 'ms-1', status: 'submitted' }),
          ]),
        })
      );
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('should persist notes when provided', async () => {
      const { submitMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'pending' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));
      mockProjectRepository.updateProject.mockResolvedValueOnce(
        makeProject([{ ...milestone, status: 'submitted', notes: 'see attached' }])
      );

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
        notes: 'see attached',
      });

      expect(result.success).toBe(true);
      const updateCall = mockProjectRepository.updateProject.mock.calls[0];
      expect(updateCall[1].milestones[0].notes).toBe('see attached');
    });

    it('should increment revision count when resubmitting rejected milestone', async () => {
      const { submitMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'rejected', revision_count: 1 });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));
      mockProjectRepository.updateProject.mockResolvedValueOnce(
        makeProject([{ ...milestone, status: 'submitted' }])
      );

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(true);
      const updateCall = mockProjectRepository.updateProject.mock.calls[0];
      expect(updateCall[1].milestones[0].revision_count).toBe(2);
      expect(updateCall[1].milestones[0].revisionCount).toBe(2);
    });

    it('should fail when milestone not found', async () => {
      const { submitMilestone } = await importModule();

      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await submitMilestone({
        milestoneId: 'nonexistent',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the freelancer', async () => {
      const { submitMilestone } = await importModule();

      // The user finds the milestone as the EMPLOYER of the contract
      const contract = makeContract({ freelancer_id: 'other-freelancer' });
      const milestone = makeMilestone({ status: 'pending' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when contract is not active', async () => {
      const { submitMilestone } = await importModule();

      const contract = makeContract({ status: 'completed' });
      const milestone = makeMilestone({ status: 'pending' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS');
        expect(result.error.message).toContain('completed');
      }
    });

    it('should fail when milestone status is not pending or rejected', async () => {
      const { submitMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'approved' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should handle update failure', async () => {
      const { submitMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'pending' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));
      mockProjectRepository.updateProject.mockResolvedValueOnce(null);

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('SUBMIT_FAILED');
    });

    it('should handle database errors', async () => {
      const { submitMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'pending' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));
      mockProjectRepository.updateProject.mockRejectedValueOnce(new Error('DB error'));

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('SUBMIT_FAILED');
    });
  });

  describe('rejectMilestone', () => {
    it('should reject milestone with revision request', async () => {
      const { rejectMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'submitted', revision_count: 0 });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));
      mockProjectRepository.updateProject.mockResolvedValueOnce(
        makeProject([{ ...milestone, status: 'rejected' }])
      );

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Needs more work',
        requestRevision: true,
      });

      expect(result.success).toBe(true);
      expect(mockProjectRepository.updateProject).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({
          milestones: expect.arrayContaining([
            expect.objectContaining({ id: 'ms-1', status: 'rejected', rejected_at: expect.any(String) }),
          ]),
        })
      );
      expect(mockCreateNotification).toHaveBeenCalled();
      // BLF-12.2: rejection is audited with the employer as actor and the reason
      expect(mockAuditLogRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'freelancer-1',
        actor_id: 'employer-1',
        action: 'milestone.rejected',
        resource_type: 'milestone',
        resource_id: 'ms-1',
        payload: expect.objectContaining({
          contractId: 'c-1',
          reason: 'Needs more work',
          requestRevision: true,
        }),
      }));
    });

    it('should reject milestone as disputed and create a dispute record', async () => {
      const { rejectMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'submitted', revision_count: 0 });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));
      mockProjectRepository.updateProject.mockResolvedValueOnce(
        makeProject([{ ...milestone, status: 'disputed' }])
      );

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Unacceptable quality',
        requestRevision: false,
      });

      expect(result.success).toBe(true);
      expect(mockDisputeRepository.createDispute).toHaveBeenCalledWith(
        expect.objectContaining({
          contract_id: 'c-1',
          milestone_id: 'ms-1',
          status: 'open',
        })
      );
      // BLF-12.2: rejection-without-revision is audited as a milestone dispute
      expect(mockAuditLogRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        actor_id: 'employer-1',
        action: 'milestone.disputed',
        payload: expect.objectContaining({ requestRevision: false }),
      }));
    });

    it('should fail when milestone not found', async () => {
      const { rejectMilestone } = await importModule();

      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await rejectMilestone({
        milestoneId: 'nonexistent',
        employerId: 'employer-1',
        reason: 'Bad',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when user is not the employer', async () => {
      const { rejectMilestone } = await importModule();

      // The user finds the milestone as the FREELANCER of the contract
      const contract = makeContract({ employer_id: 'other-employer' });
      const milestone = makeMilestone({ status: 'submitted' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Bad',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when milestone is not in submitted status', async () => {
      const { rejectMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'pending' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Bad',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should fail when revision count reached the cap', async () => {
      const { rejectMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'submitted', revision_count: 5 });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Needs work',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('MAX_REVISIONS_REACHED');
    });

    it('should handle update failure', async () => {
      const { rejectMilestone } = await importModule();

      const contract = makeContract();
      const milestone = makeMilestone({ status: 'submitted' });
      mockContractRepository.getUserContracts.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([milestone]));
      mockProjectRepository.updateProject.mockResolvedValueOnce(null);

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Bad',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('REJECT_FAILED');
    });
  });

  describe('getContractMilestones', () => {
    it('should return milestones for contract', async () => {
      const { getContractMilestones } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce(makeContract());
      mockProjectRepository.findProjectById.mockResolvedValueOnce(
        makeProject([makeMilestone({ id: 'ms-1', status: 'submitted' }), makeMilestone({ id: 'ms-2', status: 'pending' })])
      );

      const result = await getContractMilestones('c-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]).toEqual(expect.objectContaining({ id: 'ms-1', contract_id: 'c-1', project_id: 'p-1' }));
      }
    });

    it('should return empty array when the project document is missing', async () => {
      const { getContractMilestones } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce(makeContract());
      mockProjectRepository.findProjectById.mockResolvedValueOnce(null);

      const result = await getContractMilestones('c-1');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual([]);
    });

    it('should return empty array when no milestones', async () => {
      const { getContractMilestones } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce(makeContract());
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([]));

      const result = await getContractMilestones('c-1');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual([]);
    });

    it('should handle database errors', async () => {
      const { getContractMilestones } = await importModule();

      mockContractRepository.getContractById.mockRejectedValueOnce(new Error('DB error'));

      const result = await getContractMilestones('c-1');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });

    // BLF-8.1: userId verification in getContractMilestones
    it('should return NOT_FOUND when contract does not exist for userId check', async () => {
      const { getContractMilestones } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await getContractMilestones('c-1', 'user-1');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not a contract party', async () => {
      const { getContractMilestones } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce(makeContract());

      const result = await getContractMilestones('c-1', 'random-user');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return milestones when user is employer party', async () => {
      const { getContractMilestones } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce(makeContract());
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([makeMilestone()]));

      const result = await getContractMilestones('c-1', 'employer-1');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toHaveLength(1);
    });

    it('should return milestones when user is freelancer party', async () => {
      const { getContractMilestones } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce(makeContract());
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([makeMilestone()]));

      const result = await getContractMilestones('c-1', 'freelancer-1');

      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toHaveLength(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Error-path / branch coverage
// ═══════════════════════════════════════════════════════════════

describe('milestone-service – error paths', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getMilestoneById catches non-Error throws with fallback message', async () => {
    mockContractRepository.getUserContracts.mockRejectedValue('raw string error');

    const { getMilestoneById } = await import(resolveModule('src/services/milestone-service.ts'));
    const result = await getMilestoneById('m1', 'employer-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DATABASE_ERROR');
      expect(result.error.message).toBe('Failed to get milestone');
    }
  });

  it('submitMilestone catches error when update fails', async () => {
    mockContractRepository.getUserContracts.mockResolvedValueOnce({
      items: [{ id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' }],
      total: 1,
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', status: 'pending', title: 'M1', revision_count: 0 }],
    });
    mockProjectRepository.updateProject.mockRejectedValueOnce('update failed');

    const { submitMilestone } = await import(resolveModule('src/services/milestone-service.ts'));
    const result = await submitMilestone({ milestoneId: 'm1', deliverables: [], freelancerId: 'f1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SUBMIT_FAILED');
      expect(result.error.message).toBe('Failed to submit milestone');
    }
  });

  it('rejectMilestone catches error when update fails', async () => {
    mockContractRepository.getUserContracts.mockResolvedValueOnce({
      items: [{ id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' }],
      total: 1,
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', status: 'submitted', title: 'M1', revision_count: 0 }],
    });
    mockProjectRepository.updateProject.mockRejectedValueOnce({ code: 500 });

    const { rejectMilestone } = await import(resolveModule('src/services/milestone-service.ts'));
    const result = await rejectMilestone({ milestoneId: 'm1', reason: 'bad', employerId: 'e1', requestRevision: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('REJECT_FAILED');
      expect(result.error.message).toBe('Failed to reject milestone');
    }
  });

  it('getContractMilestones catches non-Error throws', async () => {
    mockContractRepository.getContractById.mockRejectedValueOnce(null);

    const { getContractMilestones } = await import(resolveModule('src/services/milestone-service.ts'));
    const result = await getContractMilestones('c1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DATABASE_ERROR');
      expect(result.error.message).toBe('Failed to get milestones');
    }
  });

  it('rejectMilestone uses default reason when input.reason is empty', async () => {
    mockContractRepository.getUserContracts.mockResolvedValueOnce({
      items: [{ id: 'c1', project_id: 'p1', freelancer_id: 'f1', employer_id: 'e1', status: 'active' }],
      total: 1,
    });
    mockProjectRepository.findProjectById.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', status: 'submitted', title: 'M1', revision_count: 0 }],
    });
    mockProjectRepository.updateProject.mockResolvedValueOnce({
      id: 'p1', milestones: [{ id: 'm1', status: 'disputed' }],
    });

    const { rejectMilestone } = await import(resolveModule('src/services/milestone-service.ts'));
    const result = await rejectMilestone({ milestoneId: 'm1', employerId: 'e1', reason: '', requestRevision: false });
    expect(result.success).toBe(true);
    expect(mockDisputeRepository.createDispute).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Milestone rejected without revision' })
    );
  });
});
