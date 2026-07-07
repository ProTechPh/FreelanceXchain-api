import { Proposal, mapProposalFromEntity } from '../utils/entity-mapper.js';
import { Contract, Project, mapContractFromEntity, mapProjectFromEntity } from '../utils/entity-mapper.js';
import { proposalRepository, ProposalEntity } from '../repositories/proposal-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/types.js';
import { generateId } from '../utils/id.js';
import { logger } from '../config/logger.js';

import { createAgreementOnBlockchain, signAgreement } from './agreement-contract.js';
import { FileAttachment, validateAttachments } from '../utils/file-validator.js';
import type { ServiceResult } from '../types/service-result.js';

export type CreateProposalInput = {
  projectId: string;
  attachments: FileAttachment[];
  proposedRate: number;
  estimatedDuration: number;
};


export type ProposalWithNotification = {
  proposal: Proposal;
  notification: {
    userId: string;
    type: string;
  };
};

export type AcceptProposalResult = {
  proposal: Proposal;
  contract: Contract;
};

export type RejectProposalResult = {
  proposal: Proposal;
};


// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function fail(code: string, message: string): ServiceResult<never> {
  return { success: false, error: { code, message } };
}

async function validateProposalAcceptance(
  proposalId: string,
  employerId: string
): Promise<ServiceResult<{
  proposalEntity: any;
  project: Project;
  projectEntity: any;
  proposalRate: number;
  rushFee: number;
  totalAmount: number;
  freelancerLimit: number;
}>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return fail('NOT_FOUND', 'Proposal not found');
  }

  // Check if proposal is pending
  if (proposalEntity.status !== 'pending') {
    return fail('INVALID_STATUS', `Cannot accept proposal with status "${proposalEntity.status}"`);
  }

  // Verify employer owns the project
  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return fail('NOT_FOUND', 'Project not found');
  }
  const project = mapProjectFromEntity(projectEntity);

  if (project.employerId !== employerId) {
    return fail('UNAUTHORIZED', 'You are not authorized to accept proposals for this project');
  }

  // Check that the project has milestones defined
  if (!project.milestones || project.milestones.length === 0) {
    return fail('NO_MILESTONES', 'Project must have milestones defined before accepting a proposal');
  }

  const proposalRate = proposalEntity.proposed_rate;
  if (proposalRate === null || proposalRate === undefined || proposalRate <= 0) {
    return fail('INVALID_PROPOSAL_RATE', 'Accepted proposal must have a valid positive rate');
  }

  // Milestone total must match the base amount (proposed rate), not the total with rush fee
  const milestoneTotal = project.milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  if (Math.abs(milestoneTotal - proposalRate) > 0.01) {
    return fail('AMOUNT_MISMATCH', 'Proposal rate must match the total project milestone amount before contract creation');
  }

  // Calculate rush fee if project is marked as rush
  const isRush = project.isRush ?? false;
  const rushFeePercentage = project.rushFeePercentage ?? 25;
  const rushFee = isRush ? Math.round(proposalRate * rushFeePercentage / 100 * 100) / 100 : 0;
  const totalAmount = proposalRate + rushFee;

  // Pre-check: Verify freelancer limit hasn't been reached
  const freelancerLimit = projectEntity.freelancer_limit ?? 1;
  const preCheckAcceptedCount = await proposalRepository.getAcceptedProposalCount(proposalEntity.project_id);
  if (preCheckAcceptedCount >= freelancerLimit) {
    return fail('FREELANCER_LIMIT_REACHED', `This project has already accepted the maximum number of freelancers (${freelancerLimit})`);
  }

  return {
    success: true,
    data: { proposalEntity, project, projectEntity, proposalRate, rushFee, totalAmount, freelancerLimit },
  };
}

async function rejectOtherPendingProposals(projectId: string, acceptedProposalId: string): Promise<void> {
  try {
    const otherProposals = await proposalRepository.getProposalsByProject(projectId, { limit: 1000, offset: 0 });
    for (const otherProposal of otherProposals.items) {
      if (otherProposal.id !== acceptedProposalId && otherProposal.status === 'pending') {
        await proposalRepository.updateProposal(otherProposal.id, { status: 'rejected' });
      }
    }
  } catch (error) {
    logger.error('Failed to reject other pending proposals', { error });
    // Continue - this is non-critical
  }
}

async function initializeBlockchainEscrow(
  contract: Contract,
  project: Project,
  employerId: string,
  freelancerId: string,
  totalAmount: number,
  rushFee: number
): Promise<{ escrowAddress?: string }> {
  const employer = await userRepository.getUserById(employerId);
  const freelancer = await userRepository.getUserById(freelancerId);

  if (!employer?.wallet_address || !freelancer?.wallet_address) {
    return {};
  }

  const isRush = project.isRush ?? false;
  const rushFeePercentage = project.rushFeePercentage ?? 25;

  // Create agreement on blockchain (employer signs on creation)
  await createAgreementOnBlockchain({
    contractId: contract.id,
    employerWallet: employer.wallet_address,
    freelancerWallet: freelancer.wallet_address,
    totalAmount: totalAmount,
    milestoneCount: project.milestones.length,
    terms: {
      projectTitle: project.title,
      description: project.description ?? '',
      milestones: project.milestones.map(m => ({ title: m.title, amount: m.amount })),
      deadline: project.deadline ?? '',
      ...(isRush ? { isRush: true, rushFee, rushFeePercentage } : {}),
    },
  });

  // Note: Freelancer should explicitly sign the agreement, not auto-sign
  // The employer accepted the proposal; the freelancer submitted it.
  // Auto-signing is kept for now but should be replaced with explicit consent flow.
  await signAgreement(contract.id, freelancer.wallet_address);

  // Initialize escrow and activate contract
  const { initializeContractEscrow } = await import('./payment-service.js');
  const escrowResult = await initializeContractEscrow(
    contract,
    project,
    employer.wallet_address,
    freelancer.wallet_address
  );

  if (escrowResult.success) {
    return { escrowAddress: escrowResult.data.escrowAddress };
  }

  return {};
}

async function updateProjectStatusForAcceptance(
  project: Project,
  projectId: string
): Promise<void> {
  // Update project status based on freelancer limit
  // Only transition to in_progress when all freelancer slots are filled
  const maxFreelancers = project.freelancerLimit ?? 1;
  const acceptedProposals = await proposalRepository.getProposalsByProject(projectId, { limit: 1000, offset: 0 });
  const acceptedCount = acceptedProposals.items.filter(p => p.status === 'accepted').length;
  const limitReached = acceptedCount >= maxFreelancers;

  if (limitReached) {
    // All freelancer slots filled — transition project to in_progress and activate first milestone
    const updatedMilestones = project.milestones?.map((milestone, index) => {
      // Automatically set the first milestone to in_progress so the freelancer can begin
      if (index === 0) {
        return {
          ...milestone,
          status: 'in_progress' as any,
          due_date: milestone.dueDate,
        };
      }
      return {
        ...milestone,
        due_date: milestone.dueDate,
      };
    }) || [];

    await projectRepository.updateProject(projectId, {
      status: 'in_progress',
      milestones: updatedMilestones,
    });
  }
  // If limit is not reached, project stays 'open' so more freelancers can be accepted
}


// Submit a proposal for a project
export async function submitProposal(
  freelancerId: string,
  input: CreateProposalInput
): Promise<ServiceResult<ProposalWithNotification>> {
  // Validate attachments
  const attachmentErrors = validateAttachments(input.attachments);
  if (attachmentErrors.length > 0) {
    return {
      success: false,
      error: { 
        code: 'VALIDATION_ERROR', 
        message: 'Invalid attachments',
        details: attachmentErrors.map(e => e.message),
      },
    };
  }

  // Check if project exists
  const projectEntity = await projectRepository.findProjectById(input.projectId);
  if (!projectEntity) {
    return fail('NOT_FOUND', 'Project not found');
  }
  const project = mapProjectFromEntity(projectEntity);

  // Check if project is open for proposals
  if (project.status !== 'open') {
    return fail('PROJECT_NOT_OPEN', 'Project is not accepting proposals');
  }

  // Check for duplicate proposal
  const existingProposal = await proposalRepository.getExistingProposal(input.projectId, freelancerId);
  if (existingProposal) {
    return fail('DUPLICATE_PROPOSAL', 'You have already submitted a proposal for this project');
  }

  // Check if freelancer limit has been reached (all slots filled)
  const acceptedCount = await proposalRepository.getAcceptedProposalCount(input.projectId);
  const freelancerLimit = projectEntity.freelancer_limit ?? 1;
  if (acceptedCount >= freelancerLimit) {
    return fail('FREELANCER_LIMIT_REACHED', `This project has already accepted the maximum number of freelancers (${freelancerLimit})`);
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

  return {
    success: true,
    data: { 
      proposal: created,
      notification: {
        userId: project.employerId,
        type: 'proposal_received',
      },
    },
  };
}


// Get proposal by ID
export async function getProposalById(proposalId: string): Promise<ServiceResult<Proposal>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return fail('NOT_FOUND', 'Proposal not found');
  }
  return { success: true, data: mapProposalFromEntity(proposalEntity) };
}

// Get proposal by ID with employer history (rating and completed projects)
export type EmployerHistory = {
  completedProjectsCount: number;
  averageRating: number;
  reviewCount: number;
  companyName: string | null | undefined;
  industry: string | null | undefined;
};

export type ProposalWithEmployerHistory = {
  proposal: Proposal;
  project: Project;
  employerHistory: EmployerHistory;
};

export async function getProposalWithEmployerHistory(proposalId: string): Promise<ServiceResult<ProposalWithEmployerHistory>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return fail('NOT_FOUND', 'Proposal not found');
  }

  const proposal = mapProposalFromEntity(proposalEntity);

  // Get project to find employer
  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return fail('NOT_FOUND', 'Project not found');
  }
  const project = mapProjectFromEntity(projectEntity);

  // Get employer's completed contracts
  const { items: allContracts } = await contractRepository.getContractsByEmployer(project.employerId);
  const completedContracts = allContracts.filter(c => c.status === 'completed');

  // Get employer's average rating and review count
  const { reviewRepository } = await import('../repositories/review-repository.js');
  const { average: averageRating, count: reviewCount } = await reviewRepository.getAverageRating(project.employerId);

  // Get employer profile
  const { employerProfileRepository } = await import('../repositories/employer-profile-repository.js');
  const employerProfile = await employerProfileRepository.getProfileByUserId(project.employerId);

  return {
    success: true,
    data: {
      proposal,
      project,
      employerHistory: {
        completedProjectsCount: completedContracts.length,
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        reviewCount,
        companyName: employerProfile?.company_name,
        industry: employerProfile?.industry,
      },
    },
  };
}

// Get proposals for a project
export async function getProposalsByProject(
  projectId: string,
  options?: QueryOptions
): Promise<ServiceResult<PaginatedResult<Proposal>>> {
  const projectEntity = await projectRepository.findProjectById(projectId);
  if (!projectEntity) {
    return fail('NOT_FOUND', 'Project not found');
  }

  const result = await proposalRepository.getProposalsByProject(projectId, options);
  return { 
    success: true, 
    data: {
      items: result.items.map(mapProposalFromEntity),
      hasMore: result.hasMore,
      total: result.total,
    }
  };
}

// Get proposals by freelancer
export async function getProposalsByFreelancer(
  freelancerId: string
): Promise<ServiceResult<Proposal[]>> {
  const proposalEntities = await proposalRepository.getProposalsByFreelancer(freelancerId);
  return { success: true, data: proposalEntities.map(mapProposalFromEntity) };
}


// Accept a proposal - creates a contract
// - Checks if another proposal was already accepted (prevents race condition)
// - Uses freelancer's proposedRate for contract amount (not project.budget)
// - Rejects all other pending proposals for the same project
// - Checks that project has milestones before creating contract
export async function acceptProposal(
  proposalId: string,
  employerId: string
): Promise<ServiceResult<AcceptProposalResult>> {
  try {
    // Validate all preconditions
    const validation = await validateProposalAcceptance(proposalId, employerId);
    if (!validation.success) return validation;
    const { proposalEntity, project, proposalRate, rushFee, totalAmount } = validation.data;

    // Accept proposal: update status to 'accepted'
    const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
      status: 'accepted',
    });

    if (!updatedProposalEntity) {
      logger.error('Failed to accept proposal');
      return fail('UPDATE_FAILED', 'Failed to accept proposal or proposal already accepted');
    }

    // Create contract record
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
      return fail('UPDATE_FAILED', 'Proposal accepted but no contract was created');
    }

    // Map entities for downstream use
    const proposal = mapProposalFromEntity(updatedProposalEntity);
    const contract = mapContractFromEntity(contractEntity);

    // Reject other pending proposals for this project (fire-and-forget)
    await rejectOtherPendingProposals(project.id, proposalId);

    // Create agreement on blockchain and initialize escrow (non-critical)
    try {
      const escrowResult = await initializeBlockchainEscrow(
        contract, project, employerId, proposalEntity.freelancer_id, totalAmount, rushFee
      );
      if (escrowResult.escrowAddress) {
        // Update contract status to active and set escrow address
        await contractRepository.updateContract(contract.id, {
          status: 'active',
          escrow_address: escrowResult.escrowAddress,
        });
      }
    } catch (error) {
      logger.error('Failed to create blockchain agreement or initialize escrow', { error });
      // Continue - blockchain is secondary, contract remains pending
    }

    // Update project status based on freelancer limit
    await updateProjectStatusForAcceptance(project, project.id);

    // Create notification for freelancer
    try {
      await notificationRepository.createNotification({
        id: generateId(),
        user_id: proposalEntity.freelancer_id,
        type: 'proposal_accepted',
        title: 'Proposal Accepted',
        message: `Your proposal for "${project.title}" has been accepted!`,
        data: {
          proposalId: proposalEntity.id,
          projectId: project.id,
          projectTitle: project.title,
          contractId: contract.id,
        },
        is_read: false,
      });
    } catch (error) {
      logger.error('Failed to create notification', { error });
      // Continue - notification is secondary
    }

    return {
      success: true,
      data: {
        proposal,
        contract,
      },
    };
  } catch (error) {
    logger.error('Unexpected error accepting proposal', { error });
    return fail('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}


// Reject a proposal
export async function rejectProposal(
  proposalId: string,
  employerId: string
): Promise<ServiceResult<RejectProposalResult>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return fail('NOT_FOUND', 'Proposal not found');
  }

  // Check if proposal is pending
  if (proposalEntity.status !== 'pending') {
    return fail('INVALID_STATUS', `Cannot reject proposal with status "${proposalEntity.status}"`);
  }

  // Verify employer owns the project
  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return fail('NOT_FOUND', 'Project not found');
  }
  const project = mapProjectFromEntity(projectEntity);

  if (project.employerId !== employerId) {
    return fail('UNAUTHORIZED', 'You are not authorized to reject proposals for this project');
  }

  // Update proposal status
  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
    status: 'rejected',
  });

  if (!updatedProposalEntity) {
    return fail('UPDATE_FAILED', 'Failed to update proposal status');
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

  return {
    success: true,
    data: {
      proposal: updatedProposal,
    },
  };
}

// Withdraw a proposal (by freelancer)
export async function withdrawProposal(
  proposalId: string,
  freelancerId: string
): Promise<ServiceResult<Proposal>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return fail('NOT_FOUND', 'Proposal not found');
  }

  // Verify freelancer owns the proposal
  if (proposalEntity.freelancer_id !== freelancerId) {
    return fail('UNAUTHORIZED', 'You are not authorized to withdraw this proposal');
  }

  // Check if proposal can be withdrawn
  if (proposalEntity.status !== 'pending') {
    return fail('INVALID_STATUS', `Cannot withdraw proposal with status "${proposalEntity.status}"`);
  }

  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
    status: 'withdrawn',
  });

  if (!updatedProposalEntity) {
    return fail('UPDATE_FAILED', 'Failed to withdraw proposal');
  }

  return { success: true, data: mapProposalFromEntity(updatedProposalEntity) };
}
