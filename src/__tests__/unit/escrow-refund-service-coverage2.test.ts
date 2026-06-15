// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

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

const mockContractRepository = {
  getContractById: jest.fn(),
  updateContract: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: mockContractRepository,
}));

const mockRefundRequestRepository = {
  findWithContract: jest.fn(),
  findPendingByContract: jest.fn(),
  findByContract: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/refund-request-repository.ts'), () => ({
  refundRequestRepository: mockRefundRequestRepository,
}));

const mockMilestoneRepository = {
  findByContract: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
  milestoneRepository: mockMilestoneRepository,
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
    mockContractRepository.getContractById.mockReset();
    mockContractRepository.updateContract.mockReset();
    mockRefundRequestRepository.findPendingByContract.mockReset();
    mockRefundRequestRepository.findByContract.mockReset();
    mockRefundRequestRepository.findWithContract.mockReset();
    mockRefundRequestRepository.create.mockReset();
    mockRefundRequestRepository.update.mockReset();
    mockMilestoneRepository.findByContract.mockReset();
  });

  describe('createRefundRequest', () => {
    it('should return CONTRACT_NOT_FOUND when contract does not exist', async () => {
      mockContractRepository.getContractById.mockResolvedValue(null);
      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'user-1', reason: 'Not satisfied',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should return INVALID_STATUS for non-active contract', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'completed', freelancer_id: 'f-1', employer_id: 'e-1',
      });
      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'e-1', reason: 'Not satisfied',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should return UNAUTHORIZED when requester is not involved', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', freelancer_id: 'f-1', employer_id: 'e-1',
      });
      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'outsider', reason: 'Not satisfied',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return DUPLICATE_REQUEST when pending refund exists', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', freelancer_id: 'f-1', employer_id: 'e-1', total_amount: 1000,
      });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValue({ id: 'existing-refund' });

      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'e-1', reason: 'Not satisfied',
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DUPLICATE_REQUEST');
    });

    it('should create refund request successfully (full amount)', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', freelancer_id: 'f-1', employer_id: 'e-1', total_amount: 1000,
      });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValue(null);
      mockRefundRequestRepository.create.mockResolvedValue({ id: 'ref-1', contract_id: 'c-1', status: 'pending', amount: 1000 });

      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'e-1', reason: 'Not satisfied',
      });
      expect(result.success).toBe(true);
    });

    it('should create partial refund request', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', status: 'active', freelancer_id: 'f-1', employer_id: 'e-1', total_amount: 1000,
      });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValue(null);
      mockRefundRequestRepository.create.mockResolvedValue({ id: 'ref-1', contract_id: 'c-1', status: 'pending', amount: 500, is_partial: true });

      const result = await createRefundRequest({
        contractId: 'c-1', requestedBy: 'f-1', reason: 'Partial work', amount: 500,
      });
      expect(result.success).toBe(true);
    });

    it('should handle database error during creation', async () => {
      mockContractRepository.getContractById.mockRejectedValue(new Error('DB connection error'));
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
      mockRefundRequestRepository.findWithContract.mockResolvedValue({
        id: 'ref-1', contract_id: 'c-1', status: 'pending',
        requested_by: 'f-1',
        contract: {
          freelancer_id: 'f-1', employer_id: 'e-1',
          escrow_address: '0x123', total_amount: 1000,
        },
      });
      // UPDATE refund_requests
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved' });
      // SELECT milestones
      mockMilestoneRepository.findByContract.mockResolvedValueOnce([
        { id: 'm-1', status: 'pending', index: 0 },
        { id: 'm-2', status: 'approved', index: 1 },
      ]);
      // UPDATE contracts
      mockContractRepository.updateContract.mockResolvedValueOnce({});
      // UPDATE other refund_requests
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([]);

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'e-1' });
      expect(result.success).toBe(true);
    });

    it('should approve refund without escrow address', async () => {
      mockRefundRequestRepository.findWithContract.mockResolvedValue({
        id: 'ref-1', contract_id: 'c-1', status: 'pending',
        requested_by: 'f-1',
        contract: {
          freelancer_id: 'f-1', employer_id: 'e-1',
          escrow_address: null, total_amount: 1000,
        },
      });
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved' });
      mockMilestoneRepository.findByContract.mockResolvedValueOnce([]);
      mockContractRepository.updateContract.mockResolvedValueOnce({});
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([]);

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'e-1' });
      expect(result.success).toBe(true);
    });

    it('should handle general error during approval', async () => {
      mockRefundRequestRepository.findWithContract.mockRejectedValue(new Error('DB error'));
      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'e-1' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('APPROVE_FAILED');
    });
  });

  describe('rejectRefund', () => {
    it('should return REFUND_NOT_FOUND when refund does not exist', async () => {
      mockRefundRequestRepository.findWithContract.mockResolvedValue(null);
      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'e-1', reason: 'No reason' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('REFUND_NOT_FOUND');
    });

    it('should return UNAUTHORIZED when rejector is not the other party', async () => {
      mockRefundRequestRepository.findWithContract.mockResolvedValue({
        id: 'ref-1', contract_id: 'c-1', status: 'pending',
        requested_by: 'f-1',
        contract: {
          freelancer_id: 'f-1', employer_id: 'e-1',
        },
      });
      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'outsider', reason: 'No reason' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return INVALID_STATUS when refund is not pending', async () => {
      mockRefundRequestRepository.findWithContract.mockResolvedValue({
        id: 'ref-1', contract_id: 'c-1', status: 'approved',
        requested_by: 'f-1',
        contract: {
          freelancer_id: 'f-1', employer_id: 'e-1',
        },
      });
      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'e-1', reason: 'No reason' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should reject refund successfully', async () => {
      mockRefundRequestRepository.findWithContract.mockResolvedValue({
        id: 'ref-1', contract_id: 'c-1', status: 'pending',
        requested_by: 'f-1',
        contract: {
          freelancer_id: 'f-1', employer_id: 'e-1',
        },
      });
      mockRefundRequestRepository.update.mockResolvedValue({ id: 'ref-1', status: 'rejected' });

      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'e-1', reason: 'Work was done' });
      expect(result.success).toBe(true);
    });

    it('should handle database error during rejection', async () => {
      mockRefundRequestRepository.findWithContract.mockRejectedValue(new Error('DB error'));
      const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'e-1', reason: 'No reason' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('REJECT_FAILED');
    });
  });

  describe('getContractRefunds', () => {
    it('should return CONTRACT_NOT_FOUND when contract does not exist', async () => {
      mockContractRepository.getContractById.mockResolvedValue(null);
      const result = await getContractRefunds('c-1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should return UNAUTHORIZED when user is not involved', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', freelancer_id: 'f-1', employer_id: 'e-1',
      });
      const result = await getContractRefunds('c-1', 'outsider');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should return refunds on success', async () => {
      mockContractRepository.getContractById.mockResolvedValue({
        id: 'c-1', freelancer_id: 'f-1', employer_id: 'e-1',
      });
      mockRefundRequestRepository.findByContract.mockResolvedValue([{ id: 'ref-1', status: 'pending' }]);

      const result = await getContractRefunds('c-1', 'f-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.length).toBe(1);
    });

    it('should handle database error', async () => {
      mockContractRepository.getContractById.mockRejectedValue(new Error('DB error'));
      const result = await getContractRefunds('c-1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });
});
