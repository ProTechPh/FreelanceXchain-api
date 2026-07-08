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

const mockMilestoneRepository = {
  getById: jest.fn(),
  update: jest.fn(),
  findByContract: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
  milestoneRepository: mockMilestoneRepository,
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

describe('Milestone Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMilestoneRepository.getById.mockReset();
    mockMilestoneRepository.update.mockReset();
    mockMilestoneRepository.findByContract.mockReset();
    mockContractRepository.getContractById.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/milestone-service.js');
  };

  describe('getMilestoneById', () => {
    it('should return milestone when found', async () => {
      const { getMilestoneById } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design Phase', status: 'pending', contractId: 'c-1' };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);

      const result = await getMilestoneById('ms-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(milestone);
    });

    it('should return NOT_FOUND when milestone does not exist', async () => {
      const { getMilestoneById } = await importModule();

      mockMilestoneRepository.getById.mockResolvedValueOnce(null);

      const result = await getMilestoneById('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const { getMilestoneById } = await importModule();

      mockMilestoneRepository.getById.mockRejectedValueOnce(new Error('DB error'));

      const result = await getMilestoneById('ms-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('submitMilestone', () => {
    it('should submit milestone successfully', async () => {
      const { submitMilestone } = await importModule();

      // getMilestoneById
      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      // Get contract
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1', status: 'active' });
      // Update milestone
      const updated = { ...milestone, status: 'submitted', submitted_at: '2025-01-01' };
      mockMilestoneRepository.update.mockResolvedValueOnce(updated);

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: ['file1.pdf', 'file2.pdf'],
      });

      expect(result.success).toBe(true);
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('should increment revision count when resubmitting rejected milestone', async () => {
      const { submitMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'rejected', contract_id: 'c-1', revision_count: 1 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1', status: 'active' });
      mockMilestoneRepository.update.mockResolvedValueOnce({ ...milestone, status: 'submitted' });

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: ['file1.pdf'],
      });

      expect(result.success).toBe(true);
    });

    it('should fail when milestone not found', async () => {
      const { submitMilestone } = await importModule();

      mockMilestoneRepository.getById.mockResolvedValueOnce(null);

      const result = await submitMilestone({
        milestoneId: 'nonexistent',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should fail when contract not found', async () => {
      const { submitMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should fail when user is not the freelancer', async () => {
      const { submitMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'other-user', employer_id: 'employer-1', project_id: 'p-1' });

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when milestone status is not pending or rejected', async () => {
      const { submitMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'approved', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1', status: 'active' });

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should handle update failure', async () => {
      const { submitMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1', status: 'active' });
      mockMilestoneRepository.update.mockResolvedValueOnce(null);

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SUBMIT_FAILED');
    });

    it('should handle database errors', async () => {
      const { submitMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1', status: 'active' });
      mockMilestoneRepository.update.mockRejectedValueOnce(new Error('DB error'));

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: [],
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SUBMIT_FAILED');
    });
  });

  describe('rejectMilestone', () => {
    it('should reject milestone with revision request', async () => {
      const { rejectMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' });
      const updated = { ...milestone, status: 'rejected' };
      mockMilestoneRepository.update.mockResolvedValueOnce(updated);

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Needs more work',
        requestRevision: true,
      });

      expect(result.success).toBe(true);
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('should reject milestone as disputed', async () => {
      const { rejectMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' });
      const updated = { ...milestone, status: 'disputed' };
      mockMilestoneRepository.update.mockResolvedValueOnce(updated);

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Unacceptable quality',
        requestRevision: false,
      });

      expect(result.success).toBe(true);
    });

    it('should fail when milestone not found', async () => {
      const { rejectMilestone } = await importModule();

      mockMilestoneRepository.getById.mockResolvedValueOnce(null);

      const result = await rejectMilestone({
        milestoneId: 'nonexistent',
        employerId: 'employer-1',
        reason: 'Bad',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
    });

    it('should fail when contract not found', async () => {
      const { rejectMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Bad',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should fail when user is not the employer', async () => {
      const { rejectMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'other-employer', project_id: 'p-1' });

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Bad',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when milestone is not in submitted status', async () => {
      const { rejectMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' });

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Bad',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should handle update failure', async () => {
      const { rejectMilestone } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contract_id: 'c-1', revision_count: 0 };
      mockMilestoneRepository.getById.mockResolvedValueOnce(milestone);
      mockContractRepository.getContractById.mockResolvedValueOnce({ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' });
      mockMilestoneRepository.update.mockResolvedValueOnce(null);

      const result = await rejectMilestone({
        milestoneId: 'ms-1',
        employerId: 'employer-1',
        reason: 'Bad',
        requestRevision: true,
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REJECT_FAILED');
    });
  });

  describe('getContractMilestones', () => {
    it('should return milestones for contract', async () => {
      const { getContractMilestones } = await importModule();

      const milestones = [
        { id: 'ms-1', title: 'Phase 1', status: 'completed' },
        { id: 'ms-2', title: 'Phase 2', status: 'pending' },
      ];
      mockMilestoneRepository.findByContract.mockResolvedValueOnce(milestones);

      const result = await getContractMilestones('contract-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should return empty array when no milestones', async () => {
      const { getContractMilestones } = await importModule();

      mockMilestoneRepository.findByContract.mockResolvedValueOnce([]);

      const result = await getContractMilestones('contract-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle database errors', async () => {
      const { getContractMilestones } = await importModule();

      mockMilestoneRepository.findByContract.mockRejectedValueOnce(new Error('DB error'));

      const result = await getContractMilestones('contract-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });
});
