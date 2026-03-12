import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import type {
  RefundRequest,
  CreateRefundRequestInput,
  ApproveRefundInput,
  RejectRefundInput,
} from '../models/escrow-refund.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';

export type ServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

/**
 * Create refund request
 */
export async function createRefundRequest(
  input: CreateRefundRequestInput
): Promise<ServiceResult<RefundRequest>> {
  try {
    const supabase = getSupabaseClient();

    // Get contract details
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*, projects!inner(employer_id)')
      .eq('id', input.contractId)
      .single();

    if (contractError || !contract) {
      return {
        success: false,
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      };
    }

    // Verify requester is involved
    const isInvolved = 
      contract.freelancer_id === input.requestedBy || 
      contract.projects.employer_id === input.requestedBy;

    if (!isInvolved) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You are not involved in this contract' },
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
      ? contract.projects.employer_id 
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
      sendNotificationToUser(otherPartyId, notificationResult.data);
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
    const supabase = getSupabaseClient();

    // Get refund request
    const { data: refund, error: refundError } = await supabase
      .from('refund_requests')
      .select('*, contracts!inner(*, projects!inner(employer_id))')
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
      ? contract.projects.employer_id 
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

    // TODO: Execute blockchain refund
    // await executeBlockchainRefund(refund.contract_id, refund.amount);

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
      sendNotificationToUser(refund.requested_by, notificationResult.data);
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
    const supabase = getSupabaseClient();

    // Get refund request
    const { data: refund, error: refundError } = await supabase
      .from('refund_requests')
      .select('*, contracts!inner(*, projects!inner(employer_id))')
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
      ? contract.projects.employer_id 
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
      sendNotificationToUser(refund.requested_by, notificationResult.data);
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
    const supabase = getSupabaseClient();

    // Verify user is involved
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*, projects!inner(employer_id)')
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
      contract.projects.employer_id === userId;

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
