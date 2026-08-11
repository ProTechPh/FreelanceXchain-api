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

const mockRequestMilestoneCompletion = jest.fn(async () => ({ success: true, data: {} }));
jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
  requestMilestoneCompletion: mockRequestMilestoneCompletion,
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

describe('Milestone Service - freelancer context & submission flow', () => {
  const importModule = async () => {
    return await import('../../services/milestone-service.js');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockContractRepository.getContractsByFreelancer.mockReset();
    mockContractRepository.getContractsByEmployer.mockReset();
    mockProjectRepository.findProjectById.mockReset();
    mockRequestMilestoneCompletion.mockReset();
    mockRequestMilestoneCompletion.mockResolvedValue({ success: true, data: {} });
  });

  describe('findFreelancerMilestoneContext', () => {
    it('prefers active contracts and falls back to older contracts', async () => {
      const { findFreelancerMilestoneContext } = await importModule();

      const active = makeContract({ id: 'c-active', created_at: '2025-01-01T00:00:00.000Z', status: 'active' });
      const completed = makeContract({ id: 'c-old', project_id: 'p-old', created_at: '2024-01-01T00:00:00.000Z', status: 'completed' });
      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [completed, active], total: 2 });
      // Active contract's project has no matching milestone -> continue to the older one
      mockProjectRepository.findProjectById
        .mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-other' })]))
        .mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-1' })], { id: 'p-old' }));

      const context = await findFreelancerMilestoneContext('freelancer-1', 'ms-1');

      expect(context).not.toBeNull();
      expect(context?.contractId).toBe('c-old');
      expect(context?.milestoneIndex).toBe(0);
      expect(context?.milestone.id).toBe('ms-1');
      // active contract was scanned first, then the completed fallback
      expect(mockProjectRepository.findProjectById).toHaveBeenNthCalledWith(1, 'p-1');
      expect(mockProjectRepository.findProjectById).toHaveBeenNthCalledWith(2, 'p-old');
    });

    it('returns null when the milestone is not in any contract project', async () => {
      const { findFreelancerMilestoneContext } = await importModule();

      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [makeContract({ created_at: now() })], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([]));

      const context = await findFreelancerMilestoneContext('freelancer-1', 'ms-missing');

      expect(context).toBeNull();
    });

    it('skips contracts whose project document is missing', async () => {
      const { findFreelancerMilestoneContext } = await importModule();

      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [makeContract({ created_at: now() })], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(null);

      const context = await findFreelancerMilestoneContext('freelancer-1', 'ms-1');

      expect(context).toBeNull();
    });

    it('sorts same-status contracts by created_at (newest first)', async () => {
      const { findFreelancerMilestoneContext } = await importModule();

      const older = makeContract({ id: 'c-old', project_id: 'p-old', created_at: '2024-01-01T00:00:00.000Z', status: 'completed' });
      const newer = makeContract({ id: 'c-new', project_id: 'p-new', created_at: '2025-01-01T00:00:00.000Z', status: 'completed' });
      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [older, newer], total: 2 });
      // Newer contract scanned first (no matching milestone), then the older one
      mockProjectRepository.findProjectById
        .mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-other' })]))
        .mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-1' })], { id: 'p-old' }));

      const context = await findFreelancerMilestoneContext('freelancer-1', 'ms-1');

      expect(context?.contractId).toBe('c-old');
      expect(mockProjectRepository.findProjectById).toHaveBeenNthCalledWith(1, 'p-new');
      expect(mockProjectRepository.findProjectById).toHaveBeenNthCalledWith(2, 'p-old');
    });
  });

  describe('mapMilestoneResponse', () => {
    it('maps camelCase milestone fields into the API response shape', async () => {
      const { mapMilestoneResponse } = await importModule();

      const milestone = makeMilestone({
        deliverableFiles: [{ filename: 'a.pdf', url: 'http://x/a.pdf', size: 1, mimeType: 'application/pdf' }],
        revisionCount: 2,
        submittedAt: '2025-02-01T00:00:00.000Z',
        approvedAt: '2025-02-02T00:00:00.000Z',
        notes: 'needs review',
      });
      const project = makeProject([milestone]);

      const mapped = mapMilestoneResponse(milestone, 'c-1', project);

      expect(mapped).toEqual(expect.objectContaining({
        id: 'ms-1',
        contractId: 'c-1',
        dueDate: '2025-01-01',
        status: 'pending',
        deliverableFiles: [{ filename: 'a.pdf', url: 'http://x/a.pdf', size: 1, mimeType: 'application/pdf' }],
        revisionCount: 2,
        submittedAt: '2025-02-01T00:00:00.000Z',
        approvedAt: '2025-02-02T00:00:00.000Z',
        notes: 'needs review',
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      }));
    });

    it('falls back to snake_case fields', async () => {
      const { mapMilestoneResponse } = await importModule();

      const milestone = makeMilestone({
        deliverable_files: [{ filename: 'b.pdf', url: 'http://x/b.pdf', size: 2, mimeType: 'application/pdf' }],
        revision_count: 3,
        submitted_at: '2025-03-01T00:00:00.000Z',
        approved_at: '2025-03-02T00:00:00.000Z',
        rejected_at: '2025-03-03T00:00:00.000Z',
        completed_at: '2025-03-04T00:00:00.000Z',
        rejection_reason: 'redo',
      });
      const project = makeProject([milestone]);

      const mapped = mapMilestoneResponse(milestone, 'c-1', project);

      expect(mapped).toEqual(expect.objectContaining({
        deliverableFiles: [{ filename: 'b.pdf', url: 'http://x/b.pdf', size: 2, mimeType: 'application/pdf' }],
        revisionCount: 3,
        submittedAt: '2025-03-01T00:00:00.000Z',
        approvedAt: '2025-03-02T00:00:00.000Z',
        rejectedAt: '2025-03-03T00:00:00.000Z',
        completedAt: '2025-03-04T00:00:00.000Z',
        rejectionReason: 'redo',
      }));
    });

    it('uses submittedAtIso when the milestone has no timestamp fields', async () => {
      const { mapMilestoneResponse } = await importModule();

      const mapped = mapMilestoneResponse(makeMilestone({}), 'c-1', makeProject([]), '2025-04-01T00:00:00.000Z');

      expect(mapped.submittedAt).toBe('2025-04-01T00:00:00.000Z');
      expect(mapped.revisionCount).toBe(0);
      expect(mapped.deliverableFiles).toEqual([]);
    });
  });

  describe('submitMilestoneFromProjectContext', () => {
    it('submits the milestone through the payment service and returns the updated milestone', async () => {
      const { submitMilestoneFromProjectContext } = await importModule();

      const contract = makeContract({ created_at: now() });
      const milestone = makeMilestone({ status: 'pending' });
      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [contract], total: 1 });
      mockProjectRepository.findProjectById
        .mockResolvedValueOnce(makeProject([milestone]))
        .mockResolvedValueOnce(makeProject([{ ...milestone, status: 'submitted', submitted_at: now() }]));

      const result = await submitMilestoneFromProjectContext(
        'ms-1',
        'freelancer-1',
        [{ filename: 'f1.pdf', url: 'http://x/f1.pdf', size: 1, mimeType: 'application/pdf' }],
        'see attached'
      );

      expect(result.success).toBe(true);
      expect(mockRequestMilestoneCompletion).toHaveBeenCalledWith('c-1', 'ms-1', 'freelancer-1', {
        deliverables: [{ filename: 'f1.pdf', url: 'http://x/f1.pdf', size: 1, mimeType: 'application/pdf' }],
        notes: 'see attached',
      });
      if (result.success) {
        expect(result.data.status).toBe('submitted');
        expect(result.data.contractId).toBe('c-1');
      }
    });

    it('returns NOT_FOUND when the milestone cannot be located', async () => {
      const { submitMilestoneFromProjectContext } = await importModule();

      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [], total: 0 });

      const result = await submitMilestoneFromProjectContext('ms-1', 'freelancer-1', []);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('returns the completion error when the payment service rejects', async () => {
      const { submitMilestoneFromProjectContext } = await importModule();

      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [makeContract({ created_at: now() })], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([makeMilestone()]));
      mockRequestMilestoneCompletion.mockResolvedValueOnce({ success: false, error: { code: 'SUBMIT_FAILED', message: 'Escrow rejected' } });

      const result = await submitMilestoneFromProjectContext('ms-1', 'freelancer-1', []);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SUBMIT_FAILED');
        expect(result.error.message).toBe('Escrow rejected');
      }
    });

    it('returns SUBMIT_FAILED when the payment service throws', async () => {
      const { submitMilestoneFromProjectContext } = await importModule();

      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [makeContract({ created_at: now() })], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([makeMilestone()]));
      mockRequestMilestoneCompletion.mockRejectedValueOnce(new Error('Escrow contract unavailable'));

      const result = await submitMilestoneFromProjectContext('ms-1', 'freelancer-1', []);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SUBMIT_FAILED');
        expect(result.error.message).toBe('Escrow contract unavailable');
      }
    });

    it('returns NOT_FOUND when the project document disappears after completion', async () => {
      const { submitMilestoneFromProjectContext } = await importModule();

      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [makeContract({ created_at: now() })], total: 1 });
      mockProjectRepository.findProjectById
        .mockResolvedValueOnce(makeProject([makeMilestone()]))
        .mockResolvedValueOnce(null);

      const result = await submitMilestoneFromProjectContext('ms-1', 'freelancer-1', []);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('returns NOT_FOUND when the milestone is missing from the updated project', async () => {
      const { submitMilestoneFromProjectContext } = await importModule();

      mockContractRepository.getContractsByFreelancer.mockResolvedValueOnce({ items: [makeContract({ created_at: now() })], total: 1 });
      mockProjectRepository.findProjectById
        .mockResolvedValueOnce(makeProject([makeMilestone()]))
        .mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-other' })]));

      const result = await submitMilestoneFromProjectContext('ms-1', 'freelancer-1', []);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('findEmployerMilestoneContractId', () => {
    it('returns the contract id that contains the milestone', async () => {
      const { findEmployerMilestoneContractId } = await importModule();

      mockContractRepository.getContractsByEmployer.mockResolvedValueOnce({ items: [makeContract()], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-1' })]));

      const contractId = await findEmployerMilestoneContractId('employer-1', 'ms-1');

      expect(contractId).toBe('c-1');
    });

    it('skips projects without the milestone and keeps scanning', async () => {
      const { findEmployerMilestoneContractId } = await importModule();

      mockContractRepository.getContractsByEmployer.mockResolvedValueOnce({
        items: [
          makeContract({ id: 'c-1', project_id: 'p-1' }),
          makeContract({ id: 'c-2', project_id: 'p-2' }),
        ],
        total: 2,
      });
      mockProjectRepository.findProjectById
        .mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-other' })]))
        .mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-1' })], { id: 'p-2' }));

      const contractId = await findEmployerMilestoneContractId('employer-1', 'ms-1');

      expect(contractId).toBe('c-2');
    });

    it('returns null when the project document is missing', async () => {
      const { findEmployerMilestoneContractId } = await importModule();

      mockContractRepository.getContractsByEmployer.mockResolvedValueOnce({ items: [makeContract()], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(null);

      const contractId = await findEmployerMilestoneContractId('employer-1', 'ms-1');

      expect(contractId).toBeNull();
    });

    it('returns null when the milestone is nowhere to be found', async () => {
      const { findEmployerMilestoneContractId } = await importModule();

      mockContractRepository.getContractsByEmployer.mockResolvedValueOnce({ items: [makeContract()], total: 1 });
      mockProjectRepository.findProjectById.mockResolvedValueOnce(makeProject([makeMilestone({ id: 'ms-other' })]));

      const contractId = await findEmployerMilestoneContractId('employer-1', 'ms-1');

      expect(contractId).toBeNull();
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
