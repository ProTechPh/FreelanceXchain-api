import { pool } from '../config/database.js';
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

/**
 * Create refund request
 */
export async function createRefundRequest(
  input: CreateRefundRequestInput
): Promise<ServiceResult<RefundRequest>> {
  try {
    // Get contract details
    const contractResult = await pool.query(
      'SELECT * FROM contracts WHERE id = $1',
      [input.contractId]
    );

    if (contractResult.rows.length === 0) {
      return {
        success: false,
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      };
    }

    const contract = contractResult.rows[0];

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
    const existingRefundsResult = await pool.query(
      'SELECT id FROM refund_requests WHERE contract_id = $1 AND status = $2',
      [input.contractId, 'pending']
    );

    if (existingRefundsResult.rows.length > 0) {
      return {
        success: false,
        error: { code: 'DUPLICATE_REQUEST', message: 'There is already a pending refund request for this contract' },
      };
    }

    // Determine if partial refund
    const isPartial = input.amount !== undefined && input.amount < contract.total_amount;

    // Insert refund request
    const refundResult = await pool.query(
      `INSERT INTO refund_requests (contract_id, requested_by, amount, is_partial, reason, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [input.contractId, input.requestedBy, input.amount || contract.total_amount, isPartial, input.reason, 'pending']
    );

    if (refundResult.rows.length === 0) {
      throw new Error('Failed to create refund request');
    }

    const refund = refundResult.rows[0];

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

    return { success: true, data: refund as RefundRequest };
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
    // Get refund request
    const refundResult = await pool.query(
      `SELECT r.*, c.freelancer_id, c.employer_id, c.total_amount, c.status as contract_status
       FROM refund_requests r
       INNER JOIN contracts c ON r.contract_id = c.id
       WHERE r.id = $1`,
      [input.refundId]
    );

    if (refundResult.rows.length === 0) {
      return {
        success: false,
        error: { code: 'REFUND_NOT_FOUND', message: 'Refund request not found' },
      };
    }

    const refund = refundResult.rows[0];

    // Verify approver is the other party
    const otherPartyId = refund.freelancer_id === refund.requested_by
      ? refund.employer_id
      : refund.freelancer_id;

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

    // Update refund request
    const updateResult = await pool.query(
      `UPDATE refund_requests 
       SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      ['approved', input.approvedBy, input.refundId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error('Failed to approve refund');
    }

    const updated = updateResult.rows[0];

    // Execute blockchain refund for all non-approved milestones
    try {
      if (refund.escrow_address) {
        const { refundMilestone } = await import('./escrow-blockchain.js');

        // Get all milestones for this contract to determine correct indices
        const milestonesResult = await pool.query(
          'SELECT id, status FROM milestones WHERE contract_id = $1 ORDER BY due_date ASC',
          [refund.contract_id]
        );

        const pendingMilestones = milestonesResult.rows
          .map((m: any, index: number) => ({ ...m, index }))
          .filter((m: any) => m.status !== 'approved');

        for (const milestone of pendingMilestones) {
          try {
            await refundMilestone(refund.escrow_address, milestone.index);
            logger.info('Blockchain refund executed for milestone', {
              refundId: input.refundId,
              milestoneIndex: milestone.index,
              milestoneId: milestone.id,
              escrowAddress: refund.escrow_address,
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
      // Log error but don't fail the approval - the refund is approved in DB
      /* istanbul ignore next */
      logger.error('Failed to execute blockchain refund', {
        error: blockchainError,
        refundId: input.refundId
      });
    }

    // Update contract status to cancelled after refund approval
    await pool.query(
      "UPDATE contracts SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [refund.contract_id]
    );

    // Cancel any other pending refund requests for this contract
    await pool.query(
      "UPDATE refund_requests SET status = 'cancelled', updated_at = NOW() WHERE contract_id = $1 AND status = 'pending' AND id != $2",
      [refund.contract_id, input.refundId]
    );

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

    return { success: true, data: updated as RefundRequest };
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
    // Get refund request
    const refundResult = await pool.query(
      `SELECT r.*, c.freelancer_id, c.employer_id
       FROM refund_requests r
       INNER JOIN contracts c ON r.contract_id = c.id
       WHERE r.id = $1`,
      [input.refundId]
    );

    if (refundResult.rows.length === 0) {
      return {
        success: false,
        error: { code: 'REFUND_NOT_FOUND', message: 'Refund request not found' },
      };
    }

    const refund = refundResult.rows[0];

    // Verify rejector is the other party
    const otherPartyId = refund.freelancer_id === refund.requested_by
      ? refund.employer_id
      : refund.freelancer_id;

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
    const updateResult = await pool.query(
      `UPDATE refund_requests 
       SET status = $1, rejected_by = $2, rejection_reason = $3, rejected_at = NOW(), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      ['rejected', input.rejectedBy, input.reason, input.refundId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error('Failed to reject refund');
    }

    const updated = updateResult.rows[0];

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

    return { success: true, data: updated as RefundRequest };
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
    const contractResult = await pool.query(
      'SELECT * FROM contracts WHERE id = $1',
      [contractId]
    );

    if (contractResult.rows.length === 0) {
      return {
        success: false,
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      };
    }

    const contract = contractResult.rows[0];

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
    const refundsResult = await pool.query(
      'SELECT * FROM refund_requests WHERE contract_id = $1 ORDER BY created_at DESC',
      [contractId]
    );

    return { success: true, data: refundsResult.rows as RefundRequest[] };
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
