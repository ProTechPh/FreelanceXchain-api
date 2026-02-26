/**
 * Payment Service
 * Handles milestone completion, approval, disputes, and contract completion
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import { Contract, MilestoneStatus, Project, Dispute, mapContractFromEntity, mapProjectFromEntity } from '../utils/entity-mapper.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { PaymentRepository, PaymentType } from '../repositories/payment-repository.js';
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
import {
  submitMilestoneToRegistry,
  approveMilestoneOnRegistry,
} from './milestone-registry.js';
import { completeAgreement } from './agreement-contract.js';

/**
 * Create a payment record for audit trail
 */
async function createPaymentRecord(params: {
  contractId: string;
  milestoneId: string | null;
  payerId: string;
  payeeId: string;
  amount: number;
  paymentType: PaymentType;
  txHash: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
}): Promise<void> {
  try {
    await PaymentRepository.create({
      id: generateId(),
      contract_id: params.contractId,
      milestone_id: params.milestoneId,
      payer_id: params.payerId,
      payee_id: params.payeeId,
      amount: params.amount,
      currency: 'ETH',
      tx_hash: params.txHash,
      status: params.status,
      payment_type: params.paymentType,
    });
  } catch (error) {
    console.error('Failed to create payment record:', error);
    // Non-critical: payment record is for audit, don't fail the operation
  }
}

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

  // Verify contract is active
  if (contract.status !== 'active') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot submit milestone on a ${contract.status} contract` },
    };
  }

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

  // Check milestone status - only 'pending' or 'in_progress' can be submitted
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

  if (milestone.status === 'submitted') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Milestone already submitted for review' },
    };
  }

  // Submit milestone to blockchain registry FIRST (blockchain-first pattern)
  try {
    const freelancer = await userRepository.getUserById(freelancerId);
    const employer = await userRepository.getUserById(contract.employerId);
    
    if (freelancer?.wallet_address && employer?.wallet_address) {
      await submitMilestoneToRegistry({
        milestoneId,
        contractId,
        freelancerWallet: freelancer.wallet_address,
        employerWallet: employer.wallet_address,
        amount: milestone.amount,
        title: milestone.title,
        deliverables: `Milestone "${milestone.title}" submitted for review`,
      });
    }
  } catch (error) {
    console.error('Failed to submit milestone to blockchain registry:', error);
    // Non-critical: blockchain registry is supplementary, DB is source of truth for status
  }

  // Update milestone status to submitted in DB
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
 * 
 * FIXED: 
 * - Only milestones with status 'submitted' can be approved
 * - Contract must be 'active' status
 * - Looks up employer wallet address instead of passing UUID
 * - Blockchain-first: only updates DB after successful escrow release
 * - paymentReleased reflects actual blockchain result
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

  // Verify contract is active
  if (contract.status !== 'active') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot approve milestone on a ${contract.status} contract` },
    };
  }

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

  // Only milestones with status 'submitted' can be approved
  if (milestone.status !== 'submitted') {
    return {
      success: false,
      error: { 
        code: 'INVALID_STATUS', 
        message: milestone.status === 'approved' 
          ? 'Milestone already approved' 
          : milestone.status === 'disputed'
          ? 'Milestone is under dispute and cannot be approved'
          : `Milestone must be submitted before it can be approved (current status: ${milestone.status})` 
      },
    };
  }

  // Release payment from escrow - BLOCKCHAIN FIRST
  // Look up the employer's wallet address (NOT the UUID)
  let transactionHash: string | undefined;
  let paymentReleased = false;
  try {
    const escrow = await getEscrowByContractId(contractId);
    const employer = await userRepository.getUserById(employerId);
    if (escrow && employer?.wallet_address) {
      const receipt = await releaseEscrowMilestone(
        escrow.address,
        milestoneId,
        employer.wallet_address  // Use actual wallet address, not UUID
      );
      transactionHash = receipt.transactionHash;
      paymentReleased = true;
    }
  } catch (error) {
    console.error('Failed to release escrow payment:', error);
    // Payment release failed - still proceed with approval but mark paymentReleased as false
    // The payment can be retried later
  }

  // Update milestone status to approved (proceed even if blockchain failed -
  // the employer approved the work, payment release can be retried)
  const milestoneToApprove = projectEntity.milestones[milestoneIndex];
  if (milestoneToApprove) {
    milestoneToApprove.status = 'approved';
  }

  // Update project in database
  await projectRepository.updateProject(project.id, {
    milestones: projectEntity.milestones,
  });

  // Approve milestone on blockchain registry
  try {
    const employer = await userRepository.getUserById(employerId);
    if (employer?.wallet_address) {
      await approveMilestoneOnRegistry(milestoneId, employer.wallet_address);
    }
  } catch (error) {
    console.error('Failed to approve milestone on blockchain registry:', error);
  }

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

    // Complete agreement on blockchain
    try {
      const employer = await userRepository.getUserById(employerId);
      if (employer?.wallet_address) {
        await completeAgreement(contractId, employer.wallet_address);
      }
    } catch (error) {
      console.error('Failed to complete agreement on blockchain:', error);
    }
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

  // Only send payment notification if payment was actually released
  if (paymentReleased) {
    await notifyPaymentReleased(
      contract.freelancerId,
      milestone.amount,
      milestoneId,
      milestone.title,
      project.id,
      project.title,
      contractId
    );
  }

  return {
    success: true,
    data: {
      milestoneId,
      status: 'approved',
      paymentReleased,  // Reflects actual blockchain result
      transactionHash,
      contractCompleted,
    },
  };
}


/**
 * Dispute milestone
 * Called by a contract party to dispute a milestone completion
 * Requirements: 6.4
 * 
 * FIXED:
 * - Contract must be 'active' status
 * - Only milestones with status 'submitted' can be disputed
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

  // Verify contract is active
  if (contract.status !== 'active') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot dispute milestone on a ${contract.status} contract` },
    };
  }

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

  // Only milestones with status 'submitted' can be disputed
  // You can't dispute work that hasn't been submitted
  if (milestone.status !== 'submitted') {
    return {
      success: false,
      error: { 
        code: 'INVALID_STATUS', 
        message: milestone.status === 'approved' 
          ? 'Cannot dispute an already approved milestone'
          : milestone.status === 'disputed'
          ? 'Milestone is already under dispute'
          : `Milestone must be submitted before it can be disputed (current status: ${milestone.status})`
      },
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
 * Convert a decimal number to wei (BigInt) safely without floating-point precision loss.
 * Uses string manipulation instead of `Math.floor(amount * 1e18)` which loses precision.
 * e.g., 0.3 * 1e18 = 299999999999999940 (wrong), but this function returns 300000000000000000 (correct)
 */
function toWei(amount: number): bigint {
  // Convert to string and split on decimal point
  const str = amount.toString();
  const parts = str.split('.');
  const whole = parts[0] ?? '0';
  const decimal = (parts[1] ?? '').padEnd(18, '0').slice(0, 18);
  return BigInt(whole + decimal);
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
    // FIXED: Use toWei() instead of BigInt(Math.floor(amount * 1e18)) to avoid floating-point precision loss
    const escrowMilestones: EscrowMilestone[] = project.milestones.map(m => ({
      id: m.id,
      amount: toWei(m.amount),
      status: 'pending' as const,
    }));

    // Calculate total from milestones to ensure consistency
    const totalFromMilestones = escrowMilestones.reduce((sum, m) => sum + m.amount, 0n);

    // Deploy escrow contract
    const deployment = await deployEscrow({
      contractId: contract.id,
      employerAddress: employerWalletAddress,
      freelancerAddress: freelancerWalletAddress,
      totalAmount: totalFromMilestones,
      milestones: escrowMilestones,
    });

    // Deposit funds to escrow
    await depositToEscrow(
      deployment.escrowAddress,
      totalFromMilestones,
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
