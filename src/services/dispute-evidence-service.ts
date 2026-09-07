import { disputeEvidenceRepository, DisputeEvidenceEntity } from '../repositories/dispute-evidence-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import type {
  DisputeEvidence,
  SubmitEvidenceInput,
  VerifyEvidenceInput,
} from '../models/dispute-evidence.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';
import { generateId } from '../utils/id.js';
import { deleteFileFromStorage, extractFileIdFromUrl } from '../utils/storage-uploader.js';
import { BUCKETS } from '../config/appwrite.js';

export async function submitEvidence(
  input: SubmitEvidenceInput
): Promise<ServiceResult<DisputeEvidence>> {
  try {
    const disputeEntity = await disputeRepository.getDisputeById(input.disputeId);
    if (!disputeEntity) {
      return errorResult('DISPUTE_NOT_FOUND', 'Dispute not found');
    }

    const contractEntity = await contractRepository.getContractById(disputeEntity.contract_id);
    if (!contractEntity) {
      return errorResult('DISPUTE_NOT_FOUND', 'Dispute not found');
    }

    const isInvolved = 
      contractEntity.freelancer_id === input.submittedBy || 
      contractEntity.employer_id === input.submittedBy;

    if (!isInvolved) {
      return errorResult('UNAUTHORIZED', 'You are not involved in this dispute');
    }

    const now = new Date().toISOString();
    const evidenceEntity: DisputeEvidenceEntity = {
      id: generateId(),
      dispute_id: input.disputeId,
      submitted_by: input.submittedBy,
      evidence_type: input.evidenceType,
      description: input.description,
      created_at: now,
      updated_at: now,
    };
    if (input.fileUrl) {
      evidenceEntity.file_url = input.fileUrl;
    }

    const createdEvidence = await disputeEvidenceRepository.createEvidence(evidenceEntity);

    const evidence: DisputeEvidence = {
      id: createdEvidence.id,
      disputeId: createdEvidence.dispute_id,
      submittedBy: createdEvidence.submitted_by,
      evidenceType: createdEvidence.evidence_type as DisputeEvidence['evidenceType'],
      fileUrl: createdEvidence.file_url ?? '',
      description: createdEvidence.description,
      createdAt: new Date(createdEvidence.created_at),
      updatedAt: new Date(createdEvidence.updated_at),
      ...(createdEvidence.verified_by ? { verifiedBy: createdEvidence.verified_by } : {}),
      ...(createdEvidence.verified_at ? { verifiedAt: new Date(createdEvidence.verified_at) } : {}),
    };

    if (disputeEntity.resolution?.resolved_by) {
      const notificationResult = await createNotification({
        userId: disputeEntity.resolution.resolved_by,
        type: 'dispute_evidence_submitted',
        title: 'New Evidence Submitted',
        message: `New evidence has been submitted for dispute #${input.disputeId.substring(0, 8)}`,
        data: {
          relatedId: input.disputeId,
          relatedType: 'dispute',
        },
      });

      if (notificationResult.success) {
        await sendNotificationToUser(disputeEntity.resolution.resolved_by, notificationResult.data);
      }
    }

    const otherPartyId = contractEntity.freelancer_id === input.submittedBy 
      ? contractEntity.employer_id 
      : contractEntity.freelancer_id;

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

    return successResult(evidence);
  } catch (error) {
    logger.error('Failed to submit evidence:', error);
    return errorResult('SUBMIT_FAILED', error instanceof Error ? error.message : 'Failed to submit evidence');
  }
}

export async function getDisputeEvidence(
  disputeId: string,
  userId: string
): Promise<ServiceResult<DisputeEvidence[]>> {
  try {
    const disputeEntity = await disputeRepository.getDisputeById(disputeId);
    if (!disputeEntity) {
      return errorResult('DISPUTE_NOT_FOUND', 'Dispute not found');
    }

    const contractEntity = await contractRepository.getContractById(disputeEntity.contract_id);
    if (!contractEntity) {
      return errorResult('DISPUTE_NOT_FOUND', 'Dispute not found');
    }

    const isAuthorized = 
      contractEntity.freelancer_id === userId || 
      contractEntity.employer_id === userId ||
      disputeEntity.resolution?.resolved_by === userId;

    if (!isAuthorized) {
      return errorResult('UNAUTHORIZED', 'You are not authorized to view this evidence');
    }

    const evidenceEntities = await disputeEvidenceRepository.findByDispute(disputeId);

    const evidence: DisputeEvidence[] = evidenceEntities.map(e => ({
      id: e.id,
      disputeId: e.dispute_id,
      submittedBy: e.submitted_by,
      evidenceType: e.evidence_type as DisputeEvidence['evidenceType'],
      fileUrl: e.file_url ?? '',
      description: e.description,
      createdAt: new Date(e.created_at),
      updatedAt: new Date(e.updated_at),
      ...(e.verified_by ? { verifiedBy: e.verified_by } : {}),
      ...(e.verified_at ? { verifiedAt: new Date(e.verified_at) } : {}),
    }));

    return successResult(evidence);
  } catch (error) {
    logger.error('Failed to get dispute evidence:', error);
    return errorResult('DATABASE_ERROR', error instanceof Error ? error.message : 'Failed to get evidence');
  }
}

export async function deleteEvidence(
  evidenceId: string,
  userId: string
): Promise<ServiceResult<void>> {
  try {
    const evidenceEntity = await disputeEvidenceRepository.getEvidenceById(evidenceId);

    if (!evidenceEntity) {
      return errorResult('EVIDENCE_NOT_FOUND', 'Evidence not found');
    }

    if (evidenceEntity.submitted_by !== userId) {
      return errorResult('UNAUTHORIZED', 'You can only delete your own evidence');
    }

    if (evidenceEntity.verified_at) {
      return errorResult('ALREADY_VERIFIED', 'Cannot delete verified evidence');
    }

    await disputeEvidenceRepository.deleteEvidence(evidenceId);

    if (evidenceEntity.file_url) {
      const fileId = extractFileIdFromUrl(evidenceEntity.file_url);
      if (fileId) {
        try {
          await deleteFileFromStorage(fileId, BUCKETS.DISPUTE_EVIDENCE);
        } catch (storageErr) {
          logger.warn('Failed to clean up evidence file from storage', { error: storageErr, evidenceId, fileId });
        }
      }
    }

    logger.info(`Evidence ${evidenceId} deleted by user ${userId}`);

    return successResult(undefined);
  } catch (error) {
    logger.error('Failed to delete evidence:', error);
    return errorResult('DELETE_FAILED', error instanceof Error ? error.message : 'Failed to delete evidence');
  }
}

export async function verifyEvidence(
  input: VerifyEvidenceInput
): Promise<ServiceResult<DisputeEvidence>> {
  try {
    const evidenceEntity = await disputeEvidenceRepository.getEvidenceById(input.evidenceId);

    if (!evidenceEntity) {
      return errorResult('EVIDENCE_NOT_FOUND', 'Evidence not found');
    }

    const disputeEntity = await disputeRepository.getDisputeById(evidenceEntity.dispute_id);
    if (!disputeEntity) {
      return errorResult('EVIDENCE_NOT_FOUND', 'Evidence not found');
    }

    // M12: Allow admins to verify evidence at any stage (not just after resolution).
    // Previously, evidence could only be verified by resolution.resolved_by which is
    // only set after the dispute is resolved — making the feature completely unusable.
    const verifier = await userRepository.getUserById(input.verifiedBy);
    const isAdmin = verifier?.role === 'admin';
    const isArbiter = disputeEntity.resolution?.resolved_by === input.verifiedBy;

    if (!isAdmin && !isArbiter) {
      return errorResult('UNAUTHORIZED', 'Only admins or the assigned arbiter can verify evidence');
    }

    const now = new Date().toISOString();
    const updatedEntity = await disputeEvidenceRepository.updateEvidence(input.evidenceId, {
      verified_by: input.verifiedBy,
      verified_at: now,
      updated_at: now,
    });

    if (!updatedEntity) {
      throw new Error('Failed to verify evidence');
    }

    const updated: DisputeEvidence = {
      id: updatedEntity.id,
      disputeId: updatedEntity.dispute_id,
      submittedBy: updatedEntity.submitted_by,
      evidenceType: updatedEntity.evidence_type as DisputeEvidence['evidenceType'],
      fileUrl: updatedEntity.file_url ?? '',
      description: updatedEntity.description,
      createdAt: new Date(updatedEntity.created_at),
      updatedAt: new Date(updatedEntity.updated_at),
      ...(updatedEntity.verified_by ? { verifiedBy: updatedEntity.verified_by } : {}),
      ...(updatedEntity.verified_at ? { verifiedAt: new Date(updatedEntity.verified_at) } : {}),
    };

    logger.info(`Evidence ${input.evidenceId} verified by arbiter ${input.verifiedBy}`);

    return successResult(updated);
  } catch (error) {
    logger.error('Failed to verify evidence:', error);
    return errorResult('VERIFY_FAILED', error instanceof Error ? error.message : 'Failed to verify evidence');
  }
}
