import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import type {
  Milestone,
  MilestoneStatus,
  SubmitMilestoneInput,
  RejectMilestoneInput,
  FileAttachment,
} from '../models/milestone.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';

/**
 * Get milestone by ID
 */
export async function getMilestoneById(milestoneId: string): Promise<ServiceResult<Milestone>> {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('id', milestoneId)
      .single();

    if (error) throw error;
    if (!data) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Milestone not found' },
      };
    }

    return { success: true, data: data as Milestone };
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
    const supabase = getSupabaseClient();

    // Get milestone and verify ownership
    const milestoneResult = await getMilestoneById(input.milestoneId);
    if (!milestoneResult.success) {
      return milestoneResult;
    }

    const milestone = milestoneResult.data;

    // Get contract to verify freelancer
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('freelancer_id, employer_id, project_id')
      .eq('id', milestone.contractId)
      .single();

    if (contractError || !contract) {
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
    const { data: updated, error: updateError } = await supabase
      .from('milestones')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        deliverable_files: input.deliverables,
        revision_count: milestone.status === 'rejected' ? milestone.revisionCount + 1 : milestone.revisionCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.milestoneId)
      .select()
      .single();

    if (updateError || !updated) {
      throw updateError || new Error('Failed to update milestone');
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

    return { success: true, data: updated as Milestone };
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
    const supabase = getSupabaseClient();

    // Get milestone
    const milestoneResult = await getMilestoneById(input.milestoneId);
    if (!milestoneResult.success) {
      return milestoneResult;
    }

    const milestone = milestoneResult.data;

    // Get contract to verify employer
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('freelancer_id, employer_id, project_id')
      .eq('id', milestone.contractId)
      .single();

    if (contractError || !contract) {
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
    
    const { data: updated, error: updateError } = await supabase
      .from('milestones')
      .update({
        status: newStatus,
        rejected_at: new Date().toISOString(),
        rejection_reason: input.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.milestoneId)
      .select()
      .single();

    if (updateError || !updated) {
      throw updateError || new Error('Failed to update milestone');
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

    return { success: true, data: updated as Milestone };
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
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('contract_id', contractId)
      .order('due_date', { ascending: true });

    if (error) throw error;

    return { success: true, data: (data || []) as Milestone[] };
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
