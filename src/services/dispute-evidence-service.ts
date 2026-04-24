import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import type {
  DisputeEvidence,
  SubmitEvidenceInput,
  VerifyEvidenceInput,
} from '../models/dispute-evidence.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';

/**
 * Submit evidence for dispute
 */
export async function submitEvidence(
  input: SubmitEvidenceInput
): Promise<ServiceResult<DisputeEvidence>> {
  try {
    const supabase = getSupabaseClient();

    // Verify dispute exists and user is involved
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .select('*, contracts!inner(freelancer_id, employer_id)')
      .eq('id', input.disputeId)
      .single();

    if (disputeError || !dispute) {
      return {
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' },
      };
    }

    const contract = dispute.contracts;
    const isInvolved = 
      contract.freelancer_id === input.submittedBy || 
      contract.employer_id === input.submittedBy;

    if (!isInvolved) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You are not involved in this dispute' },
      };
    }

    // Insert evidence
    const { data: evidence, error: insertError } = await supabase
      .from('dispute_evidence')
      .insert({
        dispute_id: input.disputeId,
        submitted_by: input.submittedBy,
        evidence_type: input.evidenceType,
        file_url: input.fileUrl,
        description: input.description,
      })
      .select()
      .single();

    if (insertError || !evidence) {
      throw insertError || new Error('Failed to insert evidence');
    }

    // Notify arbiter if assigned
    if (dispute.arbiter_id) {
      const notificationResult = await createNotification({
        userId: dispute.arbiter_id,
        type: 'dispute_evidence_submitted',
        title: 'New Evidence Submitted',
        message: `New evidence has been submitted for dispute #${input.disputeId.substring(0, 8)}`,
        data: {
          relatedId: input.disputeId,
          relatedType: 'dispute',
        },
      });

      if (notificationResult.success) {
        await sendNotificationToUser(dispute.arbiter_id, notificationResult.data);
      }
    }

    // Notify the other party
    const otherPartyId = contract.freelancer_id === input.submittedBy 
      ? contract.employer_id 
      : contract.freelancer_id;

    const notificationResult = await createNotification({
      userId: otherPartyId,
      type: 'dispute_evidence_submitted',
      title: 'Evidence Submitted',
      message: `The other party has submitted evidence for the dispute`,
      data: {
        relatedId: input.disputeId,
        relatedType: 'dispute',
      },
    });

    if (notificationResult.success) {
      sendNotificationToUser(otherPartyId, notificationResult.data);
    }

    logger.info(`Evidence submitted for dispute ${input.disputeId} by user ${input.submittedBy}`);

    return { success: true, data: evidence as DisputeEvidence };
  } catch (error) {
    logger.error('Failed to submit evidence:', error);
    return {
      success: false,
      error: {
        code: 'SUBMIT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to submit evidence',
      },
    };
  }
}

/**
 * Get all evidence for dispute
 */
export async function getDisputeEvidence(
  disputeId: string,
  userId: string
): Promise<ServiceResult<DisputeEvidence[]>> {
  try {
    const supabase = getSupabaseClient();

    // Verify user is involved in dispute or is arbiter
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .select('*, contracts!inner(freelancer_id, employer_id)')
      .eq('id', disputeId)
      .single();

    if (disputeError || !dispute) {
      return {
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' },
      };
    }

    const contract = dispute.contracts;
    const isAuthorized = 
      contract.freelancer_id === userId || 
      contract.employer_id === userId ||
      dispute.arbiter_id === userId;

    if (!isAuthorized) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You are not authorized to view this evidence' },
      };
    }

    // Get all evidence
    const { data: evidence, error: evidenceError } = await supabase
      .from('dispute_evidence')
      .select('*')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: true });

    if (evidenceError) throw evidenceError;

    return { success: true, data: (evidence || []) as DisputeEvidence[] };
  } catch (error) {
    logger.error('Failed to get dispute evidence:', error);
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get evidence',
      },
    };
  }
}

/**
 * Delete evidence (only by submitter before verification)
 */
export async function deleteEvidence(
  evidenceId: string,
  userId: string
): Promise<ServiceResult<void>> {
  try {
    const supabase = getSupabaseClient();

    // Get evidence
    const { data: evidence, error: evidenceError } = await supabase
      .from('dispute_evidence')
      .select('*')
      .eq('id', evidenceId)
      .single();

    if (evidenceError || !evidence) {
      return {
        success: false,
        error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found' },
      };
    }

    // Check ownership
    if (evidence.submitted_by !== userId) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You can only delete your own evidence' },
      };
    }

    // Check if already verified
    if (evidence.verified_at) {
      return {
        success: false,
        error: { code: 'ALREADY_VERIFIED', message: 'Cannot delete verified evidence' },
      };
    }

    // Delete evidence
    const { error: deleteError } = await supabase
      .from('dispute_evidence')
      .delete()
      .eq('id', evidenceId);

    if (deleteError) throw deleteError;

    logger.info(`Evidence ${evidenceId} deleted by user ${userId}`);

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to delete evidence:', error);
    return {
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete evidence',
      },
    };
  }
}

/**
 * Verify evidence (arbiter only)
 */
export async function verifyEvidence(
  input: VerifyEvidenceInput
): Promise<ServiceResult<DisputeEvidence>> {
  try {
    const supabase = getSupabaseClient();

    // Get evidence and dispute
    const { data: evidence, error: evidenceError } = await supabase
      .from('dispute_evidence')
      .select('*, disputes!inner(*)')
      .eq('id', input.evidenceId)
      .single();

    if (evidenceError || !evidence) {
      return {
        success: false,
        error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found' },
      };
    }

    const dispute = evidence.disputes;

    // Check if user is arbiter
    if (dispute.arbiter_id !== input.verifiedBy) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Only the assigned arbiter can verify evidence' },
      };
    }

    // Update evidence
    const { data: updated, error: updateError } = await supabase
      .from('dispute_evidence')
      .update({
        verified_by: input.verifiedBy,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.evidenceId)
      .select()
      .single();

    if (updateError || !updated) {
      throw updateError || new Error('Failed to verify evidence');
    }

    logger.info(`Evidence ${input.evidenceId} verified by arbiter ${input.verifiedBy}`);

    return { success: true, data: updated as DisputeEvidence };
  } catch (error) {
    logger.error('Failed to verify evidence:', error);
    return {
      success: false,
      error: {
        code: 'VERIFY_FAILED',
        message: error instanceof Error ? error.message : 'Failed to verify evidence',
      },
    };
  }
}
