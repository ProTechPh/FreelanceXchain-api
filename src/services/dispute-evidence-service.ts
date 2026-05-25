import { pool } from '../config/database.js';
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
    // Verify dispute exists and user is involved
    const disputeResult = await pool.query(
      `SELECT d.*, c.freelancer_id, c.employer_id 
       FROM disputes d
       INNER JOIN contracts c ON d.contract_id = c.id
       WHERE d.id = $1`,
      [input.disputeId]
    );

    if (disputeResult.rows.length === 0) {
      return {
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' },
      };
    }

    const dispute = disputeResult.rows[0];
    const isInvolved = 
      dispute.freelancer_id === input.submittedBy || 
      dispute.employer_id === input.submittedBy;

    if (!isInvolved) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You are not involved in this dispute' },
      };
    }

    // Insert evidence
    const evidenceResult = await pool.query(
      `INSERT INTO dispute_evidence (dispute_id, submitted_by, evidence_type, file_url, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [input.disputeId, input.submittedBy, input.evidenceType, input.fileUrl, input.description]
    );

    if (evidenceResult.rows.length === 0) {
      throw new Error('Failed to insert evidence');
    }

    const evidence = evidenceResult.rows[0];

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
    const otherPartyId = dispute.freelancer_id === input.submittedBy 
      ? dispute.employer_id 
      : dispute.freelancer_id;

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
    // Verify user is involved in dispute or is arbiter
    const disputeResult = await pool.query(
      `SELECT d.*, c.freelancer_id, c.employer_id 
       FROM disputes d
       INNER JOIN contracts c ON d.contract_id = c.id
       WHERE d.id = $1`,
      [disputeId]
    );

    if (disputeResult.rows.length === 0) {
      return {
        success: false,
        error: { code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' },
      };
    }

    const dispute = disputeResult.rows[0];
    const isAuthorized = 
      dispute.freelancer_id === userId || 
      dispute.employer_id === userId ||
      dispute.arbiter_id === userId;

    if (!isAuthorized) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You are not authorized to view this evidence' },
      };
    }

    // Get all evidence
    const evidenceResult = await pool.query(
      'SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at ASC',
      [disputeId]
    );

    return { success: true, data: evidenceResult.rows as DisputeEvidence[] };
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
    // Get evidence
    const evidenceResult = await pool.query(
      'SELECT * FROM dispute_evidence WHERE id = $1',
      [evidenceId]
    );

    if (evidenceResult.rows.length === 0) {
      return {
        success: false,
        error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found' },
      };
    }

    const evidence = evidenceResult.rows[0];

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
    await pool.query(
      'DELETE FROM dispute_evidence WHERE id = $1',
      [evidenceId]
    );

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
    // Get evidence and dispute
    const evidenceResult = await pool.query(
      `SELECT de.*, d.arbiter_id, d.id as dispute_id
       FROM dispute_evidence de
       INNER JOIN disputes d ON de.dispute_id = d.id
       WHERE de.id = $1`,
      [input.evidenceId]
    );

    if (evidenceResult.rows.length === 0) {
      return {
        success: false,
        error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found' },
      };
    }

    const evidence = evidenceResult.rows[0];

    // Check if user is arbiter
    if (evidence.arbiter_id !== input.verifiedBy) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Only the assigned arbiter can verify evidence' },
      };
    }

    // Update evidence
    const updateResult = await pool.query(
      `UPDATE dispute_evidence 
       SET verified_by = $1, verified_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [input.verifiedBy, input.evidenceId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error('Failed to verify evidence');
    }

    const updated = updateResult.rows[0];

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
