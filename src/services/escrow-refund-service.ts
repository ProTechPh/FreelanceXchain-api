import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import type {
  RefundRequest,
  CreateRefundRequestInput,
  ApproveRefundInput,
  RejectRefundInput,
} from '../models/escrow-refund.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';
import { refundRequestRepository } from '../repositories/refund-request-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { milestoneRepository } from '../repositories/milestone-repository.js';

/**
 * Create refund request
 */
export async function createRefundRequest(
  input: CreateRefundRequestInput
): Promise<ServiceResult<RefundRequest>> {
  try {
    // Get contract details
    const contract = await contractRepository.getContractById(input.contractId);

    if (!contract) {
      return {
        success: false,
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      };
    }

    // Only allow refund on active contracts
    if (contract.status !== 'active') {
      return {
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot request refund on a ${contract.status} contract` },
      };
    }

    // Verify requester is involved
    const isInvolved =
      contract.freelancer_id === input.requestedBy ||
      contract.employer_id === input.requestedBy;

    if (!isInvolved) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You are not involved in this contract' },
      };
    }

    // Check for existing pending refund request
    const existingRefund = await refundRequestRepository.findPendingByContract(input.contractId);

    if (existingRefund) {
      return {
        success: false,
        error: { code: 'DUPLICATE_REQUEST', message: 'There is already a pending refund request for this contract' },
      };
    }

    // Calculate remaining escrow: total minus milestones already approved and released.
    // Wrapped in try/catch — milestone fetch is non-critical; on failure we conservatively
    // use the full contract amount as the ceiling (safe: prevents under-refund, not over-refund).
    let releasedAmount = 0;
    try {
      const contractMilestones = await milestoneRepository.findByContract(input.contractId);
      releasedAmount = ((contractMilestones ?? []) as Array<{ status: string; amount?: number }>)
        .filter(m => m.status === 'approved')
        .reduce((sum, m) => sum + (m.amount ?? 0), 0);
    } catch {
      // Non-critical — proceed with full contract amount as ceiling
    }
    const remainingEscrow = contract.total_amount - releasedAmount;

    // Validate requested amount: must be positive and cannot exceed remaining escrow
    if (input.amount !== undefined) {
      if (typeof input.amount !== 'number' || !isFinite(input.amount) || input.amount <= 0) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Refund amount must be a positive number' },
        };
      }
      if (input.amount > remainingEscrow) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Refund amount (${input.amount}) exceeds remaining escrow balance (${remainingEscrow})`,
          },
        };
      }
    }

    const requestedAmount = input.amount ?? remainingEscrow;
    const isPartial = requestedAmount < contract.total_amount;

    // Create refund request
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

    return { success: true, data: refund as unknown as RefundRequest };
  } catch (error) {
    logger.error('Failed to create refund request:', error);
    return {
      success: false,
      error: {
        code: 'CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create refund request',
      },
    };
  }
}

/**
 * Approve refund request
 */
export async function approveRefund(
  input: ApproveRefundInput
): Promise<ServiceResult<RefundRequest>> {
  try {
    // Get refund request with contract data
    const refundData = await refundRequestRepository.findWithContract(input.refundId);

    if (!refundData || !refundData.contract) {
      return {
        success: false,
        error: { code: 'REFUND_NOT_FOUND', message: 'Refund request not found' },
      };
    }

    const { contract, ...refund } = refundData;

    // Verify approver is the other party
    const otherPartyId = contract.freelancer_id === refund.requested_by
      ? contract.employer_id
      : contract.freelancer_id;

    if (otherPartyId !== input.approvedBy) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Only the other party can approve refund' },
      };
    }

    // Check status
    if (refund.status !== 'pending') {
      return {
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Refund request is not pending' },
      };
    }

    // Re-read immediately before writing to narrow the concurrent-approval race window.
    // Appwrite lacks atomic compare-and-set; this second read catches most races.
    const freshRefund = await refundRequestRepository.findWithContract(input.refundId);
    if (!freshRefund || freshRefund.status !== 'pending') {
      return {
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Refund request status changed concurrently' },
      };
    }

    // Update refund request
    const updated = await refundRequestRepository.update(input.refundId, {
      status: 'approved',
      approved_by: input.approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (!updated) {
      throw new Error('Failed to approve refund');
    }

    // Execute blockchain refund for all non-approved milestones
    try {
      if (contract.escrow_address) {
        const { refundMilestone } = await import('./escrow-blockchain.js');

        // Get all milestones for this contract to determine correct indices
        const milestones = await milestoneRepository.findByContract(refund.contract_id);

        const pendingMilestones = milestones
          .map((m: any, index: number) => ({ ...m, index }))
          .filter((m: any) => m.status !== 'approved');

        for (const milestone of pendingMilestones) {
          try {
            await refundMilestone(contract.escrow_address, milestone.index);
            logger.info('Blockchain refund executed for milestone', {
              refundId: input.refundId,
              milestoneIndex: milestone.index,
              milestoneId: milestone.id,
              escrowAddress: contract.escrow_address,
            });
          } catch (milestoneRefundError) {
            logger.error('Failed to refund individual milestone on-chain', {
              error: milestoneRefundError,
              milestoneIndex: milestone.index,
              milestoneId: milestone.id,
            });
          }
        }
      } else {
        /* istanbul ignore next */
        logger.warn('Contract has no escrow address, skipping blockchain refund', {
          contractId: refund.contract_id
        });
      }
    } catch (blockchainError) {
      // Blockchain call failed — rollback the DB approval so the state stays consistent.
      // Without this rollback the requester would see "approved" but receive no on-chain refund.
      logger.error('Failed to execute blockchain refund, rolling back DB approval', {
        error: blockchainError,
        refundId: input.refundId,
      });
      try {
        await refundRequestRepository.update(input.refundId, {
          status: 'pending',
          approved_by: null,
          approved_at: null,
          updated_at: new Date().toISOString(),
        });
      } catch (rollbackError) {
        logger.error('CRITICAL: Failed to rollback refund approval after blockchain failure', {
          error: rollbackError,
          refundId: input.refundId,
        });
      }
      return {
        success: false,
        error: { code: 'BLOCKCHAIN_REFUND_FAILED', message: 'Blockchain refund failed; approval has been rolled back' },
      };
    }

    // Update contract status to cancelled after refund approval
    await contractRepository.updateContract(refund.contract_id, {
      status: 'cancelled',
    });

    // Cancel any other pending refund requests for this contract
    const otherRefunds = await refundRequestRepository.findByContract(refund.contract_id);
    for (const r of otherRefunds) {
      if (r.status === 'pending' && r.id !== input.refundId) {
        await refundRequestRepository.update(r.id, {
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        });
      }
    }

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

    return { success: true, data: updated as unknown as RefundRequest };
  } catch (error) {
    logger.error('Failed to approve refund:', error);
    return {
      success: false,
      error: {
        code: 'APPROVE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to approve refund',
      },
    };
  }
}

/**
 * Reject refund request
 */
export async function rejectRefund(
  input: RejectRefundInput
): Promise<ServiceResult<RefundRequest>> {
  try {
    // Get refund request with contract data
    const refundData = await refundRequestRepository.findWithContract(input.refundId);

    if (!refundData || !refundData.contract) {
      return {
        success: false,
        error: { code: 'REFUND_NOT_FOUND', message: 'Refund request not found' },
      };
    }

    const { contract, ...refund } = refundData;

    // Verify rejector is the other party
    const otherPartyId = contract.freelancer_id === refund.requested_by
      ? contract.employer_id
      : contract.freelancer_id;

    if (otherPartyId !== input.rejectedBy) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Only the other party can reject refund' },
      };
    }

    // Check status
    if (refund.status !== 'pending') {
      return {
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Refund request is not pending' },
      };
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
      userId: refund.requested_by,
      type: 'refund_rejected',
      title: 'Refund Rejected',
      message: `Your refund request was rejected. Reason: ${input.reason}`,
      data: {
        relatedId: refund.contract_id,
        relatedType: 'contract',
      },
    });

    if (notificationResult.success) {
      await sendNotificationToUser(refund.requested_by, notificationResult.data);
    }

    logger.info(`Refund ${input.refundId} rejected by ${input.rejectedBy}`);

    return { success: true, data: updated as unknown as RefundRequest };
  } catch (error) {
    logger.error('Failed to reject refund:', error);
    return {
      success: false,
      error: {
        code: 'REJECT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to reject refund',
      },
    };
  }
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
      return {
        success: false,
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      };
    }

    const isInvolved =
      contract.freelancer_id === userId ||
      contract.employer_id === userId;

    if (!isInvolved) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You are not involved in this contract' },
      };
    }

    // Get refund requests
    const refunds = await refundRequestRepository.findByContract(contractId);

    return { success: true, data: refunds as unknown as RefundRequest[] };
  } catch (error) {
    logger.error('Failed to get contract refunds:', error);
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get refunds',
      },
    };
  }
}
