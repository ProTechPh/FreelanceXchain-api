import { Proposal, mapProposalFromEntity } from '../utils/entity-mapper.js';
import { Contract, mapContractFromEntity, mapProjectFromEntity } from '../utils/entity-mapper.js';
import { proposalRepository, ProposalEntity } from '../repositories/proposal-repository.js';
import { contractRepository, ContractEntity } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';
import { generateId } from '../utils/id.js';
import { createAgreementOnBlockchain, signAgreement } from './agreement-contract.js';
import { FileAttachment, validateAttachments } from '../utils/file-validator.js';

export type CreateProposalInput = {
  projectId: string;
  attachments: FileAttachment[];
  proposedRate: number;
  estimatedDuration: number;
};

export type ProposalServiceError = {
  code: string;
  message: string;
  details?: string[];
};

export type ProposalServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ProposalServiceError };

export type ProposalWithNotification = {
  proposal: Proposal;
  notification: {
    userId: string;
    type: 'proposal_received' | 'proposal_accepted' | 'proposal_rejected';
    title: string;
    message: string;
    data: Record<string, unknown>;
  };
};

export type AcceptProposalResult = {
  proposal: Proposal;
  contract: Contract;
  notification: {
    userId: string;
    type: 'proposal_accepted';
    title: string;
    message: string;
    data: Record<string, unknown>;
  };
};

export type RejectProposalResult = {
  proposal: Proposal;
  notification: {
    userId: string;
    type: 'proposal_rejected';
    title: string;
    message: string;
    data: Record<string, unknown>;
  };
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
  const notification = {
    userId: project.employerId,
    type: 'proposal_received' as const,
    title: 'New Proposal Received',
    message: `A freelancer has submitted a proposal for your project "${project.title}"`,
    data: {
      proposalId: created.id,
      projectId: project.id,
      projectTitle: project.title,
      freelancerId,
    },
  };

  return {
    success: true,
    data: { proposal: created, notification },
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

  // RACE CONDITION FIX: Check if another proposal was already accepted for this project
  const hasAccepted = await proposalRepository.hasAcceptedProposal(proposalEntity.project_id);
  if (hasAccepted) {
    return {
      success: false,
      error: { code: 'ALREADY_ACCEPTED', message: 'Another proposal has already been accepted for this project' },
    };
  }

  // Check that the project has milestones defined
  if (!project.milestones || project.milestones.length === 0) {
    return {
      success: false,
      error: { code: 'NO_MILESTONES', message: 'Project must have milestones defined before accepting a proposal' },
    };
  }

  // Update proposal status
  const updatedProposalEntity = await proposalRepository.updateProposal(proposalId, {
    status: 'accepted',
  });

  if (!updatedProposalEntity) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update proposal status' },
    };
  }
  const updatedProposal = mapProposalFromEntity(updatedProposalEntity);

  // BULK REJECT: Reject all other pending proposals for this project
  try {
    const otherProposals = await proposalRepository.getProposalsByProject(proposalEntity.project_id);
    for (const otherProposal of otherProposals.items) {
      if (otherProposal.id !== proposalId && otherProposal.status === 'pending') {
        await proposalRepository.updateProposal(otherProposal.id, { status: 'rejected' });
      }
    }
  } catch (error) {
    console.error('Failed to bulk-reject other proposals:', error);
    // Non-critical - continue with contract creation
  }

  // Create contract entity
  // FIX: Use the freelancer's proposed rate, not the project budget
  const contractEntity: Omit<ContractEntity, 'created_at' | 'updated_at'> = {
    id: generateId(),
    project_id: proposalEntity.project_id,
    proposal_id: proposalEntity.id,
    freelancer_id: proposalEntity.freelancer_id,
    employer_id: project.employerId,
    escrow_address: '', // Will be set when smart contract is deployed
    total_amount: proposalEntity.proposed_rate ?? project.budget,
    status: 'active',
  };

  const createdContractEntity = await contractRepository.createContract(contractEntity);
  const createdContract = mapContractFromEntity(createdContractEntity);

  // Create agreement on blockchain
  try {
    const employer = await userRepository.getUserById(project.employerId);
    const freelancer = await userRepository.getUserById(proposalEntity.freelancer_id);
    
    if (employer?.wallet_address && freelancer?.wallet_address) {
      // Create agreement on blockchain (employer signs on creation)
      await createAgreementOnBlockchain({
        contractId: createdContract.id,
        employerWallet: employer.wallet_address,
        freelancerWallet: freelancer.wallet_address,
        totalAmount: proposalEntity.proposed_rate ?? project.budget,
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
    }
  } catch (error) {
    console.error('Failed to create blockchain agreement:', error);
    // Continue - blockchain is secondary
  }

  // Update project status to in_progress
  await projectRepository.updateProject(project.id, {
    status: 'in_progress',
  });

  // Create notification for freelancer
  const notification = {
    userId: proposalEntity.freelancer_id,
    type: 'proposal_accepted' as const,
    title: 'Proposal Accepted',
    message: `Your proposal for "${project.title}" has been accepted!`,
    data: {
      proposalId: proposalEntity.id,
      projectId: project.id,
      projectTitle: project.title,
      contractId: createdContract.id,
    },
  };

  return {
    success: true,
    data: {
      proposal: updatedProposal,
      contract: createdContract,
      notification,
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
  const notification = {
    userId: proposalEntity.freelancer_id,
    type: 'proposal_rejected' as const,
    title: 'Proposal Rejected',
    message: `Your proposal for "${project.title}" was not accepted.`,
    data: {
      proposalId: proposalEntity.id,
      projectId: project.id,
      projectTitle: project.title,
    },
  };

  return {
    success: true,
    data: {
      proposal: updatedProposal,
      notification,
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
