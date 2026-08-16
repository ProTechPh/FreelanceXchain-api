/**
 * Milestone Service
 *
 * Milestone state lives in the project document's embedded `milestones` array —
 * the single source of truth written by the payment/dispute/rush flows.
 * (The standalone `milestones` Appwrite collection is write-orphaned and is not
 * used here; reading it produced stale/empty results and broke reject/refund flows.)
 */

import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import type {
  MilestoneStatus,
  RejectMilestoneInput,
} from '../models/milestone.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import {
  projectRepository,
  type ProjectEntity,
  type MilestoneEntity,
} from '../repositories/project-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { requestMilestoneCompletion } from './payment-service.js';
import { generateId } from '../utils/id.js';
import { withLock, milestoneLockKey } from '../utils/async-lock.js';
import { persistAuditEntry } from '../utils/admin-audit.js';

type MilestoneWithContract = {
  milestone: MilestoneEntity & {
    contract_id: string;
    project_id: string;
    created_at: string;
    updated_at: string;
  };
  contract: ContractEntity;
};

type MilestoneContext = {
  contract: ContractEntity;
  project: ProjectEntity;
  milestone: MilestoneEntity;
  milestoneIndex: number;
};

/**
 * Locate a milestone inside the user's contracts' project documents.
 * The project document is the single source of truth for milestone state.
 */
async function findMilestoneContext(
  milestoneId: string,
  userId: string
): Promise<MilestoneContext | null> {
  const contractsResult = await contractRepository.getUserContracts(userId, { limit: 1000, offset: 0 });

  for (const contract of contractsResult.items) {
    const project = await projectRepository.findProjectById(contract.project_id);
    if (!project) continue;

    const milestoneIndex = (project.milestones ?? []).findIndex((m) => m.id === milestoneId);
    if (milestoneIndex === -1) continue;

    const milestone = project.milestones[milestoneIndex];
    if (!milestone) continue;

    return { contract, project, milestone, milestoneIndex };
  }

  return null;
}

/**
 * Attach relational fields (contract/project ids, timestamps) so the returned
 * milestone keeps the shape the API consumers expect from the old milestone repo.
 */
function enrichMilestone(
  milestone: MilestoneEntity,
  contractId: string,
  project: ProjectEntity
): MilestoneWithContract['milestone'] {
  return {
    ...milestone,
    contract_id: contractId,
    project_id: project.id,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

/**
 * Get milestone by ID with contract authorization
 */
export async function getMilestoneById(
  milestoneId: string,
  userId?: string
): Promise<ServiceResult<MilestoneWithContract>> {
  try {
    if (!userId) {
      return errorResult('UNAUTHORIZED', 'You are not authorized to view this milestone');
    }

    const context = await findMilestoneContext(milestoneId, userId);
    if (!context) {
      return errorResult('NOT_FOUND', 'Milestone not found');
    }

    return successResult({
      milestone: enrichMilestone(context.milestone, context.contract.id, context.project),
      contract: context.contract,
    });
  } catch (error) {
    logger.error('Failed to get milestone:', error);
    return errorResult('DATABASE_ERROR', error instanceof Error ? error.message : 'Failed to get milestone');
  }
}

/**
 * Reject milestone with reason (writes the project-document milestone).
 *
 * Serialized with approveMilestone via the shared `milestone-approve:{id}` lock
 * so a concurrent reject cannot race an approval on the same milestone state.
 */
/* eslint-disable max-lines-per-function -- reject SAGA; refactor follow-up */
export async function rejectMilestone(
  input: RejectMilestoneInput
): Promise<ServiceResult<MilestoneWithContract['milestone']>> {
  return withLock(milestoneLockKey(input.milestoneId), async () => {
    try {
      const context = await findMilestoneContext(input.milestoneId, input.employerId);
      if (!context) {
        return errorResult('NOT_FOUND', 'Milestone not found');
      }

      const { contract, project, milestone, milestoneIndex } = context;

      // Only the contract employer can reject a milestone
      if (contract.employer_id !== input.employerId) {
        return errorResult('UNAUTHORIZED', 'Only the contract employer can reject this milestone');
      }

      // Check if milestone can be rejected
      if (milestone.status !== 'submitted') {
        return errorResult('INVALID_STATUS', `Cannot reject milestone with status "${milestone.status}"`);
      }

      // L2: Enforce revision count cap to prevent infinite rejection loop
      const MAX_REVISIONS = 5;
      if (input.requestRevision && Number(milestone.revision_count ?? milestone.revisionCount ?? 0) >= MAX_REVISIONS) {
        return errorResult('MAX_REVISIONS_REACHED', `Maximum number of revisions (${MAX_REVISIONS}) has been reached. The milestone must be disputed or approved.`);
      }

      const newStatus: MilestoneStatus = input.requestRevision ? 'rejected' : 'disputed';
      const now = new Date().toISOString();

      const updatedMilestones = project.milestones.map((m, i) =>
        i === milestoneIndex
          ? {
              ...m,
              status: newStatus,
              rejected_at: now,
              rejectedAt: now,
              rejection_reason: input.reason,
              rejectionReason: input.reason,
            }
          : m
      );

      const updatedProject = await projectRepository.updateProject(project.id, { milestones: updatedMilestones });
      if (!updatedProject) {
        throw new Error('Failed to update milestone');
      }

      // H5: When rejecting without revision (disputed), create a proper dispute record
      if (!input.requestRevision) {
        const disputeId = generateId();
        await disputeRepository.createDispute({
          id: disputeId,
          contract_id: contract.id,
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

      // BLF-12.2: durable audit trail — milestone rejections (and rejections without
      // revision, which open a dispute) are recorded with the employer as actor and
      // the reason + status outcome. Best-effort by design.
      await persistAuditEntry({
        user_id: contract.freelancer_id,
        actor_id: input.employerId,
        action: input.requestRevision ? 'milestone.rejected' : 'milestone.disputed',
        resource_type: 'milestone',
        resource_id: input.milestoneId,
        payload: {
          contractId: contract.id,
          projectId: project.id,
          milestoneTitle: milestone.title ?? null,
          reason: input.reason,
          requestRevision: input.requestRevision ?? false,
          status: newStatus,
        },
        ip_address: null,
        user_agent: null,
        status: 'success',
        error_message: null,
      });

      logger.info(`Milestone ${input.milestoneId} rejected by employer ${input.employerId}`);

      const updatedMilestone = updatedProject.milestones[milestoneIndex];
      if (!updatedMilestone) {
        throw new Error('Failed to read updated milestone');
      }
      return successResult(enrichMilestone(updatedMilestone, contract.id, updatedProject));
    } catch (error) {
      logger.error('Failed to reject milestone:', error);
      return errorResult('REJECT_FAILED', error instanceof Error ? error.message : 'Failed to reject milestone');
    }
  });
}

export type MilestoneDeliverable = { filename: string; url: string; size: number; mimeType: string };

export type FreelancerMilestoneContext = {
  contractId: string;
  project: ProjectEntity;
  milestone: MilestoneEntity;
  milestoneIndex: number;
};

/**
 * Locate a milestone by scanning the freelancer's contracts' project documents.
 * Prefers active contracts, then falls back to other statuses (newest first).
 */
export async function findFreelancerMilestoneContext(
  freelancerId: string,
  milestoneId: string
): Promise<FreelancerMilestoneContext | null> {
  const contractsResult = await contractRepository.getContractsByFreelancer(freelancerId, { limit: 1000, offset: 0 });

  // Prefer active contracts first, then fall back to others.
  const contracts = [...contractsResult.items].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });

  for (const contract of contracts) {
    const project = await projectRepository.findProjectById(contract.project_id);
    if (!project) continue;

    const milestoneIndex = (project.milestones || []).findIndex((m) => m.id === milestoneId);
    if (milestoneIndex === -1) continue;

    const milestone = project.milestones[milestoneIndex];
    if (!milestone) continue;

    return {
      contractId: contract.id,
      project,
      milestone,
      milestoneIndex,
    };
  }

  return null;
}

/**
 * Map a milestone entity into the API response shape the milestone routes expose.
 */
export function mapMilestoneResponse(
  milestone: MilestoneEntity,
  contractId: string,
  project: ProjectEntity,
  submittedAtIso?: string
) {
  const deliverableFiles = milestone.deliverableFiles || milestone.deliverable_files || [];
  const revisionCount = milestone.revisionCount ?? milestone.revision_count ?? 0;
  const submittedAt = milestone.submittedAt || milestone.submitted_at || submittedAtIso;
  const approvedAt = milestone.approvedAt || milestone.approved_at;
  const rejectedAt = milestone.rejectedAt || milestone.rejected_at;
  const completedAt = milestone.completedAt || milestone.completed_at;
  const rejectionReason = milestone.rejectionReason || milestone.rejection_reason;

  return {
    id: milestone.id,
    contractId,
    title: milestone.title,
    description: milestone.description,
    amount: milestone.amount,
    dueDate: milestone.dueDate || milestone.due_date,
    status: milestone.status,
    submittedAt,
    approvedAt,
    rejectedAt,
    completedAt,
    deliverableFiles,
    rejectionReason,
    revisionCount,
    notes: milestone.notes,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

export type SubmitMilestoneResult =
  | { success: true; data: ReturnType<typeof mapMilestoneResponse> }
  | { success: false; error: { code: string; message: string } };

/**
 * Submit a milestone: resolve the freelancer context, request completion via the
 * payment service (escrow/blockchain aware), then re-read the project document to
 * return the updated milestone.
 */
export async function submitMilestoneFromProjectContext(
  milestoneId: string,
  freelancerId: string,
  deliverables: MilestoneDeliverable[],
  notes?: string
): Promise<SubmitMilestoneResult> {
  try {
    const context = await findFreelancerMilestoneContext(freelancerId, milestoneId);
    if (!context) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Milestone not found' },
      };
    }

    const completion = await requestMilestoneCompletion(context.contractId, milestoneId, freelancerId, {
      deliverables,
      ...(notes !== undefined ? { notes } : {}),
    });
    if (!completion.success) {
      const completionError = 'error' in completion
        ? completion.error
        : { code: 'SUBMIT_FAILED', message: 'Failed to submit milestone' };
      return { success: false, error: completionError };
    }

    const updatedProject = await projectRepository.findProjectById(context.project.id);
    if (!updatedProject) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      };
    }

    const milestoneIndex = (updatedProject.milestones || []).findIndex((m) => m.id === milestoneId);
    if (milestoneIndex === -1) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Milestone not found' },
      };
    }

    const updatedMilestone = updatedProject.milestones[milestoneIndex];
    if (!updatedMilestone) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Milestone not found' },
      };
    }

    const now = new Date().toISOString();

    return {
      success: true,
      data: mapMilestoneResponse(updatedMilestone, context.contractId, updatedProject, now),
    };
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
 * Find the contract id that contains the given milestone among the employer's contracts.
 * Used by the approval flow to locate the contract before releasing escrow.
 */
export async function findEmployerMilestoneContractId(
  employerId: string,
  milestoneId: string
): Promise<string | null> {
  const contractsResult = await contractRepository.getContractsByEmployer(employerId, { limit: 1000, offset: 0 });

  for (const contract of contractsResult.items) {
    const project = await projectRepository.findProjectById(contract.project_id);
    if (!project) continue;
    const found = (project.milestones || []).some((m) => m.id === milestoneId);
    if (found) {
      return contract.id;
    }
  }

  return null;
}

/**
 * Get milestones for a contract (from the project document)
 */
export async function getContractMilestones(
  contractId: string,
  userId?: string
): Promise<ServiceResult<MilestoneWithContract['milestone'][]>> {
  try {
    const contract = await contractRepository.getContractById(contractId);
    if (!contract) {
      return errorResult('NOT_FOUND', 'Contract not found');
    }

    // BLF-8.1: Verify user is a party to the contract before returning milestones
    if (userId) {
      if (contract.employer_id !== userId && contract.freelancer_id !== userId) {
        return errorResult('UNAUTHORIZED', 'You are not authorized to view these milestones');
      }
    }

    const project = await projectRepository.findProjectById(contract.project_id);
    if (!project) {
      return successResult([]);
    }

    return successResult(project.milestones.map((m) => enrichMilestone(m, contract.id, project)));
  } catch (error) {
    logger.error('Failed to get contract milestones:', error);
    return errorResult('DATABASE_ERROR', error instanceof Error ? error.message : 'Failed to get milestones');
  }
}
