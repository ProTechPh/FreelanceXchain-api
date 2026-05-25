// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockPool = { query: jest.fn<any>() };

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

const mockSendNotificationToUser = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  sendNotificationToUser: mockSendNotificationToUser,
}));

const mockCreateNotification = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  createNotification: mockCreateNotification,
}));

jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  refundMilestone: jest.fn<any>(),
}));

const {
  createRefundRequest,
  approveRefund,
  rejectRefund,
  getContractRefunds,
} = await import('../../services/escrow-refund-service.js');

describe('Escrow Refund Service - Coverage2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateNotification.mockResolvedValue({ success: true, data: { id: 'n-1' } });
    mockSendNotificationToUser.mockResolvedValue(undefined);
  });

  describe('createRefundRequest', () => {
    it('should return CONTRACT_NOT_FOUND when contract does not exist', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'user-1', reason: 'Not satisfied',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should return INVALID_STATUS for non-active contract', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'c-1', status: 'completed', freelancer_id: 'f-1', employer_id: 'e-1' }],
      });
      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'e-1', reason: 'Not satisfied',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return UNAUTHORIZED when requester is not involved', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'c-1', status: 'active', freelancer_id: 'f-1', employer_id: 'e-1' }],
      });
      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'outsider', reason: 'Not satisfied',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return DUPLICATE_REQUEST when pending refund exists', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'c-1', status: 'active', freelancer_id: 'f-1', employer_id: 'e-1', total_amount: 1000 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-refund' }] });

      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'e-1', reason: 'Not satisfied',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DUPLICATE_REQUEST');
    });

    it('should create refund request successfully (full amount)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'c-1', status: 'active', freelancer_id: 'f-1', employer_id: 'e-1', total_amount: 1000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'ref-1', contract_id: 'c-1', status: 'pending', amount: 1000 }] });

      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'e-1', reason: 'Not satisfied',
      });
      expect(result.success).toBe(true);
    });

    it('should create partial refund request', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'c-1', status: 'active', freelancer_id: 'f-1', employer_id: 'e-1', total_amount: 1000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'ref-1', contract_id: 'c-1', status: 'pending', amount: 500, is_partial: true }] });

      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'f-1', reason: 'Partial work', amount: 500,
      });
      expect(result.success).toBe(true);
    });

    it('should handle database error during creation', async () => {
      mockPool.query.mockRejectedValue(new Error('DB connection error'));
      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'e-1', reason: 'Not satisfied',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('CREATE_FAILED');
    });
  });

  describe('approveRefund - additional paths', () => {
    it('should approve refund successfully with blockchain execution', async () => {
      // First query: get refund with contract details
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'ref-1', contract_id: 'c-1', status: 'pending',
            requested_by: 'f-1', freelancer_id: 'f-1', employer_id: 'e-1',
            escrow_address: '0x123', total_amount: 1000,
          }],
        })
        // UPDATE refund_requests
        .mockResolvedValueOnce({ rows: [{ id: 'ref-1', status: 'approved' }] })
        // SELECT milestones
        .mockResolvedValueOnce({ rows: [{ id: 'm-1', status: 'pending', index: 0 }, { id: 'm-2', status: 'approved', index: 1 }] })
        // UPDATE contracts
        .mockResolvedValueOnce({ rows: [] })
        // UPDATE other refund_requests
        .mockResolvedValueOnce({ rows: [] });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'e-1' });
      expect(result.success).toBe(true);
    });

    it('should approve refund without escrow address', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'ref-1', contract_id: 'c-1', status: 'pending',
            requested_by: 'f-1', freelancer_id: 'f-1', employer_id: 'e-1',
            escrow_address: null, total_amount: 1000,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'ref-1', status: 'approved' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'e-1' });
      expect(result.success).toBe(true);
    });

    it('should handle general error during approval', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));
      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'e-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('APPROVE_FAILED');
    });
  });

  describe('rejectRefund', () => {
    it('should return REFUND_NOT_FOUND when refund does not exist', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'e-1', reason: 'No reason' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('REFUND_NOT_FOUND');
    });

    it('should return UNAUTHORIZED when rejector is not the other party', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', status: 'pending',
          requested_by: 'f-1', freelancer_id: 'f-1', employer_id: 'e-1',
        }],
      });
      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'outsider', reason: 'No reason' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return INVALID_STATUS when refund is not pending', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', status: 'approved',
          requested_by: 'f-1', freelancer_id: 'f-1', employer_id: 'e-1',
        }],
      });
      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'e-1', reason: 'No reason' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should reject refund successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'ref-1', contract_id: 'c-1', status: 'pending',
            requested_by: 'f-1', freelancer_id: 'f-1', employer_id: 'e-1',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'ref-1', status: 'rejected' }] });

      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'e-1', reason: 'Work was done' });
      expect(result.success).toBe(true);
    });

    it('should handle database error during rejection', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));
      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'e-1', reason: 'No reason' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('REJECT_FAILED');
    });
  });

  describe('getContractRefunds', () => {
    it('should return CONTRACT_NOT_FOUND when contract does not exist', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await getContractRefunds('c-1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not involved', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'c-1', freelancer_id: 'f-1', employer_id: 'e-1' }],
      });
      const result = await getContractRefunds('c-1', 'outsider');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return refunds on success', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'c-1', freelancer_id: 'f-1', employer_id: 'e-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'ref-1', status: 'pending' }] });

      const result = await getContractRefunds('c-1', 'f-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.length).toBe(1);
    });

    it('should handle database error', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));
      const result = await getContractRefunds('c-1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });
});
