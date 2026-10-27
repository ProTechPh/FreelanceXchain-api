/**
 * Contract terms: negotiation-offer validation and canonical signing payloads.
 *
 * Pure module (no I/O). All money math runs in integer units of 0.0001 ETH so the
 * "milestones sum to total" and "base >= freelancer floor" rules never suffer
 * floating-point drift. The same canonical terms are hashed with EIP-712 so the
 * wallet signature, the stored terms_hash and the on-chain agreement agree.
 */
import { TypedDataEncoder, getAddress, id as keccakUtf8, parseUnits } from 'ethers';
import { LEGAL_TERMS_HASH, LEGAL_TERMS_VERSION, SIGNATURE_STATEMENT } from '../constants/legal-terms.js';

export const MAX_CONTRACT_AMOUNT = 1_000_000;
export const DEFAULT_MAX_MILESTONES = 20;

export type OfferMilestoneInput = {
  title: string;
  description?: string | null;
  amount: number;
  dueDate: string;
};

export type OfferTermsInput = {
  baseAmount: number;
  additionalPay?: number | null;
  isRush: boolean;
  rushFeePercentage?: number | null;
  deadline: string;
  milestones: OfferMilestoneInput[];
};

export type OfferMilestone = {
  title: string;
  description: string;
  amount: number;
  dueDate: string;
};

export type NormalizedOfferTerms = {
  baseAmount: number;
  additionalPay: number;
  isRush: boolean;
  rushFeePercentage: number;
  rushFee: number;
  totalAmount: number;
  deadline: string;
  milestones: OfferMilestone[];
};

export type TermsFieldError = { field: string; message: string };

export type OfferValidationResult =
  | { ok: true; terms: NormalizedOfferTerms }
  | { ok: false; code: 'FLOOR_VIOLATION' | 'AMOUNT_MISMATCH' | 'VALIDATION_ERROR'; message: string; errors: TermsFieldError[] };

export type OfferValidationOptions = {
  /** The freelancer's proposed rate: the base amount may go down to half of it, never lower. */
  floor: number;
  maxMilestones?: number;
  now?: Date;
};

// ─── Money helpers ──────────────────────────────────────────────────────────

/**
 * Contract amounts use up to 4 decimals of ETH (0.0001 ETH ≈ ₱15), fine enough
 * for peso-denominated offers; math runs in integer units of 0.0001 ETH.
 */
export const AMOUNT_DECIMALS = 4;
const UNITS_PER_ETH = 10 ** AMOUNT_DECIMALS;
export const MIN_AMOUNT = 1 / UNITS_PER_ETH;

export function toUnits(amount: number): number {
  return Math.round(amount * UNITS_PER_ETH);
}

export function fromUnits(units: number): number {
  return units / UNITS_PER_ETH;
}

/** The freelancer's floor in amount units, rounded up should a rate carry extra precision. */
export function floorUnits(floor: number): number {
  return Math.ceil(floor * UNITS_PER_ETH - 1e-6);
}

/** Share of the freelancer's proposed rate that an offer's base amount must stay above. */
export const MIN_BASE_SHARE = 0.5;

/** Lowest base amount allowed in an offer, in amount units: the smallest amount above half the proposed rate. */
export function minimumBaseUnits(proposedRate: number): number {
  return Math.floor(floorUnits(proposedRate) * MIN_BASE_SHARE) + 1;
}

export function hasAtMostDecimals(value: number, decimals: number = AMOUNT_DECIMALS): boolean {
  const scale = 10 ** decimals;
  return Math.abs(value * scale - Math.round(value * scale)) < 1e-6;
}

/** Decimal ETH → wei, via a 2-decimal string so float noise never reaches the chain. */
export function ethToWei(amount: number): bigint {
  return parseUnits(fromUnits(toUnits(amount)).toFixed(AMOUNT_DECIMALS), 18);
}

export function computeRushFee(baseAmount: number, isRush: boolean, rushFeePercentage: number): number {
  if (!isRush || rushFeePercentage <= 0) return 0;
  return fromUnits(Math.round(toUnits(baseAmount) * rushFeePercentage / 100));
}

export function computeOfferTotals(input: {
  baseAmount: number;
  additionalPay?: number | null;
  isRush: boolean;
  rushFeePercentage?: number | null;
}): { rushFee: number; totalAmount: number } {
  const rushFee = computeRushFee(input.baseAmount, input.isRush, input.rushFeePercentage ?? 0);
  const totalUnits = toUnits(input.baseAmount) + toUnits(input.additionalPay ?? 0) + toUnits(rushFee);
  return { rushFee, totalAmount: fromUnits(totalUnits) };
}

// ─── Date helpers ───────────────────────────────────────────────────────────

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/** Normalize an ISO date/datetime to `YYYY-MM-DD` (UTC), or null when invalid. */
export function normalizeDate(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const match = DATE_PREFIX.exec(value.trim());
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === match[1] ? match[1]! : null;
}

function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Offer validation ───────────────────────────────────────────────────────

function validateMoney(field: string, value: unknown, errors: TermsFieldError[], opts: { min: number; allowZero?: boolean }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({ field, message: 'Must be a number' });
    return 0;
  }
  if (!hasAtMostDecimals(value)) {
    errors.push({ field, message: `Must have at most ${AMOUNT_DECIMALS} decimal places` });
  }
  if (value < opts.min || (!opts.allowZero && value === 0)) {
    errors.push({ field, message: opts.allowZero ? `Must be at least ${opts.min}` : 'Must be greater than zero' });
  }
  if (value > MAX_CONTRACT_AMOUNT) {
    errors.push({ field, message: `Must not exceed ${MAX_CONTRACT_AMOUNT}` });
  }
  return value;
}

function validateMilestones(
  milestones: OfferMilestoneInput[],
  limits: { deadline: string | null; today: string; maxMilestones: number },
  errors: TermsFieldError[],
): OfferMilestone[] {
  const { deadline, today, maxMilestones } = limits;
  if (!Array.isArray(milestones) || milestones.length === 0) {
    errors.push({ field: 'milestones', message: 'At least one milestone is required' });
    return [];
  }
  if (milestones.length > maxMilestones) {
    errors.push({ field: 'milestones', message: `At most ${maxMilestones} milestones are allowed` });
  }

  let previousDue: string | null = null;
  return milestones.map((m, i) => {
    const field = `milestones[${i}]`;
    const title = typeof m?.title === 'string' ? m.title.trim() : '';
    if (title.length === 0 || title.length > 255) {
      errors.push({ field: `${field}.title`, message: 'Title is required (max 255 characters)' });
    }
    const description = typeof m?.description === 'string' ? m.description.trim() : '';
    if (description.length > 2000) {
      errors.push({ field: `${field}.description`, message: 'Description must be at most 2000 characters' });
    }
    const amount = validateMoney(`${field}.amount`, m?.amount, errors, { min: MIN_AMOUNT });
    const dueDate = normalizeDate(m?.dueDate);
    if (!dueDate) {
      errors.push({ field: `${field}.dueDate`, message: 'Due date must be a valid date (YYYY-MM-DD)' });
    } else {
      if (dueDate < today) errors.push({ field: `${field}.dueDate`, message: 'Due date cannot be in the past' });
      if (deadline && dueDate > deadline) errors.push({ field: `${field}.dueDate`, message: 'Due date cannot be after the contract deadline' });
      if (previousDue && dueDate < previousDue) errors.push({ field: `${field}.dueDate`, message: 'Due dates must be in chronological order' });
      previousDue = dueDate;
    }
    return { title, description, amount, dueDate: dueDate ?? '' };
  });
}

/**
 * Validate an offer against the negotiation rules and return the normalized
 * terms with server-computed totals (client-sent totals are never trusted).
 */
export function validateOfferTerms(input: OfferTermsInput, options: OfferValidationOptions): OfferValidationResult {
  const errors: TermsFieldError[] = [];
  const now = options.now ?? new Date();
  const today = todayUtc(now);
  const maxMilestones = options.maxMilestones ?? DEFAULT_MAX_MILESTONES;

  const baseAmount = validateMoney('baseAmount', input?.baseAmount, errors, { min: MIN_AMOUNT });
  const additionalPay = validateMoney('additionalPay', input?.additionalPay ?? 0, errors, { min: 0, allowZero: true });

  const isRush = input?.isRush === true;
  const rushFeePercentage = isRush ? (input.rushFeePercentage ?? 0) : 0;
  if (isRush) {
    if (typeof rushFeePercentage !== 'number' || !Number.isFinite(rushFeePercentage) || rushFeePercentage <= 0 || rushFeePercentage > 100) {
      errors.push({ field: 'rushFeePercentage', message: 'Rush fee percentage must be between 0.01 and 100' });
    } else if (!hasAtMostDecimals(rushFeePercentage, 2)) {
      errors.push({ field: 'rushFeePercentage', message: 'Rush fee percentage must have at most 2 decimal places' });
    }
  }

  const deadline = normalizeDate(input?.deadline);
  if (!deadline) {
    errors.push({ field: 'deadline', message: 'Deadline must be a valid date (YYYY-MM-DD)' });
  } else if (deadline < today) {
    errors.push({ field: 'deadline', message: 'Deadline cannot be in the past' });
  }

  const milestones = validateMilestones(input?.milestones, { deadline, today, maxMilestones }, errors);

  if (errors.length > 0) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Offer terms are invalid', errors };
  }

  const minimumUnits = minimumBaseUnits(options.floor);
  if (toUnits(baseAmount) < minimumUnits) {
    return {
      ok: false,
      code: 'FLOOR_VIOLATION',
      message: `The base amount must be more than half of the freelancer's proposed rate (at least ${fromUnits(minimumUnits)} ETH)`,
      errors: [{ field: 'baseAmount', message: `Must be at least ${fromUnits(minimumUnits)}` }],
    };
  }

  const { rushFee, totalAmount } = computeOfferTotals({ baseAmount, additionalPay, isRush, rushFeePercentage });
  if (totalAmount > MAX_CONTRACT_AMOUNT) {
    return { ok: false, code: 'VALIDATION_ERROR', message: `Total must not exceed ${MAX_CONTRACT_AMOUNT} ETH`, errors: [{ field: 'totalAmount', message: 'Too large' }] };
  }

  const milestoneUnits = milestones.reduce((sum, m) => sum + toUnits(m.amount), 0);
  if (milestoneUnits !== toUnits(totalAmount)) {
    return {
      ok: false,
      code: 'AMOUNT_MISMATCH',
      message: `Milestone amounts (${fromUnits(milestoneUnits)} ETH) must add up to the contract total (${totalAmount} ETH)`,
      errors: [{ field: 'milestones', message: `Must sum to ${totalAmount}` }],
    };
  }

  return {
    ok: true,
    terms: {
      baseAmount: fromUnits(toUnits(baseAmount)),
      additionalPay: fromUnits(toUnits(additionalPay)),
      isRush,
      rushFeePercentage: isRush ? rushFeePercentage : 0,
      rushFee,
      totalAmount,
      deadline: deadline!,
      milestones: milestones.map(m => ({ ...m, amount: fromUnits(toUnits(m.amount)) })),
    },
  };
}

/** Stable hash of normalized offer terms, used to detect tampering between create and accept. */
export function hashOfferTerms(terms: NormalizedOfferTerms): string {
  return keccakUtf8(JSON.stringify({
    baseAmount: terms.baseAmount.toFixed(AMOUNT_DECIMALS),
    additionalPay: terms.additionalPay.toFixed(AMOUNT_DECIMALS),
    isRush: terms.isRush,
    rushFeePercentage: terms.rushFeePercentage.toFixed(2),
    rushFee: terms.rushFee.toFixed(AMOUNT_DECIMALS),
    totalAmount: terms.totalAmount.toFixed(AMOUNT_DECIMALS),
    deadline: terms.deadline,
    milestones: terms.milestones.map(m => [m.title, m.description, m.amount.toFixed(AMOUNT_DECIMALS), m.dueDate]),
  }));
}

/** Split `totalUnits` across milestones in proportion to `weights`, last absorbs rounding. */
function splitUnits(totalUnits: number, weights: number[]): number[] {
  const weightSum = weights.reduce((s, w) => s + (w > 0 ? w : 0), 0);
  const result: number[] = [];
  let allocated = 0;
  weights.forEach((w, i) => {
    if (i === weights.length - 1) {
      result.push(totalUnits - allocated);
      return;
    }
    const share = weightSum > 0 ? Math.round(totalUnits * (w > 0 ? w : 0) / weightSum) : Math.floor(totalUnits / weights.length);
    result.push(share);
    allocated += share;
  });
  return result;
}

export type TemplateMilestone = { title?: string; description?: string; amount?: number; due_date?: string; dueDate?: string };

/**
 * Build the round-1 offer from the project template and the freelancer's proposal.
 * The project milestones are rescaled to the proposal total (never persisted back
 * to the project) and dates are clamped into the future so the seed is acceptable
 * as-is.
 */
export function seedOfferFromTemplate(
  project: { milestones?: TemplateMilestone[] | null; deadline?: string | null; is_rush?: boolean | null; rush_fee_percentage?: number | null },
  proposal: { proposed_rate: number; estimated_duration?: number | null },
  now: Date = new Date(),
): NormalizedOfferTerms {
  const today = todayUtc(now);
  const baseAmount = fromUnits(floorUnits(proposal.proposed_rate));
  const isRush = project.is_rush === true && (project.rush_fee_percentage ?? 0) > 0;
  const rushFeePercentage = isRush ? Number(project.rush_fee_percentage) : 0;
  const { rushFee, totalAmount } = computeOfferTotals({ baseAmount, additionalPay: 0, isRush, rushFeePercentage });

  const durationDays = Math.max(1, Math.round(proposal.estimated_duration ?? 30));
  const projectDeadline = normalizeDate(project.deadline);
  const deadline = projectDeadline && projectDeadline >= today ? projectDeadline : addDays(today, durationDays);

  const template = (project.milestones ?? []).filter(m => m && typeof m === 'object');
  const source: TemplateMilestone[] = template.length > 0
    ? template.slice(0, DEFAULT_MAX_MILESTONES)
    : [{ title: 'Agreed Deliverables', description: 'Delivery of the agreed project work.', amount: totalAmount, dueDate: deadline }];

  const amounts = splitUnits(toUnits(totalAmount), source.map(m => Number(m.amount ?? 0)));

  let previousDue = today;
  const milestones: OfferMilestone[] = source.map((m, i) => {
    let dueDate = normalizeDate(m.dueDate ?? m.due_date) ?? deadline;
    if (dueDate < previousDue) dueDate = previousDue;
    if (dueDate > deadline) dueDate = deadline;
    previousDue = dueDate;
    return {
      title: (m.title ?? '').trim().slice(0, 255) || `Milestone ${i + 1}`,
      description: (m.description ?? '').trim().slice(0, 2000),
      amount: fromUnits(amounts[i] ?? 0),
      dueDate,
    };
  });

  return { baseAmount, additionalPay: 0, isRush, rushFeePercentage, rushFee, totalAmount, deadline, milestones };
}

// ─── Canonical terms + EIP-712 ──────────────────────────────────────────────

export const CONTRACT_TERMS_SCHEMA = 'fxc-contract-terms/v1';

export type CanonicalMilestone = {
  index: number;
  title: string;
  description: string;
  descriptionHash: string;
  amountWei: string;
  dueDate: string;
};

export type CanonicalContractTerms = {
  schema: string;
  contractId: string;
  projectId: string;
  proposalId: string;
  offerId: string;
  employerId: string;
  freelancerId: string;
  employerWallet: string;
  freelancerWallet: string;
  currency: 'ETH';
  baseAmountWei: string;
  additionalPayWei: string;
  rushFeeBps: number;
  rushFeeWei: string;
  totalAmountWei: string;
  deadline: string;
  milestones: CanonicalMilestone[];
  legalTermsVersion: string;
  legalTermsHash: string;
};

export function buildCanonicalTerms(input: {
  contractId: string;
  projectId: string;
  proposalId: string;
  offerId: string;
  employerId: string;
  freelancerId: string;
  employerWallet: string;
  freelancerWallet: string;
  terms: NormalizedOfferTerms;
}): CanonicalContractTerms {
  const { terms } = input;
  return {
    schema: CONTRACT_TERMS_SCHEMA,
    contractId: input.contractId,
    projectId: input.projectId,
    proposalId: input.proposalId,
    offerId: input.offerId,
    employerId: input.employerId,
    freelancerId: input.freelancerId,
    employerWallet: getAddress(input.employerWallet),
    freelancerWallet: getAddress(input.freelancerWallet),
    currency: 'ETH',
    baseAmountWei: ethToWei(terms.baseAmount).toString(),
    additionalPayWei: ethToWei(terms.additionalPay).toString(),
    rushFeeBps: Math.round(terms.rushFeePercentage * 100),
    rushFeeWei: ethToWei(terms.rushFee).toString(),
    totalAmountWei: ethToWei(terms.totalAmount).toString(),
    deadline: terms.deadline,
    milestones: terms.milestones.map((m, index) => ({
      index,
      title: m.title,
      description: m.description,
      descriptionHash: keccakUtf8(m.description),
      amountWei: ethToWei(m.amount).toString(),
      dueDate: m.dueDate,
    })),
    legalTermsVersion: LEGAL_TERMS_VERSION,
    legalTermsHash: LEGAL_TERMS_HASH,
  };
}

export const EIP712_DOMAIN_NAME = 'FreelanceXchain Contract Agreement';
export const EIP712_DOMAIN_VERSION = '1';

const MILESTONE_TYPE = [
  { name: 'index', type: 'uint16' },
  { name: 'title', type: 'string' },
  { name: 'descriptionHash', type: 'bytes32' },
  { name: 'amountWei', type: 'uint256' },
  { name: 'dueDate', type: 'string' },
];

const CONTRACT_TERMS_TYPE = [
  { name: 'contractId', type: 'string' },
  { name: 'projectId', type: 'string' },
  { name: 'employer', type: 'address' },
  { name: 'freelancer', type: 'address' },
  { name: 'currency', type: 'string' },
  { name: 'baseAmountWei', type: 'uint256' },
  { name: 'additionalPayWei', type: 'uint256' },
  { name: 'rushFeeBps', type: 'uint16' },
  { name: 'rushFeeWei', type: 'uint256' },
  { name: 'totalAmountWei', type: 'uint256' },
  { name: 'deadline', type: 'string' },
  { name: 'milestones', type: 'Milestone[]' },
  { name: 'legalTermsHash', type: 'bytes32' },
];

const SIGN_CONTRACT_TYPE = [
  { name: 'statement', type: 'string' },
  { name: 'signerRole', type: 'string' },
  { name: 'termsHash', type: 'bytes32' },
  { name: 'terms', type: 'ContractTerms' },
];

export const TERMS_HASH_TYPES = { ContractTerms: CONTRACT_TERMS_TYPE, Milestone: MILESTONE_TYPE };
export const SIGNING_TYPES = { SignContract: SIGN_CONTRACT_TYPE, ContractTerms: CONTRACT_TERMS_TYPE, Milestone: MILESTONE_TYPE };

export type TypedTermsMessage = {
  contractId: string;
  projectId: string;
  employer: string;
  freelancer: string;
  currency: string;
  baseAmountWei: string;
  additionalPayWei: string;
  rushFeeBps: number;
  rushFeeWei: string;
  totalAmountWei: string;
  deadline: string;
  milestones: Array<{ index: number; title: string; descriptionHash: string; amountWei: string; dueDate: string }>;
  legalTermsHash: string;
};

export function toTypedTermsMessage(terms: CanonicalContractTerms): TypedTermsMessage {
  return {
    contractId: terms.contractId,
    projectId: terms.projectId,
    employer: terms.employerWallet,
    freelancer: terms.freelancerWallet,
    currency: terms.currency,
    baseAmountWei: terms.baseAmountWei,
    additionalPayWei: terms.additionalPayWei,
    rushFeeBps: terms.rushFeeBps,
    rushFeeWei: terms.rushFeeWei,
    totalAmountWei: terms.totalAmountWei,
    deadline: terms.deadline,
    milestones: terms.milestones.map(m => ({
      index: m.index,
      title: m.title,
      descriptionHash: m.descriptionHash,
      amountWei: m.amountWei,
      dueDate: m.dueDate,
    })),
    legalTermsHash: terms.legalTermsHash,
  };
}

/** Chain-independent EIP-712 struct hash of the terms; stored as contracts.terms_hash. */
export function hashTerms(terms: CanonicalContractTerms): string {
  return TypedDataEncoder.hashStruct('ContractTerms', TERMS_HASH_TYPES, toTypedTermsMessage(terms));
}

export type SignerRole = 'employer' | 'freelancer';

export type Eip712Domain = { name: string; version: string; chainId: number };

export type SigningTypedData = {
  domain: Eip712Domain;
  types: typeof SIGNING_TYPES;
  primaryType: 'SignContract';
  message: { statement: string; signerRole: SignerRole; termsHash: string; terms: TypedTermsMessage };
};

export function buildEip712Domain(chainId: number): Eip712Domain {
  return { name: EIP712_DOMAIN_NAME, version: EIP712_DOMAIN_VERSION, chainId };
}

export function buildSigningTypedData(terms: CanonicalContractTerms, signerRole: SignerRole, chainId: number): SigningTypedData {
  return {
    domain: buildEip712Domain(chainId),
    types: SIGNING_TYPES,
    primaryType: 'SignContract',
    message: {
      statement: SIGNATURE_STATEMENT,
      signerRole,
      termsHash: hashTerms(terms),
      terms: toTypedTermsMessage(terms),
    },
  };
}

/** Parse a stored terms snapshot (JSON string or already-parsed object). */
export function parseTermsSnapshot(value: unknown): CanonicalContractTerms | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const terms = parsed as CanonicalContractTerms;
  return terms.schema === CONTRACT_TERMS_SCHEMA && Array.isArray(terms.milestones) ? terms : null;
}
