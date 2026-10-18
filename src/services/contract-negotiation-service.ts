/**
 * Contract Negotiation Service
 *
 * After an employer accepts a proposal the contract is `negotiating`. Either
 * party proposes structured terms (base amount, additional pay, rush fee,
 * deadline, milestones); the other side accepts, counters or declines. The
 * freelancer's proposed rate is a hard floor for the base amount. Accepting an
 * offer locks the terms: milestones are written to the contract, the canonical
 * terms hash is recorded, and the contract moves to `awaiting_signatures`.
 */
import { logger } from '../config/logger.js';
import { getContractSettings } from '../config/contract-settings.js';
import { contractRepository, type ContractEntity } from '../repositories/contract-repository.js';
import { contractOfferRepository, type ContractOfferEntity } from '../repositories/contract-offer-repository.js';
import { contractSignatureRepository } from '../repositories/contract-signature-repository.js';
import { proposalRepository, type ProposalEntity } from '../repositories/proposal-repository.js';
import { projectRepository, type ProjectEntity, type MilestoneEntity } from '../repositories/project-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import { withLock } from '../utils/async-lock.js';
import { generateId } from '../utils/id.js';
import { persistAuditEntry } from '../utils/admin-audit.js';
import { mapContractFromEntity, type Contract } from '../utils/entity-mapper.js';
import {
  validateOfferTerms,
  hashOfferTerms,
  seedOfferFromTemplate,
  buildCanonicalTerms,
  hashTerms,
  type NormalizedOfferTerms,
  type OfferTermsInput,
  type OfferMilestone,
  type CanonicalContractTerms,
} from '../utils/contract-terms.js';
import { transitionContract } from './contract-state-machine.js';
import { lockAgreementTerms } from './agreement-contract.js';
import { notifyContractParty, type ContractRole } from './contract-notifications.js';
import { releaseContractSlot } from './contract-lifecycle-service.js';

export const contractTermsLockKey = (contractId: string): string => `contract-terms:${contractId}`;

export type ContractOffer = {
  id: string;
  contractId: string;
  round: number;
  proposedBy: string;
  proposerRole: ContractRole;
  status: ContractOfferEntity['status'];
  baseAmount: number;
  additionalPay: number;
  isRush: boolean;
  rushFeePercentage: number;
  rushFee: number;
  totalAmount: number;
  milestones: OfferMilestone[];
  deadline: string;
  message: string | null;
  parentOfferId: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  isSeed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NegotiationPermissions = {
  canPropose: boolean;
  canAccept: boolean;
  canDecline: boolean;
  canWithdraw: boolean;
  canEnd: boolean;
  canReopen: boolean;
};

export type NegotiationState = {
  contract: Contract;
  role: ContractRole | 'admin';
  floor: { proposedRate: number; estimatedDuration: number | null };
  template: {
    projectTitle: string;
    deadline: string | null;
    isRush: boolean;
    rushFeePercentage: number;
    milestones: Array<{ title: string; description: string; amount: number; dueDate: string }>;
  };
  offers: ContractOffer[];
  openOffer: ContractOffer | null;
  acceptedOffer: ContractOffer | null;
  permissions: NegotiationPermissions;
  limits: { maxMilestones: number; maxRounds: number; roundsUsed: number };
  chat: { otherPartyId: string; projectId: string };
};

export function mapContractOfferFromEntity(entity: ContractOfferEntity): ContractOffer {
  const milestones = Array.isArray(entity.milestones)
    ? entity.milestones
    : (() => { try { return JSON.parse(String(entity.milestones)) as OfferMilestone[]; } catch { return []; } })();
  return {
    id: entity.id,
    contractId: entity.contract_id,
    round: entity.round,
    proposedBy: entity.proposed_by,
    proposerRole: entity.proposer_role,
    status: entity.status,
    baseAmount: entity.base_amount,
    additionalPay: entity.additional_pay ?? 0,
    isRush: entity.is_rush === true,
    rushFeePercentage: entity.rush_fee_percentage ?? 0,
    rushFee: entity.rush_fee ?? 0,
    totalAmount: entity.total_amount,
    milestones,
    deadline: entity.deadline,
    message: entity.message ?? null,
    parentOfferId: entity.parent_offer_id ?? null,
    respondedBy: entity.responded_by ?? null,
    respondedAt: entity.responded_at ?? null,
    isSeed: entity.is_seed === true,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  };
}

function offerToTermsInput(offer: ContractOfferEntity | ContractOffer): OfferTermsInput {
  const mapped = 'contract_id' in offer ? mapContractOfferFromEntity(offer) : offer;
  return {
    baseAmount: mapped.baseAmount,
    additionalPay: mapped.additionalPay,
    isRush: mapped.isRush,
    rushFeePercentage: mapped.rushFeePercentage,
    deadline: mapped.deadline,
    milestones: mapped.milestones,
  };
}

function partyRole(contract: ContractEntity, userId: string): ContractRole | null {
  if (contract.employer_id === userId) return 'employer';
  if (contract.freelancer_id === userId) return 'freelancer';
  return null;
}

function counterpartOf(contract: ContractEntity, role: ContractRole): { userId: string; role: ContractRole } {
  return role === 'employer'
    ? { userId: contract.freelancer_id, role: 'freelancer' }
    : { userId: contract.employer_id, role: 'employer' };
}

function openOfferOf(offers: ContractOfferEntity[]): ContractOfferEntity | null {
  for (let i = offers.length - 1; i >= 0; i--) {
    if (offers[i]!.status === 'pending') return offers[i]!;
  }
  return null;
}

type LoadedContext = {
  contract: ContractEntity;
  proposal: ProposalEntity;
  project: ProjectEntity | null;
  offers: ContractOfferEntity[];
};

async function loadContext(contractId: string): Promise<LoadedContext | ServiceResult<never>> {
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) return errorResult('NOT_FOUND', 'Contract not found');
  const proposal = await proposalRepository.findProposalById(contract.proposal_id);
  if (!proposal) return errorResult('NOT_FOUND', 'The proposal behind this contract was not found');
  const [project, offers] = await Promise.all([
    projectRepository.findProjectById(contract.project_id),
    contractOfferRepository.listByContract(contractId),
  ]);
  return { contract, proposal, project, offers };
}

function isError(value: unknown): value is ServiceResult<never> {
  return typeof value === 'object' && value !== null && 'success' in value && (value as { success: boolean }).success === false;
}

function computePermissions(contract: ContractEntity, role: ContractRole | 'admin', offers: ContractOfferEntity[], userId: string): NegotiationPermissions {
  const isParty = role !== 'admin';
  const negotiating = contract.status === 'negotiating';
  const open = openOfferOf(offers);
  const roundsLeft = offers.length < getContractSettings().maxNegotiationRounds;
  return {
    canPropose: isParty && negotiating && roundsLeft,
    canAccept: isParty && negotiating && !!open && open.proposed_by !== userId,
    canDecline: isParty && negotiating && !!open && open.proposed_by !== userId,
    canWithdraw: isParty && negotiating && !!open && open.proposed_by === userId,
    canEnd: isParty && (negotiating || contract.status === 'awaiting_signatures'),
    canReopen: isParty && contract.status === 'awaiting_signatures',
  };
}

/** Negotiation state for a contract party (admins get a read-only view). */
export async function getNegotiation(contractId: string, userId: string, userRole?: string): Promise<ServiceResult<NegotiationState>> {
  const ctx = await loadContext(contractId);
  if (isError(ctx)) return ctx;
  const { contract, proposal, project, offers } = ctx;

  const party = partyRole(contract, userId);
  if (!party && userRole !== 'admin') {
    return errorResult('UNAUTHORIZED', 'Only contract parties can view this negotiation');
  }
  const role: ContractRole | 'admin' = party ?? 'admin';
  const settings = getContractSettings();
  const open = openOfferOf(offers);
  const accepted = contract.accepted_offer_id ? offers.find(o => o.id === contract.accepted_offer_id) ?? null : null;

  return successResult({
    contract: mapContractFromEntity(contract),
    role,
    floor: { proposedRate: proposal.proposed_rate, estimatedDuration: proposal.estimated_duration ?? null },
    template: {
      projectTitle: project?.title ?? '',
      deadline: project?.deadline ?? null,
      isRush: project?.is_rush === true,
      rushFeePercentage: project?.rush_fee_percentage ?? 0,
      milestones: (project?.milestones ?? []).map(m => ({
        title: m.title,
        description: m.description ?? '',
        amount: m.amount,
        dueDate: m.dueDate ?? m.due_date ?? '',
      })),
    },
    offers: offers.map(mapContractOfferFromEntity),
    openOffer: open ? mapContractOfferFromEntity(open) : null,
    acceptedOffer: accepted ? mapContractOfferFromEntity(accepted) : null,
    permissions: computePermissions(contract, role, offers, userId),
    limits: { maxMilestones: settings.maxMilestones, maxRounds: settings.maxNegotiationRounds, roundsUsed: offers.length },
    chat: {
      otherPartyId: role === 'freelancer' ? contract.employer_id : contract.freelancer_id,
      projectId: contract.project_id,
    },
  });
}

async function persistOffer(input: {
  contract: ContractEntity;
  proposedBy: string;
  proposerRole: ContractRole;
  terms: NormalizedOfferTerms;
  round: number;
  message?: string | null;
  parentOfferId?: string | null;
  isSeed?: boolean;
}): Promise<ContractOfferEntity> {
  return contractOfferRepository.createOffer({
    id: generateId(),
    contract_id: input.contract.id,
    round: input.round,
    proposed_by: input.proposedBy,
    proposer_role: input.proposerRole,
    status: 'pending',
    base_amount: input.terms.baseAmount,
    additional_pay: input.terms.additionalPay,
    is_rush: input.terms.isRush,
    rush_fee_percentage: input.terms.rushFeePercentage,
    rush_fee: input.terms.rushFee,
    total_amount: input.terms.totalAmount,
    milestones: input.terms.milestones,
    deadline: input.terms.deadline,
    message: input.message ?? null,
    parent_offer_id: input.parentOfferId ?? null,
    offer_hash: hashOfferTerms(input.terms),
    is_seed: input.isSeed === true,
  });
}

/**
 * Round-1 offer seeded from the project template on the employer's behalf, so
 * the freelancer can accept the posted terms in one step (today's behaviour).
 */
export async function createSeedOffer(contract: ContractEntity, project: ProjectEntity, proposal: ProposalEntity): Promise<ContractOfferEntity | null> {
  try {
    const terms = seedOfferFromTemplate(project, proposal);
    return await persistOffer({
      contract,
      proposedBy: contract.employer_id,
      proposerRole: 'employer',
      terms,
      round: 1,
      message: "Starting terms created from the project posting and the freelancer's proposed rate.",
      isSeed: true,
    });
  } catch (error) {
    logger.error('Failed to create seed offer; parties can still propose terms', { contractId: contract.id, error });
    return null;
  }
}

export type CreateOfferInput = OfferTermsInput & { message?: string | null };

export async function createOffer(contractId: string, userId: string, input: CreateOfferInput): Promise<ServiceResult<ContractOffer>> {
  return withLock(contractTermsLockKey(contractId), async () => {
    const ctx = await loadContext(contractId);
    if (isError(ctx)) return ctx;
    const { contract, proposal, project, offers } = ctx;

    const role = partyRole(contract, userId);
    if (!role) return errorResult('UNAUTHORIZED', 'Only contract parties can propose terms');
    if (contract.status !== 'negotiating') {
      return errorResult('INVALID_STATUS', `Terms can only be proposed while the contract is negotiating (current: ${contract.status})`);
    }
    const settings = getContractSettings();
    if (offers.length >= settings.maxNegotiationRounds) {
      return errorResult('NEGOTIATION_LIMIT_REACHED', `This negotiation reached the maximum of ${settings.maxNegotiationRounds} offers. Accept the current terms or end the negotiation.`);
    }

    const validation = validateOfferTerms(input, { floor: proposal.proposed_rate, maxMilestones: settings.maxMilestones });
    if (!validation.ok) {
      return errorResult(validation.code, validation.message, validation.errors.map(e => `${e.field}: ${e.message}`));
    }

    const open = openOfferOf(offers);
    if (open) {
      const status = open.proposed_by === userId ? 'superseded' : 'countered';
      await contractOfferRepository.updateOffer(open.id, {
        status,
        ...(status === 'countered' ? { responded_by: userId, responded_at: new Date().toISOString() } : {}),
      });
    }

    const created = await persistOffer({
      contract,
      proposedBy: userId,
      proposerRole: role,
      terms: validation.terms,
      round: offers.length + 1,
      message: input.message?.trim() || null,
      parentOfferId: open && open.proposed_by !== userId ? open.id : null,
    });

    const other = counterpartOf(contract, role);
    const projectTitle = project?.title ?? 'your project';
    await notifyContractParty({
      userId: other.userId,
      role: other.role,
      contractId,
      type: 'contract_offer_received',
      title: open && open.proposed_by !== userId ? 'New counter-offer' : 'New contract offer',
      message: `New terms were proposed for "${projectTitle}": ${validation.terms.totalAmount} ETH across ${validation.terms.milestones.length} milestone(s).`,
      data: { offerId: created.id, projectId: contract.project_id },
      email: true,
      projectTitle,
    });

    return successResult(mapContractOfferFromEntity(created));
  });
}

function toContractMilestones(contractId: string, terms: NormalizedOfferTerms): MilestoneEntity[] {
  return terms.milestones.map(m => ({
    id: generateId(),
    contract_id: contractId,
    title: m.title,
    description: m.description,
    amount: m.amount,
    due_date: m.dueDate,
    dueDate: m.dueDate,
    status: 'pending' as const,
    revision_count: 0,
  }));
}

function lockedTermsPatch(
  contractId: string,
  terms: NormalizedOfferTerms,
  lock: { offerId: string; termsHash: string; canonical: CanonicalContractTerms; nowIso: string },
): Partial<ContractEntity> {
  return {
    milestone_source: 'contract',
    milestones: toContractMilestones(contractId, terms),
    base_amount: terms.baseAmount,
    additional_pay: terms.additionalPay,
    rush_fee: terms.rushFee,
    rush_fee_percentage: terms.rushFeePercentage,
    total_amount: terms.totalAmount,
    deadline: terms.deadline,
    accepted_offer_id: lock.offerId,
    terms_hash: lock.termsHash,
    terms_snapshot: lock.canonical as unknown as Record<string, unknown>,
    terms_locked_at: lock.nowIso,
  };
}

/** Agreement record, notifications and audit after terms lock (all best-effort). */
async function afterTermsLocked(input: {
  contract: ContractEntity;
  project: ProjectEntity | null;
  terms: NormalizedOfferTerms;
  termsHash: string;
  offerId: string;
  acceptedBy: ContractRole;
  userId: string;
  employerWallet: string;
  freelancerWallet: string;
}): Promise<void> {
  const { contract, project, terms, termsHash, offerId } = input;
  const contractId = contract.id;
  try {
    await lockAgreementTerms({
      contractId,
      employerWallet: input.employerWallet,
      freelancerWallet: input.freelancerWallet,
      totalAmount: terms.totalAmount,
      milestoneCount: terms.milestones.length,
      termsHash,
      terms: {
        projectTitle: project?.title ?? '',
        description: project?.description ?? '',
        milestones: terms.milestones.map(m => ({ title: m.title, amount: m.amount })),
        deadline: terms.deadline,
        ...(terms.isRush ? { isRush: true, rushFee: terms.rushFee, rushFeePercentage: terms.rushFeePercentage } : {}),
      },
    });
  } catch (error) {
    logger.warn('Failed to record agreement terms (signatures remain the source of truth)', { contractId, error });
  }

  const projectTitle = project?.title ?? 'your project';
  await Promise.all([
    notifyContractParty({
      userId: contract.freelancer_id,
      role: 'freelancer',
      contractId,
      type: 'contract_signature_requested',
      title: 'Terms agreed — please sign the contract',
      message: `Terms for "${projectTitle}" are locked at ${terms.totalAmount} ETH. Sign the contract to continue; the client signs after you.`,
      data: { projectId: contract.project_id, termsHash },
      email: true,
      projectTitle,
    }),
    notifyContractParty({
      userId: contract.employer_id,
      role: 'employer',
      contractId,
      type: 'contract_offer_accepted',
      title: 'Terms agreed',
      message: `Terms for "${projectTitle}" are locked. The freelancer signs first, then you sign and fund the escrow.`,
      data: { projectId: contract.project_id, termsHash },
      email: input.acceptedBy === 'freelancer',
      projectTitle,
    }),
  ]);

  await persistAuditEntry({
    user_id: counterpartOf(contract, input.acceptedBy).userId,
    actor_id: input.userId,
    action: 'contract.terms_locked',
    resource_type: 'contract',
    resource_id: contractId,
    payload: { offerId, termsHash, totalAmount: terms.totalAmount, milestoneCount: terms.milestones.length },
    ip_address: null,
    user_agent: null,
    status: 'success',
    error_message: null,
  });
}

export async function acceptOffer(contractId: string, offerId: string, userId: string): Promise<ServiceResult<Contract>> {
  return withLock(contractTermsLockKey(contractId), async () => {
    const ctx = await loadContext(contractId);
    if (isError(ctx)) return ctx;
    const { contract, proposal, project, offers } = ctx;

    const role = partyRole(contract, userId);
    if (!role) return errorResult('UNAUTHORIZED', 'Only contract parties can accept terms');
    if (contract.status !== 'negotiating') {
      return errorResult('INVALID_STATUS', `Terms can only be accepted while the contract is negotiating (current: ${contract.status})`);
    }
    const offer = offers.find(o => o.id === offerId);
    if (!offer) return errorResult('NOT_FOUND', 'Offer not found');
    if (offer.status !== 'pending' || openOfferOf(offers)?.id !== offer.id) {
      return errorResult('OFFER_NOT_OPEN', 'This offer is no longer open. Review the latest terms.');
    }
    if (offer.proposed_by === userId) {
      return errorResult('CANNOT_ACCEPT_OWN_OFFER', 'The other party has to accept your offer');
    }

    const validation = validateOfferTerms(offerToTermsInput(offer), { floor: proposal.proposed_rate, maxMilestones: getContractSettings().maxMilestones });
    if (!validation.ok) {
      return errorResult(validation.code, `${validation.message}. Send a counter-offer with updated terms.`, validation.errors.map(e => `${e.field}: ${e.message}`));
    }
    if (hashOfferTerms(validation.terms) !== offer.offer_hash) {
      return errorResult('OFFER_INTEGRITY_FAILED', 'Offer terms changed after they were proposed');
    }

    const [employer, freelancer] = await Promise.all([
      userRepository.getUserById(contract.employer_id),
      userRepository.getUserById(contract.freelancer_id),
    ]);
    if (!employer?.wallet_address || !freelancer?.wallet_address) {
      return errorResult('MISSING_WALLET', 'Both parties need a connected wallet address before the contract can be signed.');
    }

    const terms = validation.terms;
    const canonical = buildCanonicalTerms({
      contractId,
      projectId: contract.project_id,
      proposalId: contract.proposal_id,
      offerId,
      employerId: contract.employer_id,
      freelancerId: contract.freelancer_id,
      employerWallet: employer.wallet_address,
      freelancerWallet: freelancer.wallet_address,
      terms,
    });
    const termsHash = hashTerms(canonical);
    const nowIso = new Date().toISOString();

    const acceptedOffer = await contractOfferRepository.updateOffer(offerId, { status: 'accepted', responded_by: userId, responded_at: nowIso });
    if (!acceptedOffer) return errorResult('UPDATE_FAILED', 'Failed to accept the offer');

    const transitioned = await transitionContract(contractId, {
      from: ['negotiating'],
      to: 'awaiting_signatures',
      actor: 'system',
      patch: lockedTermsPatch(contractId, terms, { offerId, termsHash, canonical, nowIso }),
    });
    if (!transitioned.ok) {
      // Compensate: the offer stays open so it can be accepted again.
      await contractOfferRepository.updateOffer(offerId, { status: 'pending', responded_by: null, responded_at: null });
      return errorResult(transitioned.code, transitioned.message);
    }

    await afterTermsLocked({ contract, project, terms, termsHash, offerId, acceptedBy: role, userId, employerWallet: employer.wallet_address, freelancerWallet: freelancer.wallet_address });

    return successResult(mapContractFromEntity(transitioned.contract));
  });
}

export async function declineOffer(
  contractId: string,
  offerId: string,
  userId: string,
  input: { reason?: string | null; endNegotiation?: boolean } = {},
): Promise<ServiceResult<{ offer: ContractOffer; contractCancelled: boolean }>> {
  const declined = await withLock(contractTermsLockKey(contractId), async (): Promise<ServiceResult<{ offer: ContractOfferEntity; contract: ContractEntity; role: ContractRole }>> => {
    const ctx = await loadContext(contractId);
    if (isError(ctx)) return ctx;
    const { contract, project, offers } = ctx;

    const role = partyRole(contract, userId);
    if (!role) return errorResult('UNAUTHORIZED', 'Only contract parties can decline terms');
    if (contract.status !== 'negotiating') {
      return errorResult('INVALID_STATUS', `Terms can only be declined while the contract is negotiating (current: ${contract.status})`);
    }
    const offer = offers.find(o => o.id === offerId);
    if (!offer) return errorResult('NOT_FOUND', 'Offer not found');
    if (offer.status !== 'pending') return errorResult('OFFER_NOT_OPEN', 'This offer is no longer open');
    if (offer.proposed_by === userId) {
      return errorResult('CANNOT_DECLINE_OWN_OFFER', 'Withdraw your own offer instead of declining it');
    }

    const updated = await contractOfferRepository.updateOffer(offerId, {
      status: 'declined',
      responded_by: userId,
      responded_at: new Date().toISOString(),
      ...(input.reason ? { message: `${offer.message ? `${offer.message}\n\n` : ''}Declined: ${input.reason}`.slice(0, 2000) } : {}),
    });
    if (!updated) return errorResult('UPDATE_FAILED', 'Failed to decline the offer');

    if (!input.endNegotiation) {
      const other = counterpartOf(contract, role);
      await notifyContractParty({
        userId: other.userId,
        role: other.role,
        contractId,
        type: 'contract_offer_declined',
        title: 'Offer declined',
        message: `Your offer for "${project?.title ?? 'your project'}" was declined${input.reason ? `: ${input.reason}` : ''}. You can send new terms.`,
        data: { offerId, projectId: contract.project_id },
      });
    }
    return successResult({ offer: updated, contract, role });
  });
  if (!declined.success) return declined;

  let contractCancelled = false;
  if (input.endNegotiation) {
    const released = await releaseContractSlot({
      contractId,
      actorId: userId,
      actor: declined.data.role,
      reason: 'negotiation_ended',
    });
    if (!released.success) return released;
    contractCancelled = true;
  }
  return successResult({ offer: mapContractOfferFromEntity(declined.data.offer), contractCancelled });
}

export async function withdrawOffer(contractId: string, offerId: string, userId: string): Promise<ServiceResult<ContractOffer>> {
  return withLock(contractTermsLockKey(contractId), async () => {
    const contract = await contractRepository.getContractById(contractId);
    if (!contract) return errorResult('NOT_FOUND', 'Contract not found');
    if (!partyRole(contract, userId)) return errorResult('UNAUTHORIZED', 'Only contract parties can withdraw offers');
    if (contract.status !== 'negotiating') {
      return errorResult('INVALID_STATUS', `Offers can only be withdrawn while the contract is negotiating (current: ${contract.status})`);
    }
    const offer = await contractOfferRepository.getOfferById(offerId);
    if (!offer || offer.contract_id !== contractId) return errorResult('NOT_FOUND', 'Offer not found');
    if (offer.proposed_by !== userId) return errorResult('UNAUTHORIZED', 'You can only withdraw your own offer');
    if (offer.status !== 'pending') return errorResult('OFFER_NOT_OPEN', 'This offer is no longer open');

    const updated = await contractOfferRepository.updateOffer(offerId, { status: 'withdrawn', responded_at: new Date().toISOString() });
    if (!updated) return errorResult('UPDATE_FAILED', 'Failed to withdraw the offer');
    return successResult(mapContractOfferFromEntity(updated));
  });
}

/**
 * "Request changes" after terms were locked but before both signed: voids any
 * signature, clears the locked terms and returns to negotiation.
 */
export async function reopenNegotiation(contractId: string, userId: string): Promise<ServiceResult<Contract>> {
  return withLock(contractTermsLockKey(contractId), async () => {
    const contract = await contractRepository.getContractById(contractId);
    if (!contract) return errorResult('NOT_FOUND', 'Contract not found');
    const role = partyRole(contract, userId);
    if (!role) return errorResult('UNAUTHORIZED', 'Only contract parties can reopen negotiation');

    const transitioned = await transitionContract(contractId, {
      from: ['awaiting_signatures'],
      to: 'negotiating',
      actor: role,
      patch: {
        milestones: [],
        accepted_offer_id: null,
        terms_hash: null,
        terms_snapshot: null,
        terms_locked_at: null,
      },
    });
    if (!transitioned.ok) return errorResult(transitioned.code, transitioned.message);

    try {
      await contractSignatureRepository.voidAllForContract(contractId);
    } catch (error) {
      logger.error('Failed to void signatures after reopening negotiation', { contractId, error });
    }

    const other = counterpartOf(contract, role);
    const project = await projectRepository.findProjectById(contract.project_id).catch(() => null);
    await notifyContractParty({
      userId: other.userId,
      role: other.role,
      contractId,
      type: 'contract_offer_received',
      title: 'Changes requested',
      message: `The other party reopened negotiation for "${project?.title ?? 'your project'}". Any signatures were voided; propose or review new terms.`,
      data: { projectId: contract.project_id },
      email: true,
    });

    return successResult(mapContractFromEntity(transitioned.contract));
  });
}
