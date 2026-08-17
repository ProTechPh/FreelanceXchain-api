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

/**
 * Compute the escrow balance still available for refund: the contract total
 * minus milestones already approved and released. Non-critical fetch — on
 * failure we conservatively use the full contract amount as the ceiling
 * (safe: prevents under-refund, not over-refund).
 */
async function computeRemainingEscrow(projectId: string, totalAmount: number): Promise<number> {
  let releasedAmount = 0;
  try {
    // Milestone state lives in the project document (single source of truth), so
    // read it from there. On failure we conservatively use the full contract
    // amount as the ceiling (safe: prevents under-refund, not over-refund).
    const project = await projectRepository.findProjectById(projectId);
    const contractMilestones = project?.milestones ?? [];
    releasedAmount = ((contractMilestones ?? []) as Array<{ status: string; amount?: number }>)
      .filter(m => m.status === 'approved')
      .reduce((sum, m) => sum + (m.amount ?? 0), 0);
  } catch {
    // Non-critical — proceed with full contract amount as ceiling
  }
  return Math.max(0, totalAmount - releasedAmount);
}

type RefundRequestCreation = {
  contract: NonNullable<Awaited<ReturnType<typeof contractRepository.getContractById>>>;
  requestedAmount: number;
  isPartial: boolean;
};

/**
 * Validate that a refund request can be created for the contract.
 * Returns the resolved amounts or a ServiceResult error.
 */
async function validateRefundRequestCreation(input: CreateRefundRequestInput): Promise<
  | { error: ServiceResult<RefundRequest> }
  | RefundRequestCreation
> {
  const contract = await contractRepository.getContractById(input.contractId);
  if (!contract) {
    return { error: errorResult('CONTRACT_NOT_FOUND', 'Contract not found') };
  }

  if (contract.status !== 'active') {
    return { error: errorResult('INVALID_STATUS', `Cannot request refund on a ${contract.status} contract`) };
  }

  const isInvolved =
    contract.freelancer_id === input.requestedBy ||
    contract.employer_id === input.requestedBy;

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
      return { error: errorResult('VALIDATION_ERROR', `Refund amount (${input.amount}) exceeds remaining escrow balance (${remainingEscrow})`) };
    }
  }

  const requestedAmount = input.amount ?? remainingEscrow;
  const isPartial = requestedAmount < contract.total_amount;

  return { contract, requestedAmount, isPartial };
}

export async function createRefundRequest(
  input: CreateRefundRequestInput
): Promise<ServiceResult<RefundRequest>> {
  // BLF-3.1: Serialize refund creation per contract to prevent duplicate pending requests
  return withLock(`refund-create:${input.contractId}`, async () => {
    try {
      const validated = await validateRefundRequestCreation(input);
      if ('error' in validated) return validated.error;

      const { contract, requestedAmount, isPartial } = validated;

      const refund = await refundRequestRepository.create({
        id: '',
        contract_id: input.contractId,
        requested_by: input.requestedBy,
        amount: requestedAmount,
        is_partial: isPartial,
        reason: input.reason,
        status: 'pending',
      });

      if (!refund) {
        throw new Error('Failed to create refund request');
      }

      const otherPartyId = contract.freelancer_id === input.requestedBy
        ? contract.employer_id
        : contract.freelancer_id;

      const notificationResult = await createNotification({
        userId: otherPartyId,
        type: 'refund_requested',
        title: 'Refund Requested',
        message: `A refund has been requested for contract. Reason: ${input.reason}`,
        data: {
          relatedId: input.contractId,
          relatedType: 'contract',
        },
      });

      if (notificationResult.success) {
        await sendNotificationToUser(otherPartyId, notificationResult.data);
      }

      logger.info(`Refund request created for contract ${input.contractId}`);

      return successResult(refund as unknown as RefundRequest);
    } catch (error) {
      logger.error('Failed to create refund request:', error);
      return errorResult('CREATE_FAILED', error instanceof Error ? error.message : 'Failed to create refund request');
    }
  });
}

type RefundApprovalContext = {
  refund: RefundRequestEntity;
  contract: ContractEntity;
};

/**
 * Validate that a refund can be approved by the other party.
 * Re-reads the refund immediately before writing to narrow the
 * concurrent-approval race window (Appwrite lacks atomic compare-and-set).
 */
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

  // Re-read immediately before writing to narrow the concurrent-approval race window.
  // Appwrite lacks atomic compare-and-set; this second read catches most races.
  const freshRefund = await refundRequestRepository.findWithContract(input.refundId);
  if (!freshRefund || freshRefund.status !== 'pending') {
    return { error: errorResult('INVALID_STATUS', 'Refund request status changed concurrently') };
  }

  return { refund: refundData, contract: refundData.contract };
}

/**
 * Acquire the shared milestone-approve locks for multiple milestones in sorted
 * order (deadlock-free: every flow that locks several milestone keys uses the
 * same ordering) and run `fn` only once all are held. With an empty set, `fn`
 * runs immediately. Locks are released automatically when `fn` settles.
 */
async function withMilestoneLocks<T>(
  milestoneIds: string[],
  fn: () => Promise<T>
): Promise<T> {
  const uniqueSortedIds = [...new Set(milestoneIds)].sort();
  let run = fn;
  for (let i = uniqueSortedIds.length - 1; i >= 0; i--) {
    const id = uniqueSortedIds[i]!;
    const next = run;
    run = () => withLock(milestoneLockKey(id), next);
  }
  return run();
}

/* eslint-disable max-lines-per-function -- milestone-granular refund flow (BLF-3.x); refactor follow-up */
export async function approveRefund(
  input: ApproveRefundInput
): Promise<ServiceResult<RefundRequest>> {
  // Serialize concurrent refund approval attempts to prevent double-refund
  return withLock(`refund-approve:${input.refundId}`, async () => {
    try {
      const validated = await validateRefundApproval(input);
      if ('error' in validated) return validated.error;

      const { refund, contract } = validated;

      // First read of the project document determines WHICH milestone locks to
      // acquire. The project document is the single source of truth for milestone
      // state (the same store every milestone transition writes). EVERY milestone
      // id is locked: terminal states ('approved'/'refunded') never transition so
      // locking them is harmless, and 'releasing' milestones (approve SAGA in
      // flight) MUST be locked — otherwise a rolled-back or retried SAGA
      // (employer retry / scheduler job re-driving stuck 'releasing' milestones)
      // could release the same escrow the refund is about to refund.
      let milestoneLockIds: string[] = [];
      try {
        const project = await projectRepository.findProjectById(contract.project_id);
        milestoneLockIds = (project?.milestones ?? [])
          .map(m => m.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
      } catch (projectError) {
        logger.error('Failed to load project milestones for refund', {
          error: projectError,
          refundId: input.refundId,
        });
        throw projectError;
      }

      // BLF-3.5: Close the refund-vs-(approve|dispute) TOCTOU. approveMilestone,
      // rejectMilestone and createDispute all serialize per-milestone under the
      // shared `milestone-approve:{id}` lock. By acquiring those same locks (in
      // sorted order, so multi-key acquisition stays deadlock-free) for every
      // currently-unsettled milestone, and then RE-READING the project while
      // holding them, a concurrent approval/dispute can no longer commit between
      // our read and our writes — the re-read below is authoritative for the
      // dispute and pending checks, and the refund decision is never made on
      // stale data.
      // `await` is required: the rejection of the inner callback (e.g. a failed DB
      // update) must be converted to APPROVE_FAILED by the outer catch below.
      return await withMilestoneLocks(milestoneLockIds, async () => {
        let projectMilestones: MilestoneEntity[] = [];
        let pendingMilestones: Array<Record<string, unknown> & { index: number }> = [];
        try {
          const project = await projectRepository.findProjectById(contract.project_id);
          projectMilestones = project?.milestones ?? [];
          pendingMilestones = projectMilestones.reduce<Array<Record<string, unknown> & { index: number }>>((acc, m, index) => {
            if (m.status !== 'approved' && m.status !== 'refunded' && m.status !== 'releasing') acc.push({ ...m, index });
            return acc;
          }, []);
        } catch (projectError) {
          logger.error('Failed to load project milestones for refund', {
            error: projectError,
            refundId: input.refundId,
          });
          throw projectError;
        }

        // BLF-3.4: Contested escrow is settled by dispute resolution, not by a
        // contract-cancelling refund. If any milestone is under an open dispute,
        // refuse the refund so it cannot race (and defeat) an admin's resolution
        // of the same escrow. This closes the refund-vs-resolve double-commit.
        if (projectMilestones.some(m => m.status === 'disputed')) {
          return errorResult('DISPUTE_PENDING', 'This contract has an open dispute. Resolve the dispute before processing a refund.');
        }

        // BLF-3.3: A refund with nothing left to refund must not be approved —
        // approving it would cancel the contract without moving any funds.
        if (pendingMilestones.length === 0) {
          return errorResult('NOTHING_TO_REFUND', 'All milestones are already settled; nothing to refund');
        }

        // Without an escrow there is no on-chain balance to refund — do not approve.
        if (!contract.escrow_address) {
          return errorResult('ESCROW_NOT_FOUND', 'Contract has no escrow address. Refund cannot be processed.');
        }

        const updated = await refundRequestRepository.update(input.refundId, {
          status: 'approved',
          approved_by: input.approvedBy,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (!updated) {
          throw new Error('Failed to approve refund');
        }

        // BLF-3.6: Refund scope. Full refunds (the default — any request whose
        // `is_partial` flag is false) settle the entire remaining escrow through the
        // contract-cancelling `refundEscrow` adapter call. Partial refunds
        // (`is_partial: true` + `amount`) are milestone-granular: pending milestones
        // are refunded in order until the cumulative refunded amount covers the
        // requested amount, via the per-milestone `refundMilestone` adapter call
        // (matching the FreelanceEscrow contract, which only allows refunding
        // pending milestones). Whole milestones are always refunded, so the actual
        // refunded amount may exceed the request when it doesn't align to a
        // milestone boundary. All-or-nothing: on failure the DB approval is rolled
        // back; retries are made safe by the on-chain status pre-check below, which
        // skips milestones already Refunded in the ledger (a failed attempt may
        // have refunded some milestones on-chain before rolling back).
        const isPartialRefund = refund.is_partial === true && (refund.amount ?? 0) > 0;

        let refundTargets: Array<{ index: number; amount: number }>;
        if (isPartialRefund) {
          refundTargets = [];
          let remaining = refund.amount;
          for (const m of pendingMilestones) {
            if (remaining <= 0) break;
            const milestoneAmount = Number((m as { amount?: unknown }).amount ?? 0);
            refundTargets.push({ index: m.index, amount: milestoneAmount });
            remaining -= milestoneAmount;
          }
        } else {
          refundTargets = pendingMilestones.map(m => ({
            index: m.index,
            amount: Number((m as { amount?: unknown }).amount ?? 0),
          }));
        }

        // The contract is only cancelled when every refundable milestone was
        // refunded; a partial refund leaves it active.
        const refundsAllPending = refundTargets.length === pendingMilestones.length;

        // tx hash per refunded milestone index — the full-refund path refunds
        // every target in one tx (same hash), the partial path has one tx per
        // milestone; already-refunded milestones skipped on idempotent retry get
        // no new tx (null hash) but are still recorded so the log stays complete.
        const refundTxHashes: Record<number, string | null> = {};

        try {
          const adapter = getBlockchainAdapter();
          if (!adapter.isAvailable()) {
            throw new Error('Blockchain adapter unavailable');
          }
          if (isPartialRefund) {
            // Refund only the selected milestones (pending-only on-chain).
            // Idempotent retry: a failed attempt may have refunded some milestones
            // on-chain before rolling the DB approval back to 'pending' — on retry
            // the DB-derived targets still include them, so re-check on-chain status
            // and skip milestones that are already Refunded (refunding them again
            // would revert with MilestoneNotPending and wedge the refund forever).
            // Any other non-Pending status is a genuine DB/ledger inconsistency:
            // fail closed rather than silently skipping it.
            for (const target of refundTargets) {
              const onChainStatus = await adapter.getMilestone(contract.escrow_address, target.index);
              if (onChainStatus.status === 'Refunded') {
                logger.info('Skipping already-refunded milestone during partial refund', {
                  refundId: input.refundId,
                  escrowAddress: contract.escrow_address,
                  milestoneIndex: target.index,
                });
                continue;
              }
              if (onChainStatus.status !== 'Pending') {
                throw new Error(
                  `Milestone ${target.index} is ${onChainStatus.status} on-chain; expected Pending for refund`
                );
              }
              const refundResult = await adapter.refundMilestone(contract.escrow_address, target.index);
              refundTxHashes[target.index] = refundResult.transactionHash ?? null;
            }
            logger.info('Blockchain partial refund executed', {
              refundId: input.refundId,
              escrowAddress: contract.escrow_address,
              requestedAmount: refund.amount,
              refundedMilestones: refundTargets.map(t => t.index),
            });
          } else {
            const refundResult = await adapter.refundEscrow(contract.escrow_address);
            for (const target of refundTargets) {
              refundTxHashes[target.index] = refundResult.transactionHash ?? null;
            }
            logger.info('Blockchain refund executed', {
              refundId: input.refundId,
              escrowAddress: contract.escrow_address,
              refundedMilestones: refundTargets.map(t => t.index),
            });
          }
        } catch (blockchainError) {
          // Blockchain call or milestone status read failed — rollback the DB
          // approval so the state stays consistent.
          logger.error('Failed to execute blockchain refund or read milestone status, rolling back DB approval', {
            error: blockchainError,
            refundId: input.refundId,
          });
          try {
            await refundRequestRepository.update(input.refundId, {
              status: 'pending',
              updated_at: new Date().toISOString(),
            });
          } catch (rollbackError) {
            logger.error('CRITICAL: Failed to rollback refund approval after blockchain failure', {
              error: rollbackError,
              refundId: input.refundId,
            });
          }
          return errorResult('BLOCKCHAIN_REFUND_FAILED', 'Blockchain refund failed; approval has been rolled back');
        }

        // Mark the refunded milestones in the project document so the DB reflects
        // the ledger (settled milestones can no longer be approved or re-refunded).
        // Full refunds settle the whole remaining escrow and cancel the contract;
        // partial refunds mark only the refunded milestones and leave the contract
        // active so the remaining milestones can still be worked and paid out.
        const refundedAt = new Date().toISOString();
        const refundedIndices = new Set(refundTargets.map(t => t.index));
        const updatedMilestones = projectMilestones.map((m, i) =>
          refundedIndices.has(i) ? { ...m, status: 'refunded' as const, refunded_at: refundedAt } : m
        );
        await projectRepository.updateProject(contract.project_id, { milestones: updatedMilestones });

        // Update contract status: cancelled only when every refundable milestone was
        // refunded; a partial refund keeps the contract active.
        if (refundsAllPending) {
          await contractRepository.updateContract(refund.contract_id, {
            status: 'cancelled',
          });
        }

        // Payment records: one 'refund' record per refunded milestone so the
        // payments log traces every escrow → employer movement (the milestone
        // money returns to the employer). Best-effort: a failed record write
        // never rolls back the refund — the funds already moved on-chain.
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
          logger.error('Failed to record refund payment (payments log may diverge from ledger)', {
            error: recordError,
            refundId: input.refundId,
          });
        }

        const otherRefunds = await refundRequestRepository.findByContract(refund.contract_id);
        const toCancel = otherRefunds.filter(r => r.status === 'pending' && r.id !== input.refundId);
        await Promise.all(toCancel.map(r =>
          refundRequestRepository.update(r.id, {
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
        ));

        const notificationResult = await createNotification({
          userId: refund.requested_by,
          type: 'refund_approved',
          title: 'Refund Approved',
          message: 'Your refund request has been approved and will be processed shortly.',
          data: {
            relatedId: refund.contract_id,
            relatedType: 'contract',
          },
        });

        if (notificationResult.success) {
          await sendNotificationToUser(refund.requested_by, notificationResult.data);
        }

        // BLF-12.2: durable audit trail — every refund decision is recorded with the
        // contract + escrow context. Written only after the refund fully commits;
        // best-effort by design (a failed audit write never rolls back the refund).
        await persistAuditEntry({
          user_id: refund.requested_by,
          actor_id: input.approvedBy,
          action: 'refund.approved',
          resource_type: 'refund_request',
          resource_id: input.refundId,
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

        logger.info(`Refund ${input.refundId} approved by ${input.approvedBy}`);

        return successResult(updated as unknown as RefundRequest);
      }); // BLF-3.5: end withMilestoneLocks
    } catch (error) {
      logger.error('Failed to approve refund:', error);
      return errorResult('APPROVE_FAILED', error instanceof Error ? error.message : 'Failed to approve refund');
    }
  });
}

export async function rejectRefund(
  input: RejectRefundInput
): Promise<ServiceResult<RefundRequest>> {
  // BLF-3.2: Serialize with approveRefund using same lock key to prevent concurrent approve+reject
  return withLock(`refund-approve:${input.refundId}`, async () => {
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

      // Re-read immediately before writing to narrow the concurrent-rejection race window,
      // matching the same double-read guard used in approveRefund.
      // Appwrite lacks atomic compare-and-set; this second read catches most races and
      // prevents duplicate rejection notifications being sent to the requester.
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

      if (!updated) {
        throw new Error('Failed to reject refund');
      }

      const notificationResult = await createNotification({
        userId: refundData.requested_by,
        type: 'refund_rejected',
        title: 'Refund Rejected',
        message: `Your refund request was rejected. Reason: ${input.reason}`,
        data: {
          relatedId: refundData.contract_id,
          relatedType: 'contract',
        },
      });

      if (notificationResult.success) {
        await sendNotificationToUser(refundData.requested_by, notificationResult.data);
      }

      // BLF-12.2: durable audit trail — rejected refunds are recorded with the
      // requester, contract, and rejection reason. Best-effort by design.
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

      logger.info(`Refund ${input.refundId} rejected by ${input.rejectedBy}`);

      return successResult(updated as unknown as RefundRequest);
    } catch (error) {
      logger.error('Failed to reject refund:', error);
      return errorResult('REJECT_FAILED', error instanceof Error ? error.message : 'Failed to reject refund');
    }
  }); // BLF-3.2: end withLock
}

export async function getContractRefunds(
  contractId: string,
  userId: string
): Promise<ServiceResult<RefundRequest[]>> {
  try {
    const contract = await contractRepository.getContractById(contractId);

    if (!contract) {
      return errorResult('CONTRACT_NOT_FOUND', 'Contract not found');
    }

    const isInvolved =
      contract.freelancer_id === userId ||
      contract.employer_id === userId;

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
