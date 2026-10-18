import { Proposal, mapProposalFromEntity } from '../utils/entity-mapper.js';
import { Contract, Project, mapContractFromEntity, mapProjectFromEntity } from '../utils/entity-mapper.js';
import { proposalRepository, ProposalEntity } from '../repositories/proposal-repository.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { projectRepository, type ProjectEntity } from '../repositories/project-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/types.js';
import { generateId } from '../utils/id.js';
import { logger } from '../config/logger.js';

import { createSeedOffer } from './contract-negotiation-service.js';
import { FileAttachment, validateAttachments, validateStoredAttachmentOwnership } from '../utils/file-validator.js';
import { BUCKETS } from '../config/appwrite.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';
import { persistAuditEntry } from '../utils/admin-audit.js';
import { sendGatedEmail, sendProposalAcceptedEmail, sendContractCreatedEmail } from './email-delivery-service.js';

type CreateProposalInput = {
  projectId: string;
  attachments: FileAttachment[];
  proposedRate: number;
  estimatedDuration: number;
  coverLetter?: string | null;
};


type ProposalWithNotification = {
  proposal: Proposal;
  notification: {
    userId: string;
    type: string;
  };
};

type AcceptProposalResult = {
  proposal: Proposal;
  contract: Contract;
};

type RejectProposalResult = {
  proposal: Proposal;
};

type ValidatedProposal = {
  proposal: ProposalEntity;
  project: Project;
  projectEntity: ProjectEntity;
  proposalRate: number;
  totalAmount: number;
  rushFee: number;
  isRush: boolean;
  rushFeePercentage: number;
};

async function validateProposalAttachments(
  attachments: FileAttachment[],
  freelancerId: string
): Promise<ServiceResult<never> | null> {
  const attachmentErrors = validateAttachments(attachments);
  if (attachmentErrors.length > 0) {
    return errorResult('VALIDATION_ERROR', 'Invalid attachments', attachmentErrors.map((e) => e.message));
  }
  const ownershipErrors = await validateStoredAttachmentOwnership(
    attachments,
    freelancerId,
    BUCKETS.PROPOSAL_ATTACHMENTS
  );
  if (ownershipErrors.length > 0) {
    return errorResult('VALIDATION_ERROR', 'Invalid attachments', ownershipErrors.map((e) => e.message));
  }
  return null;
}

export async function submitProposal(
  freelancerId: string,
  input: CreateProposalInput
): Promise<ServiceResult<ProposalWithNotification>> {
  const attachmentValidation = await validateProposalAttachments(input.attachments, freelancerId);
  if (attachmentValidation) return attachmentValidation;

  return withLock(`proposal-submit:${input.projectId}:${freelancerId}`, async () => {
  const projectEntity = await projectRepository.findProjectById(input.projectId);
  if (!projectEntity) {
    return errorResult('NOT_FOUND', 'Project not found');
  }
  const project = mapProjectFromEntity(projectEntity);

  // One account can act as both freelancer and employer, so block applying to your own project.
  if (projectEntity.employer_id === freelancerId) {
    return errorResult('CANNOT_PROPOSE_OWN_PROJECT', 'You cannot submit a proposal on your own project.');
  }

  if (project.status !== 'open') {
    return errorResult('PROJECT_NOT_OPEN', 'This project is no longer accepting proposals.');
  }

  const existingProposal = await proposalRepository.getExistingProposal(input.projectId, freelancerId);
  if (existingProposal) {
    return errorResult('DUPLICATE_PROPOSAL', 'You have already submitted a proposal for this project');
  }

  // Check if freelancer limit has been reached (all slots filled)
  const acceptedCount = await proposalRepository.getAcceptedProposalCount(input.projectId);
  const freelancerLimit = projectEntity.freelancer_limit != null ? projectEntity.freelancer_limit : 1;
  if (acceptedCount >= freelancerLimit) {
    return errorResult('FREELANCER_LIMIT_REACHED', `This project has already filled all ${freelancerLimit} freelancer slot${freelancerLimit === 1 ? '' : 's'} and is no longer accepting proposals.`);
  }

  const proposalEntity: Omit<ProposalEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    project_id: input.projectId,
    freelancer_id: freelancerId,
    cover_letter: input.coverLetter ?? null,
    attachments: input.attachments,
    proposed_rate: input.proposedRate,
    estimated_duration: input.estimatedDuration,
    status: 'pending',
  };

  const createdEntity = await proposalRepository.createProposal(proposalEntity);
  const created = mapProposalFromEntity(createdEntity);

  // Create notification for employer
  try {
    await notificationRepository.createNotification({
      id: generateId(),
      user_id: project.employerId,
      type: 'proposal_received',
      title: 'New Proposal Received',
      message: `A freelancer has submitted a proposal for your project "${project.title}"`,
      data: {
        proposalId: created.id,
        projectId: project.id,
        projectTitle: project.title,
        freelancerId,
      },
      is_read: false,
    });
  } catch (error) {
    logger.error('Failed to create notification', { error });
    // Continue - notification is secondary
  }

  return successResult({ 
    proposal: created,
    notification: {
    userId: project.employerId,
    type: 'proposal_received',
    },
  });
  });
}


// Get proposal by ID
export async function getProposalById(proposalId: string): Promise<ServiceResult<Proposal>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return errorResult('NOT_FOUND', 'Proposal not found');
  }
  return successResult(mapProposalFromEntity(proposalEntity));
}

// Get proposal by ID with employer history (rating and completed projects)
type EmployerHistory = {
  completedProjectsCount: number;
  averageRating: number;
  reviewCount: number;
  companyName: string | null | undefined;
  industry: string | null | undefined;
};

type ProposalWithEmployerHistory = {
  proposal: Proposal;
  project: Project;
  employerHistory: EmployerHistory;
};

export async function getProposalWithEmployerHistory(proposalId: string): Promise<ServiceResult<ProposalWithEmployerHistory>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return errorResult('NOT_FOUND', 'Proposal not found');
  }

  const proposal = mapProposalFromEntity(proposalEntity);

  // Get project to find employer
  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return errorResult('NOT_FOUND', 'Project not found');
  }
  const project = mapProjectFromEntity(projectEntity);

  // Get employer's completed contracts
  const { items: allContracts } = await contractRepository.getContractsByEmployer(project.employerId);
  const completedContracts = allContracts.filter(c => c.status === 'completed');

  // Get employer's average rating and review count + employer profile in parallel
  const [{ reviewRepository }, { employerProfileRepository }] = await Promise.all([
    import('../repositories/review-repository.js'),
    import('../repositories/employer-profile-repository.js'),
  ]);
  const [{ average: averageRating, count: reviewCount }, employerProfile] = await Promise.all([
    reviewRepository.getAverageRating(project.employerId),
    employerProfileRepository.getProfileByUserId(project.employerId),
  ]);

  return successResult({
    proposal,
    project,
    employerHistory: {
    completedProjectsCount: completedContracts.length,
    averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
    reviewCount,
    companyName: employerProfile?.company_name,
    industry: employerProfile?.industry,
    },
  });
}

// Get proposals for a project
export async function getProposalsByProject(
  projectId: string,
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<Proposal>>> {
  const projectEntity = await projectRepository.findProjectById(projectId);
  if (!projectEntity) {
    return errorResult('NOT_FOUND', 'Project not found');
  }

  const result = await proposalRepository.getProposalsByProject(projectId, options);
  return successResult({
    items: result.items.map(mapProposalFromEntity),
    hasMore: result.hasMore,
    total: result.total,
  });
  }

// Get proposals by freelancer
export async function getProposalsByFreelancer(
  freelancerId: string
): Promise<ServiceResult<Proposal[]>> {
  const proposalEntities = await proposalRepository.getProposalsByFreelancer(freelancerId);
  return successResult(proposalEntities.map(mapProposalFromEntity));
}


/**
 * Validate all preconditions for proposal acceptance.
 * Returns validated data or a ServiceResult error.
 */
async function validateProposalAcceptance(
  proposalId: string,
  employerId: string,
  proposalEntity: ProposalEntity,
): Promise<
  | { error: ServiceResult<AcceptProposalResult> }
  | ValidatedProposal
> {
  // NOTE: Caller (acceptProposal) is responsible for verifying proposal existence
  // and passing a valid proposalEntity. The NOT_FOUND check was removed to avoid
  // a redundant findProposalById call.

  if (proposalEntity.status !== 'pending') {
    return { error: errorResult('INVALID_STATUS', `You can only accept proposals that are still pending. This proposal is currently: ${proposalEntity.status}.`) };
  }

  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return { error: errorResult('NOT_FOUND', 'Project not found') };
  }
  const project = mapProjectFromEntity(projectEntity);

  if (project.employerId !== employerId) {
    return { error: errorResult('UNAUTHORIZED', 'You are not authorized to accept proposals for this project') };
  }

  if (proposalEntity.freelancer_id === employerId) {
    return { error: errorResult('CANNOT_PROPOSE_OWN_PROJECT', 'You cannot hire yourself on your own project.') };
  }

  const proposalRate = proposalEntity.proposed_rate;
  if (proposalRate === null || proposalRate === undefined || proposalRate <= 0) {
    return { error: errorResult('INVALID_PROPOSAL_RATE', 'Accepted proposal must have a valid positive rate') };
  }

  /* istanbul ignore next -- mapProjectFromEntity always defaults isRush=false, rushFeePercentage=25 */
  const isRush = project.isRush != null ? project.isRush : false;
  /* istanbul ignore next */
  const rushFeePercentage = project.rushFeePercentage != null ? project.rushFeePercentage : 25;
  const rushFee = isRush ? Math.round(proposalRate * rushFeePercentage / 100 * 100) / 100 : 0;
  const totalAmount = proposalRate + rushFee;

  const freelancerLimit = projectEntity.freelancer_limit != null ? projectEntity.freelancer_limit : 1;
  // Slots are reserved from acceptance: contracts still negotiating, signing or
  // awaiting funding hold a slot until they are cancelled or expire.
  const reservedSlots = await contractRepository.countReservedSlots(proposalEntity.project_id);
  if (reservedSlots >= freelancerLimit) {
    return { error: errorResult('FREELANCER_LIMIT_REACHED', `This project has already filled all ${freelancerLimit} freelancer slot${freelancerLimit === 1 ? '' : 's'} and is no longer accepting proposals.`) };
  }

  return { proposal: proposalEntity, project, projectEntity, proposalRate, totalAmount, rushFee, isRush, rushFeePercentage };
}

/**
 * Accept the proposal and create the contract record.
 * Returns the created contract and updated proposal, or a ServiceResult error.
 */
type CreateContractFromProposalInput = {
  proposalId: string;
  proposalEntity: ProposalEntity;
  project: Project;
  employerId: string;
  proposalRate: number;
  rushFee: number;
  totalAmount: number;
};

async function createContractFromAcceptedProposal(
  input: CreateContractFromProposalInput
): Promise<
  | { error: ServiceResult<AcceptProposalResult> }
  | {
      updatedProposalEntity: NonNullable<Awaited<ReturnType<typeof proposalRepository.updateProposal>>>;
      contractEntity: ContractEntity;
    }
> {
  const { proposalId, proposalEntity, project, employerId, proposalRate, rushFee, totalAmount } = input;

  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
    status: 'accepted',
  });

  if (!updatedProposalEntity) {
    logger.error('Failed to accept proposal');
    return { error: errorResult('UPDATE_FAILED', 'Failed to accept proposal or proposal already accepted') };
  }

  let contractEntity: ContractEntity | null = null;
  let createError: unknown = null;
  try {
    contractEntity = await contractRepository.create({
      id: generateId(),
      project_id: project.id,
      proposal_id: proposalId,
      freelancer_id: proposalEntity.freelancer_id,
      employer_id: employerId,
      base_amount: proposalRate,
      rush_fee: rushFee,
      total_amount: totalAmount,
      status: 'negotiating',
      milestone_source: 'contract',
      escrow_address: '',
    });
  } catch (error) {
    createError = error;
  }

  if (!contractEntity) {
    // Compensate: never leave a proposal 'accepted' without its contract (it would
    // hold a hiring slot that no contract can ever release).
    logger.error('Contract creation failed after accepting proposal; reverting proposal to pending', {
      proposalId,
      error: createError instanceof Error ? createError.message : createError,
    });
    try {
      await proposalRepository.updateProposal(proposalId, { status: 'pending' });
    } catch (revertError) {
      logger.error('CRITICAL: failed to revert proposal after contract creation failure', { proposalId, error: revertError });
    }
    return { error: errorResult('CONTRACT_CREATION_FAILED', 'The contract could not be created, so the proposal was left pending. Please try again.') };
  }

  return { updatedProposalEntity, contractEntity };
}

/**
 * Notifies relevant parties of proposal acceptance.
 * Non-blocking: fires and forgets notifications and emails.
 */
async function notifyProposalAccepted(
  proposal: ProposalEntity,
  contract: Contract,
  project: Project,
): Promise<void> {
  try {
    await notificationRepository.createNotification({
      id: generateId(),
      user_id: proposal.freelancer_id,
      type: 'proposal_accepted',
      title: 'Proposal Accepted',
      message: `Your proposal for "${project.title}" has been accepted! Review and negotiate the contract terms.`,
      data: {
        proposalId: proposal.id,
        projectId: project.id,
        projectTitle: project.title,
        contractId: contract.id,
      },
      is_read: false,
    });
  } catch (error) {
    logger.error('Failed to create notification', { error });
  }

  await sendGatedEmail(proposal.freelancer_id, 'proposal_accepted', (recipient) =>
    sendProposalAcceptedEmail(recipient.email, {
      recipientName: recipient.name,
      freelancerName: recipient.name,
      projectTitle: project.title,
      projectUrl: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/projects/${project.id}`,
    })
  );

  await sendGatedEmail(proposal.freelancer_id, 'contract_created', (recipient) =>
    sendContractCreatedEmail(recipient.email, {
      recipientName: recipient.name,
      projectTitle: project.title,
      contractUrl: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/dashboard/freelancer/contracts/${contract.id}`,
    })
  );
}

/**
 * Records audit trail for proposal acceptance.
 * Non-blocking: fires and forgets audit log.
 */
type AuditProposalAcceptanceInput = {
  proposal: ProposalEntity;
  contract: Contract;
  employerId: string;
  project: Project;
  totalAmount: number;
  rushFee: number;
  isRush: boolean;
};

async function auditProposalAcceptance(input: AuditProposalAcceptanceInput): Promise<void> {
  const { proposal, contract, employerId, project, totalAmount, rushFee, isRush } = input;
  try {
    await persistAuditEntry({
      user_id: proposal.freelancer_id,
      actor_id: employerId,
      action: 'contract.created',
      resource_type: 'contract',
      resource_id: contract.id,
      payload: {
        projectId: project.id,
        proposalId: proposal.id,
        totalAmount,
        rushFee,
        isRush,
      },
      ip_address: null,
      user_agent: null,
      status: 'success',
      error_message: null,
    });
  } catch (error) {
    /* istanbul ignore next */
    logger.error('Failed to persist audit entry for proposal acceptance', { error });
  }
}

// Accept a proposal - creates a contract in `negotiating`
// - Serialized per project so concurrent accepts cannot exceed the freelancer limit
// - Reserves a slot; the remaining pending proposals are only rejected once every
//   slot has a funded (active) contract (see contract-lifecycle-service)
// - Seeds a round-1 offer from the project template and the proposed rate
export async function acceptProposal(
  proposalId: string,
  employerId: string
): Promise<ServiceResult<AcceptProposalResult>> {
  // BLF-6.1: Lock per PROJECT (not per proposal) to prevent concurrent accepts
  // of different proposals on the same project from exceeding the freelancer limit
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return errorResult('NOT_FOUND', 'Proposal not found');
  }
  return withLock(`proposal-accept:project:${proposalEntity.project_id}`, async () => {
    const freshProposal = await proposalRepository.findProposalById(proposalId);
    if (!freshProposal) return errorResult('NOT_FOUND', 'Proposal not found');
    const existingContract = await contractRepository.findContractByProposalId(proposalId);
    if (existingContract) {
      return errorResult('DUPLICATE_CONTRACT', 'A contract already exists for this proposal');
    }
    const validated = await validateProposalAcceptance(proposalId, employerId, freshProposal);
    if ('error' in validated) return validated.error;

    const { proposal, project, projectEntity, proposalRate, totalAmount, rushFee, isRush } = validated;

    // Accepting starts negotiation: the contract holds a slot but is not active.
    // Terms (milestones, extra pay, deadline, rush fee) are agreed per freelancer
    // on the contract, so the shared project template is never rescaled here.
    const contractResult = await createContractFromAcceptedProposal({
      proposalId,
      proposalEntity: proposal,
      project,
      employerId,
      proposalRate,
      rushFee,
      totalAmount,
    });
    if ('error' in contractResult) return contractResult.error;

    const { updatedProposalEntity, contractEntity } = contractResult;
    const contract = mapContractFromEntity(contractEntity);

    // Round-1 offer from the posted terms so the freelancer can accept in one step.
    await createSeedOffer(contractEntity, projectEntity, proposal);

    void notifyProposalAccepted(proposal, contract, project);

    void auditProposalAcceptance({ proposal, contract, employerId, project, totalAmount, rushFee, isRush });

    return successResult({
      proposal: mapProposalFromEntity(updatedProposalEntity),
      contract: contract,
    });
      });
    }


// Reject a proposal
export async function rejectProposal(
  proposalId: string,
  employerId: string
): Promise<ServiceResult<RejectProposalResult>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return errorResult('NOT_FOUND', 'Proposal not found');
  }

  // Check if proposal is pending
  if (proposalEntity.status !== 'pending') {
    return errorResult('INVALID_STATUS', `You can only reject proposals that are still pending. This proposal is currently: ${proposalEntity.status}.`);
  }

  // Verify employer owns the project
  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return errorResult('NOT_FOUND', 'Project not found');
  }
  const project = mapProjectFromEntity(projectEntity);

  if (project.employerId !== employerId) {
    return errorResult('UNAUTHORIZED', 'You are not authorized to reject proposals for this project');
  }

  // Update proposal status
  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
    status: 'rejected',
  });

  if (!updatedProposalEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update proposal status');
  }
  const updatedProposal = mapProposalFromEntity(updatedProposalEntity);

  // Create notification for freelancer
  try {
    await notificationRepository.createNotification({
      id: generateId(),
      user_id: proposalEntity.freelancer_id,
      type: 'proposal_rejected',
      title: 'Proposal Rejected',
      message: `Your proposal for "${project.title}" was not accepted.`,
      data: {
        proposalId: proposalEntity.id,
        projectId: project.id,
        projectTitle: project.title,
      },
      is_read: false,
    });
  } catch (error) {
    logger.error('Failed to create notification', { error });
    // Continue - notification is secondary
  }

  return successResult({
    proposal: updatedProposal,
  });
  }

// Withdraw a proposal (by freelancer)
export async function withdrawProposal(
  proposalId: string,
  freelancerId: string
): Promise<ServiceResult<Proposal>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return errorResult('NOT_FOUND', 'Proposal not found');
  }

  // Verify freelancer owns the proposal
  if (proposalEntity.freelancer_id !== freelancerId) {
    return errorResult('UNAUTHORIZED', 'You are not authorized to withdraw this proposal');
  }

  // Check if proposal can be withdrawn
  if (proposalEntity.status !== 'pending') {
    return errorResult('INVALID_STATUS', `You can only withdraw proposals that are still pending. This proposal is currently: ${proposalEntity.status}.`);
  }

  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
    status: 'withdrawn',
  });

  if (!updatedProposalEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to withdraw proposal');
  }

  return successResult(mapProposalFromEntity(updatedProposalEntity));
}

export type UpdateProposalInput = {
  proposedRate?: number;
  estimatedDuration?: number;
  coverLetter?: string;
};

// Update a proposal's terms (by freelancer, while pending)
export async function updateProposal(
  proposalId: string,
  freelancerId: string,
  input: UpdateProposalInput
): Promise<ServiceResult<Proposal>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return errorResult('NOT_FOUND', 'Proposal not found');
  }

  // Verify freelancer owns the proposal
  if (proposalEntity.freelancer_id !== freelancerId) {
    return errorResult('UNAUTHORIZED', 'You are not authorized to update this proposal');
  }

  // Check if proposal can be edited
  if (proposalEntity.status !== 'pending') {
    return errorResult('INVALID_STATUS', `You can only edit proposals that are still pending. This proposal is currently: ${proposalEntity.status}.`);
  }

  if (input.proposedRate !== undefined) {
    if (typeof input.proposedRate !== 'number' || !Number.isFinite(input.proposedRate) || input.proposedRate <= 0) {
      return errorResult('VALIDATION_ERROR', 'Proposed rate must be greater than 0');
    }
  }

  if (input.estimatedDuration !== undefined) {
    if (typeof input.estimatedDuration !== 'number' || !Number.isInteger(input.estimatedDuration) || input.estimatedDuration < 1 || input.estimatedDuration > 3650) {
      return errorResult('VALIDATION_ERROR', 'Estimated duration must be an integer between 1 and 3650 days');
    }
  }

  const updates: Partial<ProposalEntity> = {
    ...(input.proposedRate !== undefined && { proposed_rate: input.proposedRate }),
    ...(input.estimatedDuration !== undefined && { estimated_duration: input.estimatedDuration }),
    ...(input.coverLetter !== undefined && { cover_letter: input.coverLetter }),
  };

  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, updates);
  if (!updatedProposalEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to update proposal');
  }

  const project = await projectRepository.findProjectById(proposalEntity.project_id);
  if (project) {
    try {
      await notificationRepository.createNotification({
        id: generateId(),
        user_id: project.employer_id,
        type: 'proposal_received',
        title: 'Proposal Terms Updated',
        message: `Freelancer has updated their proposal terms for "${project.title}" to ${input.proposedRate ?? proposalEntity.proposed_rate} ETH.`,
        data: {
          proposalId,
          projectId: project.id,
          projectTitle: project.title,
          freelancerId,
        },
        is_read: false,
      });
    } catch {
      // Continue - notification is secondary
    }
  }

  return successResult(mapProposalFromEntity(updatedProposalEntity));
}
