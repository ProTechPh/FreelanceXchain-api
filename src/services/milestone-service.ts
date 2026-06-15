import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import type {
  Milestone,
  MilestoneStatus,
  SubmitMilestoneInput,
  RejectMilestoneInput,
} from '../models/milestone.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';
import { milestoneRepository } from '../repositories/milestone-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';

/**
 * Get milestone by ID
 */
export async function getMilestoneById(milestoneId: string): Promise<ServiceResult<Milestone>> {
  try {
    const milestone = await milestoneRepository.getById(milestoneId);

    if (!milestone) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Milestone not found' },
      };
    }

    return { success: true, data: milestone as unknown as Milestone };
  } catch (error) {
    logger.error('Failed to get milestone:', error);
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get milestone',
      },
    };
  }
}

/**
 * Submit milestone with deliverables
 */
export async function submitMilestone(
  input: SubmitMilestoneInput
): Promise<ServiceResult<Milestone>> {
  try {
    // Get milestone and verify ownership
    const milestoneResult = await getMilestoneById(input.milestoneId);
    if (!milestoneResult.success) {
      return milestoneResult;
    }

    const milestone: any = milestoneResult.data;

    // Get contract to verify freelancer
    const contract = await contractRepository.getContractById(milestone.contract_id);

    if (!contract) {
      return {
        success: false,
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      };
    }

    if (contract.freelancer_id !== input.freelancerId) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You are not authorized to submit this milestone' },
      };
    }

    // Check if milestone can be submitted
    if (milestone.status !== 'pending' && milestone.status !== 'rejected') {
      return {
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot submit milestone with status "${milestone.status}"`,
        },
      };
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

    return { success: true, data: updated as unknown as Milestone };
  } catch (error) {
    logger.error('Failed to submit milestone:', error);
    return {
      success: false,
      error: {
        code: 'SUBMIT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to submit milestone',
      },
    };
  }
}

/**
 * Reject milestone with reason
 */
export async function rejectMilestone(
  input: RejectMilestoneInput
): Promise<ServiceResult<Milestone>> {
  try {
    // Get milestone
    const milestoneResult = await getMilestoneById(input.milestoneId);
    if (!milestoneResult.success) {
      return milestoneResult;
    }

    const milestone: any = milestoneResult.data;

    // Get contract to verify employer
    const contract = await contractRepository.getContractById(milestone.contract_id);

    if (!contract) {
      return {
        success: false,
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      };
    }

    if (contract.employer_id !== input.employerId) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'You are not authorized to reject this milestone' },
      };
    }

    // Check if milestone can be rejected
    if (milestone.status !== 'submitted') {
      return {
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot reject milestone with status "${milestone.status}"`,
        },
      };
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

    return { success: true, data: updated as unknown as Milestone };
  } catch (error) {
    logger.error('Failed to reject milestone:', error);
    return {
      success: false,
      error: {
        code: 'REJECT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to reject milestone',
      },
    };
  }
}

/**
 * Get milestones for contract
 */
export async function getContractMilestones(contractId: string): Promise<ServiceResult<Milestone[]>> {
  try {
    const milestones = await milestoneRepository.findByContract(contractId);

    return { success: true, data: milestones as unknown as Milestone[] };
  } catch (error) {
    logger.error('Failed to get contract milestones:', error);
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get milestones',
      },
    };
  }
}
