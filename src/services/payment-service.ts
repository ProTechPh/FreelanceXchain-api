/**
 * Payment Service
 * Handles milestone completion, approval, disputes, and contract completion
 */

import { Contract, MilestoneStatus, Project, Dispute, mapContractFromEntity, mapProjectFromEntity, mapDisputeFromEntity } from '../utils/entity-mapper.js';
import { logger } from '../config/logger.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository, type ProjectEntity } from '../repositories/project-repository.js';
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
import { successResult, errorResult } from '../types/service-result.js';
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
    throw new Error(`Invalid payment amount: ${params.amount}`);
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
    throw error;
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

type MilestoneContext = {
  contract: Contract;
  project: Project;
  projectEntity: ProjectEntity;
  milestone: NonNullable<Project['milestones'][number]>;
  milestoneIndex: number;
};

/**
 * Validate that a freelancer can submit a milestone for review.
 * Returns the resolved context or a ServiceResult error.
 */
async function validateMilestoneSubmission(
  contractId: string,
  milestoneId: string,
  freelancerId: string,
): Promise<
  | { error: ServiceResult<MilestoneCompletionResult> }
  | MilestoneContext
> {
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return { error: errorResult('NOT_FOUND', 'Contract not found') };
  }
  const contract = mapContractFromEntity(contractEntity);

  if (contract.status !== 'active') {
    return { error: errorResult('INVALID_STATUS', `Cannot submit milestone on a ${contract.status} contract`) };
  }

  if (contract.freelancerId !== freelancerId) {
    return { error: errorResult('UNAUTHORIZED', 'Only the contract freelancer can request milestone completion') };
  }

  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return { error: errorResult('NOT_FOUND', 'Project not found') };
  }
  const project = mapProjectFromEntity(projectEntity);

  const milestoneIndex = projectEntity.milestones.findIndex(m => m.id === milestoneId);
  const milestone = project.milestones.find(m => m.id === milestoneId);
  if (!milestone || milestoneIndex === -1) {
    return { error: errorResult('NOT_FOUND', 'Milestone not found') };
  }

  if (milestone.status === 'approved') {
    return { error: errorResult('INVALID_STATUS', 'Milestone already approved') };
  }

  if (milestone.status === 'disputed') {
    return { error: errorResult('INVALID_STATUS', 'Milestone is under dispute') };
  }

  if (milestone.status === 'refunded') {
    return { error: errorResult('INVALID_STATUS', 'Milestone has been refunded') };
  }

  if (milestone.status === 'submitted') {
    return { error: errorResult('INVALID_STATUS', 'Milestone already submitted for review') };
  }

  return { contract, project, projectEntity, milestone, milestoneIndex };
}

/**
 * Submit milestone to blockchain registry first (blockchain-first pattern).
 * Non-critical: the DB remains the source of truth for status.
 */
async function submitMilestoneToBlockchainRegistry(input: {
  contract: Contract;
  milestone: NonNullable<Project['milestones'][number]>;
  milestoneId: string;
  contractId: string;
  freelancerId: string;
}): Promise<void> {
  const { contract, milestone, milestoneId, contractId, freelancerId } = input;
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
  }
}

type SubmissionMetadata = {
  deliverables?: Array<{ filename: string; url: string; size: number; mimeType: string }>;
  notes?: string;
};

/**
 * Build the updated milestones array for a submitted milestone (immutable pattern).
 */
function buildSubmittedMilestones(
  projectEntity: ProjectEntity,
  milestoneIndex: number,
  milestone: NonNullable<Project['milestones'][number]>,
  input: { metadata: SubmissionMetadata | undefined; submittedAt: string },
): ProjectEntity['milestones'] {
  const { metadata, submittedAt } = input;
  return projectEntity.milestones.map((m, i) => {
    if (i !== milestoneIndex) return m;
    const currentRevisionCount = Number(m.revisionCount ?? m.revision_count ?? 0);
    const existingStatus = String(m.status ?? '');
    const nextRevisionCount = existingStatus === 'rejected' ? currentRevisionCount + 1 : currentRevisionCount;
    const deliverables = metadata?.deliverables ?? m.deliverable_files ?? m.deliverableFiles ?? [];
    const notes = metadata?.notes ?? m.notes;
    return {
      ...m,
      status: 'submitted' as const,
      submitted_at: submittedAt,
      submittedAt: submittedAt,
      deliverable_files: deliverables,
      deliverableFiles: deliverables,
      ...(notes !== undefined ? { notes } : {}),
      revision_count: nextRevisionCount,
      revisionCount: nextRevisionCount,
      rejection_reason: null,
      rejectionReason: null,
    };
  });
}

/**
 * Request milestone completion
 * Called by freelancer when they complete a milestone
 */
export async function requestMilestoneCompletion(
  contractId: string,
  milestoneId: string,
  freelancerId: string,
  metadata?: SubmissionMetadata
): Promise<ServiceResult<MilestoneCompletionResult>> {
  // BLF-2.2: Serialize concurrent submissions to prevent double blockchain registry entry
  return withLock(`milestone-submit:${milestoneId}`, async () => {
    const validated = await validateMilestoneSubmission(contractId, milestoneId, freelancerId);
    if ('error' in validated) return validated.error;

    const { contract, project, projectEntity, milestone, milestoneIndex } = validated;

    await submitMilestoneToBlockchainRegistry({ contract, milestone, milestoneId, contractId, freelancerId });

    const updatedMilestones = buildSubmittedMilestones(
      projectEntity,
      milestoneIndex,
      milestone,
      { metadata, submittedAt: new Date().toISOString() },
    );

    await projectRepository.updateProject(project.id, {
      milestones: updatedMilestones,
    });

    await notifyMilestoneSubmitted({
      employerId: contract.employerId,
      milestoneId,
      milestoneTitle: milestone.title,
      projectId: project.id,
      projectTitle: project.title,
      contractId,
    });

    return successResult({
      milestoneId,
      status: 'submitted',
      notificationSent: true,
    });
  });
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
      projectEntity: ProjectEntity;
      freshProjectEntity: ProjectEntity;
    }
> {
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return { error: errorResult('NOT_FOUND', 'Contract not found') };
  }
  const contract = mapContractFromEntity(contractEntity);

  if (contract.status !== 'active') {
    return { error: errorResult('INVALID_STATUS', `Cannot approve milestone on a ${contract.status} contract`) };
  }
  if (contract.employerId !== employerId) {
    return { error: errorResult('UNAUTHORIZED', 'Only the contract employer can approve milestones') };
  }

  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return { error: errorResult('NOT_FOUND', 'Project not found') };
  }
  const project = mapProjectFromEntity(projectEntity);

  const milestoneIndex = projectEntity.milestones.findIndex(m => m.id === milestoneId);
  const milestone = project.milestones.find(m => m.id === milestoneId);
  if (!milestone || milestoneIndex === -1) {
    return { error: errorResult('NOT_FOUND', 'Milestone not found') };
  }

  if (milestone.status !== 'submitted') {
    const statusMsg = milestone.status === 'approved'
      ? 'Milestone already approved'
      : milestone.status === 'disputed'
        ? 'Milestone is under dispute and cannot be approved'
        : milestone.status === 'releasing'
          ? 'Milestone payment is already being processed'
          : `Milestone must be submitted before it can be approved (current status: ${milestone.status})`;
    return { error: errorResult('INVALID_STATUS', statusMsg) };
  }

  const employer = await userRepository.getUserById(employerId);
  if (!employer?.wallet_address) {
    return { error: errorResult('MISSING_WALLET', 'Employer wallet address is required to approve and release milestone payment.') };
  }

  // Re-read project before intent write to reduce concurrent-approval race window
  const freshProject = await projectRepository.findProjectById(contract.projectId);
  if (!freshProject) {
    return { error: errorResult('NOT_FOUND', 'Project not found') };
  }
  const freshStatus = freshProject.milestones[milestoneIndex]?.status;
  if (freshStatus !== 'submitted') {
    const msg = freshStatus === 'releasing'
      ? 'Milestone payment is already being processed'
      : `Milestone status changed concurrently (current: ${freshStatus ?? 'unknown'})`;
    return { error: errorResult('INVALID_STATUS', msg) };
  }

  return { contract, project, milestone, milestoneIndex, employer: { wallet_address: employer.wallet_address }, freshProject: project, projectEntity, freshProjectEntity: freshProject };
}

type ReleaseOnBlockchainInput = {
  contract: Contract;
  contractId: string;
  milestoneIndex: number;
  milestoneId: string;
  employerWallet: string;
};

/**
 * Release the milestone on-chain (real) or in the simulated escrow ledger.
 * Returns the transaction hash or a ServiceResult error.
 */
async function releaseOnBlockchain(
  input: ReleaseOnBlockchainInput
): Promise<
  { transactionHash: string } | { error: ServiceResult<MilestoneApprovalResult> }
> {
  if (getBlockchainMode() === 'real' && isWeb3Available()) {
    if (!input.contract.escrowAddress) {
      return { error: errorResult('ESCROW_NOT_FOUND', 'No escrow contract address found on this contract.') };
    }
    const onChainResult = await approveOnChainMilestone(input.contract.escrowAddress, input.milestoneIndex);
    logger.info('Real blockchain milestone release tx', { transactionHash: onChainResult.transactionHash });
    return { transactionHash: onChainResult.transactionHash };
  }

  // Simulated mode: only run when NOT using real blockchain
  const escrow = await escrowOps.getEscrowByContractId(input.contractId);
  if (!escrow) {
    return { error: errorResult('ESCROW_NOT_FOUND', 'No escrow record found for this contract. Payment cannot be released.') };
  }
  const simReceipt = await escrowOps.releaseMilestone(escrow.address, input.milestoneId, input.employerWallet);
  return { transactionHash: simReceipt.transactionHash };
}

/**
 * Read the escrow milestone amount for the payment record, falling back to
 * the contract milestone amount if the escrow read fails (non-critical).
 */
async function readEscrowRecordedAmount(
  contractId: string,
  milestoneId: string,
  fallbackAmount: number,
): Promise<number> {
  try {
    const escrow = await escrowOps.getEscrowByContractId(contractId);
    const escrowMilestone = escrow?.milestones.find(m => m.id === milestoneId);
    return escrowMilestone ? Number(escrowMilestone.amount) : fallbackAmount;
  } catch {
    return fallbackAmount;
  }
}

/**
 * Roll back a milestone stuck in the transient 'releasing' state after a
 * payment failure, so it can be retried. Logs CRITICAL if rollback fails.
 */
async function rollbackReleasingMilestone(
  projectId: string,
  contractId: string,
  milestoneId: string,
  milestoneIndex: number,
): Promise<void> {
  try {
    const latestProject = await projectRepository.findProjectById(projectId);
    if (!latestProject) {
      logger.error('CRITICAL: Cannot rollback — project fetch returned null. Milestone may be stuck in releasing.', { milestoneId, contractId });
    } else {
      // Only roll back if the milestone is still 'releasing' (it may have been
      // finalized by a concurrent retry). Re-read the fresh status to decide.
      const latestStatus = latestProject.milestones[milestoneIndex]?.status;
      if (latestStatus === 'releasing') {
        const rollbackMilestones = latestProject.milestones.map((m, i) =>
          i === milestoneIndex ? { ...m, status: 'submitted' as const } : m
        );
        await projectRepository.updateProject(projectId, { milestones: rollbackMilestones });
        logger.warn('Recovered milestone from "releasing" back to "submitted" after payment failure.', {
          milestoneId, contractId, projectId, milestoneIndex,
        });
      } else {
        logger.info('Milestone no longer in "releasing" during rollback — leaving as-is (likely finalized concurrently).', {
          milestoneId, contractId, currentStatus: latestStatus,
        });
      }
    }
  } catch (rollbackError) {
    // BLF-2.4: CRITICAL — milestone is now stuck in 'releasing' with no automated recovery.
    // A periodic recovery job should detect milestones in 'releasing' status for >N minutes
    // and either retry the release or roll back to 'submitted' with admin notification.
    logger.error('CRITICAL: Failed to rollback milestone status after payment failure. ' +
      'Milestone may be stuck in "releasing" status. Manual intervention required.', {
      milestoneId,
      contractId,
      projectId,
      milestoneIndex,
      error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      actionRequired: 'Check milestone status in DB. If stuck in "releasing", manually revert to "submitted" or retry escrow release.',
    });
  }
}

type ReleaseEscrowPaymentInput = {
  contractId: string;
  contract: Contract;
  project: Project;
  milestoneId: string;
  milestoneIndex: number;
  milestoneAmount: number;
  employerId: string;
  employerWallet: string;
  releasingBaseEntity: ProjectEntity;
};

/**
 * Record SAGA releasing intent and release escrow payment.
 * Returns transactionHash or a ServiceResult error. Rolls back on failure.
 */
async function releaseEscrowPaymentWithSaga(
  input: ReleaseEscrowPaymentInput
): Promise<
  { transactionHash: string } | { error: ServiceResult<MilestoneApprovalResult> }
> {
  const { contract, project, milestoneId, milestoneIndex, milestoneAmount, employerId, employerWallet, contractId, releasingBaseEntity } = input;

  const releasingMilestones = releasingBaseEntity.milestones.map((m, i) =>
    i === milestoneIndex ? { ...m, status: 'releasing' as const } : m
  );
  await projectRepository.updateProject(project.id, { milestones: releasingMilestones });

  let transactionHash: string | undefined;
  try {
    const releaseResult = await releaseOnBlockchain({ contract, contractId, milestoneIndex, milestoneId, employerWallet });
    if ('error' in releaseResult) return releaseResult;
    transactionHash = releaseResult.transactionHash;

    const recordedAmount = await readEscrowRecordedAmount(contractId, milestoneId, milestoneAmount);

    await createPaymentRecord({
      contractId,
      milestoneId,
      payerId: employerId,
      payeeId: contract.freelancerId,
      amount: recordedAmount,
      paymentType: 'milestone_release',
      txHash: transactionHash,
      status: 'completed',
    });
  } catch (error) {
    await rollbackReleasingMilestone(contract.projectId, contractId, milestoneId, milestoneIndex);
    return { error: errorResult('PAYMENT_RELEASE_FAILED', error instanceof Error ? error.message : 'Failed to release escrow payment') };
  }

  return { transactionHash: transactionHash! };
}

/**
 * Approve the milestone on the blockchain registry (best-effort).
 */
async function approveMilestoneOnBlockchainRegistry(
  milestoneId: string,
  employerId: string,
): Promise<void> {
  try {
    const employer = await userRepository.getUserById(employerId);
    if (employer?.wallet_address) {
      await approveMilestoneOnRegistry(milestoneId, employer.wallet_address);
    }
  } catch (error) {
    logger.error('Failed to approve milestone on blockchain registry', { error });
  }
}

type CompleteContractInput = {
  contractId: string;
  project: Project;
  employerId: string;
  updatedMilestones: ProjectEntity['milestones'];
};

/**
 * Mark the contract (and project) completed when every milestone is approved or refunded.
 * Returns whether the contract was completed.
 */
async function completeContractIfAllMilestonesDone(input: CompleteContractInput): Promise<boolean> {
  const { contractId, project, employerId, updatedMilestones } = input;

  const allApproved = updatedMilestones.every(m => m.status === 'approved' || m.status === 'refunded');
  if (!allApproved) return false;

  await contractRepository.updateContract(contractId, { status: 'completed' });
  await projectRepository.updateProject(project.id, { status: 'completed' });

  try {
    const employer = await userRepository.getUserById(employerId);
    if (employer?.wallet_address) {
      await completeAgreement(contractId, employer.wallet_address);
    }
  } catch (error) {
    logger.error('Failed to complete agreement on blockchain', { error });
  }

  return true;
}

type FinalizeMilestoneApprovalInput = {
  contractId: string;
  contract: Contract;
  project: Project;
  milestoneId: string;
  milestone: NonNullable<Project['milestones'][number]>;
  milestoneIndex: number;
  employerId: string;
  releasingBaseEntity: ProjectEntity;
  transactionHash: string;
};

/**
 * Finalize milestone approval: update DB, blockchain registry, check contract completion, notify.
 */
async function finalizeMilestoneApproval(
  input: FinalizeMilestoneApprovalInput
): Promise<MilestoneApprovalResult> {
  const { contractId, contract, project, milestoneId, milestone, milestoneIndex, employerId, releasingBaseEntity, transactionHash } = input;

  const updatedMilestones = releasingBaseEntity.milestones.map((m, i) =>
    i === milestoneIndex ? { ...m, status: 'approved' as const } : m
  );
  await projectRepository.updateProject(project.id, { milestones: updatedMilestones });

  await approveMilestoneOnBlockchainRegistry(milestoneId, employerId);

  const contractCompleted = await completeContractIfAllMilestonesDone({
    contractId,
    project,
    employerId,
    updatedMilestones,
  });

  await notifyMilestoneApproved({
    freelancerId: contract.freelancerId,
    milestoneId,
    milestoneTitle: milestone.title,
    projectId: project.id,
    projectTitle: project.title,
    contractId,
  });
  await notifyPaymentReleased({
    userId: contract.freelancerId,
    amount: milestone.amount,
    milestoneId,
    milestoneTitle: milestone.title,
    projectId: project.id,
    projectTitle: project.title,
    contractId,
  });

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
      return errorResult('PENDING_REFUND', 'Cannot approve milestone while a refund request is pending. Resolve the refund first.');
    }

    const released = await releaseEscrowPaymentWithSaga({
      contractId,
      contract,
      project,
      milestoneId,
      milestoneIndex,
      milestoneAmount: milestone.amount,
      employerId,
      employerWallet: employer.wallet_address,
      releasingBaseEntity,
    });
    if ('error' in released) return released.error;

    const result = await finalizeMilestoneApproval({
      contractId,
      contract,
      project,
      milestoneId,
      milestone,
      milestoneIndex,
      employerId,
      releasingBaseEntity,
      transactionHash: released.transactionHash,
    });

    return successResult(result);
  });
}

type MilestoneDisputeContext = {
  contract: Contract;
  project: Project;
  projectEntity: ProjectEntity;
  milestone: NonNullable<Project['milestones'][number]>;
  milestoneIndex: number;
};

/**
 * Validate that a milestone can be disputed by the initiator.
 * Returns the resolved context or a ServiceResult error.
 */
async function validateMilestoneDispute(
  contractId: string,
  milestoneId: string,
  initiatorId: string,
): Promise<
  | { error: ServiceResult<MilestoneDisputeResult> }
  | MilestoneDisputeContext
> {
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return { error: errorResult('NOT_FOUND', 'Contract not found') };
  }
  const contract = mapContractFromEntity(contractEntity);

  if (contract.status !== 'active') {
    return { error: errorResult('INVALID_STATUS', `Cannot dispute milestone on a ${contract.status} contract`) };
  }

  if (contract.employerId !== initiatorId && contract.freelancerId !== initiatorId) {
    return { error: errorResult('UNAUTHORIZED', 'Only contract parties can dispute milestones') };
  }

  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return { error: errorResult('NOT_FOUND', 'Project not found') };
  }
  const project = mapProjectFromEntity(projectEntity);

  const milestoneIndex = projectEntity.milestones.findIndex(m => m.id === milestoneId);
  const milestone = project.milestones.find(m => m.id === milestoneId);
  if (!milestone || milestoneIndex === -1) {
    return { error: errorResult('NOT_FOUND', 'Milestone not found') };
  }

  // Only milestones with status 'submitted' can be disputed
  // You can't dispute work that hasn't been submitted
  if (milestone.status !== 'submitted') {
    return { error: errorResult('INVALID_STATUS', milestone.status === 'approved'
             ? 'Cannot dispute an already approved milestone'
             : milestone.status === 'disputed'
             ? 'Milestone is already under dispute'
             : `Milestone must be submitted before it can be disputed (current status: ${milestone.status})`) };
  }

  return { contract, project, projectEntity, milestone, milestoneIndex };
}

/**
 * Create the dispute record and mark the milestone disputed (immutable pattern).
 * Returns the generated dispute ID.
 */
async function createMilestoneDispute(
  context: MilestoneDisputeContext,
  input: { contractId: string; milestoneId: string; initiatorId: string; reason: string },
): Promise<string> {
  const { project, projectEntity, milestoneIndex } = context;
  const { contractId, milestoneId, initiatorId, reason } = input;

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

  const updatedMilestones = projectEntity.milestones.map((m, i) =>
    i === milestoneIndex ? { ...m, status: 'disputed' as const } : m
  );

  await projectRepository.updateProject(project.id, {
    milestones: updatedMilestones,
  });

  // Do NOT update contract status — only the specific milestone is disputed
  // Other milestones can still be worked on and approved

  return disputeId;
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
  // BLF-2.1: Serialize concurrent dispute+approve attempts using the same lock key
  // as approveMilestone to prevent the race where both succeed simultaneously
  return withLock(`milestone-approve:${milestoneId}`, async () => {
    const validated = await validateMilestoneDispute(contractId, milestoneId, initiatorId);
    if ('error' in validated) return validated.error;

    const { contract, project, milestone } = validated;
    const disputeId = await createMilestoneDispute(validated, { contractId, milestoneId, initiatorId, reason });

    // Send notifications to both parties
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

    return successResult({
      milestoneId,
      status: 'disputed',
      disputeId,
      disputeCreated: true,
    });
  });
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
    return errorResult('NOT_FOUND', 'Contract not found');
  }
  const contract = mapContractFromEntity(contractEntity);

  // Verify user is a contract party — admins are allowed through for oversight
  if (contract.employerId !== userId && contract.freelancerId !== userId) {
    if (role !== 'admin') {
      return errorResult('UNAUTHORIZED', 'Only contract parties can view payment status');
    }
    // admin is allowed through — no early return
  }

  // Get project to access milestones
  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return errorResult('NOT_FOUND', 'Project not found');
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

  return successResult({
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
  });
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

type EscrowDeploymentInput = {
  contract: Contract;
  project: Project;
  escrowMilestones: EscrowMilestone[];
  contractTotalAmount: bigint;
  employerWalletAddress: string;
  freelancerWalletAddress: string;
};

/**
 * Build the on-chain milestone list for a contract's project.
 */
function buildEscrowMilestones(project: Project): EscrowMilestone[] {
  return project.milestones.map(m => ({
    id: m.id,
    amount: toWei(m.amount),
    status: 'pending' as const,
  }));
}

/**
 * Verify the milestone amounts match the contract total.
 * Returns the milestone sum (source of truth) or null on mismatch.
 */
function validateEscrowAmounts(
  escrowMilestones: EscrowMilestone[],
  contractTotalAmount: number,
): bigint | null {
  const totalFromMilestones = escrowMilestones.reduce((sum, m) => sum + m.amount, 0n);
  return totalFromMilestones === toWei(contractTotalAmount) ? totalFromMilestones : null;
}

/**
 * Deploy the escrow on the real blockchain (Ganache), also saving a simulated
 * escrow record for status tracking (non-critical).
 */
async function deployRealEscrowIfAvailable(input: EscrowDeploymentInput): Promise<string> {
  const { contract, project, escrowMilestones, contractTotalAmount, employerWalletAddress, freelancerWalletAddress } = input;

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

  logger.info('Real escrow deployed', { escrowAddress: realDeployment.escrowAddress, contractTotalAmount });

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

  return realDeployment.escrowAddress;
}

/**
 * Deploy the escrow in the simulated (Appwrite) ledger.
 */
async function deploySimulatedEscrow(input: EscrowDeploymentInput): Promise<string> {
  const { contract, escrowMilestones, contractTotalAmount, employerWalletAddress, freelancerWalletAddress } = input;

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

  return deployment.escrowAddress;
}

/**
 * Persist the escrow address on the contract.
 */
async function persistEscrowAddress(contract: Contract, escrowAddress: string): Promise<void> {
  const updatedContract = await contractRepository.updateContract(contract.id, {
    escrow_address: escrowAddress,
  });

  if (!updatedContract) {
    throw new Error('Failed to persist escrow address on contract');
  }
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
      return errorResult('INVALID_CONTRACT_AMOUNT', 'Contract total amount must be greater than zero');
    }

    const escrowMilestones = buildEscrowMilestones(project);

    const contractTotalAmount = validateEscrowAmounts(escrowMilestones, contract.totalAmount);
    if (contractTotalAmount === null) {
      return errorResult('AMOUNT_MISMATCH', 'Contract total amount does not match total milestone amount');
    }

    const deploymentInput: EscrowDeploymentInput = {
      contract,
      project,
      escrowMilestones,
      contractTotalAmount,
      employerWalletAddress,
      freelancerWalletAddress,
    };

    const escrowAddress = getBlockchainMode() === 'real' && isWeb3Available()
      ? await deployRealEscrowIfAvailable(deploymentInput)
      : await deploySimulatedEscrow(deploymentInput);

    await persistEscrowAddress(contract, escrowAddress);

    return successResult({ escrowAddress });
  } catch (error) {
    return errorResult('ESCROW_DEPLOYMENT_FAILED', error instanceof Error ? error.message : 'Failed to deploy escrow');
  }
}
