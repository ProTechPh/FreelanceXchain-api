/**
 * Contract lifecycle side effects for the hiring flow:
 *  - releaseContractSlot: cancel an unfunded contract and free its project slot
 *  - onContractActivated: post-funding bookkeeping (first milestone, project
 *    status, deferred rejection of remaining proposals)
 *  - funding deadline: expiry (cron + lazy on read) and reminders
 */
import { logger } from '../config/logger.js';
import { getContractSettings } from '../config/contract-settings.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { proposalRepository } from '../repositories/proposal-repository.js';
import { projectRepository } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';
import { persistAuditEntry } from '../utils/admin-audit.js';
import { transitionContract, UNFUNDED_STATUSES, type TransitionActor } from './contract-state-machine.js';
import { cancelAgreement } from './agreement-contract.js';
import { notifyContractParty, type ContractRole } from './contract-notifications.js';
import { readContractMilestones, saveMilestones, usesContractMilestones } from './contract-milestone-store.js';

export type CancelReason = 'cancelled_by_party' | 'negotiation_ended' | 'funding_expired';

const REASON_COPY: Record<CancelReason, string> = {
  cancelled_by_party: 'was cancelled before funding',
  negotiation_ended: 'negotiation was ended',
  funding_expired: 'was not funded before the funding deadline',
};

function roleOf(contract: ContractEntity, userId: string): ContractRole | null {
  if (contract.employer_id === userId) return 'employer';
  if (contract.freelancer_id === userId) return 'freelancer';
  return null;
}

async function projectTitleOf(projectId: string): Promise<string> {
  try {
    const project = await projectRepository.findProjectById(projectId);
    return project?.title ?? 'your project';
  } catch {
    return 'your project';
  }
}

/**
 * Reopen a project that was marked in_progress once a slot frees up again.
 */
async function reopenProjectIfSlotsFree(projectId: string): Promise<void> {
  try {
    const project = await projectRepository.findProjectById(projectId);
    if (!project || project.status !== 'in_progress') return;
    const funded = await contractRepository.countFundedContracts(projectId);
    if (funded < (project.freelancer_limit ?? 1)) {
      await projectRepository.updateProject(projectId, { status: 'open' });
    }
  } catch (error) {
    logger.warn('Failed to reopen project after slot release', { projectId, error });
  }
}

/**
 * Cancel an unfunded contract (pending / negotiating / awaiting_*) and release
 * its project slot: the proposal leaves 'accepted' (withdrawn when the
 * freelancer walked away, rejected otherwise) and the agreement is cancelled.
 */
export async function releaseContractSlot(input: {
  contractId: string;
  actorId: string | null;
  actor: TransitionActor;
  reason: CancelReason;
}): Promise<ServiceResult<ContractEntity>> {
  const contract = await contractRepository.getContractById(input.contractId);
  if (!contract) return errorResult('NOT_FOUND', 'Contract not found');

  return withLock(`proposal-accept:project:${contract.project_id}`, async () => {
    const transitioned = await transitionContract(input.contractId, {
      from: UNFUNDED_STATUSES,
      to: 'cancelled',
      actor: input.actor,
      patch: {
        cancel_reason: input.reason,
        ...(input.actorId ? { cancelled_by: input.actorId } : {}),
      },
    });
    if (!transitioned.ok) {
      return errorResult(transitioned.code, transitioned.message);
    }
    const cancelled = transitioned.contract;

    try {
      await proposalRepository.updateProposal(cancelled.proposal_id, {
        status: input.actor === 'freelancer' ? 'withdrawn' : 'rejected',
      });
    } catch (error) {
      logger.error('Failed to release proposal after contract cancellation', { contractId: cancelled.id, error });
    }

    try {
      await cancelAgreement(cancelled.id);
    } catch (error) {
      logger.warn('Failed to cancel agreement record', { contractId: cancelled.id, error });
    }

    await reopenProjectIfSlotsFree(cancelled.project_id);

    const projectTitle = await projectTitleOf(cancelled.project_id);
    const recipients: Array<{ userId: string; role: ContractRole }> = [];
    if (input.actorId !== cancelled.employer_id) recipients.push({ userId: cancelled.employer_id, role: 'employer' });
    if (input.actorId !== cancelled.freelancer_id) recipients.push({ userId: cancelled.freelancer_id, role: 'freelancer' });
    await Promise.all(recipients.map(r => notifyContractParty({
      userId: r.userId,
      role: r.role,
      contractId: cancelled.id,
      type: input.reason === 'funding_expired' ? 'contract_funding_expired' : 'contract_negotiation_cancelled',
      title: input.reason === 'funding_expired' ? 'Contract funding deadline passed' : 'Contract cancelled',
      message: `The contract for "${projectTitle}" ${REASON_COPY[input.reason]}.`,
      data: { projectId: cancelled.project_id, reason: input.reason },
      email: true,
      projectTitle,
    })));

    await persistAuditEntry({
      user_id: input.actorId === cancelled.freelancer_id ? cancelled.employer_id : cancelled.freelancer_id,
      actor_id: input.actorId ?? 'system',
      action: 'contract.cancelled',
      resource_type: 'contract',
      resource_id: cancelled.id,
      payload: { projectId: cancelled.project_id, reason: input.reason, totalAmount: cancelled.total_amount ?? null },
      ip_address: null,
      user_agent: null,
      status: 'success',
      error_message: null,
    });

    return successResult(cancelled);
  });
}

/**
 * Bookkeeping after the escrow is funded and the contract becomes active.
 * Best-effort: the contract is already active; failures are logged.
 */
export async function onContractActivated(contractId: string): Promise<void> {
  try {
    const contract = await contractRepository.getContractById(contractId);
    if (!contract || contract.status !== 'active') return;

    await contractRepository.updateContract(contractId, { funded_at: new Date().toISOString() });

    if (usesContractMilestones(contract)) {
      const milestones = readContractMilestones(contract);
      if (milestones.length > 0 && milestones[0]!.status === 'pending') {
        await saveMilestones(contract, contract.project_id, milestones.map((m, i) =>
          i === 0 ? { ...m, status: 'in_progress' as const } : m));
      }
    }

    const project = await projectRepository.findProjectById(contract.project_id);
    if (project) {
      const limit = project.freelancer_limit ?? 1;
      const funded = await contractRepository.countFundedContracts(project.id);
      if (funded >= limit) {
        // All slots funded: the remaining applicants can no longer be hired.
        const proposals = await proposalRepository.getProposalsByProject(project.id, { limit: 1000, offset: 0 });
        await Promise.all(proposals.items
          .filter(p => p.status === 'pending')
          .map(p => proposalRepository.updateProposal(p.id, { status: 'rejected' })));
        if (project.status === 'open') {
          await projectRepository.updateProject(project.id, { status: 'in_progress' });
        }
      }
    }

    const projectTitle = project?.title ?? 'your project';
    await notifyContractParty({
      userId: contract.freelancer_id,
      role: 'freelancer',
      contractId,
      type: 'contract_activated',
      title: 'Contract funded — work can begin',
      message: `The escrow for "${projectTitle}" is funded and the contract is now active.`,
      data: { projectId: contract.project_id },
      email: true,
      projectTitle,
    });
  } catch (error) {
    logger.error('Post-activation bookkeeping failed', { contractId, error });
  }
}

function isPastDeadline(contract: ContractEntity, now: Date): boolean {
  if (contract.status !== 'awaiting_funding' || !contract.funding_deadline) return false;
  const deadline = Date.parse(contract.funding_deadline);
  if (Number.isNaN(deadline)) return false;
  return now.getTime() > deadline + getContractSettings().fundingGraceMinutes * 60_000;
}

/**
 * Real mode safety net: an employer may have deployed the escrow without the
 * registration reaching us. Never expire a contract that has a deployment.
 */
async function hasUnregisteredDeployment(contract: ContractEntity): Promise<boolean> {
  try {
    const { getBlockchainMode } = await import('./blockchain/factory.js');
    if (getBlockchainMode() !== 'real') return false;
    const { getProvider, isWeb3Available } = await import('./web3-client.js');
    if (!isWeb3Available()) return false;
    const employer = await userRepository.getUserById(contract.employer_id);
    if (!employer?.wallet_address) return false;
    const { findExistingOnChainEscrowDeployment } = await import('./escrow-bytecode-validator.js');
    return (await findExistingOnChainEscrowDeployment(getProvider(), contract.id, employer.wallet_address)) !== null;
  } catch (error) {
    logger.warn('Could not check for an unregistered escrow deployment; skipping expiry this round', { contractId: contract.id, error });
    return true;
  }
}

/** Expire one contract if its funding deadline (plus grace) has passed. Returns true when expired. */
export async function expireContractIfOverdue(contractId: string, now: Date = new Date()): Promise<boolean> {
  return withLock(`contract-money:${contractId}`, async () => {
    const contract = await contractRepository.getContractById(contractId);
    if (!contract || !isPastDeadline(contract, now) || contract.escrow_address) return false;

    if (await hasUnregisteredDeployment(contract)) {
      logger.warn('Funding deadline passed but an escrow deployment exists; leaving contract for registration', { contractId });
      await notifyContractParty({
        userId: contract.employer_id,
        role: 'employer',
        contractId,
        type: 'contract_funding_reminder',
        title: 'Finish registering your escrow',
        message: 'We found an escrow deployment for this contract. Open the contract to finish registering it.',
      });
      return false;
    }

    const result = await releaseContractSlot({ contractId, actorId: null, actor: 'system', reason: 'funding_expired' });
    return result.success;
  });
}

/** Lazy expiry on read so a stale awaiting_funding never shows after the deadline. */
export async function expireIfOverdue(contract: Pick<ContractEntity, 'id' | 'status' | 'funding_deadline' | 'escrow_address'>): Promise<boolean> {
  if (contract.status !== 'awaiting_funding' || contract.escrow_address) return false;
  if (!isPastDeadline(contract as ContractEntity, new Date())) return false;
  try {
    return await expireContractIfOverdue(contract.id);
  } catch (error) {
    logger.error('Lazy funding expiry failed', { contractId: contract.id, error });
    return false;
  }
}

/** Cron: expire every awaiting_funding contract past its deadline + grace. */
export async function expireOverdueFunding(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - getContractSettings().fundingGraceMinutes * 60_000).toISOString();
  const overdue = await contractRepository.findAwaitingFundingBefore(cutoff);
  let expired = 0;
  for (const contract of overdue) {
    try {
      if (await expireContractIfOverdue(contract.id, now)) expired++;
    } catch (error) {
      logger.error('Failed to expire overdue contract funding', { contractId: contract.id, error });
    }
  }
  if (expired > 0) logger.info(`Expired ${expired} contract(s) past their funding deadline`);
  return expired;
}

/** Cron: one reminder to the employer when less than 24h of the funding window remain. */
export async function sendFundingReminders(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
  const dueSoon = await contractRepository.findAwaitingFundingBefore(cutoff);
  let sent = 0;
  for (const contract of dueSoon) {
    if (contract.funding_reminder_sent_at || contract.escrow_address) continue;
    if (contract.funding_deadline && Date.parse(contract.funding_deadline) < now.getTime()) continue;
    try {
      await contractRepository.updateContract(contract.id, { funding_reminder_sent_at: now.toISOString() });
      const projectTitle = await projectTitleOf(contract.project_id);
      await notifyContractParty({
        userId: contract.employer_id,
        role: 'employer',
        contractId: contract.id,
        type: 'contract_funding_reminder',
        title: 'Fund your contract before the deadline',
        message: `Both parties signed the contract for "${projectTitle}". Fund the escrow before ${contract.funding_deadline} or it will be cancelled.`,
        data: { fundingDeadline: contract.funding_deadline },
        email: true,
        projectTitle,
      });
      sent++;
    } catch (error) {
      logger.error('Failed to send funding reminder', { contractId: contract.id, error });
    }
  }
  return sent;
}

export { roleOf as contractRoleOf };
