import { logger } from '../config/logger.js';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import type {
  RefundRequest,
  CreateRefundRequestInput,
  ApproveRefundInput,
  RejectRefundInput,
} from '../models/escrow-refund.js';
import type { ContractEntity } from '../repositories/contract-repository.js';
import { sendNotificationToUser } from './notification-delivery-service.js';
import { createNotification } from './notification-service.js';
import { refundRequestRepository, type RefundRequestEntity } from '../repositories/refund-request-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { projectRepository, type MilestoneEntity } from '../repositories/project-repository.js';
import { getBlockchainAdapter } from './blockchain/factory.js';
import { withLock, milestoneLockKey } from '../utils/async-lock.js';
import { persistAuditEntry } from '../utils/admin-audit.js';
import { createPaymentRecord } from '../utils/payment-records.js';
import { paymentSummaryCache } from '../utils/cache.js';

async function computeRemainingEscrow(projectId: string, totalAmount: number): Promise<number> {
  let releasedAmount = 0;
  try {
    const project = await projectRepository.findProjectById(projectId);
    const contractMilestones = project?.milestones ?? [];
    releasedAmount = ((contractMilestones ?? []) as Array<{ status: string; amount?: number }>)
      .filter(m => m.status === 'approved')
      .reduce((sum, m) => sum + (m.amount ?? 0), 0);
  } catch {
    // Expected - no action needed: releasedAmount defaults to 0
  }
  return Math.max(0, totalAmount - releasedAmount);
}

type RefundRequestCreation = {
  contract: NonNullable<Awaited<ReturnType<typeof contractRepository.getContractById>>>;
  requestedAmount: number;
  isPartial: boolean;
};

async function validateRefundRequestCreation(input: CreateRefundRequestInput): Promise<
  | { error: ServiceResult<RefundRequest> }
  | RefundRequestCreation
> {
  const contract = await contractRepository.getContractById(input.contractId);
  if (!contract) {
    return { error: errorResult('CONTRACT_NOT_FOUND', 'Contract not found') };
  }
  if (contract.status !== 'active') {
    return { error: errorResult('INVALID_STATUS', `Cannot request refund on a  contract`) };
  }
  const isInvolved = contract.freelancer_id === input.requestedBy || contract.employer_id === input.requestedBy;
  if (!isInvolved) {
    return { error: errorResult('UNAUTHORIZED', 'You are not involved in this contract') };
  }
  const existingRefund = await refundRequestRepository.findPendingByContract(input.contractId);
  if (existingRefund) {
    return { error: errorResult('DUPLICATE_REQUEST', 'There is already a pending refund request for this contract') };
  }
  const remainingEscrow = await computeRemainingEscrow(contract.project_id, contract.total_amount);
  if (input.amount !== undefined) {
    if (typeof input.amount !== 'number' || !isFinite(input.amount) || input.amount <= 0) {
      return { error: errorResult('VALIDATION_ERROR', 'Refund amount must be a positive number') };
    }
    if (input.amount > remainingEscrow) {
      return { error: errorResult('VALIDATION_ERROR', `Refund amount () exceeds remaining escrow balance ()`) };
    }
  }
  const requestedAmount = input.amount ?? remainingEscrow;
  const isPartial = requestedAmount < contract.total_amount;
  return { contract, requestedAmount, isPartial };
}

async function withMilestoneLocks<T>(milestoneIds: string[], fn: () => Promise<T>): Promise<T> {
  const uniqueSortedIds = [...new Set(milestoneIds)].sort();
  let run = fn;
  for (let i = uniqueSortedIds.length - 1; i >= 0; i--) {
    const id = uniqueSortedIds[i]!;
    const next = run;
    run = () => withLock(milestoneLockKey(id), next);
  }
  return run();
}

export async function createRefundRequest(input: CreateRefundRequestInput): Promise<ServiceResult<RefundRequest>> {
  return withLock(`refund-create:${input.contractId}`, async () => {
    try {
      const validated = await validateRefundRequestCreation(input);
      if ('error' in validated) return validated.error;
      const { contract, requestedAmount, isPartial } = validated;
      let milestoneLockIds: string[] = [];
      try {
        const project = await projectRepository.findProjectById(contract.project_id);
        milestoneLockIds = (project?.milestones ?? [])
          .map(m => m.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
      } catch {
        // Expected - no action needed: milestoneLockIds defaults to empty array
      }
      return await withMilestoneLocks(milestoneLockIds, async () => {
        const refund = await refundRequestRepository.create({
          id: '',
          contract_id: input.contractId,
          requested_by: input.requestedBy,
          amount: requestedAmount,
          is_partial: isPartial,
          reason: input.reason,
          status: 'pending',
        });
        if (!refund) throw new Error('Failed to create refund request');
        const otherPartyId = contract.freelancer_id === input.requestedBy ? contract.employer_id : contract.freelancer_id;
        const notificationResult = await createNotification({
          userId: otherPartyId,
          type: 'refund_requested',
          title: 'Refund Requested',
          message: `A refund has been requested for contract. Reason: `,
          data: { relatedId: input.contractId, relatedType: 'contract' },
        });
        if (notificationResult.success) await sendNotificationToUser(otherPartyId, notificationResult.data);
        logger.info(`Refund request created for contract `);
        return successResult(refund as unknown as RefundRequest);
      });
    } catch (error) {
      logger.error('Failed to create refund request:', error);
      return errorResult('CREATE_FAILED', error instanceof Error ? error.message : 'Failed to create refund request');
    }
  });
}

type RefundApprovalContext = { refund: RefundRequestEntity; contract: ContractEntity };

async function validateRefundApproval(input: ApproveRefundInput): Promise<
  | { error: ServiceResult<RefundRequest> }
  | RefundApprovalContext
> {
  const refundData = await refundRequestRepository.findWithContract(input.refundId);
  if (!refundData || !refundData.contract) {
    return { error: errorResult('REFUND_NOT_FOUND', 'Refund request not found') };
  }
  const otherPartyId = refundData.contract.freelancer_id === refundData.requested_by
    ? refundData.contract.employer_id
    : refundData.contract.freelancer_id;
  if (otherPartyId !== input.approvedBy) {
    return { error: errorResult('UNAUTHORIZED', 'Only the other party can approve refund') };
  }
  if (refundData.status !== 'pending') {
    return { error: errorResult('INVALID_STATUS', 'Refund request is not pending') };
  }
  const freshRefund = await refundRequestRepository.findWithContract(input.refundId);
  if (!freshRefund || freshRefund.status !== 'pending') {
    return { error: errorResult('INVALID_STATUS', 'Refund request status changed concurrently') };
  }
  return { refund: refundData, contract: refundData.contract };
}

// ============================================================
// Refund Approval Pipeline - Extracted from approveRefund
// ============================================================

type MilestoneLockContext = { milestoneLockIds: string[] };

async function loadMilestoneLockIds(projectId: string, refundId: string): Promise<MilestoneLockContext> {
  try {
    const project = await projectRepository.findProjectById(projectId);
    const milestoneLockIds = (project?.milestones ?? [])
      .map(m => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return { milestoneLockIds };
  } catch (projectError) {
    logger.error('Failed to load project milestones for refund', { error: projectError, refundId });
    throw projectError;
  }
}

type MilestoneValidation = {
  projectMilestones: MilestoneEntity[];
  pendingMilestones: Array<Record<string, unknown> & { index: number }>;
};

async function validateMilestonesForRefund(projectId: string, refundId: string): Promise<ServiceResult<MilestoneValidation>> {
  let projectMilestones: MilestoneEntity[] = [];
  let pendingMilestones: Array<Record<string, unknown> & { index: number }> = [];
  try {
    const project = await projectRepository.findProjectById(projectId);
    projectMilestones = project?.milestones ?? [];
    pendingMilestones = projectMilestones.reduce<Array<Record<string, unknown> & { index: number }>>((acc, m, index) => {
      if (m.status !== 'approved' && m.status !== 'refunded' && m.status !== 'releasing') acc.push({ ...m, index });
      return acc;
    }, []);
  } catch (projectError) {
    logger.error('Failed to load project milestones for refund', { error: projectError, refundId });
    throw projectError;
  }
  if (projectMilestones.some(m => m.status === 'disputed')) {
    return errorResult('DISPUTE_PENDING', 'This contract has an open dispute. Resolve the dispute before processing a refund.');
  }
  if (pendingMilestones.length === 0) {
    return errorResult('NOTHING_TO_REFUND', 'All milestones are already settled; nothing to refund');
  }
  return successResult({ projectMilestones, pendingMilestones });
}

type RefundTarget = { index: number; amount: number };

function computeRefundTargets(refund: RefundRequestEntity, pendingMilestones: Array<Record<string, unknown> & { index: number }>): RefundTarget[] {
  const isPartialRefund = refund.is_partial === true && (refund.amount ?? 0) > 0;
  if (isPartialRefund) {
    const targets: RefundTarget[] = [];
    let remaining = refund.amount;
    for (const m of pendingMilestones) {
      if (remaining <= 0) break;
      const milestoneAmount = Number((m as { amount?: unknown }).amount ?? 0);
      targets.push({ index: m.index, amount: milestoneAmount });
      remaining -= milestoneAmount;
    }
    return targets;
  }
  return pendingMilestones.map(m => ({ index: m.index, amount: Number((m as { amount?: unknown }).amount ?? 0) }));
}

interface ExecuteBlockchainRefundOptions {
  escrowAddress: string;
  refundTargets: RefundTarget[];
  isPartialRefund: boolean;
  refundId: string;
  contract: ContractEntity;
}

async function executeBlockchainRefund(
  options: ExecuteBlockchainRefundOptions
): Promise<ServiceResult<Record<number, string | null>>> {
  const { escrowAddress, refundTargets, isPartialRefund, refundId, contract } = options;
  const refundTxHashes: Record<number, string | null> = {};
  try {
    const adapter = getBlockchainAdapter();
    if (!adapter.isAvailable()) throw new Error('Blockchain adapter unavailable');
    if (isPartialRefund) {
      for (const target of refundTargets) {
        const onChainStatus = await adapter.getMilestone(escrowAddress, target.index);
        if (onChainStatus.status === 'Refunded') {
          logger.info('Skipping already-refunded milestone during partial refund', { refundId, escrowAddress, milestoneIndex: target.index });
          continue;
        }
        if (onChainStatus.status !== 'Pending') {
          throw new Error(`Milestone  is  on-chain; expected Pending for refund`);
        }
        const refundResult = await adapter.refundMilestone(escrowAddress, target.index);
        refundTxHashes[target.index] = refundResult.transactionHash ?? null;
      }
      logger.info('Blockchain partial refund executed', { refundId, escrowAddress, requestedAmount: contract.total_amount, refundedMilestones: refundTargets.map(t => t.index) });
    } else {
      const refundResult = await adapter.refundEscrow(escrowAddress);
      for (const target of refundTargets) {
        refundTxHashes[target.index] = refundResult.transactionHash ?? null;
      }
      logger.info('Blockchain refund executed', { refundId, escrowAddress, refundedMilestones: refundTargets.map(t => t.index) });
    }
    return successResult(refundTxHashes);
  } catch (blockchainError) {
    logger.error('Failed to execute blockchain refund or read milestone status, rolling back DB approval', { error: blockchainError, refundId });
    try {
      await refundRequestRepository.update(refundId, { status: 'pending', updated_at: new Date().toISOString() });
    } catch (rollbackError) {
      logger.error('CRITICAL: Failed to rollback refund approval after blockchain failure', { error: rollbackError, refundId });
    }
    return errorResult('BLOCKCHAIN_REFUND_FAILED', 'Blockchain refund failed; approval has been rolled back');
  }
}

interface UpdateRefundedMilestonesOptions {
  projectId: string;
  milestones: MilestoneEntity[];
  refundTargets: RefundTarget[];
  refundsAllPending: boolean;
  contractId: string;
}

async function updateRefundedMilestones(
  options: UpdateRefundedMilestonesOptions
): Promise<void> {
  const { projectId, milestones, refundTargets, refundsAllPending, contractId } = options;
  const refundedAt = new Date().toISOString();
  const refundedIndices = new Set(refundTargets.map(t => t.index));
  const updatedMilestones = milestones.map((m, i) =>
    refundedIndices.has(i) ? { ...m, status: 'refunded' as const, refunded_at: refundedAt } : m
  );
  await projectRepository.updateProject(projectId, { milestones: updatedMilestones });
  if (refundsAllPending) {
    await contractRepository.updateContract(contractId, { status: 'cancelled' });
  }
}

interface RecordRefundPaymentsOptions {
  refund: RefundRequestEntity;
  contract: ContractEntity;
  refundTargets: RefundTarget[];
  projectMilestones: MilestoneEntity[];
  refundTxHashes: Record<number, string | null>;
  refundId: string;
}

async function recordRefundPayments(
  options: RecordRefundPaymentsOptions
): Promise<void> {
  const { refund, contract, refundTargets, projectMilestones, refundTxHashes, refundId } = options;
  try {
    for (const target of refundTargets) {
      if (!(target.amount > 0)) continue;
      await createPaymentRecord({
        contractId: refund.contract_id,
        milestoneId: projectMilestones[target.index]?.id ?? null,
        payerId: contract.freelancer_id,
        payeeId: contract.employer_id,
        amount: target.amount,
        paymentType: 'refund',
        txHash: refundTxHashes[target.index] ?? null,
        status: 'completed',
      });
    }
  } catch (recordError) {
    logger.error('Failed to record refund payment (payments log may diverge from ledger)', { error: recordError, refundId });
  } finally {
    paymentSummaryCache.delete(contract.employer_id);
    paymentSummaryCache.delete(contract.freelancer_id);
    paymentSummaryCache.delete(refund.requested_by);
  }
}

async function cancelOtherPendingRefunds(contractId: string, currentRefundId: string): Promise<void> {
  const otherRefunds = await refundRequestRepository.findByContract(contractId);
  const toCancel = otherRefunds.filter(r => r.status === 'pending' && r.id !== currentRefundId);
  await Promise.all(toCancel.map(r => refundRequestRepository.update(r.id, { status: 'cancelled', updated_at: new Date().toISOString() })));
}

async function notifyRefundApproved(refund: RefundRequestEntity): Promise<void> {
  const notificationResult = await createNotification({
    userId: refund.requested_by,
    type: 'refund_approved',
    title: 'Refund Approved',
    message: 'Your refund request has been approved and will be processed shortly.',
    data: { relatedId: refund.contract_id, relatedType: 'contract' },
  });
  if (notificationResult.success) await sendNotificationToUser(refund.requested_by, notificationResult.data);
}

interface PersistRefundAuditEntryOptions {
  refund: RefundRequestEntity;
  approvedBy: string;
  refundId: string;
  contract: ContractEntity;
  refundTargets: RefundTarget[];
}

async function persistRefundAuditEntry(
  options: PersistRefundAuditEntryOptions
): Promise<void> {
  const { refund, approvedBy, refundId, contract, refundTargets } = options;
  await persistAuditEntry({
    user_id: refund.requested_by,
    actor_id: approvedBy,
    action: 'refund.approved',
    resource_type: 'refund_request',
    resource_id: refundId,
    payload: {
      contractId: refund.contract_id,
      amount: refund.amount ?? null,
      isPartial: refund.is_partial ?? false,
      escrowAddress: contract.escrow_address ?? null,
      refundedMilestoneCount: refundTargets.length,
    },
    ip_address: null,
    user_agent: null,
    status: 'success',
    error_message: null,
  });
}

export async function approveRefund(input: ApproveRefundInput): Promise<ServiceResult<RefundRequest>> {
  return withLock(`refund-approve:${input.refundId}`, async () => {
    try {
      const validated = await validateRefundApproval(input);
      if ('error' in validated) return validated.error;

      const { refund, contract } = validated;

      if (!contract.escrow_address) {
        return errorResult('ESCROW_NOT_FOUND', 'Contract has no escrow address. Refund cannot be processed.');
      }

      const { milestoneLockIds } = await loadMilestoneLockIds(contract.project_id, input.refundId);

      return await withMilestoneLocks(milestoneLockIds, async () => {
        const validationResult = await validateMilestonesForRefund(contract.project_id, input.refundId);
        if (!validationResult.success) return validationResult;

        const { projectMilestones, pendingMilestones } = validationResult.data;

        const updated = await refundRequestRepository.update(input.refundId, {
          status: 'approved',
          approved_by: input.approvedBy,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (!updated) throw new Error('Failed to approve refund');

        const refundTargets = computeRefundTargets(refund, pendingMilestones);
        const refundsAllPending = refundTargets.length === pendingMilestones.length;
        const isPartialRefund = refund.is_partial === true && (refund.amount ?? 0) > 0;

        const blockchainResult = await executeBlockchainRefund({
          escrowAddress: contract.escrow_address,
          refundTargets,
          isPartialRefund,
          refundId: input.refundId,
          contract
        });

        if (!blockchainResult.success) return blockchainResult;

        await updateRefundedMilestones({
          projectId: contract.project_id,
          milestones: projectMilestones,
          refundTargets,
          refundsAllPending,
          contractId: refund.contract_id
        });

        await recordRefundPayments({
          refund,
          contract,
          refundTargets,
          projectMilestones,
          refundTxHashes: blockchainResult.data,
          refundId: input.refundId
        });

        await cancelOtherPendingRefunds(refund.contract_id, input.refundId);

        await notifyRefundApproved(refund);

        await persistRefundAuditEntry({ refund, approvedBy: input.approvedBy, refundId: input.refundId, contract, refundTargets });

        logger.info(`Refund  approved by `);

        return successResult(updated as unknown as RefundRequest);
      });
    } catch (error) {
      logger.error('Failed to approve refund:', error);
      return errorResult('APPROVE_FAILED', error instanceof Error ? error.message : 'Failed to approve refund');
    }
  });
}

export async function rejectRefund(input: RejectRefundInput): Promise<ServiceResult<RefundRequest>> {
  return withLock(`refund-reject:${input.refundId}`, async () => {
    try {
      const refundData = await refundRequestRepository.findWithContract(input.refundId);

      if (!refundData || !refundData.contract) {
        return errorResult('REFUND_NOT_FOUND', 'Refund request not found');
      }

      const otherPartyId = refundData.contract.freelancer_id === refundData.requested_by
        ? refundData.contract.employer_id
        : refundData.contract.freelancer_id;

      if (otherPartyId !== input.rejectedBy) {
        return errorResult('UNAUTHORIZED', 'Only the other party can reject refund');
      }

      if (refundData.status !== 'pending') {
        return errorResult('INVALID_STATUS', 'Refund request is not pending');
      }

      const freshRefund = await refundRequestRepository.findWithContract(input.refundId);
      if (!freshRefund || freshRefund.status !== 'pending') {
        return errorResult('INVALID_STATUS', 'Refund request status changed concurrently');
      }

      const updated = await refundRequestRepository.update(input.refundId, {
        status: 'rejected',
        rejected_by: input.rejectedBy,
        rejection_reason: input.reason,
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (!updated) throw new Error('Failed to reject refund');

      const notificationResult = await createNotification({
        userId: refundData.requested_by,
        type: 'refund_rejected',
        title: 'Refund Rejected',
        message: `Your refund request was rejected. Reason: `,
        data: {
          relatedId: refundData.contract_id,
          relatedType: 'contract',
        },
      });

      if (notificationResult.success) {
        await sendNotificationToUser(refundData.requested_by, notificationResult.data);
      }

      await persistAuditEntry({
        user_id: refundData.requested_by,
        actor_id: input.rejectedBy,
        action: 'refund.rejected',
        resource_type: 'refund_request',
        resource_id: input.refundId,
        payload: {
          contractId: refundData.contract_id,
          amount: refundData.amount ?? null,
          isPartial: refundData.is_partial ?? false,
          reason: input.reason,
        },
        ip_address: null,
        user_agent: null,
        status: 'success',
        error_message: null,
      });

      logger.info(`Refund  rejected by `);

      return successResult(updated as unknown as RefundRequest);
    } catch (error) {
      logger.error('Failed to reject refund:', error);
      return errorResult('REJECT_FAILED', error instanceof Error ? error.message : 'Failed to reject refund');
    }
  });
}

export async function getContractRefunds(contractId: string, userId: string): Promise<ServiceResult<RefundRequest[]>> {
  try {
    const contract = await contractRepository.getContractById(contractId);

    if (!contract) {
      return errorResult('CONTRACT_NOT_FOUND', 'Contract not found');
    }

    const isInvolved = contract.freelancer_id === userId || contract.employer_id === userId;

    if (!isInvolved) {
      return errorResult('UNAUTHORIZED', 'You are not involved in this contract');
    }

    const refunds = await refundRequestRepository.findByContract(contractId);

    return successResult(refunds as unknown as RefundRequest[]);
  } catch (error) {
    logger.error('Failed to get contract refunds:', error);
    return errorResult('DATABASE_ERROR', error instanceof Error ? error.message : 'Failed to get refunds');
  }
}

export async function withdrawRefundRequest(
  refundId: string,
  userId: string
): Promise<ServiceResult<{ message: string }>> {
  return withLock(`refund-withdraw:${refundId}`, async () => {
    try {
      const refund = await refundRequestRepository.findWithContract(refundId);
      if (!refund) {
        return errorResult('REFUND_NOT_FOUND', 'Refund request not found');
      }

      if (refund.requested_by !== userId) {
        return errorResult('UNAUTHORIZED', 'Only the user who requested the refund can withdraw it');
      }

      if (refund.status !== 'pending') {
        return errorResult('INVALID_STATUS', 'Only pending refund requests can be withdrawn');
      }

      await refundRequestRepository.update(refundId, {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      });

      return successResult({ message: 'Refund request withdrawn successfully' });
    } catch (error) {
      logger.error('Failed to withdraw refund request:', error);
      return errorResult('WITHDRAW_FAILED', error instanceof Error ? error.message : 'Failed to withdraw refund request');
    }
  });
}
