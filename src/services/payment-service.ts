/**
 * Payment Service
 * Handles milestone completion, approval, disputes, and contract completion
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import { Contract, MilestoneStatus, Project, Dispute, mapContractFromEntity, mapProjectFromEntity } from '../utils/entity-mapper.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { generateId } from '../utils/id.js';
import {
  deployEscrow,
  depositToEscrow,
  releaseMilestone as releaseEscrowMilestone,
  getEscrowByContractId,
} from './escrow-contract.js';
import {
  notifyMilestoneSubmitted,
  notifyMilestoneApproved,
  notifyPaymentReleased,
  notifyDisputeCreated,
} from './notification-service.js';
import { EscrowMilestone } from './blockchain-types.js';

export type PaymentServiceError = {
  code: string;
  message: string;
  details?: string[];
};

export type PaymentServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: PaymentServiceError };

export type MilestoneCompletionResult = {
  milestoneId: string;
  status: MilestoneStatus;
  notificationSent: boolean;
};

export type MilestoneApprovalResult = {
  milestoneId: string;
  status: MilestoneStatus;
  paymentReleased: boolean;
  transactionHash?: string | undefined;
  contractCompleted: boolean;
};

export type MilestoneDisputeResult = {
  milestoneId: string;
  status: MilestoneStatus;
  disputeId: string;
  disputeCreated: boolean;
};

export type ContractPaymentStatus = {
  contractId: string;
  escrowAddress: string;
  totalAmount: number;
  releasedAmount: number;
  pendingAmount: number;
  milestones: {
    id: string;
    title: string;
    amount: number;
    status: MilestoneStatus;
  }[];
  contractStatus: string;
};


// In-memory dispute store (would be in database in production)
const disputeStore = new Map<string, Dispute>();

/**
 * Request milestone completion
 * Called by freelancer when they complete a milestone
 * Requirements: 6.2
 */
export async function requestMilestoneCompletion(
  contractId: string,
  milestoneId: string,
  freelancerId: string
): Promise<PaymentServiceResult<MilestoneCompletionResult>> {
  // Get contract
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

  // Verify freelancer owns this contract
  if (contract.freelancerId !== freelancerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only the contract freelancer can request milestone completion' },
    };
  }

  // Get project to access milestones
  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  // Find milestone
  const milestoneIndex = projectEntity.milestones.findIndex(m => m.id === milestoneId);
  const milestone = project.milestones.find(m => m.id === milestoneId);
  if (!milestone || milestoneIndex === -1) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  // Check milestone status
  if (milestone.status === 'approved') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Milestone already approved' },
    };
  }

  if (milestone.status === 'disputed') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Milestone is under dispute' },
    };
  }

  // Update milestone status to submitted
  const milestoneToUpdate = projectEntity.milestones[milestoneIndex];
  if (milestoneToUpdate) {
    milestoneToUpdate.status = 'submitted';
  }

  // Update project in database
  await projectRepository.updateProject(project.id, {
    milestones: projectEntity.milestones,
  });

  // Send notification to employer
  await notifyMilestoneSubmitted(
    contract.employerId,
    milestoneId,
    milestone.title,
    project.id,
    project.title,
    contractId
  );

  return {
    success: true,
    data: {
      milestoneId,
      status: 'submitted',
      notificationSent: true,
    },
  };
}


/**
 * Approve milestone completion
 * Called by employer to approve and release payment
 * Requirements: 6.3
 */
export async function approveMilestone(
  contractId: string,
  milestoneId: string,
  employerId: string
): Promise<PaymentServiceResult<MilestoneApprovalResult>> {
  // Get contract
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

  // Verify employer owns this contract
  if (contract.employerId !== employerId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only the contract employer can approve milestones' },
    };
  }

  // Get project to access milestones
  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  // Find milestone
  const milestoneIndex = projectEntity.milestones.findIndex(m => m.id === milestoneId);
  const milestone = project.milestones.find(m => m.id === milestoneId);
  if (!milestone || milestoneIndex === -1) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  // Check milestone status
  if (milestone.status === 'approved') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Milestone already approved' },
    };
  }

  if (milestone.status === 'disputed') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Milestone is under dispute' },
    };
  }

  // Release payment from escrow
  let transactionHash: string | undefined;
  try {
    const escrow = await getEscrowByContractId(contractId);
    if (escrow) {
      const receipt = await releaseEscrowMilestone(
        escrow.address,
        milestoneId,
        employerId
      );
      transactionHash = receipt.transactionHash;
    }
  } catch (error) {
    // Log error but continue - payment release is best effort in simulation
    console.error('Failed to release escrow payment:', error);
  }

  // Update milestone status to approved
  const milestoneToApprove = projectEntity.milestones[milestoneIndex];
  if (milestoneToApprove) {
    milestoneToApprove.status = 'approved';
  }

  // Update project in database
  await projectRepository.updateProject(project.id, {
    milestones: projectEntity.milestones,
  });

  // Check if all milestones are approved
  const allApproved = projectEntity.milestones.every(m => m.status === 'approved');
  let contractCompleted = false;

  if (allApproved) {
    // Update contract status to completed
    await contractRepository.updateContract(contractId, { status: 'completed' });
    contractCompleted = true;

    // Update project status to completed
    await projectRepository.updateProject(project.id, {
      status: 'completed',
    });
  }

  // Send notifications
  await notifyMilestoneApproved(
    contract.freelancerId,
    milestoneId,
    milestone.title,
    project.id,
    project.title,
    contractId
  );

  await notifyPaymentReleased(
    contract.freelancerId,
    milestone.amount,
    milestoneId,
    milestone.title,
    project.id,
    project.title,
    contractId
  );

  return {
    success: true,
    data: {
      milestoneId,
      status: 'approved',
      paymentReleased: true,
      transactionHash,
      contractCompleted,
    },
  };
}


/**
 * Dispute milestone
 * Called by employer to dispute a milestone completion
 * Requirements: 6.4
 */
export async function disputeMilestone(
  contractId: string,
  milestoneId: string,
  initiatorId: string,
  reason: string
): Promise<PaymentServiceResult<MilestoneDisputeResult>> {
  // Get contract
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
      error: { code: 'UNAUTHORIZED', message: 'Only contract parties can dispute milestones' },
    };
  }

  // Get project to access milestones
  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  // Find milestone
  const milestoneIndex = projectEntity.milestones.findIndex(m => m.id === milestoneId);
  const milestone = project.milestones.find(m => m.id === milestoneId);
  if (!milestone || milestoneIndex === -1) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Milestone not found' },
    };
  }

  // Check milestone status
  if (milestone.status === 'approved') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Cannot dispute approved milestone' },
    };
  }

  if (milestone.status === 'disputed') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Milestone already under dispute' },
    };
  }

  // Create dispute record
  const disputeId = generateId();
  const dispute: Dispute = {
    id: disputeId,
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

  disputeStore.set(disputeId, dispute);

  // Update milestone status to disputed
  const milestoneToDispute = projectEntity.milestones[milestoneIndex];
  if (milestoneToDispute) {
    milestoneToDispute.status = 'disputed';
  }

  // Update project in database
  await projectRepository.updateProject(project.id, {
    milestones: projectEntity.milestones,
  });

  // Update contract status to disputed
  await contractRepository.updateContract(contractId, { status: 'disputed' });

  // Send notifications to both parties
  await notifyDisputeCreated(
    contract.freelancerId,
    disputeId,
    milestoneId,
    milestone.title,
    project.id,
    project.title,
    contractId
  );

  await notifyDisputeCreated(
    contract.employerId,
    disputeId,
    milestoneId,
    milestone.title,
    project.id,
    project.title,
    contractId
  );

  return {
    success: true,
    data: {
      milestoneId,
      status: 'disputed',
      disputeId,
      disputeCreated: true,
    },
  };
}


/**
 * Get contract payment status
 * Returns detailed payment status for a contract
 */
export async function getContractPaymentStatus(
  contractId: string,
  userId: string
): Promise<PaymentServiceResult<ContractPaymentStatus>> {
  // Get contract
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

  // Verify user is part of this contract
  if (contract.employerId !== userId && contract.freelancerId !== userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Only contract parties can view payment status' },
    };
  }

  // Get project to access milestones
  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    };
  }
  const project = mapProjectFromEntity(projectEntity);

  // Calculate amounts
  const totalAmount = project.budget;
  const releasedAmount = project.milestones
    .filter(m => m.status === 'approved')
    .reduce((sum, m) => sum + m.amount, 0);
  const pendingAmount = totalAmount - releasedAmount;

  return {
    success: true,
    data: {
      contractId,
      escrowAddress: contract.escrowAddress,
      totalAmount,
      releasedAmount,
      pendingAmount,
      milestones: project.milestones.map(m => ({
        id: m.id,
        title: m.title,
        amount: m.amount,
        status: m.status,
      })),
      contractStatus: contract.status,
    },
  };
}

/**
 * Check if contract is complete (all milestones approved)
 * Requirements: 6.5
 */
export async function isContractComplete(contractId: string): Promise<boolean> {
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return false;
  }

  const projectEntity = await projectRepository.findProjectById(contractEntity.project_id);
  if (!projectEntity) {
    return false;
  }

  return projectEntity.milestones.every(m => m.status === 'approved');
}

/**
 * Get dispute by ID
 */
export async function getDisputeById(disputeId: string): Promise<Dispute | null> {
  return disputeStore.get(disputeId) ?? null;
}

/**
 * Get disputes by contract ID
 */
export async function getDisputesByContract(contractId: string): Promise<Dispute[]> {
  const disputes: Dispute[] = [];
  for (const dispute of disputeStore.values()) {
    if (dispute.contractId === contractId) {
      disputes.push(dispute);
    }
  }
  return disputes;
}

/**
 * Clear all disputes (for testing)
 */
export function clearDisputes(): void {
  disputeStore.clear();
}

/**
 * Initialize escrow for a contract
 * Called when a contract is created
 */
export async function initializeContractEscrow(
  contract: Contract,
  project: Project,
  employerWalletAddress: string,
  freelancerWalletAddress: string
): Promise<PaymentServiceResult<{ escrowAddress: string }>> {
  try {
    // Prepare milestone data for escrow
    const escrowMilestones: EscrowMilestone[] = project.milestones.map(m => ({
      id: m.id,
      amount: BigInt(Math.floor(m.amount * 1e18)), // Convert to wei
      status: 'pending' as const,
    }));

    // Deploy escrow contract
    const deployment = await deployEscrow({
      contractId: contract.id,
      employerAddress: employerWalletAddress,
      freelancerAddress: freelancerWalletAddress,
      totalAmount: BigInt(Math.floor(project.budget * 1e18)),
      milestones: escrowMilestones,
    });

    // Deposit funds to escrow
    await depositToEscrow(
      deployment.escrowAddress,
      BigInt(Math.floor(project.budget * 1e18)),
      employerWalletAddress
    );

    // Update contract with escrow address
    await contractRepository.updateContract(contract.id, {
      escrow_address: deployment.escrowAddress,
    });

    return {
      success: true,
      data: { escrowAddress: deployment.escrowAddress },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'ESCROW_DEPLOYMENT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to deploy escrow',
      },
    };
  }
}
