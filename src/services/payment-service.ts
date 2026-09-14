import { Contract, MilestoneStatus, Project, Dispute, mapContractFromEntity, mapProjectFromEntity, mapDisputeFromEntity } from '../utils/entity-mapper.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository, type ProjectEntity } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { disputeRepository } from '../repositories/dispute-repository.js';
import { paymentRepository } from '../repositories/payment-repository.js';
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
import { approveMilestone as approveOnChainMilestone, deployEscrowContract as deployRealEscrow, getMilestoneStatus, submitMilestone as submitMilestoneOnChain, type OnChainMilestoneStatus } from './escrow-blockchain.js';
import { isWeb3Available } from './web3-client.js';
import { getBlockchainMode } from './blockchain/factory.js';
import { withLock, milestoneLockKey } from '../utils/async-lock.js';
import { rescaleMilestoneAmounts } from '../utils/milestone-amounts.js';
import { createPaymentRecord } from '../utils/payment-records.js';
import { SagaOrchestrator } from '../utils/saga-orchestrator.js';
import { refundRequestRepository } from '../repositories/refund-request-repository.js';
import { persistAuditEntry } from '../utils/admin-audit.js';
import { sendGatedEmail, sendMilestoneApprovedEmail, sendPaymentReleasedEmail } from './email-delivery-service.js';
import { paymentSummaryCache } from '../utils/cache.js';

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

  if (milestone.status === 'releasing') {
    return { error: errorResult('INVALID_STATUS', 'Milestone payment is already being processed') };
  }

  return { contract, project, projectEntity, milestone, milestoneIndex };
}

/**
 * Submit milestone to blockchain registry first (blockchain-first pattern).
 * Non-critical: the DB remains the source of truth for status.
 */
/**
 * Real-mode: advance the on-chain escrow milestone to Submitted so the
 * employer can subsequently approve it. Best-effort — the DB stays the source
 * of truth, and the approval flow self-heals a still-Pending on-chain state.
 */
async function submitMilestoneOnChainIfReal(input: {
  contract: Contract;
  milestoneIndex: number;
}): Promise<void> {
  if (getBlockchainMode() !== 'real' || !isWeb3Available()) {
    return;
  }
  if (!input.contract.escrowAddress) {
    return;
  }
  try {
    const status = await getMilestoneStatus(input.contract.escrowAddress, input.milestoneIndex);
    if (status === 'pending') {
      await submitMilestoneOnChain(input.contract.escrowAddress, input.milestoneIndex);
      logger.info('Real blockchain milestone submitted', {
        escrowAddress: input.contract.escrowAddress,
        milestoneIndex: input.milestoneIndex,
      });
    }
  } catch (error) {
    logger.warn('Failed to submit milestone on-chain (approval will self-heal)', {
      escrowAddress: input.contract.escrowAddress,
      milestoneIndex: input.milestoneIndex,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Real-mode: ensure the on-chain escrow milestone is Submitted before the
 * payment release, so approveMilestone() does not revert with
 * MilestoneNotSubmitted. Heals legacy desyncs where the DB says 'submitted'
 * but the chain is still 'pending' (e.g. records created before the platform
 * could submit on-chain). The platform signs submissions on the freelancer's
 * behalf (FreelanceEscrow.submitMilestone allows the platform).
 */
async function ensureMilestoneSubmittedOnChain(
  contract: Contract,
  milestoneIndex: number
): Promise<{ error?: ServiceResult<MilestoneApprovalResult> }> {
  if (getBlockchainMode() !== 'real' || !isWeb3Available()) {
    return {};
  }
  const escrowAddress = contract.escrowAddress;
  if (!escrowAddress) {
    return { error: errorResult('ESCROW_NOT_FOUND', 'No escrow contract address found on this contract.') };
  }

  let status: OnChainMilestoneStatus;
  try {
    status = await getMilestoneStatus(escrowAddress, milestoneIndex);
  } catch (error) {
    logger.error('Failed to read on-chain milestone state before approval', {
      escrowAddress, milestoneIndex, error: error instanceof Error ? error.message : String(error),
    });
    return { error: errorResult('ESCROW_STATE_MISMATCH', 'The escrow could not be synchronized on the blockchain before release. Please contact support.') };
  }

  if (status === 'submitted') {
    return {};
  }
  if (status === 'pending') {
    try {
      await submitMilestoneOnChain(escrowAddress, milestoneIndex);
      return {};
    } catch (error) {
      logger.error('Failed to submit milestone on-chain before release', {
        escrowAddress, milestoneIndex, error: error instanceof Error ? error.message : String(error),
      });
      return { error: errorResult('ESCROW_STATE_MISMATCH', 'The milestone could not be advanced on the blockchain before release. Please contact support.') };
    }
  }
  logger.error('On-chain milestone in incompatible state before approval', { escrowAddress, milestoneIndex, status });
  return { error: errorResult('ESCROW_STATE_MISMATCH', `The on-chain milestone is '${status}' and cannot be approved. Please contact support.`) };
}

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
      try {
        const { signAgreement } = await import('./agreement-contract.js');
        await signAgreement(contractId, freelancer.wallet_address);
      } catch {
        // Safe if already signed or agreement not found
      }

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
    logger.error('Failed to submit milestone to blockchain registry', error);
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
    await submitMilestoneOnChainIfReal({ contract, milestoneIndex });

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

  interface MilestonePaymentSagaContext {
    transactionHash?: string;
    errorResult?: ServiceResult<MilestoneApprovalResult>;
  }

  const saga = new SagaOrchestrator<MilestonePaymentSagaContext>('MilestoneApprovalRelease');

  saga
    .addStep({
      name: 'mark-releasing-in-db',
      execute: async () => {
        const releasingMilestones = releasingBaseEntity.milestones.map((m, i) =>
          i === milestoneIndex ? { ...m, status: 'releasing' as const } : m
        );
        await projectRepository.updateProject(project.id, { milestones: releasingMilestones });
      },
      compensate: async () => {
        await rollbackReleasingMilestone(contract.projectId, contractId, milestoneId, milestoneIndex);
      },
    })
    .addStep({
      name: 'release-on-blockchain',
      execute: async (ctx) => {
        const releaseResult = await releaseOnBlockchain({ contract, contractId, milestoneIndex, milestoneId, employerWallet });
        if ('error' in releaseResult) {
          ctx.errorResult = releaseResult.error;
          throw new Error('On-chain release returned error');
        }
        ctx.transactionHash = releaseResult.transactionHash;
      },
    })
    .addStep({
      name: 'record-payment-in-db',
      execute: async (ctx) => {
        const recordedAmount = await readEscrowRecordedAmount(contractId, milestoneId, milestoneAmount);
        await createPaymentRecord({
          contractId,
          milestoneId,
          payerId: employerId,
          payeeId: contract.freelancerId,
          amount: recordedAmount,
          paymentType: 'milestone_release',
          txHash: ctx.transactionHash ?? null,
          status: 'completed',
        });
      },
    });

  const sagaResult = await saga.execute({});
  if (!sagaResult.success) {
    if (sagaResult.context.errorResult) {
      return { error: sagaResult.context.errorResult };
    }
    return {
      error: errorResult(
        'PAYMENT_RELEASE_FAILED',
        sagaResult.error instanceof Error ? sagaResult.error.message : 'Failed to release escrow payment'
      ),
    };
  }

  return { transactionHash: sagaResult.context.transactionHash! };
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
    logger.error('Failed to approve milestone on blockchain registry', error);
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
      const contractDoc = await contractRepository.getContractById(contractId);
      if (contractDoc?.freelancer_id) {
        const freelancer = await userRepository.getUserById(contractDoc.freelancer_id);
        if (freelancer?.wallet_address) {
          try {
            const { signAgreement } = await import('./agreement-contract.js');
            await signAgreement(contractId, freelancer.wallet_address);
          } catch (signErr) {
            logger.debug('signAgreement skipped or already signed during contract completion', { error: signErr });
          }
        }
      }
      await completeAgreement(contractId, employer.wallet_address);
    }
  } catch (error) {
    logger.error('Failed to complete agreement on blockchain', error);
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

  const nowIso = new Date().toISOString();
  const updatedMilestones = releasingBaseEntity.milestones.map((m, i) =>
    i === milestoneIndex ? {
      ...m,
      status: 'approved' as const,
      approved_at: nowIso,
      completed_at: nowIso,
    } : m
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

  // Transactional emails gated by the freelancer's email preferences.
  // Best-effort: a preference lookup or send failure must not break the approval.
  await sendGatedEmail(contract.freelancerId, 'milestone_updates', (recipient) =>
    sendMilestoneApprovedEmail(recipient.email, {
      freelancerName: recipient.name,
      milestoneTitle: milestone.title,
      amount: `$${milestone.amount}`,
      contractUrl: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/contracts/${contractId}`,
    })
  );
  await sendGatedEmail(contract.freelancerId, 'payment_notifications', (recipient) =>
    sendPaymentReleasedEmail(recipient.email, {
      recipientName: recipient.name,
      amount: `$${milestone.amount}`,
      contractTitle: project.title,
      transactionHash,
    })
  );

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
  return withLock(milestoneLockKey(milestoneId), async () => {
    const validated = await validateMilestoneApproval(contractId, milestoneId, employerId);
    if ('error' in validated) return validated.error;

    const { contract, project, milestone, milestoneIndex, employer, freshProjectEntity } = validated;
    const releasingBaseEntity = freshProjectEntity ?? validated.projectEntity;

    // H9: Check for pending refund requests before approving
    const pendingRefund = await refundRequestRepository.findPendingByContract(contractId);
    if (pendingRefund) {
      return errorResult('PENDING_REFUND', 'Cannot approve milestone while a refund request is pending. Resolve the refund first.');
    }

    // Real-mode: make sure the on-chain escrow milestone is Submitted before
    // releasing, so the contract call cannot revert with MilestoneNotSubmitted.
    const chainSync = await ensureMilestoneSubmittedOnChain(contract, milestoneIndex);
    if (chainSync.error) {
      return chainSync.error;
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

    // BLF-12.2: durable audit trail — milestone approvals (escrow releases) are
    // recorded with the employer as actor, the freelancer as target user, and the
    // released amount + tx hash. Written only after the release fully commits;
    // best-effort by design.
    await persistAuditEntry({
      user_id: contract.freelancerId,
      actor_id: employerId,
      action: 'milestone.approved',
      resource_type: 'milestone',
      resource_id: milestoneId,
      payload: {
        contractId,
        projectId: project.id,
        milestoneTitle: milestone.title ?? null,
        amount: milestone.amount ?? null,
        transactionHash: released.transactionHash ?? null,
        contractCompleted: result.contractCompleted,
      },
      ip_address: null,
      user_agent: null,
      status: 'success',
      error_message: null,
    });

    return successResult(result);
  });
}

export async function getContractPaymentStatus(
  contractId: string,
  userId: string,
  role?: string
): Promise<ServiceResult<ContractPaymentStatus>> {
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

  const projectEntity = await projectRepository.findProjectById(contract.projectId);
  if (!projectEntity) {
    return errorResult('NOT_FOUND', 'Project not found');
  }
  const project = mapProjectFromEntity(projectEntity);

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
 * A single entry in the contract payments log — every ledger money movement
 * (escrow deposit, milestone release, refund, dispute resolution, rush fee)
 * is recorded via createPaymentRecord, so this is the reconcilable audit trail.
 */
export type PaymentHistoryRecord = {
  id: string;
  milestoneId: string | null;
  payerId: string;
  payeeId: string;
  amount: number;
  currency: string;
  txHash: string | null;
  status: string;
  paymentType: string;
  createdAt: string;
};

/**
 * Get the payments log for a contract (newest first). Contract parties can view
 * their own contract; admins may view any contract for oversight.
 */
export async function getContractPaymentHistory(
  contractId: string,
  userId: string,
  role?: string
): Promise<ServiceResult<{ contractId: string; items: PaymentHistoryRecord[] }>> {
  const contractEntity = await contractRepository.getContractById(contractId);
  if (!contractEntity) {
    return errorResult('NOT_FOUND', 'Contract not found');
  }
  const contract = mapContractFromEntity(contractEntity);

  // Same authorization as getContractPaymentStatus: contract parties, or admins.
  if (contract.employerId !== userId && contract.freelancerId !== userId) {
    if (role !== 'admin') {
      return errorResult('UNAUTHORIZED', 'Only contract parties can view payment history');
    }
  }

  try {
    const payments = await paymentRepository.findByContractId(contractId);
    return successResult({
      contractId,
      items: payments.map((p) => ({
        id: p.id,
        milestoneId: p.milestone_id,
        payerId: p.payer_id,
        payeeId: p.payee_id,
        amount: p.amount,
        currency: p.currency,
        txHash: p.tx_hash,
        status: p.status,
        paymentType: p.payment_type,
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    return errorResult('FETCH_FAILED', error instanceof Error ? error.message : 'Failed to fetch payment history');
  }
}

/**
 * A payment in the user-wide log — same shape as PaymentHistoryRecord plus the
 * contract it belongs to (the log spans multiple contracts).
 */
export type MyPaymentRecord = PaymentHistoryRecord & { contractId: string };

/**
 * Get all payments where the user is the payer (money out) or payee (money in),
 * across every contract, newest first. Paginated via limit/offset, with
 * totalEarnings/totalSpent lifetime summaries (completed records, ETH units)
 * on top of the page. The summaries are null (not 0) when their queries fail,
 * so the UI can show "unavailable" instead of a misleading zero.
 */
export async function getMyPayments(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<ServiceResult<{
  items: MyPaymentRecord[];
  total: number;
  hasMore: boolean;
  totalEarnings: number | null;
  totalSpent: number | null;
}>> {
  try {
    const [{ items, total, hasMore }, totalEarnings, totalSpent] = await Promise.all([
      paymentRepository.findByUserId(userId, options),
      paymentRepository.getTotalEarnings(userId),
      paymentRepository.getTotalSpent(userId),
    ]);
    return successResult({
      items: items.map((p) => ({
        id: p.id,
        contractId: p.contract_id,
        milestoneId: p.milestone_id,
        payerId: p.payer_id,
        payeeId: p.payee_id,
        amount: p.amount,
        currency: p.currency,
        txHash: p.tx_hash,
        status: p.status,
        paymentType: p.payment_type,
        createdAt: p.created_at,
      })),
      total,
      hasMore,
      totalEarnings,
      totalSpent,
    });
  } catch (error) {
    return errorResult('FETCH_FAILED', error instanceof Error ? error.message : 'Failed to fetch payments');
  }
}

/**
 * Lifetime payment totals for the authenticated user. `available` is false
 * when either totals query failed, so a widget can show "unavailable" instead
 * of a misleading zero (the totals themselves stay null in that case).
 */
export type PaymentSummary = {
  totalEarnings: number | null;
  totalSpent: number | null;
  available: boolean;
};

/**
 * Get the payment summary for the authenticated user: lifetime completed
 * totals (ETH units, escrow deposits excluded — see payment-repository).
 *
 * Cached per user for 60s — the totals scan every completed payment record, so
 * a frequently-polled widget shouldn't re-scan on every request. Only
 * available results are cached; an unavailable (failed) summary is re-fetched
 * on the next request so recovery isn't masked by a stale failure.
 */
export async function getPaymentSummary(
  userId: string
): Promise<ServiceResult<PaymentSummary>> {
  const cached = paymentSummaryCache.get(userId);
  if (cached) {
    return successResult(cached);
  }

  try {
    const [totalEarnings, totalSpent] = await Promise.all([
      paymentRepository.getTotalEarnings(userId),
      paymentRepository.getTotalSpent(userId),
    ]);
    const data: PaymentSummary = {
      totalEarnings,
      totalSpent,
      available: totalEarnings !== null && totalSpent !== null,
    };
    if (data.available) {
      paymentSummaryCache.set(userId, data);
    }
    return successResult(data);
  } catch (error) {
    return errorResult('FETCH_FAILED', error instanceof Error ? error.message : 'Failed to fetch payment summary');
  }
}

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

export async function getDisputeById(disputeId: string): Promise<Dispute | null> {
  const entity = await disputeRepository.getDisputeById(disputeId);
  if (!entity) return null;
  return mapDisputeFromEntity(entity);
}

export async function getDisputesByContract(contractId: string): Promise<Dispute[]> {
  const entities = await disputeRepository.getAllDisputesByContract(contractId);
  return entities.map(mapDisputeFromEntity);
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
 * Build the milestone amounts the escrow must be funded with.
 *
 * A contract carrying a rush fee must fund the escrow with base + fee, but the
 * DB milestones may still hold base amounts (initial rush proposals, or legacy
 * contracts created before the fee was folded into milestones). In that case
 * the amounts are scaled proportionally so the escrow ledger matches the
 * contract total. When the DB milestones already include the fee (rush accepted
 * before deployment), they are used as-is — never scaled twice.
 */
function buildEscrowMilestones(project: Project, contract: Contract): {
  milestones: EscrowMilestone[];
  amounts: number[];
  scaled: boolean;
} {
  const baseAmounts = project.milestones.map(m => m.amount ?? 0);
  let amounts = baseAmounts;
  let scaled = false;

  if (contract.rushFee > 0) {
    const base = contract.baseAmount > 0 ? contract.baseAmount : contract.totalAmount - contract.rushFee;
    const milestoneSum = baseAmounts.reduce((sum, amount) => sum + amount, 0);
    const alreadyScaled = Math.abs(milestoneSum - contract.totalAmount) < 0.01;
    if (base > 0 && !alreadyScaled && Math.abs(milestoneSum - base) < 0.01) {
      amounts = rescaleMilestoneAmounts(baseAmounts, base, contract.rushFee);
      scaled = true;
    }
  }

  return {
    milestones: project.milestones.map((m, i) => ({
      id: m.id,
      amount: toWei(amounts[i] ?? 0),
      status: 'pending' as const,
    })),
    amounts,
    scaled,
  };
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
async function deployRealEscrowIfAvailable(input: EscrowDeploymentInput): Promise<{ escrowAddress: string; transactionHash: string | null }> {
  const { contract, project, escrowMilestones, contractTotalAmount, employerWalletAddress, freelancerWalletAddress } = input;

  const milestoneAmounts = escrowMilestones.map(m => m.amount);
  const milestoneDescriptions = project.milestones.map(m => m.title || `Milestone ${m.id}`);

  // Use a dedicated platform arbiter address.
  // The server wallet (msg.sender) is the on-chain "employer" (deployer).
  // The arbiter must differ from both the deployer and the freelancer.
  const platformArbiterAddress = process.env['PLATFORM_ARBITER_ADDRESS'] || config.blockchain.arbiterAddress;
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

  logger.info('Real escrow deployed', { escrowAddress: realDeployment.escrowAddress, contractTotalAmount: contractTotalAmount.toString() });

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

  return { escrowAddress: realDeployment.escrowAddress, transactionHash: realDeployment.transactionHash };
}

async function deploySimulatedEscrow(input: EscrowDeploymentInput): Promise<{ escrowAddress: string; transactionHash: string | null }> {
  const { contract, escrowMilestones, contractTotalAmount, employerWalletAddress, freelancerWalletAddress } = input;

  const deployment = await escrowOps.deployEscrow({
    contractId: contract.id,
    employerAddress: employerWalletAddress,
    freelancerAddress: freelancerWalletAddress,
    totalAmount: contractTotalAmount,
    milestones: escrowMilestones,
  });

  const depositReceipt = await escrowOps.depositToEscrow(
    deployment.escrowAddress,
    contractTotalAmount,
    employerWalletAddress
  );

  // The deposit is the funding tx (deploy itself moves no funds); fall back to
  // the deployment hash when no deposit receipt is available (e.g. tests).
  return {
    escrowAddress: deployment.escrowAddress,
    transactionHash: depositReceipt?.transactionHash ?? deployment.transactionHash ?? null,
  };
}

async function persistEscrowAddress(contract: Contract, escrowAddress: string): Promise<void> {
  const updatedContract = await contractRepository.updateContract(contract.id, {
    escrow_address: escrowAddress,
  });

  if (!updatedContract) {
    throw new Error('Failed to persist escrow address on contract');
  }
}

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

    const { milestones: escrowMilestones, amounts: scaledAmounts, scaled } = buildEscrowMilestones(project, contract);

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

    const deployment = getBlockchainMode() === 'real' && isWeb3Available()
      ? await deployRealEscrowIfAvailable(deploymentInput)
      : await deploySimulatedEscrow(deploymentInput);

    await persistEscrowAddress(contract, deployment.escrowAddress);

    // escrow_deposit payment record — the escrow was funded with the full
    // contract amount at deploy; record it so the payments log matches the
    // ledger. Best-effort: a failed record write never fails the deployment
    // (the funds already moved on-chain).
    try {
      await createPaymentRecord({
        contractId: contract.id,
        milestoneId: null,
        payerId: contract.employerId,
        payeeId: contract.freelancerId,
        // contractTotalAmount is wei; contract.totalAmount is the same value in
        // ETH units (validated equal via toWei) and matches the read model.
        amount: contract.totalAmount,
        paymentType: 'escrow_deposit',
        txHash: deployment.transactionHash,
        status: 'completed',
      });
    } catch (recordError) {
      logger.error('Failed to record escrow deposit payment (payments log may diverge from ledger)', {
        error: recordError,
        contractId: contract.id,
      });
    }

    // If the escrow was funded with scaled (fee-inclusive) amounts while the DB
    // milestones still held base amounts, persist the scaled amounts so the read
    // model (released/pending totals, payment records) matches the escrow ledger.
    if (scaled) {
      try {
        await projectRepository.updateProject(project.id, {
          milestones: project.milestones.map((m, i) => ({
            ...m,
            due_date: m.dueDate,
            amount: scaledAmounts[i] ?? m.amount,
          })),
        });
      } catch (scaleError) {
        logger.error('Failed to persist scaled milestone amounts after escrow deployment (read model may diverge)', {
          error: scaleError,
          contractId: contract.id,
          projectId: project.id,
        });
      }
    }

    return successResult({ escrowAddress: deployment.escrowAddress });
  } catch (error) {
    return errorResult('ESCROW_DEPLOYMENT_FAILED', error instanceof Error ? error.message : 'Failed to deploy escrow');
  }
}
