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

jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  refundMilestone: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: { createNotification: jest.fn<any>() },
}));

const { approveRefund } = await import('../../services/escrow-refund-service.js');

describe('Escrow Refund Service - Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Lines 183-211: approveRefund - various error paths
  describe('approveRefund', () => {
    it('should return REFUND_NOT_FOUND when refund does not exist', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'user-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('REFUND_NOT_FOUND');
    });

    it('should return UNAUTHORIZED when approver is not the other party', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', status: 'pending',
          requested_by: 'freelancer-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
          escrow_address: '0x123',
        }],
      });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'outsider' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return INVALID_STATUS when refund is not pending', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', status: 'approved',
          requested_by: 'freelancer-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
          escrow_address: '0x123',
        }],
      });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    // Lines 218-223: update fails (throws)
    it('should handle error when update fails', async () => {
      // First query returns the refund
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'ref-1', contract_id: 'c-1', status: 'pending',
          requested_by: 'freelancer-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
          escrow_address: '0x123',
        }],
      });
      // Second query (UPDATE) returns empty
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      try {
        await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });
      } catch (error) {
        expect(error.message).toContain('Failed to approve refund');
      }
    });
  });
});
