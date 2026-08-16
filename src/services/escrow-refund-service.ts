import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import type {
  RefundRequest,
  CreateRefundRequestInput,
  ApproveRefundInput,
  RejectRefundInput,
} from '../models/escrow-refund.js';
import type { ContractEntity } from '../repositories/contract-repository.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';
import { refundRequestRepository, RefundRequestEntity } from '../repositories/refund-request-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { milestoneRepository } from '../repositories/milestone-repository.js';
import { withLock } from '../utils/async-lock.js';

/**
 * Compute the escrow balance still available for refund: the contract total
 * minus milestones already approved and released. Non-critical fetch — on
 * failure we conservatively use the full contract amount as the ceiling
 * (safe: prevents under-refund, not over-refund).
 */
async function computeRemainingEscrow(contractId: string, totalAmount: number): Promise<number> {
  let releasedAmount = 0;
  try {
    const contractMilestones = await milestoneRepository.findByContract(contractId);
    releasedAmount = ((contractMilestones ?? []) as Array<{ status: string; amount?: number }>)
      .filter(m => m.status === 'approved')
      .reduce((sum, m) => sum + (m.amount ?? 0), 0);
  } catch {
    // Non-critical — proceed with full contract amount as ceiling
  }
  return Math.max(0, totalAmount - releasedAmount);
}

type RefundRequestCreation = {
  contract: NonNullable<Awaited<ReturnType<typeof contractRepository.getContractById>>>;
  requestedAmount: number;
  isPartial: boolean;
};

/**
 * Validate that a refund request can be created for the contract.
 * Returns the resolved amounts or a ServiceResult error.
 */
async function validateRefundRequestCreation(input: CreateRefundRequestInput): Promise<
  | { error: ServiceResult<RefundRequest> }
  | RefundRequestCreation
> {
  const contract = await contractRepository.getContractById(input.contractId);
  if (!contract) {
    return { error: errorResult('CONTRACT_NOT_FOUND', 'Contract not found') };
  }

  // Only allow refund on active contracts
  if (contract.status !== 'active') {
    return { error: errorResult('INVALID_STATUS', `Cannot request refund on a ${contract.status} contract`) };
  }

  // Verify requester is involved
  const isInvolved =
    contract.freelancer_id === input.requestedBy ||
    contract.employer_id === input.requestedBy;

  if (!isInvolved) {
    return { error: errorResult('UNAUTHORIZED', 'You are not involved in this contract') };
  }

  // Check for existing pending refund request
  const existingRefund = await refundRequestRepository.findPendingByContract(input.contractId);
  if (existingRefund) {
    return { error: errorResult('DUPLICATE_REQUEST', 'There is already a pending refund request for this contract') };
  }

  const remainingEscrow = await computeRemainingEscrow(input.contractId, contract.total_amount);

  // Validate requested amount: must be positive and cannot exceed remaining escrow
  if (input.amount !== undefined) {
    if (typeof input.amount !== 'number' || !isFinite(input.amount) || input.amount <= 0) {
      return { error: errorResult('VALIDATION_ERROR', 'Refund amount must be a positive number') };
    }
    if (input.amount > remainingEscrow) {
      return { error: errorResult('VALIDATION_ERROR', `Refund amount (${input.amount}) exceeds remaining escrow balance (${remainingEscrow})`) };
    }
  }

  const requestedAmount = input.amount ?? remainingEscrow;
  const isPartial = requestedAmount < contract.total_amount;

  return { contract, requestedAmount, isPartial };
}

/**
 * Create refund request
 */
export async function createRefundRequest(
  input: CreateRefundRequestInput
): Promise<ServiceResult<RefundRequest>> {
  // BLF-3.1: Serialize refund creation per contract to prevent duplicate pending requests
  return withLock(`refund-create:${input.contractId}`, async () => {
    try {
      const validated = await validateRefundRequestCreation(input);
      if ('error' in validated) return validated.error;

      const { contract, requestedAmount, isPartial } = validated;

      const refund = await refundRequestRepository.create({
        id: '',
        contract_id: input.contractId,
        requested_by: input.requestedBy,
        amount: requestedAmount,
        is_partial: isPartial,
        reason: input.reason,
        status: 'pending',
      });

      if (!refund) {
        throw new Error('Failed to create refund request');
      }

      // Notify other party
      const otherPartyId = contract.freelancer_id === input.requestedBy
        ? contract.employer_id
        : contract.freelancer_id;

      const notificationResult = await createNotification({
        userId: otherPartyId,
        type: 'refund_requested',
        title: 'Refund Requested',
        message: `A refund has been requested for contract. Reason: ${input.reason}`,
        data: {
          relatedId: input.contractId,
          relatedType: 'contract',
        },
      });

      if (notificationResult.success) {
        await sendNotificationToUser(otherPartyId, notificationResult.data);
      }

      logger.info(`Refund request created for contract ${input.contractId}`);

      return successResult(refund as unknown as RefundRequest);
    } catch (error) {
      logger.error('Failed to create refund request:', error);
      return errorResult('CREATE_FAILED', error instanceof Error ? error.message : 'Failed to create refund request');
    }
  });
}

type RefundApprovalContext = {
  refund: RefundRequestEntity;
  contract: ContractEntity;
};

/**
 * Validate that a refund can be approved by the other party.
 * Re-reads the refund immediately before writing to narrow the
 * concurrent-approval race window (Appwrite lacks atomic compare-and-set).
 */
async function validateRefundApproval(input: ApproveRefundInput): Promise<
  | { error: ServiceResult<RefundRequest> }
  | RefundApprovalContext
> {
  const refundData = await refundRequestRepository.findWithContract(input.refundId);
  if (!refundData || !refundData.contract) {
    return { error: errorResult('REFUND_NOT_FOUND', 'Refund request not found') };
  }

  // Verify approver is the other party
  const otherPartyId = refundData.contract.freelancer_id === refundData.requested_by
    ? refundData.contract.employer_id
    : refundData.contract.freelancer_id;

  if (otherPartyId !== input.approvedBy) {
    return { error: errorResult('UNAUTHORIZED', 'Only the other party can approve refund') };
  }

  // Check status
  if (refundData.status !== 'pending') {
    return { error: errorResult('INVALID_STATUS', 'Refund request is not pending') };
  }

  // Re-read immediately before writing to narrow the concurrent-approval race window.
  // Appwrite lacks atomic compare-and-set; this second read catches most races.
  const freshRefund = await refundRequestRepository.findWithContract(input.refundId);
  if (!freshRefund || freshRefund.status !== 'pending') {
    return { error: errorResult('INVALID_STATUS', 'Refund request status changed concurrently') };
  }

  return { refund: refundData, contract: refundData.contract };
}

type FailedMilestone = { index: number; id: string; error: unknown };

/**
 * Execute on-chain refunds for all non-approved milestones of the contract.
 * Per-milestone failures are collected (all-or-nothing is enforced by the caller);
 * catastrophic failures propagate to the caller for rollback.
 */
async function refundMilestonesOnBlockchain(input: {
  contract: ContractEntity;
  refundId: string;
  contractId: string;
}): Promise<FailedMilestone[]> {
  const failedMilestones: FailedMilestone[] = [];

  if (!input.contract.escrow_address) {
    /* istanbul ignore next */
    logger.warn('Contract has no escrow address, skipping blockchain refund', {
      contractId: input.contractId
    });
    return failedMilestones;
  }

  const escrowAddress = input.contract.escrow_address;
  const { refundMilestone } = await import('./escrow-blockchain.js');

  // Get all milestones for this contract to determine correct indices
  const milestones = await milestoneRepository.findByContract(input.contractId);

  const pendingMilestones = milestones.reduce<Array<Record<string, unknown> & { index: number }>>((acc, m, index) => {
    if (m.status !== 'approved' && m.status !== 'refunded') acc.push({ ...m, index });
    return acc;
  }, []);

  await Promise.all(pendingMilestones.map(async (milestone) => {
    try {
      await refundMilestone(escrowAddress, milestone.index);
      logger.info('Blockchain refund executed for milestone', {
        refundId: input.refundId,
        milestoneIndex: milestone.index,
        milestoneId: milestone.id as string,
        escrowAddress,
      });
    } catch (milestoneRefundError) {
      logger.error('Failed to refund individual milestone on-chain', {
        error: milestoneRefundError,
        milestoneIndex: milestone.index,
        milestoneId: milestone.id as string,
      });
      failedMilestones.push({ index: milestone.index, id: milestone.id as string, error: milestoneRefundError });
    }
  }));

  return failedMilestones;
}

/**
 * Roll the DB approval back to pending after a blockchain failure so the
 * state stays consistent. Logs CRITICAL if the rollback itself fails.
 */
async function rollbackRefundApproval(refundId: string, failureType: 'blockchain' | 'partial'): Promise<void> {
  try {
    await refundRequestRepository.update(refundId, {
      status: 'pending',
      updated_at: new Date().toISOString(),
    });
  } catch (rollbackError) {
    logger.error(
      failureType === 'partial'
        ? 'CRITICAL: Failed to rollback refund approval after partial blockchain failure'
        : 'CRITICAL: Failed to rollback refund approval after blockchain failure',
      {
        error: rollbackError,
        refundId,
      }
    );
  }
}

/**
 * Approve refund request
 */
export async function approveRefund(
  input: ApproveRefundInput
): Promise<ServiceResult<RefundRequest>> {
  // Serialize concurrent refund approval attempts to prevent double-refund
  return withLock(`refund-approve:${input.refundId}`, async () => {
    try {
      const validated = await validateRefundApproval(input);
      if ('error' in validated) return validated.error;

      const { refund, contract } = validated;

      const updated = await refundRequestRepository.update(input.refundId, {
        status: 'approved',
        approved_by: input.approvedBy,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (!updated) {
        throw new Error('Failed to approve refund');
      }

      // Execute blockchain refund for all non-approved milestones.
      // Track failures to implement all-or-nothing semantics.
      let failedMilestones: FailedMilestone[] = [];
      try {
        failedMilestones = await refundMilestonesOnBlockchain({
          contract,
          refundId: input.refundId,
          contractId: refund.contract_id,
        });
      } catch (blockchainError) {
        // Blockchain call failed — rollback the DB approval so the state stays consistent.
        logger.error('Failed to execute blockchain refund, rolling back DB approval', {
          error: blockchainError,
          refundId: input.refundId,
        });
        await rollbackRefundApproval(input.refundId, 'blockchain');
        return errorResult('BLOCKCHAIN_REFUND_FAILED', 'Blockchain refund failed; approval has been rolled back');
      }

      // H7: If any milestone refunds failed, rollback to prevent inconsistent state
      if (failedMilestones.length > 0) {
        logger.error('Partial refund failure — rolling back DB approval', {
          refundId: input.refundId,
          failedCount: failedMilestones.length,
          failedMilestones: failedMilestones.map(f => ({ index: f.index, id: f.id })),
        });
        await rollbackRefundApproval(input.refundId, 'partial');
        return errorResult('PARTIAL_REFUND_FAILED', `${failedMilestones.length} milestone refund(s) failed on-chain. Approval has been rolled back. Please retry.`);
      }

      // Update contract status to cancelled after refund approval
      await contractRepository.updateContract(refund.contract_id, {
        status: 'cancelled',
      });

      // Cancel any other pending refund requests for this contract
      const otherRefunds = await refundRequestRepository.findByContract(refund.contract_id);
      const toCancel = otherRefunds.filter(r => r.status === 'pending' && r.id !== input.refundId);
      await Promise.all(toCancel.map(r =>
        refundRequestRepository.update(r.id, {
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
      ));

      // Notify requester
      const notificationResult = await createNotification({
        userId: refund.requested_by,
        type: 'refund_approved',
        title: 'Refund Approved',
        message: 'Your refund request has been approved and will be processed shortly.',
        data: {
          relatedId: refund.contract_id,
          relatedType: 'contract',
        },
      });

      if (notificationResult.success) {
        await sendNotificationToUser(refund.requested_by, notificationResult.data);
      }

      logger.info(`Refund ${input.refundId} approved by ${input.approvedBy}`);

      return successResult(updated as unknown as RefundRequest);
    } catch (error) {
      logger.error('Failed to approve refund:', error);
      return errorResult('APPROVE_FAILED', error instanceof Error ? error.message : 'Failed to approve refund');
    }
  });
}

/**
 * Reject refund request
 */
export async function rejectRefund(
  input: RejectRefundInput
): Promise<ServiceResult<RefundRequest>> {
  // BLF-3.2: Serialize with approveRefund using same lock key to prevent concurrent approve+reject
  return withLock(`refund-approve:${input.refundId}`, async () => {
    try {
      // Get refund request with contract data
      const refundData = await refundRequestRepository.findWithContract(input.refundId);

      if (!refundData || !refundData.contract) {
        return errorResult('REFUND_NOT_FOUND', 'Refund request not found');
      }

      // Verify rejector is the other party
      const otherPartyId = refundData.contract.freelancer_id === refundData.requested_by
        ? refundData.contract.employer_id
        : refundData.contract.freelancer_id;

      if (otherPartyId !== input.rejectedBy) {
        return errorResult('UNAUTHORIZED', 'Only the other party can reject refund');
      }

      // Check status
      if (refundData.status !== 'pending') {
        return errorResult('INVALID_STATUS', 'Refund request is not pending');
      }

      // Re-read immediately before writing to narrow the concurrent-rejection race window,
      // matching the same double-read guard used in approveRefund.
      // Appwrite lacks atomic compare-and-set; this second read catches most races and
      // prevents duplicate rejection notifications being sent to the requester.
      const freshRefund = await refundRequestRepository.findWithContract(input.refundId);
      if (!freshRefund || freshRefund.status !== 'pending') {
        return errorResult('INVALID_STATUS', 'Refund request status changed concurrently');
      }

      // Update refund request
      const updated = await refundRequestRepository.update(input.refundId, {
        status: 'rejected',
        rejected_by: input.rejectedBy,
        rejection_reason: input.reason,
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (!updated) {
        throw new Error('Failed to reject refund');
      }

      // Notify requester
      const notificationResult = await createNotification({
        userId: refundData.requested_by,
        type: 'refund_rejected',
        title: 'Refund Rejected',
        message: `Your refund request was rejected. Reason: ${input.reason}`,
        data: {
          relatedId: refundData.contract_id,
          relatedType: 'contract',
        },
      });

      if (notificationResult.success) {
        await sendNotificationToUser(refundData.requested_by, notificationResult.data);
      }

      logger.info(`Refund ${input.refundId} rejected by ${input.rejectedBy}`);

      return successResult(updated as unknown as RefundRequest);
    } catch (error) {
      logger.error('Failed to reject refund:', error);
      return errorResult('REJECT_FAILED', error instanceof Error ? error.message : 'Failed to reject refund');
    }
  });
}

/**
 * Get refund requests for contract
 */
export async function getContractRefunds(
  contractId: string,
  userId: string
): Promise<ServiceResult<RefundRequest[]>> {
  try {
    // Verify user is involved
    const contract = await contractRepository.getContractById(contractId);

    if (!contract) {
      return errorResult('CONTRACT_NOT_FOUND', 'Contract not found');
    }

    const isInvolved =
      contract.freelancer_id === userId ||
      contract.employer_id === userId;

    if (!isInvolved) {
      return errorResult('UNAUTHORIZED', 'You are not involved in this contract');
    }

    // Get refund requests
    const refunds = await refundRequestRepository.findByContract(contractId);

    return successResult(refunds as unknown as RefundRequest[]);
  } catch (error) {
    logger.error('Failed to get contract refunds:', error);
    return errorResult('DATABASE_ERROR', error instanceof Error ? error.message : 'Failed to get refunds');
  }
}
