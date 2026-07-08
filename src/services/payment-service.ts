/**
 * Payment Service
 * Handles milestone completion, approval, disputes, and contract completion
 */

import { Contract, MilestoneStatus, Project, Dispute, mapContractFromEntity, mapProjectFromEntity, mapDisputeFromEntity } from '../utils/entity-mapper.js';
import { logger } from '../config/logger.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { paymentRepository, PaymentType } from '../repositories/payment-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
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
import { parseUnits } from 'ethers';
import type { ServiceResult } from '../types/service-result.js';
import {
  submitMilestoneToRegistry,
  approveMilestoneOnRegistry,
} from './milestone-registry.js';
import { completeAgreement } from './agreement-contract.js';
import { approveMilestone as approveOnChainMilestone, deployEscrowContract as deployRealEscrow } from './escrow-blockchain.js';
import { isWeb3Available } from './web3-client.js';
import { getBlockchainMode } from './blockchain/factory.js';
import { withLock } from '../utils/async-lock.js';
import { refundRequestRepository } from '../repositories/refund-request-repository.js';

const escrowOps = {
  deployEscrow,
  depositToEscrow,
  releaseMilestone: releaseEscrowMilestone,
  getEscrowByContractId,
};

export function setEscrowOpsForTesting(overrides?: Partial<typeof escrowOps>): void {
  if (process.env['NODE_ENV'] !== 'test') {
    return;
  }

  escrowOps.deployEscrow = overrides?.deployEscrow ?? deployEscrow;
  escrowOps.depositToEscrow = overrides?.depositToEscrow ?? depositToEscrow;
  escrowOps.releaseMilestone = overrides?.releaseMilestone ?? releaseEscrowMilestone;
  escrowOps.getEscrowByContractId = overrides?.getEscrowByContractId ?? getEscrowByContractId;
}

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
  // Validate amount to prevent negative/zero/NaN payments
  if (typeof params.amount !== 'number' || !isFinite(params.amount) || params.amount <= 0) {
    logger.error('Invalid payment amount rejected', { amount: params.amount, contractId: params.contractId });
    return;
  }
  try {
    await paymentRepository.create({
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
    logger.error('Failed to create payment record', { error });
  }
}


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


/**
 * Request milestone completion
 * Called by freelancer when they complete a milestone
 */
export async function requestMilestoneCompletion(
  contractId: string,
  milestoneId: string,
  freelancerId: string
): Promise<ServiceResult<MilestoneCompletionResult>> {
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

  if (milestone.status === 'refunded') {
    return {
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Milestone has been refunded' },
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
    logger.error('Failed to submit milestone to blockchain registry', { error });
    // Non-critical: blockchain registry is supplementary, DB is source of truth for status
  }

  // Update milestone status to submitted (immutable pattern)
  const updatedMilestones = projectEntity.milestones.map((m, i) =>
    i === milestoneIndex ? { ...m, status: 'submitted' as const } : m
  );

  // Update project in database
  await projectRepository.updateProject(project.id, {
    milestones: updatedMilestones,
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
 * Validate all preconditions for milestone approval.
 * Returns validated data or a ServiceResult error.
 */
async function validateMilestoneApproval(
  contractId: string,
  milestoneId: string,
  employerId: string,
): Promise<
  | { error: ServiceResult<MilestoneApprovalResult> }
  | {
      contract: Contract;
      project: Project;
      milestone: NonNullable<Project['milestones'][number]>;
      milestoneIndex: number;
      employer: { wallet_address: string };
      freshProject: Project;
      projectEntity: any;
      freshProjectEntity: any;
    }
> {
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return { error: { success: false, error: { code: 'NOT_FOUND', message: 'Contract not found' } } };
  }
  const contract = mapContractFromEntity(contractEntity);

  if (contract.status !== 'active') {
    return { error: { success: false, error: { code: 'INVALID_STATUS', message: `Cannot approve milestone on a ${contract.status} contract` } } };
  }
  if (contract.employerId !== employerId) {
    return { error: { success: false, error: { code: 'UNAUTHORIZED', message: 'Only the contract employer can approve milestones' } } };
  }

  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return { error: { success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } } };
  }
  const project = mapProjectFromEntity(projectEntity);

  const milestoneIndex = projectEntity.milestones.findIndex(m => m.id === milestoneId);
  const milestone = project.milestones.find(m => m.id === milestoneId);
  if (!milestone || milestoneIndex === -1) {
    return { error: { success: false, error: { code: 'NOT_FOUND', message: 'Milestone not found' } } };
  }

  if (milestone.status !== 'submitted') {
    const statusMsg = milestone.status === 'approved'
      ? 'Milestone already approved'
      : milestone.status === 'disputed'
        ? 'Milestone is under dispute and cannot be approved'
        : milestone.status === 'releasing'
          ? 'Milestone payment is already being processed'
          : `Milestone must be submitted before it can be approved (current status: ${milestone.status})`;
    return { error: { success: false, error: { code: 'INVALID_STATUS', message: statusMsg } } };
  }

  const employer = await userRepository.getUserById(employerId);
  if (!employer?.wallet_address) {
    return { error: { success: false, error: { code: 'MISSING_WALLET', message: 'Employer wallet address is required to approve and release milestone payment.' } } };
  }

  // Re-read project before intent write to reduce concurrent-approval race window
  const freshProject = await projectRepository.findProjectById(contract.projectId);
  const freshStatus = freshProject?.milestones[milestoneIndex]?.status;
  if (freshStatus !== 'submitted') {
    const msg = freshStatus === 'releasing'
      ? 'Milestone payment is already being processed'
      : `Milestone status changed concurrently (current: ${freshStatus ?? 'unknown'})`;
    return { error: { success: false, error: { code: 'INVALID_STATUS', message: msg } } };
  }

  return { contract, project, milestone, milestoneIndex, employer: { wallet_address: employer.wallet_address }, freshProject: project, projectEntity, freshProjectEntity: freshProject as any };
}

/**
 * Record SAGA releasing intent and release escrow payment.
 * Returns transactionHash or a ServiceResult error. Rolls back on failure.
 */
async function releaseEscrowPaymentWithSaga(
  contractId: string,
  contract: Contract,
  project: Project,
  milestoneId: string,
  milestoneIndex: number,
  milestoneAmount: number,
  employerId: string,
  employerWallet: string,
  releasingBaseEntity: any,
): Promise<
  { transactionHash: string } | { error: ServiceResult<MilestoneApprovalResult> }
> {
  const releasingMilestones = releasingBaseEntity.milestones.map((m: any, i: number) =>
    i === milestoneIndex ? { ...m, status: 'releasing' as const } : m
  );
  await projectRepository.updateProject(project.id, { milestones: releasingMilestones });

  let transactionHash: string | undefined;
  try {
    if (getBlockchainMode() === 'real' && isWeb3Available()) {
      if (!contract.escrowAddress) {
        return { error: { success: false, error: { code: 'ESCROW_NOT_FOUND', message: 'No escrow contract address found on this contract.' } } };
      }
      const onChainResult = await approveOnChainMilestone(contract.escrowAddress, milestoneIndex);
      transactionHash = onChainResult.transactionHash;
      logger.info('Real blockchain milestone release tx', { transactionHash });
    } else {
      // Simulated mode: only run when NOT using real blockchain
      try {
        const escrow = await escrowOps.getEscrowByContractId(contractId);
        if (escrow) {
          const simReceipt = await escrowOps.releaseMilestone(escrow.address, milestoneId, employerWallet);
          if (!transactionHash) transactionHash = simReceipt.transactionHash;
        } else if (!transactionHash) {
          return { error: { success: false, error: { code: 'ESCROW_NOT_FOUND', message: 'No escrow record found for this contract. Payment cannot be released.' } } };
        }
      } catch (simError) {
        if (!transactionHash) throw simError;
        logger.error('Simulated escrow update failed (non-critical)', { error: simError });
      }
    }

    await createPaymentRecord({
      contractId,
      milestoneId,
      payerId: employerId,
      payeeId: contract.freelancerId,
      amount: milestoneAmount,
      paymentType: 'milestone_release',
      txHash: transactionHash || null,
      status: 'completed',
    });
  } catch (error) {
    // SAGA rollback
    try {
      const latestProject = await projectRepository.findProjectById(contract.projectId);
      if (!latestProject) {
        logger.error('CRITICAL: Cannot rollback — project fetch returned null. Milestone may be stuck in releasing.', { milestoneId, contractId });
      } else {
        const rollbackMilestones = latestProject.milestones.map((m, i) =>
          i === milestoneIndex ? { ...m, status: 'submitted' as const } : m
        );
        await projectRepository.updateProject(project.id, { milestones: rollbackMilestones });
      }
    } catch (rollbackError) {
      logger.error('CRITICAL: Failed to rollback milestone status after payment failure', {
        milestoneId,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }
    return {
      error: {
        success: false,
        error: { code: 'PAYMENT_RELEASE_FAILED', message: error instanceof Error ? error.message : 'Failed to release escrow payment' },
      },
    };
  }

  return { transactionHash: transactionHash! };
}

/**
 * Finalize milestone approval: update DB, blockchain registry, check contract completion, notify.
 */
async function finalizeMilestoneApproval(
  contractId: string,
  contract: Contract,
  project: Project,
  milestoneId: string,
  milestone: NonNullable<Project['milestones'][number]>,
  milestoneIndex: number,
  employerId: string,
  releasingBaseEntity: any,
  transactionHash: string,
): Promise<MilestoneApprovalResult> {
  const updatedMilestones = releasingBaseEntity.milestones.map((m: any, i: number) =>
    i === milestoneIndex ? { ...m, status: 'approved' as const } : m
  );
  await projectRepository.updateProject(project.id, { milestones: updatedMilestones });

  try {
    const employer = await userRepository.getUserById(employerId);
    if (employer?.wallet_address) {
      await approveMilestoneOnRegistry(milestoneId, employer.wallet_address);
    }
  } catch (error) {
    logger.error('Failed to approve milestone on blockchain registry', { error });
  }

  const allApproved = updatedMilestones.every((m: any) => m.status === 'approved' || m.status === 'refunded');
  let contractCompleted = false;

  if (allApproved) {
    await contractRepository.updateContract(contractId, { status: 'completed' });
    contractCompleted = true;
    await projectRepository.updateProject(project.id, { status: 'completed' });

    try {
      const employer = await userRepository.getUserById(employerId);
      if (employer?.wallet_address) {
        await completeAgreement(contractId, employer.wallet_address);
      }
    } catch (error) {
      logger.error('Failed to complete agreement on blockchain', { error });
    }
  }

  await notifyMilestoneApproved(contract.freelancerId, milestoneId, milestone.title, project.id, project.title, contractId);
  await notifyPaymentReleased(contract.freelancerId, milestone.amount, milestoneId, milestone.title, project.id, project.title, contractId);

  return { milestoneId, status: 'approved', paymentReleased: true, transactionHash, contractCompleted };
}

/**
 * Approve a milestone and release payment
 * Called by employer to approve and release payment
 *
 * - Only milestones with status 'submitted' can be approved
 * - Contract must be 'active' status
 * - Blockchain-first: only updates DB after successful escrow release
 */
export async function approveMilestone(
  contractId: string,
  milestoneId: string,
  employerId: string
): Promise<ServiceResult<MilestoneApprovalResult>> {
  // Serialize concurrent approval attempts for the same milestone to prevent double-spend
  return withLock(`milestone-approve:${milestoneId}`, async () => {
    const validated = await validateMilestoneApproval(contractId, milestoneId, employerId);
    if ('error' in validated) return validated.error;

    const { contract, project, milestone, milestoneIndex, employer, freshProjectEntity } = validated;
    const releasingBaseEntity = freshProjectEntity ?? validated.projectEntity;

    // H9: Check for pending refund requests before approving
    const pendingRefund = await refundRequestRepository.findPendingByContract(contractId);
    if (pendingRefund) {
      return {
        success: false,
        error: { code: 'PENDING_REFUND', message: 'Cannot approve milestone while a refund request is pending. Resolve the refund first.' },
      };
    }

    const released = await releaseEscrowPaymentWithSaga(
      contractId, contract, project, milestoneId, milestoneIndex,
      milestone.amount, employerId, employer.wallet_address, releasingBaseEntity,
    );
    if ('error' in released) return released.error;

    const result = await finalizeMilestoneApproval(
      contractId, contract, project, milestoneId, milestone,
      milestoneIndex, employerId, releasingBaseEntity, released.transactionHash,
    );

    return { success: true, data: result };
  });
}


/**
 * Dispute milestone
 * Called by a contract party to dispute a milestone completion
 * 
 * - Contract must be 'active' status
 * - Only milestones with status 'submitted' can be disputed
 */
export async function disputeMilestone(
  contractId: string,
  milestoneId: string,
  initiatorId: string,
  reason: string
): Promise<ServiceResult<MilestoneDisputeResult>> {
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

  await disputeRepository.createDispute({
    id: disputeId,
    contract_id: contractId,
    milestone_id: milestoneId,
    initiator_id: initiatorId,
    reason,
    evidence: [],
    status: 'open',
    resolution: null,
  });

  // Update milestone status to disputed (immutable pattern)
  const updatedMilestones = projectEntity.milestones.map((m, i) =>
    i === milestoneIndex ? { ...m, status: 'disputed' as const } : m
  );

  // Update project in database
  await projectRepository.updateProject(project.id, {
    milestones: updatedMilestones,
  });

  // Do NOT update contract status — only the specific milestone is disputed
  // Other milestones can still be worked on and approved

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
  userId: string,
  role?: string
): Promise<ServiceResult<ContractPaymentStatus>> {
  // Get contract
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contract not found' },
    };
  }
  const contract = mapContractFromEntity(contractEntity);

  // Verify user is a contract party — admins are allowed through for oversight
  if (contract.employerId !== userId && contract.freelancerId !== userId) {
    if (role !== 'admin') {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Only contract parties can view payment status' },
      };
    }
    // admin is allowed through — no early return
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
  const totalAmount = contract.totalAmount;
  const releasedAmount = project.milestones
    .filter(m => m.status === 'approved')
    .reduce((sum, m) => sum + m.amount, 0);
  const refundedAmount = project.milestones
    .filter(m => m.status === 'refunded')
    .reduce((sum, m) => sum + m.amount, 0);
  const pendingAmount = Math.max(totalAmount - releasedAmount - refundedAmount, 0);

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
 * Check if contract is complete (all milestones approved or refunded)
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

  return projectEntity.milestones.every(m => m.status === 'approved' || m.status === 'refunded');
}

/**
 * Get dispute by ID
 */
export async function getDisputeById(disputeId: string): Promise<Dispute | null> {
  const entity = await disputeRepository.getDisputeById(disputeId);
  if (!entity) return null;
  return mapDisputeFromEntity(entity);
}

/**
 * Get disputes by contract ID
 */
export async function getDisputesByContract(contractId: string): Promise<Dispute[]> {
  const entities = await disputeRepository.getAllDisputesByContract(contractId);
  return entities.map(mapDisputeFromEntity);
}

/**
 * @deprecated Disputes are now persisted in the database. Use direct repository calls
 * in tests. This function is a no-op in all environments and will throw in production
 * to prevent accidental calls that expect side effects.
 */
export function clearDisputes(): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('clearDisputes must not be called in production — disputes are persisted in the database');
  }
  // No-op in non-production environments: disputes are stored in the database
}

/**
 * Convert a decimal number to wei (BigInt) safely without floating-point precision loss.
 * Uses ethers.parseUnits which handles the full numeric range correctly.
 * e.g., 0.3 * 1e18 = 299999999999999940 (wrong), but parseUnits('0.3', 18) returns 300000000000000000 (correct)
 */
function toWei(amount: number): bigint {
  // Convert via string to avoid IEEE 754 float precision issues.
  // Number.prototype.toString() produces the shortest string that round-trips,
  // which avoids the scientific-notation / truncation problems of toFixed(18).
  return parseUnits(amount.toString(), 18);
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
): Promise<ServiceResult<{ escrowAddress: string }>> {
  try {
    if (contract.totalAmount <= 0) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONTRACT_AMOUNT',
          message: 'Contract total amount must be greater than zero',
        },
      };
    }

    // Prepare milestone data for escrow
    const escrowMilestones: EscrowMilestone[] = project.milestones.map(m => ({
      id: m.id,
      amount: toWei(m.amount),
      status: 'pending' as const,
    }));

    // Calculate total from milestones to ensure consistency
    const totalFromMilestones = escrowMilestones.reduce((sum, m) => sum + m.amount, 0n);
    // Convert contract.totalAmount to wei for comparison
    const contractTotalWei = toWei(contract.totalAmount);

    if (totalFromMilestones !== contractTotalWei) {
      return {
        success: false,
        error: {
          code: 'AMOUNT_MISMATCH',
          message: 'Contract total amount does not match total milestone amount',
        },
      };
    }

    // Use milestone sum as source of truth for escrow amount
    const contractTotalAmount = totalFromMilestones;

    let escrowAddress: string;

    // Use real blockchain if available, otherwise fall back to simulated
    if (getBlockchainMode() === 'real' && isWeb3Available()) {
      // Deploy real escrow smart contract on Ganache with ETH
      const milestoneAmounts = escrowMilestones.map(m => m.amount);
      const milestoneDescriptions = project.milestones.map(m => m.title || `Milestone ${m.id}`);

      // Use a dedicated platform arbiter address.
      // The server wallet (msg.sender) is the on-chain "employer" (deployer).
      // The arbiter must differ from both the deployer and the freelancer.
      const platformArbiterAddress = process.env['PLATFORM_ARBITER_ADDRESS'];
      if (!platformArbiterAddress) {
        throw new Error('PLATFORM_ARBITER_ADDRESS environment variable is required for real escrow deployment');
      }

      const realDeployment = await deployRealEscrow({
        contractId: contract.id,
        freelancerAddress: freelancerWalletAddress,
        arbiterAddress: platformArbiterAddress,
        milestoneAmounts,
        milestoneDescriptions,
        totalAmount: contractTotalAmount,
      });

      escrowAddress = realDeployment.escrowAddress;
      logger.info('Real escrow deployed', { escrowAddress, contractTotalAmount });

      // Also save to simulated escrow DB for status tracking
      try {
        const simDeployment = await escrowOps.deployEscrow({
          contractId: contract.id,
          employerAddress: employerWalletAddress,
          freelancerAddress: freelancerWalletAddress,
          totalAmount: contractTotalAmount,
          milestones: escrowMilestones,
        });
        await escrowOps.depositToEscrow(
          simDeployment.escrowAddress,
          contractTotalAmount,
          employerWalletAddress
        );
      } catch (simError) {
        logger.error('Failed to save simulated escrow state (non-critical)', { error: simError });
      }
    } else {
      // Simulated mode: deploy escrow in Appwrite tables
      const deployment = await escrowOps.deployEscrow({
        contractId: contract.id,
        employerAddress: employerWalletAddress,
        freelancerAddress: freelancerWalletAddress,
        totalAmount: contractTotalAmount,
        milestones: escrowMilestones,
      });

      await escrowOps.depositToEscrow(
        deployment.escrowAddress,
        contractTotalAmount,
        employerWalletAddress
      );

      escrowAddress = deployment.escrowAddress;
    }

    // Update contract with escrow address
    const updatedContract = await contractRepository.updateContract(contract.id, {
      escrow_address: escrowAddress,
    });

    if (!updatedContract) {
      throw new Error('Failed to persist escrow address on contract');
    }

    return {
      success: true,
      data: { escrowAddress },
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
