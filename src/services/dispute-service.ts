/**
 * Dispute Service
 * Handles dispute creation, evidence submission, and resolution
 */

import { Dispute, Contract, Project, mapDisputeFromEntity } from '../utils/entity-mapper.js';
import { disputeRepository, DisputeEntity, EvidenceEntity, DisputeResolutionEntity } from '../repositories/dispute-repository.js';
import { disputeEvidenceRepository } from '../repositories/dispute-evidence-repository.js';
import { contractRepository, ContractEntity } from '../repositories/contract-repository.js';
import { projectRepository, ProjectEntity, MilestoneEntity } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { mapContractFromEntity, mapProjectFromEntity, mapMilestoneFromEntity } from '../utils/entity-mapper.js';
import { generateId } from '../utils/id.js';
import {
  notifyDisputeCreated,
  notifyDisputeResolved,
} from './notification-service.js';
import {
  createDisputeOnBlockchain,
  updateDisputeEvidence,
  resolveDisputeOnBlockchain,
} from './dispute-registry.js';
import { getBlockchainAdapter } from './blockchain/factory.js';
import { disputeAgreement } from './agreement-contract.js';
import { logger } from '../config/logger.js';
import type { ServiceResult, ServiceError } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';

export type DisputeServiceResult<T> = ServiceResult<T>;
export type DisputeServiceError = ServiceError;

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
  /**
   * Portion of the milestone awarded to the freelancer in basis points (0-10000).
   * Only meaningful for 'split' decisions; defaults to 5000 (50/50).
   */
  freelancerBps?: number;
};

type CreateDisputeValidation = {
  contract: Contract;
  contractEntity: ContractEntity;
  project: Project;
  projectEntity: ProjectEntity;
  milestone: NonNullable<Project['milestones'][number]>;
  milestoneEntity: MilestoneEntity;
};

/**
 * Validate that a dispute can be created for the given contract and milestone.
 * Returns the resolved entities or a ServiceResult error.
 */
async function validateCreateDispute(input: CreateDisputeInput): Promise<
  | { error: DisputeServiceResult<Dispute> }
  | CreateDisputeValidation
> {
  const { contractId, milestoneId, initiatorId } = input;

  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return { error: errorResult('NOT_FOUND', 'Contract not found') };
  }
  const contract = mapContractFromEntity(contractEntity);

  if (contract.status !== 'active') {
    return { error: errorResult('INVALID_CONTRACT_STATUS', `Cannot create disputes on a ${contract.status} contract. Only active contracts can be disputed.`) };
  }

  if (contract.employerId !== initiatorId && contract.freelancerId !== initiatorId) {
    return { error: errorResult('UNAUTHORIZED', 'Only contract parties can create disputes') };
  }

  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return { error: errorResult('NOT_FOUND', 'Project not found') };
  }
  const project = mapProjectFromEntity(projectEntity);

  const milestoneEntity = projectEntity.milestones.find(m => m.id === milestoneId);
  if (!milestoneEntity) {
    return { error: errorResult('NOT_FOUND', 'Milestone not found') };
  }
  const milestone = mapMilestoneFromEntity(milestoneEntity);

  if (milestone.status === 'disputed') {
    return { error: errorResult('ALREADY_DISPUTED', 'Milestone is already under dispute') };
  }

  if (milestone.status !== 'submitted') {
    const message = milestone.status === 'approved'
      ? 'Cannot dispute an approved milestone'
      : `Milestone must be submitted before it can be disputed (current status: ${milestone.status})`;

    return { error: errorResult('INVALID_STATUS', message) };
  }

  // Check for existing active dispute on this milestone (M9: use lock to prevent race)
  const existingDispute = await disputeRepository.getDisputeByMilestone(milestoneId);
  if (existingDispute) {
    return { error: errorResult('DUPLICATE_DISPUTE', 'An active dispute already exists for this milestone') };
  }

  return { contract, contractEntity, project, projectEntity, milestone, milestoneEntity };
}

function buildDisputeEntity(input: CreateDisputeInput): Omit<DisputeEntity, 'created_at' | 'updated_at'> {
  return {
    id: generateId(),
    contract_id: input.contractId,
    milestone_id: input.milestoneId,
    initiator_id: input.initiatorId,
    reason: input.reason,
    evidence: [],
    status: 'open',
    resolution: null,
  };
}

/**
 * Record the dispute and mark the agreement disputed on-chain. Best-effort.
 */
async function recordDisputeOnBlockchain(input: {
  dispute: Dispute;
  contract: Contract;
  milestone: NonNullable<Project['milestones'][number]>;
  milestoneId: string;
  contractId: string;
}): Promise<void> {
  const { dispute, contract, milestone, milestoneId, contractId } = input;
  try {
    const [initiator, freelancer, employer] = await Promise.all([
      userRepository.getUserById(dispute.initiatorId),
      userRepository.getUserById(contract.freelancerId),
      userRepository.getUserById(contract.employerId),
    ]);

    if (initiator?.wallet_address && freelancer?.wallet_address && employer?.wallet_address) {
      await createDisputeOnBlockchain({
        disputeId: dispute.id,
        contractId,
        milestoneId,
        initiatorWallet: initiator.wallet_address,
        freelancerWallet: freelancer.wallet_address,
        employerWallet: employer.wallet_address,
        amount: milestone.amount,
      });

      // Mark agreement as disputed on blockchain
      await disputeAgreement(dispute.contractId, initiator.wallet_address);
    }
  } catch (error) {
    logger.error('Failed to record dispute on blockchain', error as Error, {
      disputeId: dispute.id,
      contractId: dispute.contractId,
    });
  }
}

/**
 * Real-mode: mark the milestone Disputed on the escrow contract so the arbiter
 * can later resolve it on-chain (FreelanceEscrow.resolveDispute requires the
 * milestone to be Disputed). The server wallet acts as the on-chain employer.
 * Best-effort — the simulated adapter treats this as a no-op.
 */
async function markMilestoneDisputedOnEscrow(input: {
  contractEntity: ContractEntity;
  projectEntity: ProjectEntity;
  milestoneId: string;
  disputeId: string;
  contractId: string;
}): Promise<void> {
  const { contractEntity, projectEntity, milestoneId, disputeId, contractId } = input;
  try {
    const escrowAddress = contractEntity.escrow_address;
    if (escrowAddress) {
      const milestoneIndex = projectEntity.milestones.findIndex((m) => m.id === milestoneId);
      if (milestoneIndex !== -1) {
        await getBlockchainAdapter().disputeMilestone(escrowAddress, milestoneIndex);
      }
    }
  } catch (error) {
    logger.error('Failed to mark milestone disputed on blockchain escrow', error as Error, {
      disputeId,
      contractId,
      milestoneId,
    });
  }
}

type MarkDisputeStatesInput = {
  contractId: string;
  project: Project;
  projectEntity: ProjectEntity;
  milestoneEntity: MilestoneEntity;
};

async function markDisputeStates(input: MarkDisputeStatesInput): Promise<void> {
  const { contractId, project, projectEntity, milestoneEntity } = input;

  milestoneEntity.status = 'disputed';
  await projectRepository.updateProject(project.id, {
    milestones: projectEntity.milestones,
  });

  await contractRepository.updateContract(contractId, { status: 'disputed' });
}

type NotifyDisputePartiesInput = {
  contract: Contract;
  disputeId: string;
  milestoneId: string;
  milestone: NonNullable<Project['milestones'][number]>;
  project: Project;
  contractId: string;
};

async function notifyDisputeParties(input: NotifyDisputePartiesInput): Promise<void> {
  const { contract, disputeId, milestoneId, milestone, project, contractId } = input;

  await notifyDisputeCreated({
    userId: contract.freelancerId,
    disputeId,
    milestoneId,
    milestoneTitle: milestone.title,
    projectId: project.id,
    projectTitle: project.title,
    contractId,
  });

  await notifyDisputeCreated({
    userId: contract.employerId,
    disputeId,
    milestoneId,
    milestoneTitle: milestone.title,
    projectId: project.id,
    projectTitle: project.title,
    contractId,
  });

  // Notify all admin users about the new dispute
  try {
    const adminUsers = await userRepository.getUsersByRole('admin');
    await Promise.all(
      adminUsers.map(admin =>
        notifyDisputeCreated({
          userId: admin.id,
          disputeId,
          milestoneId,
          milestoneTitle: milestone.title,
          projectId: project.id,
          projectTitle: project.title,
          contractId,
        })
      )
    );
  } catch (error) {
    logger.error('Failed to notify admin users about dispute', error as Error, {
      disputeId,
    });
  }
}

/**
 * Create a new dispute
 */
export async function createDispute(
  input: CreateDisputeInput
): Promise<DisputeServiceResult<Dispute>> {
  const validated = await validateCreateDispute(input);
  if ('error' in validated) return validated.error;

  const { contract, contractEntity, project, projectEntity, milestone, milestoneEntity } = validated;

  const createdDisputeEntity = await disputeRepository.createDispute(buildDisputeEntity(input));
  const createdDispute = mapDisputeFromEntity(createdDisputeEntity);

  await recordDisputeOnBlockchain({ dispute: createdDispute, contract, milestone, milestoneId: input.milestoneId, contractId: input.contractId });
  await markMilestoneDisputedOnEscrow({ contractEntity, projectEntity, milestoneId: input.milestoneId, disputeId: createdDispute.id, contractId: input.contractId });
  await markDisputeStates({ contractId: input.contractId, project, projectEntity, milestoneEntity });
  await notifyDisputeParties({ contract, disputeId: createdDispute.id, milestoneId: input.milestoneId, milestone, project, contractId: input.contractId });

  return successResult(createdDispute);
}


/**
 * Submit evidence for a dispute
 */
export async function submitEvidence(
  input: SubmitEvidenceInput
): Promise<DisputeServiceResult<Dispute>> {
  const { disputeId, submitterId, type, content } = input;

  // Find dispute
  const disputeEntity = await disputeRepository.getDisputeById(disputeId);
  if (!disputeEntity) {
    return errorResult('NOT_FOUND', 'Dispute not found');
  }

  // Check dispute status - can only submit evidence for open or under_review disputes
  if (disputeEntity.status === 'resolved') {
    return errorResult('INVALID_STATUS', 'Cannot submit evidence for resolved disputes');
  }

  // Verify submitter is part of the contract
  const contractEntity = await contractRepository.getContractById(disputeEntity.contract_id);
  if (!contractEntity) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }

  if (contractEntity.employer_id !== submitterId && contractEntity.freelancer_id !== submitterId) {
    return errorResult('UNAUTHORIZED', 'Only contract parties can submit evidence');
  }

  // Create evidence entity
  const evidenceId = generateId();
  const evidenceEntity: Omit<EvidenceEntity, 'submitted_at'> = {
    id: evidenceId,
    submitter_id: submitterId,
    type,
    content,
  };

  // Add evidence to dispute via repository
  await disputeEvidenceRepository.createEvidence({
    id: evidenceId,
    dispute_id: disputeId,
    submitted_by: submitterId,
    evidence_type: type,
    description: content,
  });

  // Append evidence to dispute's evidence array
  const updatedEvidence = [...disputeEntity.evidence, { ...evidenceEntity, submitted_at: new Date().toISOString() }];
  await disputeRepository.updateDispute(disputeId, { evidence: updatedEvidence });

  // Get the fully updated entity
  const updatedDisputeEntity = await disputeRepository.getDisputeById(disputeId);
  if (!updatedDisputeEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to retrieve updated dispute');
  }

  // Update evidence hash on blockchain
  try {
    const submitter = await userRepository.getUserById(submitterId);
    if (submitter?.wallet_address) {
      const evidenceData = JSON.stringify(updatedDisputeEntity.evidence);
      await updateDisputeEvidence(disputeId, evidenceData, submitter.wallet_address);
    }
  } catch (error) {
    logger.error('Failed to update evidence on blockchain', error as Error, {
      disputeId,
      evidenceId: updatedDisputeEntity.evidence[updatedDisputeEntity.evidence.length - 1]?.id,
    });
  }

  return successResult(mapDisputeFromEntity(updatedDisputeEntity));
}


/**
 * Validate all preconditions for dispute resolution.
 * Returns validated data or a ServiceResult error.
 */
async function validateDisputeResolution(
  input: ResolveDisputeInput,
): Promise<
  | { error: DisputeServiceResult<Dispute> }
  | {
      disputeEntity: DisputeEntity;
      contract: Contract;
      contractEntity: ContractEntity;
      project: Project;
      projectEntity: ProjectEntity;
      milestone: NonNullable<Project['milestones'][number]>;
      milestoneEntity: MilestoneEntity;
      milestoneIndex: number;
    }
> {
  const { disputeId, resolverRole } = input;

  // Verify resolver is admin (defense in depth - route should also check)
  if (resolverRole !== 'admin') {
    return { error: errorResult('UNAUTHORIZED', 'Only administrators can resolve disputes') };
  }

  // Find dispute
  const disputeEntity = await disputeRepository.getDisputeById(disputeId);
  if (!disputeEntity) {
    return { error: errorResult('NOT_FOUND', 'Dispute not found') };
  }

  // Check dispute status
  if (disputeEntity.status === 'resolved') {
    return { error: errorResult('ALREADY_RESOLVED', 'Dispute is already resolved') };
  }

  // Get contract
  const contractEntity = await contractRepository.getContractById(disputeEntity.contract_id);
  if (!contractEntity) {
    return { error: errorResult('NOT_FOUND', 'Contract not found') };
  }
  const contract = mapContractFromEntity(contractEntity);

  // Get project for milestone info
  const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
  if (!projectEntity) {
    return { error: errorResult('NOT_FOUND', 'Project not found') };
  }
  const project = mapProjectFromEntity(projectEntity);

  const milestoneEntity = projectEntity.milestones.find((m) => m.id === disputeEntity.milestone_id);
  if (!milestoneEntity) {
    return { error: errorResult('NOT_FOUND', 'Milestone not found') };
  }
  const milestone = mapMilestoneFromEntity(milestoneEntity);
  const milestoneIndex = projectEntity.milestones.findIndex((m) => m.id === disputeEntity.milestone_id);

  return { disputeEntity, contract, contractEntity, project, projectEntity, milestone, milestoneEntity, milestoneIndex };
}

type ProcessDisputeEscrowPaymentInput = {
  disputeId: string;
  disputeEntity: DisputeEntity;
  decision: 'freelancer_favor' | 'employer_favor' | 'split';
  milestoneEntity: MilestoneEntity;
  escrowAddress: string;
  milestoneIndex: number;
  freelancerBps?: number;
};

/**
 * Process escrow payment for dispute resolution (release or refund).
 * Routes through the blockchain adapter so real mode resolves the on-chain
 * escrow (arbiter-signed) while simulated mode updates the Appwrite ledger.
 * Updates the milestoneEntity status in-place.
 * Returns success or a ServiceResult error.
 */
async function processDisputeEscrowPayment(
  input: ProcessDisputeEscrowPaymentInput
): Promise<
  | { error: DisputeServiceResult<Dispute> }
  | { success: true }
> {
  const { disputeId, disputeEntity, decision, milestoneEntity, escrowAddress, milestoneIndex, freelancerBps } = input;

  // BLF-10.1: Do NOT bypass payment when the escrow address is missing — return an error
  // instead. Bypassing would mark the dispute resolved without moving funds, causing financial loss.
  if (!escrowAddress) {
    logger.error('Escrow address missing on contract. Cannot process dispute payment.', {
      disputeId,
      contractId: disputeEntity.contract_id,
    });
    return { error: errorResult('ESCROW_NOT_FOUND', 'Escrow record not found. Cannot process dispute payment. Please ensure the contract has been funded.') };
  }

  try {
    const adapter = getBlockchainAdapter();
    if (!adapter.isAvailable()) {
      logger.error('Blockchain adapter unavailable. Cannot process dispute payment.', {
        disputeId,
        contractId: disputeEntity.contract_id,
      });
      return { error: errorResult('PAYMENT_FAILED', 'Blockchain adapter unavailable. Cannot process dispute payment. Please retry.') };
    }

    // Basis-points mapping:
    //   freelancer_favor -> 10000 (full to freelancer / release)
    //   employer_favor   -> 0     (full to employer / refund)
    //   split            -> freelancerBps ?? 5000 (default 50/50)
    const resolvedBps =
      decision === 'freelancer_favor' ? 10000
      : decision === 'employer_favor' ? 0
      : freelancerBps ?? 5000;

    if (decision === 'split' && (resolvedBps <= 0 || resolvedBps >= 10000)) {
      return { error: errorResult('INVALID_SPLIT_BPS', 'freelancerBps must be between 1 and 9999 for a split decision.') };
    }

    await adapter.resolveDispute(escrowAddress, milestoneIndex, resolvedBps);

    // On-chain, a split-resolved milestone is marked Approved (partial credit via
    // pull-payment to each party), so map both freelancer_favor and split to 'approved'.
    milestoneEntity.status = decision === 'employer_favor' ? 'refunded' : 'approved';
  } catch (error) {
    logger.error('Failed to process payment for dispute resolution', error as Error, {
      disputeId,
      decision,
    });
    // IMPORTANT: If payment fails, do NOT mark the dispute as resolved
    // The admin should retry the resolution after fixing the payment issue
    return { error: errorResult('PAYMENT_FAILED', 'Payment processing failed during dispute resolution. Please retry.') };
  }

  return { success: true };
}

type UpdateDisputeStatusesInput = {
  disputeId: string;
  disputeEntity: DisputeEntity;
  decision: 'freelancer_favor' | 'employer_favor' | 'split';
  reasoning: string;
  resolvedBy: string;
  contract: Contract;
  project: Project;
  projectEntity: ProjectEntity;
  milestone: NonNullable<Project['milestones'][number]>;
  resolutionEntity: DisputeResolutionEntity;
};

/**
 * Update dispute, milestone, and contract statuses after successful payment.
 * Also handles blockchain recording and notifications.
 */
async function updateDisputeStatuses(
  input: UpdateDisputeStatusesInput
): Promise<
  | { error: DisputeServiceResult<Dispute> }
  | { dispute: Dispute }
> {
  const { disputeId, disputeEntity, decision, reasoning, resolvedBy, contract, project, projectEntity, milestone, resolutionEntity } = input;

  // Update milestone status in project
  await projectRepository.updateProject(project.id, {
    milestones: projectEntity.milestones,
  });

  // Check if contract should be updated
  const hasOtherDisputes = projectEntity.milestones.some(
    (m) => m.status === 'disputed' && m.id !== disputeEntity.milestone_id
  );
  if (!hasOtherDisputes) {
    // Check if all milestones are now completed (approved or refunded)
    const allMilestonesDone = projectEntity.milestones.every(
      (m) => m.status === 'approved' || m.status === 'refunded'
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
    return { error: errorResult('UPDATE_FAILED', 'Failed to update dispute') };
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
      decision,
    });
  }

  // Send notifications to both parties
  const notifyParties = async (userId: string): Promise<void> => {
    await notifyDisputeResolved({
      userId,
      disputeId,
      resolution: decision,
      milestoneId: disputeEntity.milestone_id,
      milestoneTitle: milestone.title,
      projectId: project.id,
      projectTitle: project.title,
      contractId: disputeEntity.contract_id,
    });
  };

  await notifyParties(contract.freelancerId);
  await notifyParties(contract.employerId);

  return { dispute: updatedDispute };
}

/**
 * Resolve a dispute
 */
export async function resolveDispute(
  input: ResolveDisputeInput
): Promise<DisputeServiceResult<Dispute>> {
  // Serialize concurrent resolution attempts for the same dispute to prevent double-disbursement
  return withLock(`dispute-resolve:${input.disputeId}`, async () => {
    const { disputeId, decision, reasoning, resolvedBy } = input;

    const validated = await validateDisputeResolution(input);
    if ('error' in validated) return validated.error;

    const { disputeEntity, contractEntity, contract, project, projectEntity, milestone, milestoneEntity, milestoneIndex } = validated;

    // Create resolution entity
    const resolutionEntity: DisputeResolutionEntity = {
      decision,
      reasoning,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
    };

    const paymentResult = await processDisputeEscrowPayment({
      disputeId,
      disputeEntity,
      decision,
      milestoneEntity,
      escrowAddress: contractEntity.escrow_address,
      milestoneIndex,
      ...(input.freelancerBps !== undefined ? { freelancerBps: input.freelancerBps } : {}),
    });
    if ('error' in paymentResult) return paymentResult.error;

    const statusResult = await updateDisputeStatuses({
      disputeId,
      disputeEntity,
      decision,
      reasoning,
      resolvedBy,
      contract,
      project,
      projectEntity,
      milestone,
      resolutionEntity,
    });
    if ('error' in statusResult) return statusResult.error;

    return successResult(statusResult.dispute);
  });
}


/**
 * Get dispute by ID
 */
export async function getDisputeById(
  disputeId: string
): Promise<DisputeServiceResult<Dispute>> {
  const disputeEntity = await disputeRepository.getDisputeById(disputeId);
  if (!disputeEntity) {
    return errorResult('NOT_FOUND', 'Dispute not found');
  }
  return successResult(mapDisputeFromEntity(disputeEntity));
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
    return errorResult('NOT_FOUND', 'Contract not found');
  }

  if (contractEntity.employer_id !== userId && contractEntity.freelancer_id !== userId) {
    return errorResult('UNAUTHORIZED', 'Only contract parties can view disputes');
  }

  const disputeEntities = await disputeRepository.getAllDisputesByContract(contractId);
  return successResult(disputeEntities.map(mapDisputeFromEntity));
}

/**
 * Get all open disputes (for admin) — includes both 'open' and 'under_review' status
 */
export async function getOpenDisputes(): Promise<DisputeServiceResult<Dispute[]>> {
  const [openResult, reviewResult] = await Promise.all([
    disputeRepository.getDisputesByStatus('open'),
    disputeRepository.getDisputesByStatus('under_review'),
  ]);
  const allActive = [
    ...openResult.items.map(mapDisputeFromEntity),
    ...reviewResult.items.map(mapDisputeFromEntity),
  ];
  return successResult(allActive);
}

/**
 * Get disputes initiated by a user
 */
export async function getDisputesByInitiator(
  initiatorId: string
): Promise<DisputeServiceResult<Dispute[]>> {
  const result = await disputeRepository.getDisputesByInitiator(initiatorId);
  return successResult(result.items.map(mapDisputeFromEntity));
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

    return successResult({
      items: disputes,
      continuationToken: hasMore ? String(offset + limit) : null,
    });
  } catch (error) {
    return errorResult('FETCH_FAILED', error instanceof Error ? error.message : 'Failed to fetch disputes');
  }
}
