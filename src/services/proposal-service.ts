import { Proposal, mapProposalFromEntity } from '../utils/entity-mapper.js';
import { Contract, Project, mapContractFromEntity, mapProjectFromEntity } from '../utils/entity-mapper.js';
import { proposalRepository, ProposalEntity } from '../repositories/proposal-repository.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { projectRepository, type MilestoneEntity, type MilestoneStatus, type ProjectEntity } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/types.js';
import { generateId } from '../utils/id.js';
import { logger } from '../config/logger.js';

import { createAgreementOnBlockchain } from './agreement-contract.js';
import { FileAttachment, validateAttachments } from '../utils/file-validator.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';
import { rescaleMilestoneAmounts } from '../utils/milestone-amounts.js';
import { persistAuditEntry } from '../utils/admin-audit.js';
import { sendGatedEmail, sendProposalAcceptedEmail, sendContractCreatedEmail } from './email-delivery-service.js';

type CreateProposalInput = {
  projectId: string;
  attachments: FileAttachment[];
  proposedRate: number;
  estimatedDuration: number;
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


export async function submitProposal(
  freelancerId: string,
  input: CreateProposalInput
): Promise<ServiceResult<ProposalWithNotification>> {
  const attachmentErrors = validateAttachments(input.attachments);
  if (attachmentErrors.length > 0) {
    return errorResult('VALIDATION_ERROR', 'Invalid attachments', attachmentErrors.map(e => e.message));
  }

  const projectEntity = await projectRepository.findProjectById(input.projectId);
  if (!projectEntity) {
    return errorResult('NOT_FOUND', 'Project not found');
  }
  const project = mapProjectFromEntity(projectEntity);

  if (project.status !== 'open') {
    return errorResult('PROJECT_NOT_OPEN', 'Project is not accepting proposals');
  }

  const existingProposal = await proposalRepository.getExistingProposal(input.projectId, freelancerId);
  if (existingProposal) {
    return errorResult('DUPLICATE_PROPOSAL', 'You have already submitted a proposal for this project');
  }

  // Check if freelancer limit has been reached (all slots filled)
  const acceptedCount = await proposalRepository.getAcceptedProposalCount(input.projectId);
  const freelancerLimit = projectEntity.freelancer_limit != null ? projectEntity.freelancer_limit : 1;
  if (acceptedCount >= freelancerLimit) {
    return errorResult('FREELANCER_LIMIT_REACHED', `This project has already accepted the maximum number of freelancers (${freelancerLimit})`);
  }

  const proposalEntity: Omit<ProposalEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    project_id: input.projectId,
    freelancer_id: freelancerId,
    cover_letter: null,
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
  | {
      proposalEntity: ProposalEntity;
      project: Project;
      projectEntity: ProjectEntity;
      proposalRate: number;
      totalAmount: number;
      rushFee: number;
      isRush: boolean;
      rushFeePercentage: number;
    }
> {
  // NOTE: Caller (acceptProposal) is responsible for verifying proposal existence
  // and passing a valid proposalEntity. The NOT_FOUND check was removed to avoid
  // a redundant findProposalById call.

  if (proposalEntity.status !== 'pending') {
    return { error: errorResult('INVALID_STATUS', `Cannot accept proposal with status "${proposalEntity.status}"`) };
  }

  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return { error: errorResult('NOT_FOUND', 'Project not found') };
  }
  const project = mapProjectFromEntity(projectEntity);

  if (project.employerId !== employerId) {
    return { error: errorResult('UNAUTHORIZED', 'You are not authorized to accept proposals for this project') };
  }

  if (!project.milestones || project.milestones.length === 0) {
    return { error: errorResult('NO_MILESTONES', 'Project must have milestones defined before accepting a proposal') };
  }

  const proposalRate = proposalEntity.proposed_rate;
  if (proposalRate === null || proposalRate === undefined || proposalRate <= 0) {
    return { error: errorResult('INVALID_PROPOSAL_RATE', 'Accepted proposal must have a valid positive rate') };
  }

  const milestoneTotal = project.milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  if (Math.abs(milestoneTotal - proposalRate) > 0.01) {
    return { error: errorResult('AMOUNT_MISMATCH', 'Proposal rate must match the total project milestone amount before contract creation') };
  }

  /* istanbul ignore next -- mapProjectFromEntity always defaults isRush=false, rushFeePercentage=25 */
  const isRush = project.isRush != null ? project.isRush : false;
  /* istanbul ignore next */
  const rushFeePercentage = project.rushFeePercentage != null ? project.rushFeePercentage : 25;
  const rushFee = isRush ? Math.round(proposalRate * rushFeePercentage / 100 * 100) / 100 : 0;
  const totalAmount = proposalRate + rushFee;

  const freelancerLimit = projectEntity.freelancer_limit != null ? projectEntity.freelancer_limit : 1;
  const preCheckAcceptedCount = await proposalRepository.getAcceptedProposalCount(proposalEntity.project_id);
  if (preCheckAcceptedCount >= freelancerLimit) {
    return { error: errorResult('FREELANCER_LIMIT_REACHED', `This project has already accepted the maximum number of freelancers (${freelancerLimit})`) };
  }

  return { proposalEntity, project, projectEntity, proposalRate, totalAmount, rushFee, isRush, rushFeePercentage };
}

/**
 * Reject other pending proposals for the same project when all freelancer
 * slots are now filled. Multi-freelancer projects (freelancerLimit > 1) keep
 * the remaining proposals pending so the employer can fill the other slots.
 * Non-critical: logs errors and continues.
 */
async function rejectOtherProposals(projectId: string, acceptedProposalId: string, maxFreelancers: number): Promise<void> {
  try {
    const otherProposals = await proposalRepository.getProposalsByProject(projectId, { limit: 1000, offset: 0 });
    const acceptedCount = otherProposals.items.filter(p => p.status === 'accepted').length;
    if (acceptedCount < maxFreelancers) {
      // More slots remain — leave other pending proposals open
      return;
    }
    const toReject = otherProposals.items.filter(p => p.id !== acceptedProposalId && p.status === 'pending');
    await Promise.all(toReject.map(p => proposalRepository.updateProposal(p.id, { status: 'rejected' })));
  } catch (error) {
    logger.error('Failed to reject other pending proposals', { error });
    // Continue - this is non-critical
  }
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

async function createContractFromProposal(
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

  const contractEntity = await contractRepository.create({
    id: generateId(),
    project_id: project.id,
    proposal_id: proposalId,
    freelancer_id: proposalEntity.freelancer_id,
    employer_id: employerId,
    base_amount: proposalRate,
    rush_fee: rushFee,
    total_amount: totalAmount,
    status: 'pending',
    escrow_address: '',
  });

  if (!contractEntity) {
    return { error: errorResult('UPDATE_FAILED', 'Proposal accepted but no contract was created') };
  }

  return { updatedProposalEntity, contractEntity };
}

/**
 * Deploy blockchain agreement, initialize escrow, and activate contract.
 * Also updates project status when all freelancer slots are filled.
 * Non-critical: logs errors and continues on blockchain failures.
 */
type InitializeEscrowForContractInput = {
  contract: Contract;
  project: Project;
  proposalEntity: ProposalEntity;
  totalAmount: number;
  rushFee: number;
  isRush: boolean;
  rushFeePercentage: number;
};

async function initializeEscrowForContract(
  input: InitializeEscrowForContractInput
): Promise<void> {
  const { contract, project, proposalEntity, totalAmount, rushFee, isRush, rushFeePercentage } = input;
  try {
    const employer = await userRepository.getUserById(project.employerId);
    const freelancer = await userRepository.getUserById(proposalEntity.freelancer_id);

    if (employer?.wallet_address && freelancer?.wallet_address) {
      /* istanbul ignore next -- ProjectEntity type defines description/deadline as string; null is unreachable */
      const description = project.description != null ? project.description : '';
      /* istanbul ignore next */
      const deadline = project.deadline != null ? project.deadline : '';
      await createAgreementOnBlockchain({
        contractId: contract.id,
        employerWallet: employer.wallet_address,
        freelancerWallet: freelancer.wallet_address,
        totalAmount: totalAmount,
        milestoneCount: project.milestones.length,
        terms: {
          projectTitle: project.title,
          description,
          milestones: project.milestones.map(m => ({ title: m.title, amount: m.amount })),
          deadline,
          ...(isRush ? { isRush: true, rushFee, rushFeePercentage } : {}),
        },
      });

      // H11: Do NOT auto-sign the agreement on behalf of the freelancer.
      // The freelancer must explicitly sign the agreement after reviewing the final terms.
      // The agreement is created on-chain but left unsigned by the freelancer until they confirm.

      const { initializeContractEscrow } = await import('./payment-service.js');
      const escrowResult = await initializeContractEscrow(
        contract,
        project,
        employer.wallet_address,
        freelancer.wallet_address
      );

      if (escrowResult.success) {
        await contractRepository.updateContract(contract.id, {
          status: 'active',
          escrow_address: escrowResult.data.escrowAddress,
        });
      }
    }
  } catch (error) {
    logger.error('Failed to create blockchain agreement or initialize escrow', { error });
    // Continue - blockchain is secondary, contract remains pending
  }

  // Update project status based on freelancer limit
  // Only transition to in_progress when all freelancer slots are filled
  /* istanbul ignore next -- mapProjectFromEntity always defaults freelancerLimit=1 */
  const maxFreelancers = project.freelancerLimit != null ? project.freelancerLimit : 1;
  const acceptedProposals = await proposalRepository.getProposalsByProject(project.id, { limit: 1000, offset: 0 });
  const acceptedCount = acceptedProposals.items.filter(p => p.status === 'accepted').length;
  const limitReached = acceptedCount >= maxFreelancers;

  if (limitReached) {
    // All freelancer slots filled — transition project to in_progress and activate first milestone
    /* istanbul ignore next -- mapProjectFromEntity always returns milestones array; ?. is dead code */
    const updatedMilestones = project.milestones?.map((milestone, index): MilestoneEntity => ({
      ...milestone,
      // Automatically set the first milestone to in_progress so the freelancer can begin
      status: (index === 0 ? 'in_progress' : milestone.status) as MilestoneStatus,
      due_date: milestone.dueDate,
    })) || [];

    await projectRepository.updateProject(project.id, {
      status: 'in_progress',
      milestones: updatedMilestones,
    });
  }
  // If limit is not reached, project stays 'open' so more freelancers can be accepted
}

// Accept a proposal - creates a contract
// - Checks if another proposal was already accepted (prevents race condition)
// - Uses freelancer's proposedRate for contract amount (not project.budget)
// - Rejects all other pending proposals for the same project
// - Checks that project has milestones before creating contract
/* eslint-disable max-lines-per-function -- accept-proposal flow; refactor follow-up */
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
    const validated = await validateProposalAcceptance(proposalId, employerId, proposalEntity);
    if ('error' in validated) return validated.error;

    const { proposalEntity: validatedProposal, project, proposalRate, totalAmount, rushFee, isRush, rushFeePercentage } = validated;

    // Rush proposals carry a fee on top of the proposal rate. Fold that fee into
    // the project milestone amounts BEFORE the contract is created, so the escrow
    // (deployed from project milestones) is funded with base + fee and the DB read
    // model matches the on-chain ledger. Without this, validateEscrowAmounts fails
    // with AMOUNT_MISMATCH and a rush contract can never be activated.
    let rushProject = project;
    if (isRush && rushFee > 0 && project.milestones.length > 0) {
      const scaledAmounts = rescaleMilestoneAmounts(
        project.milestones.map(m => m.amount),
        proposalRate,
        rushFee,
      );
      const scaledMilestones = project.milestones.map((m, i) => ({
        ...m,
        amount: scaledAmounts[i] ?? m.amount,
      }));
      const scaledEntityMilestones: MilestoneEntity[] = project.milestones.map((m, i) => ({
        ...m,
        due_date: m.dueDate,
        amount: scaledAmounts[i] ?? m.amount,
      }));
      await projectRepository.updateProject(project.id, { milestones: scaledEntityMilestones });
      rushProject = { ...project, milestones: scaledMilestones };
    }

    const created = await createContractFromProposal({
      proposalId,
      proposalEntity: validatedProposal,
      project,
      employerId,
      proposalRate,
      rushFee,
      totalAmount,
    });
    if ('error' in created) return created.error;

    const { updatedProposalEntity, contractEntity } = created;
    const createdContract = mapContractFromEntity(contractEntity);

    // BLF-6.2: Only reject the remaining pending proposals once the project's
    // freelancer slots are full; otherwise multi-freelancer projects could never
    // fill their other slots.
    const maxFreelancers = project.freelancerLimit != null ? project.freelancerLimit : 1;
    await rejectOtherProposals(project.id, proposalId, maxFreelancers);

    // H12: Log non-critical failures but don't silently swallow them
    try {
      await initializeEscrowForContract({
        contract: createdContract,
        project: rushProject,
        proposalEntity: validatedProposal,
        totalAmount,
        rushFee,
        isRush,
        rushFeePercentage,
      });
    } catch (escrowError) {
      logger.error('Escrow initialization failed after contract creation — contract remains pending', {
        contractId: createdContract.id,
        error: escrowError,
      });
    }

    // Create notification for freelancer
    try {
      await notificationRepository.createNotification({
        id: generateId(),
        user_id: validatedProposal.freelancer_id,
        type: 'proposal_accepted',
        title: 'Proposal Accepted',
        message: `Your proposal for "${project.title}" has been accepted!`,
        data: {
          proposalId: proposalEntity.id,
          projectId: project.id,
          projectTitle: project.title,
          contractId: createdContract.id,
        },
        is_read: false,
      });
    } catch (error) {
      logger.error('Failed to create notification', { error });
      // Continue - notification is secondary
    }

    // Transactional emails gated by the freelancer's email preferences.
    // Best-effort: a preference lookup or send failure must not roll back the acceptance.
    await sendGatedEmail(validatedProposal.freelancer_id, 'proposal_accepted', (recipient) =>
      sendProposalAcceptedEmail(recipient.email, {
        freelancerName: recipient.name,
        projectTitle: project.title,
        projectUrl: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/projects/${project.id}`,
      })
    );

    // The accepted proposal also produced a contract record — tell the freelancer.
    await sendGatedEmail(validatedProposal.freelancer_id, 'contract_created', (recipient) =>
      sendContractCreatedEmail(recipient.email, {
        recipientName: recipient.name,
        projectTitle: project.title,
        contractUrl: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/contracts/${createdContract.id}`,
      })
    );

    // BLF-12.2: durable audit trail — contract creation from an accepted proposal
    // is recorded with the employer as actor and the freelancer as target user.
    // Written after the contract record commits; best-effort by design.
    await persistAuditEntry({
      user_id: validatedProposal.freelancer_id,
      actor_id: employerId,
      action: 'contract.created',
      resource_type: 'contract',
      resource_id: createdContract.id,
      payload: {
        projectId: project.id,
        proposalId: proposalEntity.id,
        totalAmount,
        rushFee,
        isRush,
      },
      ip_address: null,
      user_agent: null,
      status: 'success',
      error_message: null,
    });

    return successResult({
      proposal: mapProposalFromEntity(updatedProposalEntity),
      contract: createdContract,
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
    return errorResult('INVALID_STATUS', `Cannot reject proposal with status "${proposalEntity.status}"`);
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
    return errorResult('INVALID_STATUS', `Cannot withdraw proposal with status "${proposalEntity.status}"`);
  }

  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
    status: 'withdrawn',
  });

  if (!updatedProposalEntity) {
    return errorResult('UPDATE_FAILED', 'Failed to withdraw proposal');
  }

  return successResult(mapProposalFromEntity(updatedProposalEntity));
}
