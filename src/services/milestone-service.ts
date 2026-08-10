import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import type {
  MilestoneStatus,
  SubmitMilestoneInput,
  RejectMilestoneInput,
} from '../models/milestone.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';
import { milestoneRepository, type MilestoneEntity } from '../repositories/milestone-repository.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { generateId } from '../utils/id.js';

/**
 * Get milestone by ID with contract authorization
 */
export type MilestoneWithContract = {
  milestone: MilestoneEntity;
  contract: ContractEntity;
};

export async function getMilestoneById(milestoneId: string, userId?: string): Promise<ServiceResult<MilestoneWithContract>> {
  try {
    const milestone = await milestoneRepository.getById(milestoneId);

    if (!milestone) {
      return errorResult('NOT_FOUND', 'Milestone not found');
    }

    if (!userId) {
      return errorResult('UNAUTHORIZED', 'You are not authorized to view this milestone');
    }

    // contract_id is the canonical field; the camelCase fallback supports callers that
    // pass model-shaped milestone payloads (e.g. test fixtures) instead of entities
    const contractId = milestone.contract_id ?? (milestone as { contractId?: string }).contractId;
    if (!contractId) {
      return errorResult('NOT_FOUND', 'Milestone not found');
    }

    const contract = await contractRepository.getContractById(contractId);
    if (!contract || (contract.employer_id !== userId && contract.freelancer_id !== userId)) {
      return errorResult('UNAUTHORIZED', 'You are not authorized to view this milestone');
    }

    return successResult({ milestone, contract });
  } catch (error) {
    logger.error('Failed to get milestone:', error);
    return errorResult('DATABASE_ERROR', error instanceof Error ? error.message : 'Failed to get milestone');
  }
}

/**
 * Submit milestone with deliverables
 */
export async function submitMilestone(
  input: SubmitMilestoneInput
): Promise<ServiceResult<MilestoneEntity>> {
  try {
    // Get milestone and verify ownership
    const milestoneResult = await getMilestoneById(input.milestoneId, input.freelancerId);
    if (!milestoneResult.success) {
      return milestoneResult;
    }

    const { milestone, contract } = milestoneResult.data;

    // H4: Verify contract is active before allowing milestone submission
    if (contract.status !== 'active') {
      return errorResult('INVALID_STATUS', `Cannot submit milestone on a ${contract.status} contract`);
    }

    // Check if milestone can be submitted
    if (milestone.status !== 'pending' && milestone.status !== 'rejected') {
      return errorResult('INVALID_STATUS', `Cannot submit milestone with status "${milestone.status}"`);
    }

    // Update milestone
    const updated = await milestoneRepository.update(input.milestoneId, {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      deliverable_files: JSON.stringify(input.deliverables),
      revision_count: milestone.status === 'rejected' ? milestone.revision_count + 1 : milestone.revision_count,
      updated_at: new Date().toISOString(),
    });

    if (!updated) {
      throw new Error('Failed to update milestone');
    }

    // Create notification for employer
    const notificationResult = await createNotification({
      userId: contract.employer_id,
      type: 'milestone_submitted',
      title: 'Milestone Submitted',
      message: `Freelancer has submitted milestone: ${milestone.title}`,
      data: {
        milestoneId: input.milestoneId,
        type: 'milestone',
      },
    });

    if (notificationResult.success) {
      await sendNotificationToUser(contract.employer_id, notificationResult.data);
    }

    logger.info(`Milestone ${input.milestoneId} submitted by freelancer ${input.freelancerId}`);

    return successResult(updated);
  } catch (error) {
    logger.error('Failed to submit milestone:', error);
    return errorResult('SUBMIT_FAILED', error instanceof Error ? error.message : 'Failed to submit milestone');
  }
}

/**
 * Reject milestone with reason
 */
export async function rejectMilestone(
  input: RejectMilestoneInput
): Promise<ServiceResult<MilestoneEntity>> {
  try {
    // Get milestone
    const milestoneResult = await getMilestoneById(input.milestoneId, input.employerId);
    if (!milestoneResult.success) {
      return milestoneResult;
    }

    const { milestone, contract } = milestoneResult.data;

    // Check if milestone can be rejected
    if (milestone.status !== 'submitted') {
      return errorResult('INVALID_STATUS', `Cannot reject milestone with status "${milestone.status}"`);
    }

    // L2: Enforce revision count cap to prevent infinite rejection loop
    const MAX_REVISIONS = 5;
    if (input.requestRevision && milestone.revision_count >= MAX_REVISIONS) {
      return errorResult('MAX_REVISIONS_REACHED', `Maximum number of revisions (${MAX_REVISIONS}) has been reached. The milestone must be disputed or approved.`);
    }

    // Update milestone
    const newStatus: MilestoneStatus = input.requestRevision ? 'rejected' : 'disputed';

    const updated = await milestoneRepository.update(input.milestoneId, {
      status: newStatus,
      rejected_at: new Date().toISOString(),
      rejection_reason: input.reason,
      updated_at: new Date().toISOString(),
    });

    if (!updated) {
      throw new Error('Failed to update milestone');
    }

    // H5: When rejecting without revision (disputed), create a proper dispute record
    if (!input.requestRevision) {
      const disputeId = generateId();
      await disputeRepository.createDispute({
        id: disputeId,
        contract_id: milestone.contract_id,
        milestone_id: input.milestoneId,
        initiator_id: input.employerId,
        reason: input.reason || 'Milestone rejected without revision',
        evidence: [],
        status: 'open',
        resolution: null,
      });
      logger.info(`Dispute record created for rejected milestone ${input.milestoneId}`, { disputeId });
    }

    // Create notification for freelancer
    const notificationResult = await createNotification({
      userId: contract.freelancer_id,
      type: 'milestone_rejected',
      title: input.requestRevision ? 'Milestone Revision Requested' : 'Milestone Rejected',
      message: input.requestRevision
        ? `Revision requested for milestone "${milestone.title}": ${input.reason}`
        : `Milestone "${milestone.title}" was rejected: ${input.reason}`,
      data: {
        milestoneId: input.milestoneId,
        type: 'milestone',
      },
    });

    if (notificationResult.success) {
      await sendNotificationToUser(contract.freelancer_id, notificationResult.data);
    }

    logger.info(`Milestone ${input.milestoneId} rejected by employer ${input.employerId}`);

    return successResult(updated);
  } catch (error) {
    logger.error('Failed to reject milestone:', error);
    return errorResult('REJECT_FAILED', error instanceof Error ? error.message : 'Failed to reject milestone');
  }
}

/**
 * Get milestones for contract
 */
export async function getContractMilestones(contractId: string, userId?: string): Promise<ServiceResult<MilestoneEntity[]>> {
  try {
    // BLF-8.1: Verify user is a party to the contract before returning milestones
    if (userId) {
      const contract = await contractRepository.getContractById(contractId);
      if (!contract) {
        return errorResult('NOT_FOUND', 'Contract not found');
      }
      if (contract.employer_id !== userId && contract.freelancer_id !== userId) {
        return errorResult('UNAUTHORIZED', 'You are not authorized to view these milestones');
      }
    }

    const milestones = await milestoneRepository.findByContract(contractId);

    return successResult(milestones);
  } catch (error) {
    logger.error('Failed to get contract milestones:', error);
    return errorResult('DATABASE_ERROR', error instanceof Error ? error.message : 'Failed to get milestones');
  }
}
