import { getSupabaseServiceClient } from '../config/supabase.js';
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
    const supabase = getSupabaseServiceClient();

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', input.contractId)
      .single();

    if (contractError || !contract) {
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
    const { data: existingRefunds } = await supabase
      .from('refund_requests')
      .select('id')
      .eq('contract_id', input.contractId)
      .eq('status', 'pending');

    if (existingRefunds && existingRefunds.length > 0) {
      return {
        success: false,
        error: { code: 'DUPLICATE_REQUEST', message: 'There is already a pending refund request for this contract' },
      };
    }

    // Determine if partial refund
    const isPartial = input.amount !== undefined && input.amount < contract.total_amount;

    // Insert refund request
    const { data: refund, error: insertError } = await supabase
      .from('refund_requests')
      .insert({
        contract_id: input.contractId,
        requested_by: input.requestedBy,
        amount: input.amount || contract.total_amount,
        is_partial: isPartial,
        reason: input.reason,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError || !refund) {
      throw insertError || new Error('Failed to create refund request');
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
    const supabase = getSupabaseServiceClient();

    // Get refund request
    const { data: refund, error: refundError } = await supabase
      .from('refund_requests')
      .select('*, contracts!inner(*)')
      .eq('id', input.refundId)
      .single();

    if (refundError || !refund) {
      return {
        success: false,
        error: { code: 'REFUND_NOT_FOUND', message: 'Refund request not found' },
      };
    }

    const contract = refund.contracts;

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

    // Update refund request
    const { data: updated, error: updateError } = await supabase
      .from('refund_requests')
      .update({
        status: 'approved',
        approved_by: input.approvedBy,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.refundId)
      .select()
      .single();

    if (updateError || !updated) {
      throw updateError || new Error('Failed to approve refund');
    }

    // Execute blockchain refund for all non-approved milestones
    try {
      if (contract.escrow_address) {
        const { refundMilestone } = await import('./escrow-blockchain.js');

        // Get all milestones for this contract to determine correct indices
        const { data: milestones } = await supabase
          .from('milestones')
          .select('id, status')
          .eq('contract_id', refund.contract_id)
          .order('due_date', { ascending: true });

        const pendingMilestones = (milestones || [])
          .map((m, index) => ({ ...m, index }))
          .filter(m => m.status !== 'approved');

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
        logger.warn('Contract has no escrow address, skipping blockchain refund', {
          contractId: refund.contract_id
        });
      }
    } catch (blockchainError) {
      // Log error but don't fail the approval - the refund is approved in DB
      logger.error('Failed to execute blockchain refund', {
        error: blockchainError,
        refundId: input.refundId
      });
    }

    // Update contract status to cancelled after refund approval
    await supabase
      .from('contracts')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', refund.contract_id);

    // Cancel any other pending refund requests for this contract
    await supabase
      .from('refund_requests')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('contract_id', refund.contract_id)
      .eq('status', 'pending')
      .neq('id', input.refundId);

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
    const supabase = getSupabaseServiceClient();

    // Get refund request
    const { data: refund, error: refundError } = await supabase
      .from('refund_requests')
      .select('*, contracts!inner(*)')
      .eq('id', input.refundId)
      .single();

    if (refundError || !refund) {
      return {
        success: false,
        error: { code: 'REFUND_NOT_FOUND', message: 'Refund request not found' },
      };
    }

    const contract = refund.contracts;

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
    const { data: updated, error: updateError } = await supabase
      .from('refund_requests')
      .update({
        status: 'rejected',
        rejected_by: input.rejectedBy,
        rejected_at: new Date().toISOString(),
        rejection_reason: input.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.refundId)
      .select()
      .single();

    if (updateError || !updated) {
      throw updateError || new Error('Failed to reject refund');
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
    const supabase = getSupabaseServiceClient();

    // Verify user is involved
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
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
    const { data: refunds, error: refundsError } = await supabase
      .from('refund_requests')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });

    if (refundsError) throw refundsError;

    return { success: true, data: (refunds || []) as RefundRequest[] };
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
