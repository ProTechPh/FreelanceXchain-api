// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockPool = { query: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: mockPool,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'gen-id',
}));

const mockRefundMilestone = jest.fn();
jest.unstable_mockModule(resolveModule('src/services/escrow-blockchain.ts'), () => ({
  refundMilestone: mockRefundMilestone,
}));

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  createNotification: jest.fn().mockResolvedValue({ success: true, data: { id: 'notif-1' } }),
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  sendNotificationToUser: jest.fn().mockResolvedValue(undefined),
}));

const { approveRefund } = await import('../../services/escrow-refund-service.js');

describe('Escrow Refund - blockchain milestone refund catch (line 205)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should catch and log when blockchain refundMilestone fails', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ref-1', contract_id: 'c-1', status: 'pending', escrow_address: '0xabc', reason: 'Cancel', requested_by: 'u-1', approved_by: null, freelancer_id: 'u-2', employer_id: 'u-1', total_amount: 1000, contract_status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ref-1', status: 'approved' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'm-1', status: 'pending', contract_id: 'c-1', due_date: new Date() }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'c-1', status: 'cancelled' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    mockRefundMilestone.mockRejectedValue(new Error('Blockchain refund failed'));

    const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'u-2' });
    expect(result.success).toBe(true);
    expect(mockRefundMilestone).toHaveBeenCalled();
  });
});
