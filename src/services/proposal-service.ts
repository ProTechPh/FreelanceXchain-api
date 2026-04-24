import { Proposal, mapProposalFromEntity } from '../utils/entity-mapper.js';
import { Contract, Project, mapContractFromEntity, mapProjectFromEntity } from '../utils/entity-mapper.js';
import { proposalRepository, ProposalEntity } from '../repositories/proposal-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';
import { generateId } from '../utils/id.js';
import { getSupabaseServiceClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';

import { createAgreementOnBlockchain, signAgreement } from './agreement-contract.js';
import { FileAttachment, validateAttachments } from '../utils/file-validator.js';
import type { ServiceResult, ServiceError } from '../types/service-result.js';

export type CreateProposalInput = {
  projectId: string;
  attachments: FileAttachment[];
  proposedRate: number;
  estimatedDuration: number;
};

export type ProposalServiceResult<T> = ServiceResult<T>;
export type ProposalServiceError = ServiceError;

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


// Submit a proposal for a project
export async function submitProposal(
  freelancerId: string,
  input: CreateProposalInput
): Promise<ProposalServiceResult<ProposalWithNotification>> {
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
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  // Check if project is open for proposals
  if (project.status !== 'open') {
    return {
      success: false,
      error: { code: 'PROJECT_NOT_OPEN', message: 'Project is not accepting proposals' },
    };
  }

  // Check for duplicate proposal
  const existingProposal = await proposalRepository.getExistingProposal(input.projectId, freelancerId);
  if (existingProposal) {
    return {
      success: false,
      error: { code: 'DUPLICATE_PROPOSAL', message: 'You have already submitted a proposal for this project' },
    };
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
export async function getProposalById(proposalId: string): Promise<ProposalServiceResult<Proposal>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Proposal not found' },
    };
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

export async function getProposalWithEmployerHistory(proposalId: string): Promise<ProposalServiceResult<ProposalWithEmployerHistory>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Proposal not found' },
    };
  }

  const proposal = mapProposalFromEntity(proposalEntity);

  // Get project to find employer
  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  // Get employer's completed contracts
  const { items: allContracts } = await contractRepository.getContractsByEmployer(project.employerId);
  const completedContracts = allContracts.filter(c => c.status === 'completed');

  // Get employer's average rating and review count
  const { ReviewRepository } = await import('../repositories/review-repository.js');
  const { average: averageRating, count: reviewCount } = await ReviewRepository.getAverageRating(project.employerId);

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
): Promise<ProposalServiceResult<PaginatedResult<Proposal>>> {
  const projectEntity = await projectRepository.findProjectById(projectId);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
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
): Promise<ProposalServiceResult<Proposal[]>> {
  const proposalEntities = await proposalRepository.getProposalsByFreelancer(freelancerId);
  return { success: true, data: proposalEntities.map(mapProposalFromEntity) };
}


// Accept a proposal - creates a contract
// FIXED:
// - Checks if another proposal was already accepted (prevents race condition)
// - Uses freelancer's proposedRate for contract amount (not project.budget)
// - Rejects all other pending proposals for the same project
// - Checks that project has milestones before creating contract
export async function acceptProposal(
  proposalId: string,
  employerId: string
): Promise<ProposalServiceResult<AcceptProposalResult>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Proposal not found' },
    };
  }

  // Check if proposal is pending
  if (proposalEntity.status !== 'pending') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot accept proposal with status "${proposalEntity.status}"` },
    };
  }

  // Verify employer owns the project
  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  if (project.employerId !== employerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not authorized to accept proposals for this project' },
    };
  }

  // Check that the project has milestones defined
  if (!project.milestones || project.milestones.length === 0) {
    return {
      success: false,
      error: { code: 'NO_MILESTONES', message: 'Project must have milestones defined before accepting a proposal' },
    };
  }

  const proposalRate = proposalEntity.proposed_rate;
  if (proposalRate === null || proposalRate === undefined || proposalRate <= 0) {
    return {
      success: false,
      error: { code: 'INVALID_PROPOSAL_RATE', message: 'Accepted proposal must have a valid positive rate' },
    };
  }

  const milestoneTotal = project.milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  if (Math.abs(milestoneTotal - proposalRate) > 0.01) {
    return {
      success: false,
      error: {
        code: 'AMOUNT_MISMATCH',
        message: 'Proposal rate must match the total project milestone amount before contract creation',
      },
    };
  }

  // RACE CONDITION FIX: Use atomic Supabase RPC to prevent double-accepting proposals
  const { data: result, error: rpcError } = await getSupabaseServiceClient()
    .rpc('accept_proposal_atomic', {
      p_proposal_id: proposalId,
      p_employer_id: employerId
    });

  if (rpcError) {
    logger.error('Failed to accept proposal (RPC)', { error: rpcError });
    return {
      success: false,
      error: { 
        code: rpcError.message.includes('already been accepted') ? 'ALREADY_ACCEPTED' : 'UPDATE_FAILED', 
        message: rpcError.message 
      },
    };
  }

  // Map the new values returned from the RPC
  const createdContractId = result.contract_id;

  // Get the updated entities
  const updatedProposalEntity = await proposalRepository.findProposalById(proposalId);
  const updatedProposal = mapProposalFromEntity(updatedProposalEntity!);
  
  const createdContractEntity = await contractRepository.getContractById(createdContractId);
  const createdContract = mapContractFromEntity(createdContractEntity!);

  // Create agreement on blockchain and initialize escrow
  try {
    const employer = await userRepository.getUserById(project.employerId);
    const freelancer = await userRepository.getUserById(proposalEntity.freelancer_id);
    
    if (employer?.wallet_address && freelancer?.wallet_address) {
      // Create agreement on blockchain (employer signs on creation)
      await createAgreementOnBlockchain({
        contractId: createdContract.id,
        employerWallet: employer.wallet_address,
        freelancerWallet: freelancer.wallet_address,
        totalAmount: proposalRate,
        milestoneCount: project.milestones.length,
        terms: {
          projectTitle: project.title,
          description: project.description ?? '',
          milestones: project.milestones.map(m => ({ title: m.title, amount: m.amount })),
          deadline: project.deadline ?? '',
        },
      });

      // Note: Freelancer should explicitly sign the agreement, not auto-sign
      // The employer accepted the proposal; the freelancer submitted it.
      // Auto-signing is kept for now but should be replaced with explicit consent flow.
      await signAgreement(createdContract.id, freelancer.wallet_address);

      // Initialize escrow and activate contract
      const { initializeContractEscrow } = await import('./payment-service.js');
      const escrowResult = await initializeContractEscrow(
        createdContract,
        project,
        employer.wallet_address,
        freelancer.wallet_address
      );

      if (escrowResult.success) {
        // Update contract status to active and set escrow address
        await contractRepository.updateContract(createdContract.id, {
          status: 'active',
          escrow_address: escrowResult.data.escrowAddress,
        });
      }
    }
  } catch (error) {
    logger.error('Failed to create blockchain agreement or initialize escrow', { error });
    // Continue - blockchain is secondary, contract remains pending
  }

  // Update project status to in_progress and activate the first milestone
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

  await projectRepository.updateProject(project.id, {
    status: 'in_progress',
    milestones: updatedMilestones,
  });

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
        contractId: createdContract.id,
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
      contract: createdContract,
    },
  };
}


// Reject a proposal
export async function rejectProposal(
  proposalId: string,
  employerId: string
): Promise<ProposalServiceResult<RejectProposalResult>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Proposal not found' },
    };
  }

  // Check if proposal is pending
  if (proposalEntity.status !== 'pending') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot reject proposal with status "${proposalEntity.status}"` },
    };
  }

  // Verify employer owns the project
  const projectEntity = await projectRepository.findProjectById(proposalEntity.project_id);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  if (project.employerId !== employerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not authorized to reject proposals for this project' },
    };
  }

  // Update proposal status
  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
    status: 'rejected',
  });

  if (!updatedProposalEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update proposal status' },
    };
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
): Promise<ProposalServiceResult<Proposal>> {
  const proposalEntity = await proposalRepository.findProposalById(proposalId);
  if (!proposalEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Proposal not found' },
    };
  }

  // Verify freelancer owns the proposal
  if (proposalEntity.freelancer_id !== freelancerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not authorized to withdraw this proposal' },
    };
  }

  // Check if proposal can be withdrawn
  if (proposalEntity.status !== 'pending') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot withdraw proposal with status "${proposalEntity.status}"` },
    };
  }

  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
    status: 'withdrawn',
  });

  if (!updatedProposalEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to withdraw proposal' },
    };
  }

  return { success: true, data: mapProposalFromEntity(updatedProposalEntity) };
}
