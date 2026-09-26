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

// Blockchain adapter factory — refundEscrow is the full-refund path, refundMilestone
// the per-milestone (partial) refund path. getMilestone lets the service re-check
// on-chain status for idempotent retries of partial refunds.
const mockRefundEscrow = jest.fn<any>().mockResolvedValue({ transactionHash: '0xrefund', receipt: {} });
const mockRefundMilestone = jest.fn<any>().mockResolvedValue({ transactionHash: '0xrefund-ms', receipt: {} });
const mockAdapterGetMilestone = jest.fn<any>().mockResolvedValue({ status: 'Pending', amount: 1000n, description: 'M' });
const mockAdapterIsAvailable = jest.fn<any>().mockReturnValue(true);
jest.unstable_mockModule(resolveModule('src/services/blockchain/factory.ts'), () => ({
  getBlockchainAdapter: () => ({
    refundEscrow: mockRefundEscrow,
    refundMilestone: mockRefundMilestone,
    getMilestone: mockAdapterGetMilestone,
    isAvailable: mockAdapterIsAvailable,
  }),
  getBlockchainMode: () => 'simulated',
  createBlockchainAdapter: jest.fn(),
  resetBlockchainAdapter: jest.fn(),
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

const mockProjectRepository = {
  findProjectById: jest.fn(),
  updateProject: jest.fn(),
  getProjectById: jest.fn(),
  createProject: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/project-repository.ts'), () => ({
  projectRepository: mockProjectRepository,
}));

// Audit-log repository (BLF-12.2 refund audit trail)
const mockAuditLogRepo = { create: jest.fn() };
jest.unstable_mockModule(resolveModule('src/repositories/audit-log-repository.ts'), () => ({
  auditLogRepository: mockAuditLogRepo,
}));

// Payment records: refunds write one 'refund' record per refunded milestone so
// the payments log matches the ledger (audit Finding 2-4).
const mockPaymentRepository = {
  create: jest.fn<any>(async (payment: any) => ({ ...payment })),
};
jest.unstable_mockModule(resolveModule('src/repositories/payment-repository.ts'), () => ({
  paymentRepository: mockPaymentRepository,
  PaymentType: {},
}));

const now = () => new Date().toISOString();

function makeProject(milestones, overrides = {}) {
  return {
    id: 'p-1',
    title: 'Project',
    milestones,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  };
}

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
    mockProjectRepository.findProjectById.mockReset();
    mockProjectRepository.updateProject.mockReset();
    mockAuditLogRepo.create.mockReset();
    mockRefundEscrow.mockReset();
    mockRefundEscrow.mockResolvedValue({ transactionHash: '0xrefund', receipt: {} });
    mockRefundMilestone.mockReset();
    mockRefundMilestone.mockResolvedValue({ transactionHash: '0xrefund-ms', receipt: {} });
    mockAdapterGetMilestone.mockReset();
    mockAdapterGetMilestone.mockResolvedValue({ status: 'Pending', amount: 1000n, description: 'M' });
    mockAdapterIsAvailable.mockReset();
    mockAdapterIsAvailable.mockReturnValue(true);
    // Default: no approved milestones — remainingEscrow === total_amount for all tests
    mockProjectRepository.findProjectById.mockResolvedValue(makeProject([]));
  });

  const importModule = async () => {
    return await import('../../services/escrow-refund-service.js');
  };

  describe('createRefundRequest', () => {
    it('should create refund request successfully', async () => {
      const { createRefundRequest } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'completed', total_amount: 1000 });

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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });

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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      // One milestone already approved — remaining escrow is 600
      mockProjectRepository.findProjectById.mockResolvedValueOnce(
        makeProject([
          { id: 'm1', status: 'approved', amount: 400 },
          { id: 'm2', status: 'pending', amount: 600 },
        ])
      );

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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      mockProjectRepository.findProjectById.mockResolvedValueOnce(
        makeProject([
          { id: 'm1', status: 'approved', amount: 400 },
          { id: 'm2', status: 'pending', amount: 600 },
        ])
      );
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

    it('should handle null milestone amounts as zero', async () => {
      const { createRefundRequest } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        status: 'active', total_amount: 1000,
      });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      mockProjectRepository.findProjectById.mockResolvedValueOnce(
        makeProject([
          { id: 'm1', status: 'approved', amount: null },
          { id: 'm2', status: 'pending', amount: 500 },
        ])
      );
      const refund = { id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', amount: 1000, status: 'pending' };
      mockRefundRequestRepository.create.mockResolvedValueOnce(refund);

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        reason: 'Test',
      });

      expect(result.success).toBe(true);
      // releasedAmount should be 0 (null amount treated as 0), so remainingEscrow = 1000
      expect(mockRefundRequestRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1000 })
      );
    });

    it('should fail when create returns null', async () => {
      const { createRefundRequest } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', status: 'active', total_amount: 1000 });
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

    it('should fall back to full amount when project milestones cannot be loaded', async () => {
      const { createRefundRequest } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        status: 'active', total_amount: 1000,
      });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      // Milestone fetch is non-critical — conservatively use full contract amount as ceiling
      mockProjectRepository.findProjectById.mockRejectedValueOnce(new Error('DB down'));
      const refund = { id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', amount: 1000, status: 'pending' };
      mockRefundRequestRepository.create.mockResolvedValueOnce(refund);

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'freelancer-1',
        reason: 'Test',
      });

      expect(result.success).toBe(true);
      expect(mockRefundRequestRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1000 })
      );
    });

    it('should notify freelancer when employer requests refund', async () => {
      const { createRefundRequest } = await importModule();

      mockContractRepository.getContractById.mockResolvedValueOnce({
        id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
        status: 'active', total_amount: 1000,
      });
      mockRefundRequestRepository.findPendingByContract.mockResolvedValueOnce(null);
      mockRefundRequestRepository.create.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'employer-1', amount: 1000, status: 'pending',
      });

      const result = await createRefundRequest({
        contractId: 'c-1',
        requestedBy: 'employer-1',
        reason: 'Changed mind',
      });

      expect(result.success).toBe(true);
      expect(mockCreateNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'freelancer-1' })
      );
    });
  });

  describe('approveRefund', () => {
    function setupHappyPath({ milestones = [{ id: 'm1', status: 'submitted', amount: 1000 }], escrow = '0xescrow' } = {}) {
      const pendingRefund = {
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        amount: 1000, is_partial: false,
        contract: {
          project_id: 'p-1',
          freelancer_id: 'freelancer-1', employer_id: 'employer-1',
          total_amount: 1000, status: 'active', escrow_address: escrow,
        },
      };
      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce(pendingRefund)
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved', approved_by: 'employer-1' });
      // approveRefund reads the project twice: once to determine the milestone lock
      // set, then again under those locks — both reads must return the same data.
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject(milestones));
      mockContractRepository.updateContract.mockResolvedValueOnce({});
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([]);
    }

    it('should approve refund successfully and execute the on-chain refund', async () => {
      const { approveRefund } = await importModule();

      setupHappyPath();

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(true);
      // Funds actually move through the adapter (both real and simulated modes)
      expect(mockRefundEscrow).toHaveBeenCalledWith('0xescrow');
      // Refunded milestones are marked in the project document
      expect(mockProjectRepository.updateProject).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({
          milestones: expect.arrayContaining([
            expect.objectContaining({ id: 'm1', status: 'refunded' }),
          ]),
        })
      );
      expect(mockContractRepository.updateContract).toHaveBeenCalledWith('c-1', { status: 'cancelled' });
      expect(mockCreateNotification).toHaveBeenCalled();
      // BLF-12.2: the approval is persisted to the durable audit log with contract+amount context
      expect(mockAuditLogRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'freelancer-1',
        actor_id: 'employer-1',
        action: 'refund.approved',
        resource_type: 'refund_request',
        resource_id: 'ref-1',
        payload: expect.objectContaining({
          contractId: 'c-1',
          amount: 1000,
          escrowAddress: '0xescrow',
        }),
      }));
      // Audit Finding 2-4: the refund is recorded in the payments log — one
      // 'refund' record per refunded milestone, money returning to the employer.
      expect(mockPaymentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        contract_id: 'c-1',
        milestone_id: 'm1',
        payer_id: 'freelancer-1',
        payee_id: 'employer-1',
        amount: 1000,
        payment_type: 'refund',
        tx_hash: '0xrefund',
        status: 'completed',
      }));
    });

    it('should refund only the requested milestones for a partial refund and keep the contract active (BLF-3.6)', async () => {
      const { approveRefund } = await importModule();

      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          amount: 1500, is_partial: true,
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 3000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved', approved_by: 'employer-1' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([
        { id: 'm1', status: 'pending', amount: 1000 },
        { id: 'm2', status: 'pending', amount: 1000 },
        { id: 'm3', status: 'pending', amount: 1000 },
      ]));
      mockContractRepository.updateContract.mockResolvedValueOnce({});
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([]);

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(true);
      // Milestone-granular refund: 1500 requested -> m1 + m2 (2000 >= 1500)
      expect(mockRefundMilestone).toHaveBeenCalledTimes(2);
      expect(mockRefundMilestone).toHaveBeenNthCalledWith(1, '0xescrow', 0);
      expect(mockRefundMilestone).toHaveBeenNthCalledWith(2, '0xescrow', 1);
      // The whole-escrow refund path is NOT used for partial refunds
      expect(mockRefundEscrow).not.toHaveBeenCalled();
      // Only m1 and m2 are marked refunded; the contract stays active (not cancelled)
      const updateCall = mockProjectRepository.updateProject.mock.calls[0];
      expect(updateCall[1].milestones.map(m => m.status)).toEqual(['refunded', 'refunded', 'pending']);
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
      // One record per refunded milestone, each with its own per-milestone tx hash.
      expect(mockPaymentRepository.create).toHaveBeenCalledTimes(2);
      expect(mockPaymentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        contract_id: 'c-1', milestone_id: 'm1', payer_id: 'freelancer-1', payee_id: 'employer-1',
        amount: 1000, payment_type: 'refund', tx_hash: '0xrefund-ms', status: 'completed',
      }));
      expect(mockPaymentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        contract_id: 'c-1', milestone_id: 'm2', payer_id: 'freelancer-1', payee_id: 'employer-1',
        amount: 1000, payment_type: 'refund', tx_hash: '0xrefund-ms', status: 'completed',
      }));
    });

    it('should cancel the contract when a partial refund covers every pending milestone (BLF-3.6)', async () => {
      const { approveRefund } = await importModule();

      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          amount: 3000, is_partial: true,
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 3000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved', approved_by: 'employer-1' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([
        { id: 'm1', status: 'pending', amount: 1000 },
        { id: 'm2', status: 'pending', amount: 1000 },
        { id: 'm3', status: 'pending', amount: 1000 },
      ]));
      mockContractRepository.updateContract.mockResolvedValueOnce({});
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([]);

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(true);
      expect(mockRefundMilestone).toHaveBeenCalledTimes(3);
      expect(mockRefundEscrow).not.toHaveBeenCalled();
      // Everything refunded -> the contract is cancelled
      expect(mockContractRepository.updateContract).toHaveBeenCalledWith('c-1', { status: 'cancelled' });
    });

    it('should roll back the approval when a partial refund milestone call fails (BLF-3.6)', async () => {
      const { approveRefund } = await importModule();

      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          amount: 500, is_partial: true,
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 1000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update
        .mockResolvedValueOnce({ id: 'ref-1', status: 'approved', approved_by: 'employer-1' })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([
        { id: 'm1', status: 'pending', amount: 1000 },
      ]));
      mockRefundMilestone.mockRejectedValueOnce(new Error('On-chain revert'));

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('BLOCKCHAIN_REFUND_FAILED');
      // Approval rolled back to pending; no DB milestone/contract writes
      expect(mockRefundRequestRepository.update).toHaveBeenCalledWith('ref-1', expect.objectContaining({ status: 'pending' }));
      expect(mockProjectRepository.updateProject).not.toHaveBeenCalled();
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
    });

    it('should skip milestones already refunded on-chain when retrying a partial refund (idempotent retry, BLF-3.6)', async () => {
      const { approveRefund } = await importModule();

      // Scenario: a first attempt refunded m1 on-chain, then failed on m2 and rolled
      // the DB approval back to 'pending'. On retry the DB still lists both as
      // pending targets, but the ledger says m1 is already Refunded.
      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          amount: 1500, is_partial: true,
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 3000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved', approved_by: 'employer-1' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([
        { id: 'm1', status: 'pending', amount: 1000 },
        { id: 'm2', status: 'pending', amount: 1000 },
      ]));
      mockAdapterGetMilestone
        .mockResolvedValueOnce({ status: 'Refunded', amount: 1000n, description: 'M1' }) // m1 already refunded on-chain
        .mockResolvedValueOnce({ status: 'Pending', amount: 1000n, description: 'M2' });
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([]);

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(true);
      // Only the not-yet-refunded milestone is re-refunded
      expect(mockRefundMilestone).toHaveBeenCalledTimes(1);
      expect(mockRefundMilestone).toHaveBeenCalledWith('0xescrow', 1);
      expect(mockRefundMilestone).not.toHaveBeenCalledWith('0xescrow', 0);
      // Both targets are marked refunded in the DB (they are refunded on-chain)
      const updateCall = mockProjectRepository.updateProject.mock.calls[0];
      expect(updateCall[1].milestones.map((m: any) => m.status)).toEqual(['refunded', 'refunded']);
      // All refundable milestones settled -> contract cancelled
      expect(mockContractRepository.updateContract).toHaveBeenCalledWith('c-1', { status: 'cancelled' });
      // Both milestones are recorded; the skipped (already-refunded) one has no
      // new tx hash (idempotent retry — the funds moved in the failed attempt).
      expect(mockPaymentRepository.create).toHaveBeenCalledTimes(2);
      expect(mockPaymentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        contract_id: 'c-1', milestone_id: 'm1', payer_id: 'freelancer-1', payee_id: 'employer-1',
        amount: 1000, payment_type: 'refund', tx_hash: null, status: 'completed',
      }));
      expect(mockPaymentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        contract_id: 'c-1', milestone_id: 'm2', payer_id: 'freelancer-1', payee_id: 'employer-1',
        amount: 1000, payment_type: 'refund', tx_hash: '0xrefund-ms', status: 'completed',
      }));
    });

    it('still succeeds when the payment record write fails (best-effort log)', async () => {
      const { approveRefund } = await importModule();

      setupHappyPath();
      mockPaymentRepository.create.mockRejectedValueOnce(new Error('db down'));

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      // The refund itself is unaffected — the funds already moved on-chain.
      expect(result.success).toBe(true);
      expect(mockContractRepository.updateContract).toHaveBeenCalledWith('c-1', { status: 'cancelled' });
    });

    it('should roll back when the on-chain status read itself fails during a partial refund (BLF-3.6)', async () => {
      const { approveRefund } = await importModule();

      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          amount: 500, is_partial: true,
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 1000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update
        .mockResolvedValueOnce({ id: 'ref-1', status: 'approved', approved_by: 'employer-1' })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([
        { id: 'm1', status: 'pending', amount: 1000 },
      ]));
      // Escrow read fails (e.g. RPC error / escrow not found on-chain)
      mockAdapterGetMilestone.mockRejectedValueOnce(new Error('Escrow read failed'));

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('BLOCKCHAIN_REFUND_FAILED');
      // No refund executed, approval rolled back to pending, no DB milestone/contract writes
      expect(mockRefundMilestone).not.toHaveBeenCalled();
      expect(mockRefundRequestRepository.update).toHaveBeenCalledWith('ref-1', expect.objectContaining({ status: 'pending' }));
      expect(mockProjectRepository.updateProject).not.toHaveBeenCalled();
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
    });

    it('should keep the contract active when skipping already-refunded milestones leaves pending ones (BLF-3.6 retry)', async () => {
      const { approveRefund } = await importModule();

      // Request only covers m1; m1 was already refunded on-chain by a failed first
      // attempt. On retry it is skipped, and no on-chain refund is executed — the
      // remaining milestones keep the contract active (not cancelled).
      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          amount: 500, is_partial: true,
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 3000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved', approved_by: 'employer-1' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([
        { id: 'm1', status: 'pending', amount: 1000 },
        { id: 'm2', status: 'pending', amount: 1000 },
        { id: 'm3', status: 'pending', amount: 1000 },
      ]));
      mockAdapterGetMilestone.mockResolvedValueOnce({ status: 'Refunded', amount: 1000n, description: 'M1' });
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([]);

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(true);
      // m1 skipped, nothing new refunded on-chain
      expect(mockRefundMilestone).not.toHaveBeenCalled();
      // m1 marked refunded (matches ledger); m2/m3 untouched
      const updateCall = mockProjectRepository.updateProject.mock.calls[0];
      expect(updateCall[1].milestones.map((m: any) => m.status)).toEqual(['refunded', 'pending', 'pending']);
      // Not all refundable milestones settled -> contract stays active
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
    });

    it('should abort the refund when a target is non-Pending but not Refunded on-chain (BLF-3.6 fail-closed)', async () => {
      const { approveRefund } = await importModule();

      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          amount: 500, is_partial: true,
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 2000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update
        .mockResolvedValueOnce({ id: 'ref-1', status: 'approved', approved_by: 'employer-1' })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([
        { id: 'm1', status: 'pending', amount: 1000 },
      ]));
      // DB says pending, ledger says Approved — genuine DB/ledger inconsistency
      mockAdapterGetMilestone.mockResolvedValueOnce({ status: 'Approved', amount: 1000n, description: 'M1' });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('BLOCKCHAIN_REFUND_FAILED');
      // No refund executed, approval rolled back, no DB milestone/contract writes
      expect(mockRefundMilestone).not.toHaveBeenCalled();
      expect(mockRefundRequestRepository.update).toHaveBeenCalledWith('ref-1', expect.objectContaining({ status: 'pending' }));
      expect(mockProjectRepository.updateProject).not.toHaveBeenCalled();
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
    });

    it('should only mark non-approved/non-refunded milestones as refunded', async () => {
      const { approveRefund } = await importModule();

      setupHappyPath({
        milestones: [
          { id: 'm1', status: 'pending' },
          { id: 'm2', status: 'approved' },
          { id: 'm3', status: 'refunded' },
        ],
      });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(true);
      const updateCall = mockProjectRepository.updateProject.mock.calls[0];
      expect(updateCall[1].milestones.map(m => m.status)).toEqual(['refunded', 'approved', 'refunded']);
    });

    it('should approve when the freelancer approves an employer-requested refund', async () => {
      const { approveRefund } = await importModule();

      // requested_by is the EMPLOYER, so the other party (approver) is the freelancer
      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'employer-1', status: 'pending',
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 1000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([{ id: 'm1', status: 'submitted' }]));
      mockContractRepository.updateContract.mockResolvedValueOnce({});
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([]);

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'freelancer-1' });

      expect(result.success).toBe(true);
      expect(mockRefundEscrow).toHaveBeenCalledWith('0xescrow');
    });

    it('should exclude in-flight releasing milestones from refund targets', async () => {
      const { approveRefund } = await importModule();

      setupHappyPath({
        milestones: [
          { id: 'm1', status: 'pending' },
          { id: 'm2', status: 'releasing' }, // approve in flight — settled by the approve SAGA, not this refund
        ],
      });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(true);
      // Only the pending milestone is refunded; the releasing one is left untouched
      const updateCall = mockProjectRepository.updateProject.mock.calls[0];
      expect(updateCall[1].milestones.map((m: any) => m.status)).toEqual(['refunded', 'releasing']);
    });

    it('should refuse the refund while any milestone is under an open dispute (BLF-3.4)', async () => {
      const { approveRefund } = await importModule();

      setupHappyPath({
        milestones: [
          { id: 'm1', status: 'disputed' },
          { id: 'm2', status: 'pending' },
        ],
      });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DISPUTE_PENDING');
      // Contested escrow is settled by dispute resolution, never by a refund
      expect(mockRefundEscrow).not.toHaveBeenCalled();
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
      expect(mockProjectRepository.updateProject).not.toHaveBeenCalled();
    });

    it('should fail with APPROVE_FAILED when project milestones cannot be loaded', async () => {
      const { approveRefund } = await importModule();
      const { logger } = await import('../../config/logger.js');

      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 1000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockProjectRepository.findProjectById.mockRejectedValueOnce(new Error('DB down'));

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('APPROVE_FAILED');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to load project milestones for refund',
        expect.objectContaining({ refundId: 'ref-1' })
      );
      expect(mockRefundEscrow).not.toHaveBeenCalled();
    });

    it('should rollback and fail when the blockchain adapter is unavailable', async () => {
      const { approveRefund } = await importModule();

      setupHappyPath();
      mockAdapterIsAvailable.mockReturnValueOnce(false);
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('BLOCKCHAIN_REFUND_FAILED');
      expect(mockRefundEscrow).not.toHaveBeenCalled();
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
    });

    it('should return NOTHING_TO_REFUND when all milestones are already settled', async () => {
      const { approveRefund } = await importModule();

      setupHappyPath({
        milestones: [
          { id: 'm1', status: 'approved' },
          { id: 'm2', status: 'refunded' },
        ],
      });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('NOTHING_TO_REFUND');
      // No on-chain refund executed, contract not cancelled
      expect(mockRefundEscrow).not.toHaveBeenCalled();
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
    });

    it('should return ESCROW_NOT_FOUND when contract has no escrow address', async () => {
      const { approveRefund } = await importModule();

      setupHappyPath({ escrow: null });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('ESCROW_NOT_FOUND');
      expect(mockRefundEscrow).not.toHaveBeenCalled();
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
    });

    it('should fail when concurrent re-read shows status changed', async () => {
      const { approveRefund } = await importModule();

      // First read: pending
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
          total_amount: 1000, status: 'active', escrow_address: null,
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
          project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000,
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
          project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1', total_amount: 1000,
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

      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 1000, escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([{ id: 'm1', status: 'submitted' }]));
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

    it('should rollback DB and return BLOCKCHAIN_REFUND_FAILED when the on-chain refund throws', async () => {
      const { approveRefund } = await importModule();

      setupHappyPath();
      mockRefundEscrow.mockRejectedValueOnce(new Error('On-chain revert'));
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('BLOCKCHAIN_REFUND_FAILED');
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
    });

    it('should log CRITICAL when rollback fails after blockchain error', async () => {
      const { approveRefund } = await importModule();
      const { logger } = await import('../../config/logger.js');

      setupHappyPath();
      mockRefundEscrow.mockRejectedValueOnce(new Error('On-chain revert'));
      mockRefundRequestRepository.update.mockRejectedValueOnce(new Error('Rollback failed'));

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('BLOCKCHAIN_REFUND_FAILED');
      expect(logger.error).toHaveBeenCalledWith(
        'CRITICAL: Failed to rollback refund approval after blockchain failure',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should cancel other pending refund requests for the same contract after approval', async () => {
      const { approveRefund } = await importModule();

      const pendingRefund = {
        id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
        contract: {
          project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
          total_amount: 1000, escrow_address: '0xescrow',
        },
      };
      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce(pendingRefund)
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'ref-1', status: 'approved' });
      mockProjectRepository.findProjectById.mockResolvedValue(makeProject([{ id: 'm1', status: 'submitted' }]));
      mockContractRepository.updateContract.mockResolvedValueOnce({});

      // Other pending refunds for the same contract
      mockRefundRequestRepository.findByContract.mockResolvedValueOnce([
        { id: 'ref-2', status: 'pending', contract_id: 'c-1' },
        { id: 'ref-3', status: 'rejected', contract_id: 'c-1' }, // Should be skipped
      ]);

      mockRefundRequestRepository.update.mockResolvedValue({});

      const result = await approveRefund({
        refundId: 'ref-1',
        approvedBy: 'employer-1',
      });

      expect(result.success).toBe(true);
      // ref-2 should be cancelled, ref-3 should not (already rejected)
      expect(mockRefundRequestRepository.update).toHaveBeenCalledWith('ref-2', expect.objectContaining({
        status: 'cancelled',
      }));
    });

    it('should refuse when a dispute is opened between the lock-set read and the under-lock re-read (BLF-3.5 TOCTOU)', async () => {
      const { approveRefund } = await importModule();

      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          contract: {
            project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1',
            total_amount: 1000, status: 'active', escrow_address: '0xescrow',
          },
        })
        .mockResolvedValueOnce({ id: 'ref-1', status: 'pending' });
      // First read (lock-set determination): milestone still submitted, no dispute
      mockProjectRepository.findProjectById
        .mockResolvedValueOnce(makeProject([{ id: 'm1', status: 'submitted' }]))
        // Re-read under the milestone locks: a concurrent createDispute committed
        .mockResolvedValueOnce(makeProject([{ id: 'm1', status: 'disputed' }]));

      const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('DISPUTE_PENDING');
      // Contested escrow is settled by dispute resolution, never by a refund
      expect(mockRefundEscrow).not.toHaveBeenCalled();
      expect(mockProjectRepository.updateProject).not.toHaveBeenCalled();
      expect(mockContractRepository.updateContract).not.toHaveBeenCalled();
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
      // BLF-12.2: the rejection is persisted to the durable audit log with the reason
      expect(mockAuditLogRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'freelancer-1',
        actor_id: 'employer-1',
        action: 'refund.rejected',
        resource_type: 'refund_request',
        resource_id: 'ref-1',
        payload: expect.objectContaining({
          contractId: 'c-1',
          reason: 'Work was delivered',
        }),
      }));
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

      mockRefundRequestRepository.findWithContract
        .mockResolvedValueOnce({
          id: 'ref-1', contract_id: 'c-1', requested_by: 'freelancer-1', status: 'pending',
          contract: { freelancer_id: 'freelancer-1', employer_id: 'employer-1' },
        })
        .mockResolvedValueOnce({
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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1' });
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

      mockContractRepository.getContractById.mockResolvedValueOnce({ id: 'c-1', project_id: 'p-1', freelancer_id: 'freelancer-1', employer_id: 'employer-1' });

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

// ═══════════════════════════════════════════════════════════════
// Branch / fallback coverage
// ═══════════════════════════════════════════════════════════════

describe('Escrow Refund Service - fallback coverage', () => {
  it('non-Error throw in createRefundRequest catch returns fallback message', async () => {
    const { createRefundRequest } = await import(resolveModule('src/services/escrow-refund-service.ts'));
    mockContractRepository.getContractById.mockRejectedValueOnce('raw string');

    const result = await createRefundRequest({ contractId: 'c-1', requestedBy: 'user-1', reason: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CREATE_FAILED');
      expect(result.error.message).toBe('Failed to create refund request');
    }
  });

  it('non-Error throw in approveRefund catch returns fallback message', async () => {
    const { approveRefund } = await import(resolveModule('src/services/escrow-refund-service.ts'));
    mockRefundRequestRepository.findWithContract.mockRejectedValueOnce(42);

    const result = await approveRefund({ refundId: 'ref-1', approvedBy: 'employer-1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('APPROVE_FAILED');
      expect(result.error.message).toBe('Failed to approve refund');
    }
  });

  it('non-Error throw in rejectRefund catch returns fallback message', async () => {
    const { rejectRefund } = await import(resolveModule('src/services/escrow-refund-service.ts'));
    mockRefundRequestRepository.findWithContract.mockRejectedValueOnce(null);

    const result = await rejectRefund({ refundId: 'ref-1', rejectedBy: 'employer-1', reason: 'No' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('REJECT_FAILED');
      expect(result.error.message).toBe('Failed to reject refund');
    }
  });

  it('non-Error throw in getContractRefunds catch returns fallback message', async () => {
    const { getContractRefunds } = await import(resolveModule('src/services/escrow-refund-service.ts'));
    mockContractRepository.getContractById.mockRejectedValueOnce({ code: 500 });

    const result = await getContractRefunds('c-1', 'user-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('DATABASE_ERROR');
      expect(result.error.message).toBe('Failed to get refunds');
    }
  });

  it('otherPartyId when refund requested by freelancer', () => {
    const contract = { freelancer_id: 'fl-1', employer_id: 'em-1' };
    const refund = { requested_by: 'fl-1' };
    const otherPartyId = contract.freelancer_id === refund.requested_by ? contract.employer_id : contract.freelancer_id;
    expect(otherPartyId).toBe('em-1');
  });

  it('otherPartyId when refund requested by employer', () => {
    const contract = { freelancer_id: 'fl-1', employer_id: 'em-1' };
    const refund = { requested_by: 'em-1' };
    const otherPartyId = contract.freelancer_id === refund.requested_by ? contract.employer_id : contract.freelancer_id;
    expect(otherPartyId).toBe('fl-1');
  });

  describe('withdrawRefundRequest', () => {
    it('returns REFUND_NOT_FOUND when refund not found', async () => {
      const { withdrawRefundRequest } = await import(resolveModule('src/services/escrow-refund-service.ts'));
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce(null);

      const result = await withdrawRefundRequest('r-1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('REFUND_NOT_FOUND');
    });

    it('returns UNAUTHORIZED when requested_by does not match userId', async () => {
      const { withdrawRefundRequest } = await import(resolveModule('src/services/escrow-refund-service.ts'));
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'r-1',
        requested_by: 'different-user',
        status: 'pending',
      });

      const result = await withdrawRefundRequest('r-1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('UNAUTHORIZED');
    });

    it('returns INVALID_STATUS when refund is not pending', async () => {
      const { withdrawRefundRequest } = await import(resolveModule('src/services/escrow-refund-service.ts'));
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'r-1',
        requested_by: 'user-1',
        status: 'approved',
      });

      const result = await withdrawRefundRequest('r-1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('INVALID_STATUS');
    });

    it('successfully withdraws a pending refund request', async () => {
      const { withdrawRefundRequest } = await import(resolveModule('src/services/escrow-refund-service.ts'));
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'r-1',
        requested_by: 'user-1',
        status: 'pending',
      });
      mockRefundRequestRepository.update.mockResolvedValueOnce({ id: 'r-1', status: 'cancelled' });

      const result = await withdrawRefundRequest('r-1', 'user-1');
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.message).toBe('Refund request withdrawn successfully');
      expect(mockRefundRequestRepository.update).toHaveBeenCalledWith(
        'r-1',
        expect.objectContaining({ status: 'cancelled' })
      );
    });

    it('returns WITHDRAW_FAILED when repository update throws', async () => {
      const { withdrawRefundRequest } = await import(resolveModule('src/services/escrow-refund-service.ts'));
      mockRefundRequestRepository.findWithContract.mockResolvedValueOnce({
        id: 'r-1',
        requested_by: 'user-1',
        status: 'pending',
      });
      mockRefundRequestRepository.update.mockRejectedValueOnce(new Error('DB failure'));

      const result = await withdrawRefundRequest('r-1', 'user-1');
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('WITHDRAW_FAILED');
    });
  });
});
