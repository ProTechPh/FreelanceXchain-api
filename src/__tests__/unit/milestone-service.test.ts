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

describe('Milestone Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/milestone-service.js');
  };

  describe('getMilestoneById', () => {
    it('should return milestone when found', async () => {
      const { getMilestoneById } = await importModule();

      const milestone = { id: 'ms-1', title: 'Design Phase', status: 'pending', contractId: 'c-1' };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });

      const result = await getMilestoneById('ms-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(milestone);
    });

    it('should return NOT_FOUND when milestone does not exist', async () => {
      const { getMilestoneById } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getMilestoneById('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should handle database errors', async () => {
      const { getMilestoneById } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getMilestoneById('ms-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('submitMilestone', () => {
    it('should submit milestone successfully', async () => {
      const { submitMilestone } = await importModule();

      // getMilestoneById
      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      // Get contract
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });
      // Update milestone
      const updated = { ...milestone, status: 'submitted', submitted_at: '2025-01-01' };
      mockPool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'rejected', contractId: 'c-1', revisionCount: 1 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...milestone, status: 'submitted' }], rowCount: 1 });

      const result = await submitMilestone({
        milestoneId: 'ms-1',
        freelancerId: 'freelancer-1',
        deliverables: ['file1.pdf'],
      });

      expect(result.success).toBe(true);
    });

    it('should fail when milestone not found', async () => {
      const { submitMilestone } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'other-user', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'approved', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });
      const updated = { ...milestone, status: 'rejected' };
      mockPool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });
      const updated = { ...milestone, status: 'disputed' };
      mockPool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

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

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'other-employer', project_id: 'p-1' }], rowCount: 1 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'pending', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });

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

      const milestone = { id: 'ms-1', title: 'Design', status: 'submitted', contractId: 'c-1', revisionCount: 0 };
      mockPool.query.mockResolvedValueOnce({ rows: [milestone], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [{ freelancer_id: 'freelancer-1', employer_id: 'employer-1', project_id: 'p-1' }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

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
      mockPool.query.mockResolvedValueOnce({ rows: milestones, rowCount: 2 });

      const result = await getContractMilestones('contract-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should return empty array when no milestones', async () => {
      const { getContractMilestones } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getContractMilestones('contract-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle database errors', async () => {
      const { getContractMilestones } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getContractMilestones('contract-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });
});
