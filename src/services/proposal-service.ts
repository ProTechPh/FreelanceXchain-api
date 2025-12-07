import { Proposal } from '../models/proposal.js';
import { Contract } from '../models/contract.js';
import { proposalRepository } from '../repositories/proposal-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';
import { generateId } from '../utils/id.js';

export type CreateProposalInput = {
  projectId: string;
  coverLetter: string;
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
  // Check if project exists
  const project = await projectRepository.findProjectById(input.projectId);
  if (!project) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

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

  const proposal: Proposal = {
    id: generateId(),
    projectId: input.projectId,
    freelancerId,
    coverLetter: input.coverLetter,
    proposedRate: input.proposedRate,
    estimatedDuration: input.estimatedDuration,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const created = await proposalRepository.createProposal(proposal);

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
  const proposal = await proposalRepository.findProposalById(proposalId);
  if (!proposal) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Proposal not found' },
    };
  }
  return { success: true, data: proposal };
}

// Get proposals for a project
export async function getProposalsByProject(
  projectId: string,
  options?: QueryOptions
): Promise<ProposalServiceResult<PaginatedResult<Proposal>>> {
  const project = await projectRepository.findProjectById(projectId);
  if (!project) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  const result = await proposalRepository.getProposalsByProject(projectId, options);
  return { success: true, data: result };
}

// Get proposals by freelancer
export async function getProposalsByFreelancer(
  freelancerId: string
): Promise<ProposalServiceResult<Proposal[]>> {
  const proposals = await proposalRepository.getProposalsByFreelancer(freelancerId);
  return { success: true, data: proposals };
}


// Accept a proposal - creates a contract
export async function acceptProposal(
  proposalId: string,
  employerId: string
): Promise<ProposalServiceResult<AcceptProposalResult>> {
  const proposal = await proposalRepository.findProposalById(proposalId);
  if (!proposal) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Proposal not found' },
    };
  }

  // Check if proposal is pending
  if (proposal.status !== 'pending') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot accept proposal with status "${proposal.status}"` },
    };
  }

  // Verify employer owns the project
  const project = await projectRepository.findProjectById(proposal.projectId);
  if (!project) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  if (project.employerId !== employerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not authorized to accept proposals for this project' },
    };
  }

  // Update proposal status
  const updatedProposal = await proposalRepository.updateProposal(proposalId, proposal.projectId, {
    status: 'accepted',
  });

  if (!updatedProposal) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update proposal status' },
    };
  }

  // Create contract
  const contract: Contract = {
    id: generateId(),
    projectId: proposal.projectId,
    proposalId: proposal.id,
    freelancerId: proposal.freelancerId,
    employerId: project.employerId,
    escrowAddress: '', // Will be set when smart contract is deployed
    totalAmount: project.budget,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createdContract = await contractRepository.createContract(contract);

  // Update project status to in_progress
  await projectRepository.updateProject(project.id, project.employerId, {
    status: 'in_progress',
  });

  // Create notification for freelancer
  const notification = {
    userId: proposal.freelancerId,
    type: 'proposal_accepted' as const,
    title: 'Proposal Accepted',
    message: `Your proposal for "${project.title}" has been accepted!`,
    data: {
      proposalId: proposal.id,
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
  const proposal = await proposalRepository.findProposalById(proposalId);
  if (!proposal) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Proposal not found' },
    };
  }

  // Check if proposal is pending
  if (proposal.status !== 'pending') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot reject proposal with status "${proposal.status}"` },
    };
  }

  // Verify employer owns the project
  const project = await projectRepository.findProjectById(proposal.projectId);
  if (!project) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }

  if (project.employerId !== employerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not authorized to reject proposals for this project' },
    };
  }

  // Update proposal status
  const updatedProposal = await proposalRepository.updateProposal(proposalId, proposal.projectId, {
    status: 'rejected',
  });

  if (!updatedProposal) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update proposal status' },
    };
  }

  // Create notification for freelancer
  const notification = {
    userId: proposal.freelancerId,
    type: 'proposal_rejected' as const,
    title: 'Proposal Rejected',
    message: `Your proposal for "${project.title}" was not accepted.`,
    data: {
      proposalId: proposal.id,
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
  const proposal = await proposalRepository.findProposalById(proposalId);
  if (!proposal) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Proposal not found' },
    };
  }

  // Verify freelancer owns the proposal
  if (proposal.freelancerId !== freelancerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'You are not authorized to withdraw this proposal' },
    };
  }

  // Check if proposal can be withdrawn
  if (proposal.status !== 'pending') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot withdraw proposal with status "${proposal.status}"` },
    };
  }

  const updatedProposal = await proposalRepository.updateProposal(proposalId, proposal.projectId, {
    status: 'withdrawn',
  });

  if (!updatedProposal) {
    return {
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to withdraw proposal' },
    };
  }

  return { success: true, data: updatedProposal };
}
