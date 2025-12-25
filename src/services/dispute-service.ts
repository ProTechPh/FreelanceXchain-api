/**
 * Dispute Service
 * Handles dispute creation, evidence submission, and resolution
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { Dispute, mapDisputeFromEntity } from '../utils/entity-mapper.js';
import { disputeRepository, DisputeEntity, EvidenceEntity, DisputeResolutionEntity } from '../repositories/dispute-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { mapContractFromEntity, mapProjectFromEntity, mapMilestoneFromEntity } from '../utils/entity-mapper.js';
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
import {
  createDisputeOnBlockchain,
  updateDisputeEvidence,
  resolveDisputeOnBlockchain,
} from './dispute-registry.js';
import { disputeAgreement } from './agreement-contract.js';

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
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

  // Verify initiator is part of this contract
  if (contract.employerId !== initiatorId && contract.freelancerId !== initiatorId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only contract parties can create disputes' },
    };
  }

  // Get project to validate milestone
  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  // Validate milestone exists
  const milestoneEntity = projectEntity.milestones.find(m => m.id === milestoneId);
  if (!milestoneEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }
  const milestone = mapMilestoneFromEntity(milestoneEntity);

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
  const existingDisputeEntity = await disputeRepository.getDisputeByMilestone(milestoneId);
  if (existingDisputeEntity && existingDisputeEntity.status !== 'resolved') {
    return {
      success: false,
      error: { code: 'DUPLICATE_DISPUTE', message: 'An active dispute already exists for this milestone' },
    };
  }

  // Create dispute entity
  const disputeEntity: Omit<DisputeEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    contract_id: contractId,
    milestone_id: milestoneId,
    initiator_id: initiatorId,
    reason,
    evidence: [],
    status: 'open',
    resolution: null,
  };

  // Save dispute to database
  const createdDisputeEntity = await disputeRepository.createDispute(disputeEntity);
  const createdDispute = mapDisputeFromEntity(createdDisputeEntity);

  // Record dispute on blockchain
  try {
    const initiator = await userRepository.getUserById(initiatorId);
    const freelancer = await userRepository.getUserById(contract.freelancerId);
    const employer = await userRepository.getUserById(contract.employerId);

    if (initiator?.wallet_address && freelancer?.wallet_address && employer?.wallet_address) {
      await createDisputeOnBlockchain({
        disputeId: createdDispute.id,
        contractId,
        milestoneId,
        initiatorWallet: initiator.wallet_address,
        freelancerWallet: freelancer.wallet_address,
        employerWallet: employer.wallet_address,
        amount: milestone.amount,
      });

      // Mark agreement as disputed on blockchain
      await disputeAgreement(contractId, initiator.wallet_address);
    }
  } catch (error) {
    console.error('Failed to record dispute on blockchain:', error);
  }

  // Update milestone status to disputed
  milestoneEntity.status = 'disputed';
  await projectRepository.updateProject(project.id, {
    milestones: projectEntity.milestones,
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
  const disputeEntity = await disputeRepository.findDisputeById(disputeId);
  if (!disputeEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Dispute not found' },
    };
  }

  // Check dispute status - can only submit evidence for open or under_review disputes
  if (disputeEntity.status === 'resolved') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Cannot submit evidence for resolved disputes' },
    };
  }

  // Verify submitter is part of the contract
  const contractEntity = await contractRepository.getContractById(disputeEntity.contract_id);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  if (contractEntity.employer_id !== submitterId && contractEntity.freelancer_id !== submitterId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only contract parties can submit evidence' },
    };
  }

  // Create evidence entity
  const evidenceEntity: EvidenceEntity = {
    id: generateId(),
    submitter_id: submitterId,
    type,
    content,
    submitted_at: new Date().toISOString(),
  };

  // Add evidence to dispute
  const updatedEvidence = [...disputeEntity.evidence, evidenceEntity];

  // Update dispute status to under_review if it was open
  const newStatus = disputeEntity.status === 'open' ? 'under_review' : disputeEntity.status;

  const updatedDisputeEntity = await disputeRepository.updateDispute(
    disputeId,
    {
      evidence: updatedEvidence,
      status: newStatus,
    }
  );

  if (!updatedDisputeEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update dispute' },
    };
  }

  // Update evidence hash on blockchain
  try {
    const submitter = await userRepository.getUserById(submitterId);
    if (submitter?.wallet_address) {
      const evidenceData = JSON.stringify(updatedEvidence);
      await updateDisputeEvidence(disputeId, evidenceData, submitter.wallet_address);
    }
  } catch (error) {
    console.error('Failed to update evidence on blockchain:', error);
  }

  return { success: true, data: mapDisputeFromEntity(updatedDisputeEntity) };
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
  const disputeEntity = await disputeRepository.findDisputeById(disputeId);
  if (!disputeEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Dispute not found' },
    };
  }

  // Check dispute status
  if (disputeEntity.status === 'resolved') {
    return {
      success: false,
      error: { code: 'ALREADY_RESOLVED', message: 'Dispute is already resolved' },
    };
  }

  // Get contract
  const contractEntity = await contractRepository.getContractById(disputeEntity.contract_id);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

  // Get project for milestone info
  const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  const milestoneEntity = projectEntity.milestones.find(m => m.id === disputeEntity.milestone_id);
  if (!milestoneEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }
  const milestone = mapMilestoneFromEntity(milestoneEntity);

  // Create resolution entity
  const resolutionEntity: DisputeResolutionEntity = {
    decision,
    reasoning,
    resolved_by: resolvedBy,
    resolved_at: new Date().toISOString(),
  };

  // Trigger payment based on decision (Requirements: 8.4, 8.5)
  try {
    const escrow = await getEscrowByContractId(disputeEntity.contract_id);
    if (escrow) {
      if (decision === 'freelancer_favor') {
        // Release funds to freelancer
        await releaseEscrowMilestone(escrow.address, disputeEntity.milestone_id, resolvedBy);
        milestoneEntity.status = 'approved';
      } else if (decision === 'employer_favor') {
        // Refund funds to employer
        await refundEscrowMilestone(escrow.address, disputeEntity.milestone_id, resolvedBy);
        milestoneEntity.status = 'pending';
      } else if (decision === 'split') {
        // For split decision, mark as approved (partial release would be handled separately)
        milestoneEntity.status = 'approved';
      }
    }
  } catch (error) {
    console.error('Failed to process payment for dispute resolution:', error);
    // Continue with resolution even if payment fails
  }

  // Update milestone status in project
  await projectRepository.updateProject(project.id, {
    milestones: projectEntity.milestones,
  });

  // Check if contract should be updated
  const hasOtherDisputes = projectEntity.milestones.some(
    m => m.status === 'disputed' && m.id !== disputeEntity.milestone_id
  );
  if (!hasOtherDisputes) {
    await contractRepository.updateContract(disputeEntity.contract_id, { status: 'active' });
  }

  const updatedDisputeEntity = await disputeRepository.updateDispute(
    disputeId,
    {
      status: 'resolved',
      resolution: resolutionEntity,
    }
  );

  if (!updatedDisputeEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update dispute' },
    };
  }

  const updatedDispute = mapDisputeFromEntity(updatedDisputeEntity);

  // Record resolution on blockchain
  try {
    const resolver = await userRepository.getUserById(resolvedBy);
    if (resolver?.wallet_address) {
      await resolveDisputeOnBlockchain({
        disputeId,
        outcome: decision,
        reasoning,
        arbiterWallet: resolver.wallet_address,
      });
    }
  } catch (error) {
    console.error('Failed to record dispute resolution on blockchain:', error);
  }

  // Send notifications to both parties
  await notifyDisputeResolved(
    contract.freelancerId,
    disputeId,
    decision,
    disputeEntity.milestone_id,
    milestone.title,
    project.id,
    project.title,
    disputeEntity.contract_id
  );

  await notifyDisputeResolved(
    contract.employerId,
    disputeId,
    decision,
    disputeEntity.milestone_id,
    milestone.title,
    project.id,
    project.title,
    disputeEntity.contract_id
  );

  return { success: true, data: updatedDispute };
}


/**
 * Get dispute by ID
 */
export async function getDisputeById(
  disputeId: string
): Promise<DisputeServiceResult<Dispute>> {
  const disputeEntity = await disputeRepository.findDisputeById(disputeId);
  if (!disputeEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Dispute not found' },
    };
  }
  return { success: true, data: mapDisputeFromEntity(disputeEntity) };
}

/**
 * Get disputes by contract ID
 */
export async function getDisputesByContract(
  contractId: string,
  userId: string
): Promise<DisputeServiceResult<Dispute[]>> {
  // Verify user is part of the contract
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }

  if (contractEntity.employer_id !== userId && contractEntity.freelancer_id !== userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only contract parties can view disputes' },
    };
  }

  const disputeEntities = await disputeRepository.getAllDisputesByContract(contractId);
  return { success: true, data: disputeEntities.map(mapDisputeFromEntity) };
}

/**
 * Get all open disputes (for admin)
 */
export async function getOpenDisputes(): Promise<DisputeServiceResult<Dispute[]>> {
  const result = await disputeRepository.getDisputesByStatus('open');
  return { success: true, data: result.items.map(mapDisputeFromEntity) };
}

/**
 * Get disputes initiated by a user
 */
export async function getDisputesByInitiator(
  initiatorId: string
): Promise<DisputeServiceResult<Dispute[]>> {
  const result = await disputeRepository.getDisputesByInitiator(initiatorId);
  return { success: true, data: result.items.map(mapDisputeFromEntity) };
}
