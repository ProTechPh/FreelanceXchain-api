/**
 * Contract status state machine.
 *
 * Hiring flow: negotiating → awaiting_signatures → awaiting_funding → active.
 * 'pending' is the legacy pre-negotiation status (fund directly → active).
 * 'system' transitions happen only as a side effect of another action (an offer
 * being accepted, the employer's signature being verified, a funding deadline
 * expiring) and can never be requested through the generic status endpoint.
 */
import type { ContractStatus } from '../models/contract.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';

export type TransitionActor = 'employer' | 'freelancer' | 'admin' | 'system';

export type ContractTransition = { status: ContractStatus; allowedRoles: TransitionActor[] };

export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractTransition[]> = {
  negotiating: [
    { status: 'awaiting_signatures', allowedRoles: ['system'] },
    { status: 'cancelled', allowedRoles: ['employer', 'freelancer', 'system'] },
  ],
  awaiting_signatures: [
    { status: 'negotiating', allowedRoles: ['employer', 'freelancer'] },
    { status: 'awaiting_funding', allowedRoles: ['system'] },
    { status: 'cancelled', allowedRoles: ['employer', 'freelancer', 'system'] },
  ],
  awaiting_funding: [
    { status: 'active', allowedRoles: ['employer'] },
    { status: 'cancelled', allowedRoles: ['employer', 'freelancer', 'system'] },
  ],
  pending: [
    { status: 'active', allowedRoles: ['employer'] },
    { status: 'cancelled', allowedRoles: ['employer', 'freelancer'] },
  ],
  active: [
    { status: 'completed', allowedRoles: ['employer'] },
    { status: 'disputed', allowedRoles: ['employer', 'freelancer'] },
  ],
  disputed: [
    { status: 'resolved', allowedRoles: ['admin'] },
    { status: 'cancelled', allowedRoles: ['admin'] },
  ],
  completed: [],
  cancelled: [],
  resolved: [
    { status: 'active', allowedRoles: ['admin'] },
    { status: 'completed', allowedRoles: ['employer'] },
    { status: 'cancelled', allowedRoles: ['admin'] },
  ],
};

/** Statuses a contract can be cancelled from without any escrow refund. */
export const UNFUNDED_STATUSES: ContractStatus[] = ['pending', 'negotiating', 'awaiting_signatures', 'awaiting_funding'];

export function findTransition(from: ContractStatus, to: ContractStatus): ContractTransition | undefined {
  return (CONTRACT_TRANSITIONS[from] ?? []).find(t => t.status === to);
}

export function canTransition(from: ContractStatus, to: ContractStatus, actor: TransitionActor): boolean {
  return findTransition(from, to)?.allowedRoles.includes(actor) ?? false;
}

export type TransitionResult =
  | { ok: true; contract: ContractEntity }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATUS' | 'INVALID_STATUS_TRANSITION' | 'UPDATE_FAILED'; message: string; current?: ContractStatus };

/**
 * Compare-and-set status transition: re-reads the contract and refuses when its
 * status is no longer one of `expectedFrom` (another request moved it first).
 * Callers hold the relevant contract lock; Appwrite has no conditional writes.
 */
export async function transitionContract(
  contractId: string,
  change: { from: ContractStatus[]; to: ContractStatus; actor: TransitionActor; patch?: Partial<ContractEntity> },
): Promise<TransitionResult> {
  const { from: expectedFrom, to, actor, patch = {} } = change;
  const current = await contractRepository.getContractById(contractId);
  if (!current) return { ok: false, code: 'NOT_FOUND', message: 'Contract not found' };

  if (!expectedFrom.includes(current.status)) {
    return {
      ok: false,
      code: 'INVALID_STATUS',
      message: `Contract is ${current.status}; expected ${expectedFrom.join(' or ')}`,
      current: current.status,
    };
  }
  if (!canTransition(current.status, to, actor)) {
    return {
      ok: false,
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot transition from "${current.status}" to "${to}"`,
      current: current.status,
    };
  }

  const updated = await contractRepository.updateContract(contractId, { ...patch, status: to });
  if (!updated) return { ok: false, code: 'UPDATE_FAILED', message: 'Failed to update contract status' };
  return { ok: true, contract: updated };
}
