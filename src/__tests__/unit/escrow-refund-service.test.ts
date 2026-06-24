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

const mockRefundRequestRepository = {
  findPendingByContract: jest.fn(),
  findByContract: jest.fn(),
  findWithContract: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  delete: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/refund-request-repository.ts'), () => ({
  refundRequestRepository: mockRefundRequestRepository,
}));

const mockMilestoneRepository = {
  findByContract: jest.fn(),
  getById: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/milestone-repository.ts'), () => ({
  milestoneRepository: mockMilestoneRepository,
}));

describe('Escrow Refund Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContractRepository.getContractById.mockReset();
    mockContractRepository.updateContract.mockReset();
    mockRefundRequestRepository.findPendingByContract.mockReset();
    mockRefundRequestRepository.findByContract.mockReset();
    mockRefundRequestRepository.findWithContract.mockReset();
    mockRefundRequestRepository.create.mockReset();
    mockRefundRequestRepository.update.mockReset();
    mockMilestoneRepository.findByContract.mockReset();
    // Default: no approved milestones — remainingEscrow === total_amount for all tests
    mockMilestoneRepository.findByContract.mockResolvedValue([]);
  });

  const importModule = async () => {
    return await import('../../services/escrow-refund-service.js');
  };

  describe('createRefundRequest', () => {
    it('should create refund request successfully', async () => {
      const { createRefundRequest } = await importModule();

      // Get contract
      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      // Check existing pending refunds
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      // Insert refund request
      const refund = { id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', amount: 1000, status: 'pending' };
      mockRefundRequestRepository.create.mockResolvedValueOnce(refund);

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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      const refund = { id: 'ref-1', contract_id: 'c-1', requested_by: 'employer-1', amount: 500, is_partial: true, status: 'pending' };
      mockRefundRequestRepository.create.mockResolvedValueOnce(refund);

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

      mockContractRepository.getContractById.mockResolvedValueOnce(null);

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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'completed', total_amount: 1000 });

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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });

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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce({ id: 'existing-ref' });

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DUPLICATE_REQUEST');
    });

    it('should fail when amount is negative', async () => {
      const { createRefundRequest } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        amount: -100,
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should fail when amount exceeds remaining escrow', async () => {
      const { createRefundRequest } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      // One milestone already approved — remaining escrow is 600
      mockMilestoneRepository.findByContract.mockResolvedValueOnce([
        { status: 'approved', amount: 400 },
        { status: 'pending', amount: 600 },
      ]);

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        amount: 700,
        reason: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reduce remaining escrow by approved milestone amounts', async () => {
      const { createRefundRequest } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      mockMilestoneRepository.findByContract.mockResolvedValueOnce([
        { status: 'approved', amount: 400 },
        { status: 'pending', amount: 600 },
      ]);
      const refund = { id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', amount: 600, status: 'pending' };
      mockRefundRequestRepository.create.mockResolvedValueOnce(refund);

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        amount: 600,
        reason: 'Test',
      });

      expect(result.success).toBe(true);
    });

    it('should fail when create returns null', async () => {
      const { createRefundRequest } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      mockRefundRequestRepository.create.mockResolvedValueOnce(null);

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

      mockContractRepository.getContractById.mockRejectedValueOnce(new Error('DB error'));

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
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000, status: 'active',
          escrow_address: null,
        },
      });
      // Re-read for concurrent-approval guard
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', status: 'pending',
      });
      // Update refund
      const updated = { id: 'ref-1', status: 'approved', approved_by: 'employer-1' };
      mockRefundRequestRepository.update.mockResolvedValueOnce(updated);
      // Get milestones for blockchain
      mockMilestoneRepository.findByContract.mockResolvedValueOnce([]);
      // Update contract status
      mockContractRepository.updateContract.mockResolvedValueOnce({});
      // Cancel other pending refunds
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([]);

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(true);
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('should fail when concurrent re-read shows status changed', async () => {
      const { approveRefund } = await importModule();

      // First read: pending
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000, status: 'active',
          escrow_address: null,
        },
      });
      // Re-read: already approved (concurrent change)
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', status: 'approved',
      });

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should fail when refund not found', async () => {
      const { approveRefund } = await importModule();

      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce(null);

      const result = await approveRefund({
        refundId: 'nonexistent',
        approvedBy: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('REFUND_NOT_FOUND');
    });

    it('should fail when approver is not the other party', async () => {
      const { approveRefund } = await importModule();

      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000,
        },
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

      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'approved',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000,
        },
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

      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000,
        },
      });
      // Re-read for concurrent-approval guard
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', status: 'pending',
      });
      mockRefundRequestRepository.update.mockResolvedValueOnce(null);

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('APPROVE_FAILED');
    });

    it('should handle database errors', async () => {
      const { approveRefund } = await importModule();

      mockRefundRequestRepository.findWithContract.mockRejectedValueOnce(new Error('DB error'));

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('APPROVE_FAILED');
    });

    it('should rollback DB and return BLOCKCHAIN_REFUND_FAILED when blockchain call throws', async () => {
      const { approveRefund } = await importModule();

      const pendingRefund = {
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
          total_amount: 1000, escrow_address: '0xdeadbeef',
        },
      };
      // First read: authorization check
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce(pendingRefund);
      // Second read: concurrent-approval guard
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      // DB approve write succeeds
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved' });
      // Milestone fetch throws — propagates to outer blockchain catch
      mockMilestoneRepository.findByContract.mockRejectedValueOnce(new Error('DB unavailable'));
      // Rollback update
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('BLOCKCHAIN_REFUND_FAILED');
    });
  });

  describe('rejectRefund', () => {
    it('should reject refund successfully', async () => {
      const { rejectRefund } = await importModule();

      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        },
      });
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: { freelancer_id: 'freelancer-1', employer_id: 'employer-1' },
      });
      const updated = { id: 'ref-1', status: 'rejected', rejected_by: 'employer-1', rejection_reason: 'Work was delivered' };
      mockRefundRequestRepository.update.mockResolvedValueOnce(updated);

      const result = await rejectRefund({
        refundId: 'ref-1',
        rejectedBy: 'employer-1',
        reason: 'Work was delivered',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('should fail when refund status changed concurrently before reject write', async () => {
      const { rejectRefund } = await importModule();

      // First read: authorization check passes (status pending)
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: { freelancer_id: 'freelancer-1', employer_id: 'employer-1' },
      });
      // Second read: concurrent guard detects status changed to approved
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'approved',
        contract: { freelancer_id: 'freelancer-1', employer_id: 'employer-1' },
      });

      const result = await rejectRefund({
        refundId: 'ref-1',
        rejectedBy: 'employer-1',
        reason: 'Work was delivered',
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('should fail when refund not found', async () => {
      const { rejectRefund } = await importModule();

      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce(null);

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

      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        },
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

      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'rejected',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        },
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

      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        },
      });
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: { freelancer_id: 'freelancer-1', employer_id: 'employer-1' },
      });
      mockRefundRequestRepository.update.mockResolvedValueOnce(null);

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

      mockRefundRequestRepository.findWithContract.mockRejectedValueOnce(new Error('DB error'));

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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1' });
      const refunds = [
        { id: 'ref-1', contract_id: 'c-1', status: 'pending' },
        { id: 'ref-2', contract_id: 'c-1', status: 'rejected' },
      ];
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce(refunds);

      const result = await getContractRefunds('c-1', 'freelancer-1');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should fail when contract not found', async () => {
      const { getContractRefunds } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce(null);

      const result = await getContractRefunds('nonexistent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should fail when user is not involved', async () => {
      const { getContractRefunds } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1' });

      const result = await getContractRefunds('c-1', 'outsider');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle database errors', async () => {
      const { getContractRefunds } = await importModule();

      mockContractRepository.getContractById.mockRejectedValueOnce(new Error('DB error'));

      const result = await getContractRefunds('c-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('DATABASE_ERROR');
    });
  });
});
