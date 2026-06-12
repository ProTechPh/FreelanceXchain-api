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

const mockRefundMilestone = jest.fn<any>().mockResolvedValue({ success: true });
jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  refundMilestone: mockRefundMilestone,
}));

const mockQuery = jest.fn();
(globalThis as any).mockPool = { query: mockQuery };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockQuery, connect: jest.fn(), on: jest.fn() },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: mockQuery,
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));

describe('Escrow Refund Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    mockPool.query.mockReset();
  });

  const importModule = async () => {
    return await import('../../services/escrow-refund-service.js');
  };

  describe('createRefundRequest', () => {
    it('should create refund request successfully', async () => {
      const { createRefundRequest } = await importModule();

      // Get contract
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 }],
        rowCount: 1,
      });
      // Check existing pending refunds
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Insert refund request
      const refund = { id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', amount: 1000, status: 'pending' };
      mockPool.query.mockResolvedValueOnce({ rows: [refund], rowCount: 1 });

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        reason: 'Project cancelled',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(refund);
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('should create partial refund request', async () => {
      const { createRefundRequest } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const refund = { id: 'ref-1', contract_id: 'c-1', requested_by: 'employer-1', amount: 500, is_partial: true, status: 'pending' };
      mockPool.query.mockResolvedValueOnce({ rows: [refund], rowCount: 1 });

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'employer-1',
        amount: 500,
        reason: 'Partial work done',
      });

      expect(result.success).toBe(true);
    });

    it('should fail when contract not found', async () => {
      const { createRefundRequest } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await createRefundRequest({
        contractId: 'nonexistent',
        requestedBy: 'user-1',
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should fail when contract is not active', async () => {
      const { createRefundRequest } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'completed', total_amount: 1000 }],
        rowCount: 1,
      });

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should fail when user is not involved in contract', async () => {
      const { createRefundRequest } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 }],
        rowCount: 1,
      });

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'outsider',
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when pending refund already exists', async () => {
      const { createRefundRequest } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-ref' }], rowCount: 1 });

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_REQUEST');
    });

    it('should handle insert failure', async () => {
      const { createRefundRequest } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CREATE_FAILED');
    });

    it('should handle database errors', async () => {
      const { createRefundRequest } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CREATE_FAILED');
    });
  });

  describe('approveRefund', () => {
    it('should approve refund successfully', async () => {
      const { approveRefund } = await importModule();

      // Get refund with contract info
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000, contract_status: 'active',
          escrow_address: null,
        }],
        rowCount: 1,
      });
      // Update refund
      const updated = { id: 'ref-1', status: 'approved', approved_by: 'employer-1' };
      mockPool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });
      // Update contract status
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Cancel other pending refunds
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(true);
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('should fail when refund not found', async () => {
      const { approveRefund } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await approveRefund({
        refundId: 'nonexistent',
        approvedBy: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REFUND_NOT_FOUND');
    });

    it('should fail when approver is not the other party', async () => {
      const { approveRefund } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000,
        }],
        rowCount: 1,
      });

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'freelancer-1', // Same as requester
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when refund is not pending', async () => {
      const { approveRefund } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'approved',
          freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000,
        }],
        rowCount: 1,
      });

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should handle update failure', async () => {
      const { approveRefund } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000,
        }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('APPROVE_FAILED');
    });

    it('should handle database errors', async () => {
      const { approveRefund } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('APPROVE_FAILED');
    });
  });

  describe('rejectRefund', () => {
    it('should reject refund successfully', async () => {
      const { rejectRefund } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        }],
        rowCount: 1,
      });
      const updated = { id: 'ref-1', status: 'rejected', rejected_by: 'employer-1', rejection_reason: 'Work was delivered' };
      mockPool.query.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

      const result = await rejectRefund({
        refundId: 'ref-1',
        rejectedBy: 'employer-1',
        reason: 'Work was delivered',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('should fail when refund not found', async () => {
      const { rejectRefund } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await rejectRefund({
        refundId: 'nonexistent',
        rejectedBy: 'user-1',
        reason: 'No reason',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REFUND_NOT_FOUND');
    });

    it('should fail when rejector is not the other party', async () => {
      const { rejectRefund } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        }],
        rowCount: 1,
      });

      const result = await rejectRefund({
        refundId: 'ref-1',
        rejectedBy: 'freelancer-1', // Same as requester
        reason: 'No',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should fail when refund is not pending', async () => {
      const { rejectRefund } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'rejected',
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        }],
        rowCount: 1,
      });

      const result = await rejectRefund({
        refundId: 'ref-1',
        rejectedBy: 'employer-1',
        reason: 'Already rejected',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should handle update failure', async () => {
      const { rejectRefund } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        }],
        rowCount: 1,
      });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await rejectRefund({
        refundId: 'ref-1',
        rejectedBy: 'employer-1',
        reason: 'No',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REJECT_FAILED');
    });

    it('should handle database errors', async () => {
      const { rejectRefund } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await rejectRefund({
        refundId: 'ref-1',
        rejectedBy: 'employer-1',
        reason: 'No',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REJECT_FAILED');
    });
  });

  describe('getContractRefunds', () => {
    it('should return refunds for authorized user', async () => {
      const { getContractRefunds } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1' }],
        rowCount: 1,
      });
      const refunds = [
        { id: 'ref-1', contract_id: 'c-1', status: 'pending' },
        { id: 'ref-2', contract_id: 'c-1', status: 'rejected' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: refunds, rowCount: 2 });

      const result = await getContractRefunds('c-1', 'freelancer-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should fail when contract not found', async () => {
      const { getContractRefunds } = await importModule();

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await getContractRefunds('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should fail when user is not involved', async () => {
      const { getContractRefunds } = await importModule();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1' }],
        rowCount: 1,
      });

      const result = await getContractRefunds('c-1', 'outsider');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getContractRefunds } = await importModule();

      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const result = await getContractRefunds('c-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });
});
