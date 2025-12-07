/**
 * Dispute Service
 * Handles dispute creation, evidence submission, and resolution
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { Dispute, Evidence, DisputeResolution } from '../models/dispute.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { generateId } from '../utils/id.js';
import {
  notifyDisputeCreated,
  notifyDisputeResolved,
} from './notification-service.js';
import {
  releaseMilestone as releaseEscrowMilestone,
  refundMilestone as refundEscrowMilestone,
  getEscrowByContractId,
} from './escrow-contract.js';

export type DisputeServiceError = {
  code: string;
  message: string;
  details?: string[];
};

export type DisputeServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: DisputeServiceError };

export type CreateDisputeInput = {
  contractId: string;
  milestoneId: string;
  initiatorId: string;
  reason: string;
};

export type SubmitEvidenceInput = {
  disputeId: string;
  submitterId: string;
  type: 'text' | 'file' | 'link';
  content: string;
};

export type ResolveDisputeInput = {
  disputeId: string;
  decision: 'freelancer_favor' | 'employer_favor' | 'split';
  reasoning: string;
  resolvedBy: string;
};


/**
 * Create a new dispute
 * Requirements: 8.1, 8.2
 */
export async function createDispute(
  input: CreateDisputeInput
): Promise<DisputeServiceResult<Dispute>> {
  const { contractId, milestoneId, initiatorId, reason } = input;

  // Validate contract exists
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  // Verify initiator is part of this contract
  if (contract.employerId !== initiatorId && contract.freelancerId !== initiatorId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only contract parties can create disputes' },
    };
  }

  // Get project to validate milestone
  const project = await projectRepository.findProjectById(contract.projectId);
  if (!project) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  // Validate milestone exists
  const milestone = project.milestones.find(m => m.id === milestoneId);
  if (!milestone) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  // Check if milestone is already disputed
  if (milestone.status === 'disputed') {
    return {
      success: false,
      error: { code: 'ALREADY_DISPUTED', message: 'Milestone is already under dispute' },
    };
  }

  // Check if milestone is already approved (cannot dispute approved milestones)
  if (milestone.status === 'approved') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Cannot dispute an approved milestone' },
    };
  }

  // Check for existing dispute on this milestone
  const existingDispute = await disputeRepository.getDisputeByMilestone(milestoneId);
  if (existingDispute && existingDispute.status !== 'resolved') {
    return {
      success: false,
      error: { code: 'DUPLICATE_DISPUTE', message: 'An active dispute already exists for this milestone' },
    };
  }

  // Create dispute record
  const dispute: Dispute = {
    id: generateId(),
    contractId,
    milestoneId,
    initiatorId,
    reason,
    evidence: [],
    status: 'open',
    resolution: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Save dispute to database
  const createdDispute = await disputeRepository.createDispute(dispute);

  // Update milestone status to disputed
  milestone.status = 'disputed';
  await projectRepository.updateProject(project.id, project.employerId, {
    milestones: project.milestones,
  });

  // Update contract status to disputed
  await contractRepository.updateContract(contractId, { status: 'disputed' });

  // Send notifications to both parties (Requirements: 8.2)
  await notifyDisputeCreated(
    contract.freelancerId,
    createdDispute.id,
    milestoneId,
    milestone.title,
    project.id,
    project.title,
    contractId
  );

  await notifyDisputeCreated(
    contract.employerId,
    createdDispute.id,
    milestoneId,
    milestone.title,
    project.id,
    project.title,
    contractId
  );

  return { success: true, data: createdDispute };
}


/**
 * Submit evidence for a dispute
 * Requirements: 8.3
 */
export async function submitEvidence(
  input: SubmitEvidenceInput
): Promise<DisputeServiceResult<Dispute>> {
  const { disputeId, submitterId, type, content } = input;

  // Find dispute
  const dispute = await disputeRepository.findDisputeById(disputeId);
  if (!dispute) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Dispute not found' },
    };
  }

  // Check dispute status - can only submit evidence for open or under_review disputes
  if (dispute.status === 'resolved') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Cannot submit evidence for resolved disputes' },
    };
  }

  // Verify submitter is part of the contract
  const contract = await contractRepository.getContractById(dispute.contractId);
  if (!contract) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  if (contract.employerId !== submitterId && contract.freelancerId !== submitterId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only contract parties can submit evidence' },
    };
  }

  // Create evidence record with metadata
  const evidence: Evidence = {
    id: generateId(),
    submitterId,
    type,
    content,
    submittedAt: new Date().toISOString(),
  };

  // Add evidence to dispute
  const updatedEvidence = [...dispute.evidence, evidence];

  // Update dispute status to under_review if it was open
  const newStatus = dispute.status === 'open' ? 'under_review' : dispute.status;

  const updatedDispute = await disputeRepository.updateDispute(
    disputeId,
    dispute.contractId,
    {
      evidence: updatedEvidence,
      status: newStatus,
    }
  );

  if (!updatedDispute) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update dispute' },
    };
  }

  return { success: true, data: updatedDispute };
}


/**
 * Resolve a dispute
 * Requirements: 8.4, 8.5, 8.6
 */
export async function resolveDispute(
  input: ResolveDisputeInput
): Promise<DisputeServiceResult<Dispute>> {
  const { disputeId, decision, reasoning, resolvedBy } = input;

  // Find dispute
  const dispute = await disputeRepository.findDisputeById(disputeId);
  if (!dispute) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Dispute not found' },
    };
  }

  // Check dispute status
  if (dispute.status === 'resolved') {
    return {
      success: false,
      error: { code: 'ALREADY_RESOLVED', message: 'Dispute is already resolved' },
    };
  }

  // Get contract
  const contract = await contractRepository.getContractById(dispute.contractId);
  if (!contract) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  // Get project for milestone info
  const project = await projectRepository.findProjectById(contract.projectId);
  if (!project) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  const milestone = project.milestones.find(m => m.id === dispute.milestoneId);
  if (!milestone) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  // Create resolution record
  const resolution: DisputeResolution = {
    decision,
    reasoning,
    resolvedBy,
    resolvedAt: new Date().toISOString(),
  };

  // Trigger payment based on decision (Requirements: 8.4, 8.5)
  try {
    const escrow = await getEscrowByContractId(dispute.contractId);
    if (escrow) {
      if (decision === 'freelancer_favor') {
        // Release funds to freelancer
        await releaseEscrowMilestone(escrow.address, dispute.milestoneId, resolvedBy);
        milestone.status = 'approved';
      } else if (decision === 'employer_favor') {
        // Refund funds to employer
        await refundEscrowMilestone(escrow.address, dispute.milestoneId, resolvedBy);
        milestone.status = 'pending';
      } else if (decision === 'split') {
        // For split decision, mark as approved (partial release would be handled separately)
        milestone.status = 'approved';
      }
    }
  } catch (error) {
    console.error('Failed to process payment for dispute resolution:', error);
    // Continue with resolution even if payment fails
  }

  // Update milestone status in project
  await projectRepository.updateProject(project.id, project.employerId, {
    milestones: project.milestones,
  });

  // Check if contract should be updated
  const hasOtherDisputes = project.milestones.some(
    m => m.status === 'disputed' && m.id !== dispute.milestoneId
  );
  if (!hasOtherDisputes) {
    await contractRepository.updateContract(dispute.contractId, { status: 'active' });
  }

  // Update dispute with resolution
  const updatedDispute = await disputeRepository.updateDispute(
    disputeId,
    dispute.contractId,
    {
      status: 'resolved',
      resolution,
    }
  );

  if (!updatedDispute) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update dispute' },
    };
  }

  // Send notifications to both parties
  await notifyDisputeResolved(
    contract.freelancerId,
    disputeId,
    decision,
    dispute.milestoneId,
    milestone.title,
    project.id,
    project.title,
    dispute.contractId
  );

  await notifyDisputeResolved(
    contract.employerId,
    disputeId,
    decision,
    dispute.milestoneId,
    milestone.title,
    project.id,
    project.title,
    dispute.contractId
  );

  return { success: true, data: updatedDispute };
}


/**
 * Get dispute by ID
 */
export async function getDisputeById(
  disputeId: string
): Promise<DisputeServiceResult<Dispute>> {
  const dispute = await disputeRepository.findDisputeById(disputeId);
  if (!dispute) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Dispute not found' },
    };
  }
  return { success: true, data: dispute };
}

/**
 * Get disputes by contract ID
 */
export async function getDisputesByContract(
  contractId: string,
  userId: string
): Promise<DisputeServiceResult<Dispute[]>> {
  // Verify user is part of the contract
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  if (contract.employerId !== userId && contract.freelancerId !== userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only contract parties can view disputes' },
    };
  }

  const disputes = await disputeRepository.getAllDisputesByContract(contractId);
  return { success: true, data: disputes };
}

/**
 * Get all open disputes (for admin)
 */
export async function getOpenDisputes(): Promise<DisputeServiceResult<Dispute[]>> {
  const result = await disputeRepository.getOpenDisputes();
  return { success: true, data: result.items };
}

/**
 * Get disputes initiated by a user
 */
export async function getDisputesByInitiator(
  initiatorId: string
): Promise<DisputeServiceResult<Dispute[]>> {
  const result = await disputeRepository.getDisputesByInitiator(initiatorId);
  return { success: true, data: result.items };
}
