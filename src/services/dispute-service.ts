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
import { getSupabaseServiceClient } from '../config/supabase.js';
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
import { logger } from '../config/logger.js';

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
  resolverRole: 'admin'; // Only admins can resolve disputes
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

  // FIXED: Verify contract is active before allowing disputes
  // Cannot dispute milestones on completed, cancelled, or pending contracts
  if (contract.status !== 'active') {
    return {
      success: false,
      error: { 
        code: 'INVALID_CONTRACT_STATUS', 
        message: `Cannot create disputes on a ${contract.status} contract. Only active contracts can be disputed.` 
      },
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

  // Only submitted milestones can be disputed
  if (milestone.status === 'disputed') {
    return {
      success: false,
      error: { code: 'ALREADY_DISPUTED', message: 'Milestone is already under dispute' },
    };
  }

  if (milestone.status !== 'submitted') {
    const message = milestone.status === 'approved'
      ? 'Cannot dispute an approved milestone'
      : `Milestone must be submitted before it can be disputed (current status: ${milestone.status})`;

    return {
      success: false,
      error: { code: 'INVALID_STATUS', message },
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
      await disputeAgreement(createdDispute.contractId, initiator.wallet_address);
    }
  } catch (error) {
    logger.error('Failed to record dispute on blockchain', error as Error, {
      disputeId: createdDispute.id,
      contractId: createdDispute.contractId,
    });
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

  // Notify all admin users about the new dispute
  try {
    const adminUsers = await userRepository.getUsersByRole('admin');
    await Promise.all(
      adminUsers.map(admin =>
        notifyDisputeCreated(
          admin.id,
          createdDispute.id,
          milestoneId,
          milestone.title,
          project.id,
          project.title,
          contractId
        )
      )
    );
  } catch (error) {
    logger.error('Failed to notify admin users about dispute', error as Error, {
      disputeId: createdDispute.id,
    });
  }

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

  // Add evidence to dispute atomically to prevent race condition (Requirement 8.3)
  const { data: newEvidenceArray, error: rpcError } = await getSupabaseServiceClient()
    .rpc('append_dispute_evidence', {
      p_dispute_id: disputeId,
      p_evidence: [evidenceEntity] // Passed as an array to append
    });

  if (rpcError) {
    logger.error('Failed to append evidence via RPC', rpcError, { disputeId });
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update dispute evidence' },
    };
  }

  // Get the fully updated entity
  const updatedDisputeEntity = await disputeRepository.findDisputeById(disputeId);
  if (!updatedDisputeEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to retrieve updated dispute' },
    };
  }

  const updatedEvidence = updatedDisputeEntity.evidence;

  // Update evidence hash on blockchain
  try {
    const submitter = await userRepository.getUserById(submitterId);
    if (submitter?.wallet_address) {
      const evidenceData = JSON.stringify(updatedEvidence);
      await updateDisputeEvidence(disputeId, evidenceData, submitter.wallet_address);
    }
  } catch (error) {
    logger.error('Failed to update evidence on blockchain', error as Error, {
      disputeId,
      evidenceId: updatedEvidence[updatedEvidence.length - 1]?.id,
    });
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
  const { disputeId, decision, reasoning, resolvedBy, resolverRole } = input;

  // Verify resolver is admin (defense in depth - route should also check)
  if (resolverRole !== 'admin') {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only administrators can resolve disputes' },
    };
  }

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
  // CRITICAL FIX: Use the employer's wallet address for escrow operations,
  // not the admin's resolvedBy ID. The escrow contract checks that the
  // approver is the employer.
  try {
    if (decision === 'split') {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_DECISION',
          message: 'Split decisions are not supported until partial escrow settlements are implemented.',
        },
      };
    }

    const escrow = await getEscrowByContractId(disputeEntity.contract_id);
    if (!escrow) {
      logger.warn('Escrow record not found in blockchain_escrows. Bypassing smart contract payment and aggressively marking dispute resolved in DB.', {
        disputeId,
        contractId: disputeEntity.contract_id
      });
      // Bypass the payment by proceeding directly to updating the milestone status below
      if (decision === 'freelancer_favor') {
        milestoneEntity.status = 'approved';
      } else if (decision === 'employer_favor') {
        milestoneEntity.status = 'refunded';
      }
    } else {
      // Use the employer's address stored in the escrow for authorization
      const employerAddress = escrow.employerAddress;

      if (decision === 'freelancer_favor') {
        // Release full funds to freelancer
        await releaseEscrowMilestone(escrow.address, disputeEntity.milestone_id, employerAddress);
        milestoneEntity.status = 'approved';
      } else if (decision === 'employer_favor') {
        // Refund full funds to employer
        await refundEscrowMilestone(escrow.address, disputeEntity.milestone_id, employerAddress);
        milestoneEntity.status = 'refunded';
      }
    }
  } catch (error) {
    logger.error('Failed to process payment for dispute resolution', error as Error, {
      disputeId,
      decision: input.decision,
    });
    // IMPORTANT: If payment fails, do NOT mark the dispute as resolved
    // The admin should retry the resolution after fixing the payment issue
    return {
      success: false,
      error: { 
        code: 'PAYMENT_FAILED', 
        message: 'Payment processing failed during dispute resolution. Please retry.' 
      },
    };
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
    // Check if all milestones are now completed (approved or refunded)
    const allMilestonesDone = projectEntity.milestones.every(
      m => m.status === 'approved' || m.status === 'refunded'
    );
    if (allMilestonesDone) {
      await contractRepository.updateContract(disputeEntity.contract_id, { status: 'completed' });
    } else {
      await contractRepository.updateContract(disputeEntity.contract_id, { status: 'active' });
    }
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
    logger.error('Failed to record dispute resolution on blockchain', error as Error, {
      disputeId,
      decision: input.decision,
    });
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
 * Get all open disputes (for admin) — includes both 'open' and 'under_review' status
 */
export async function getOpenDisputes(): Promise<DisputeServiceResult<Dispute[]>> {
  const openResult = await disputeRepository.getDisputesByStatus('open');
  const reviewResult = await disputeRepository.getDisputesByStatus('under_review');
  const allActive = [
    ...openResult.items.map(mapDisputeFromEntity),
    ...reviewResult.items.map(mapDisputeFromEntity),
  ];
  return { success: true, data: allActive };
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

/**
 * Get all disputes (admin) or user's disputes (regular users)
 */
export async function getAllDisputes(
  userId: string,
  userRole: string,
  options?: { limit?: number; offset?: number; status?: string }
): Promise<DisputeServiceResult<{ items: Dispute[]; continuationToken: string | null }>> {
  try {
    const limit = options?.limit ?? 20;
    const offset = options?.offset ?? 0;
    const status = options?.status;

    const queryOptions: { limit: number; offset: number; status?: string } = { limit, offset };
    if (status) queryOptions.status = status;

    let result;
    
    if (userRole === 'admin') {
      result = await disputeRepository.getAllDisputes(queryOptions);
    } else {
      result = await disputeRepository.getDisputesByUserId(userId, queryOptions);
    }

    const disputes = result.items.map(mapDisputeFromEntity);
    const hasMore = result.hasMore;

    return {
      success: true,
      data: {
        items: disputes,
        continuationToken: hasMore ? String(offset + limit) : null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch disputes',
      },
    };
  }
}
