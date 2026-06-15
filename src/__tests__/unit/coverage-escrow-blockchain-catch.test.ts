// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

const mockRefundRequestRepository = {
  findWithContract: jest.fn(),
  update: jest.fn(),
  findByContract: jest.fn(),
  findPendingByContract: jest.fn(),
  create: jest.fn(),
};

const mockContractRepository = {
  getContractById: jest.fn(),
  updateContract: jest.fn(),
};

const mockMilestoneRepository = {
  findByContract: jest.fn(),
};

jest.unstable_mockModule(resolveModule('src/repositories/refund-request-repository.ts'), () => ({
  refundRequestRepository: mockRefundRequestRepository,
}));

jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
  milestoneRepository: mockMilestoneRepository,
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
    mockRefundRequestRepository.findWithContract.mockResolvedValue({
      id: 'ref-1',
      contract_id: 'c-1',
      status: 'pending',
      reason: 'Cancel',
      requested_by: 'u-1',
      approved_by: null,
      contract: {
        id: 'c-1',
        status: 'active',
        escrow_address: '0xabc',
        freelancer_id: 'u-2',
        employer_id: 'u-1',
        total_amount: 1000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    mockRefundRequestRepository.update.mockResolvedValue({
      id: 'ref-1',
      status: 'approved',
    });

    mockMilestoneRepository.findByContract.mockResolvedValue([
      { id: 'm-1', status: 'pending', contract_id: 'c-1', due_date: new Date().toISOString(), index: 0 },
    ]);

    mockContractRepository.updateContract.mockResolvedValue({
      id: 'c-1',
      status: 'cancelled',
    });

    mockRefundRequestRepository.findByContract.mockResolvedValue([]);

    mockRefundMilestone.mockRejectedValue(new Error('Blockchain refund failed'));

    const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'u-2' });
    expect(result.success).toBe(true);
    expect(mockRefundMilestone).toHaveBeenCalled();
  });
});
