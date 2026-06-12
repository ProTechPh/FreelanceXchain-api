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

const mockPoolObj = { query: jest.fn(), connect: jest.fn(), on: jest.fn() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPoolObj,
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

describe('Dispute Evidence Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = mockPoolObj;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/dispute-evidence-service.js');
  };

  describe('submitEvidence', () => {
    it('should submit evidence successfully', async () => {
      const { submitEvidence } = await importModule();

      // Verify dispute exists
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'dispute-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', arbiter_id: 'arbiter-1' }],
        rowCount: 1,
      });
      // Insert evidence
      const evidence = { id: 'ev-1', dispute_id: 'dispute-1', submitted_by: 'freelancer-1', evidence_type: 'document', file_url: 'https://file.com/doc.pdf', description: 'Work proof' };
      mockPool.query.mockResolvedValueOnce({ rows: [evidence], rowCount: 1 });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Work proof',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(evidence);
      // Should notify arbiter and other party
      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    });

    it('should submit evidence when no arbiter assigned', async () => {
      const { submitEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'dispute-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', arbiter_id: null }],
        rowCount: 1,
      });
      const evidence = { id: 'ev-1', dispute_id: 'dispute-1', submitted_by: 'freelancer-1' };
      mockPool.query.mockResolvedValueOnce({ rows: [evidence], rowCount: 1 });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'screenshot',
        fileUrl: 'https://file.com/img.png',
        description: 'Screenshot',
      });

      expect(result.success).toBe(true);
      // Only notify other party, not arbiter
      expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    });

    it('should fail when dispute not found', async () => {
      const { submitEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await submitEvidence({
        disputeId: 'nonexistent',
        submittedBy: 'user-1',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Proof',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DISPUTE_NOT_FOUND');
    });

    it('should fail when user is not involved in dispute', async () => {
      const { submitEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'dispute-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', arbiter_id: null }],
        rowCount: 1,
      });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'outsider',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Proof',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle insert failure', async () => {
      const { submitEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'dispute-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', arbiter_id: null }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Proof',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SUBMIT_FAILED');
    });

    it('should handle database errors', async () => {
      const { submitEvidence } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await submitEvidence({
        disputeId: 'dispute-1',
        submittedBy: 'freelancer-1',
        evidenceType: 'document',
        fileUrl: 'https://file.com/doc.pdf',
        description: 'Proof',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SUBMIT_FAILED');
    });
  });

  describe('getDisputeEvidence', () => {
    it('should return evidence for authorized user (freelancer)', async () => {
      const { getDisputeEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'dispute-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', arbiter_id: null }],
        rowCount: 1,
      });
      const evidenceList = [
        { id: 'ev-1', dispute_id: 'dispute-1', submitted_by: 'freelancer-1' },
        { id: 'ev-2', dispute_id: 'dispute-1', submitted_by: 'employer-1' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: evidenceList, rowCount: 2 });

      const result = await getDisputeEvidence('dispute-1', 'freelancer-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should allow arbiter to view evidence', async () => {
      const { getDisputeEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'dispute-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', arbiter_id: 'arbiter-1' }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'ev-1' }], rowCount: 1 });

      const result = await getDisputeEvidence('dispute-1', 'arbiter-1');

      expect(result.success).toBe(true);
    });

    it('should fail when dispute not found', async () => {
      const { getDisputeEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getDisputeEvidence('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DISPUTE_NOT_FOUND');
    });

    it('should fail when user is not authorized', async () => {
      const { getDisputeEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'dispute-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', arbiter_id: null }],
        rowCount: 1,
      });

      const result = await getDisputeEvidence('dispute-1', 'outsider');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getDisputeEvidence } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getDisputeEvidence('dispute-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('deleteEvidence', () => {
    it('should delete evidence successfully', async () => {
      const { deleteEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ev-1', submitted_by: 'user-1', verified_at: null }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await deleteEvidence('ev-1', 'user-1');

      expect(result.success).toBe(true);
    });

    it('should fail when evidence not found', async () => {
      const { deleteEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await deleteEvidence('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EVIDENCE_NOT_FOUND');
    });

    it('should fail when user is not the submitter', async () => {
      const { deleteEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ev-1', submitted_by: 'other-user', verified_at: null }],
        rowCount: 1,
      });

      const result = await deleteEvidence('ev-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when evidence is already verified', async () => {
      const { deleteEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ev-1', submitted_by: 'user-1', verified_at: '2025-01-01' }],
        rowCount: 1,
      });

      const result = await deleteEvidence('ev-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('ALREADY_VERIFIED');
    });

    it('should handle database errors', async () => {
      const { deleteEvidence } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await deleteEvidence('ev-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DELETE_FAILED');
    });
  });

  describe('verifyEvidence', () => {
    it('should verify evidence successfully', async () => {
      const { verifyEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ev-1', arbiter_id: 'arbiter-1', dispute_id: 'dispute-1' }],
        rowCount: 1,
      });
      const updated = { id: 'ev-1', verified_by: 'arbiter-1', verified_at: '2025-01-01' };
      mockPool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

      const result = await verifyEvidence({
        evidenceId: 'ev-1',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
    });

    it('should fail when evidence not found', async () => {
      const { verifyEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await verifyEvidence({
        evidenceId: 'nonexistent',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('EVIDENCE_NOT_FOUND');
    });

    it('should fail when user is not the arbiter', async () => {
      const { verifyEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ev-1', arbiter_id: 'other-arbiter', dispute_id: 'dispute-1' }],
        rowCount: 1,
      });

      const result = await verifyEvidence({
        evidenceId: 'ev-1',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle update failure', async () => {
      const { verifyEvidence } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'ev-1', arbiter_id: 'arbiter-1', dispute_id: 'dispute-1' }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await verifyEvidence({
        evidenceId: 'ev-1',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VERIFY_FAILED');
    });

    it('should handle database errors', async () => {
      const { verifyEvidence } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await verifyEvidence({
        evidenceId: 'ev-1',
        verifiedBy: 'arbiter-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VERIFY_FAILED');
    });
  });
});
