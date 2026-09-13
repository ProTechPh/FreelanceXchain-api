import { createHash } from 'node:crypto';
import type { ServiceResult } from '../types/service-result.js';
import { successResult, errorResult } from '../types/service-result.js';
import { logger } from '../config/logger.js';

export interface ExperimentVariant {
  id: string;
  name: string;
  weight: number; // e.g. 50 for 50%
  metadata?: Record<string, any>;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  hypothesis: string;
  status: 'draft' | 'running' | 'paused' | 'concluded';
  targetAudience: 'all' | 'freelancer' | 'employer' | 'pro';
  variants: ExperimentVariant[];
  defaultVariantId: string;
  createdAt: string;
}

export interface UserExperimentAssignment {
  experimentId: string;
  variantId: string;
  variantName: string;
  metadata?: Record<string, any>;
}

/**
 * Built-in priority experiments designed in the FreelanceXchain A/B Testing Framework.
 */
const REGISTERED_EXPERIMENTS: Record<string, Experiment> = {
  'AB-001': {
    id: 'AB-001',
    name: 'Pro Paywall Placement Optimization',
    description: 'Test gating AI matching behind immediate paywall vs 3 free trials',
    hypothesis: 'Allowing 3 free AI matches before showing the Pro paywall increases activation by 25% and Pro conversion by 15%',
    status: 'running',
    targetAudience: 'freelancer',
    variants: [
      { id: 'control_immediate_paywall', name: 'Immediate Paywall on 1st Match', weight: 50 },
      { id: 'trial_three_free_matches', name: '3 Free Matches Before Paywall', weight: 50, metadata: { freeMatchesAllowed: 3 } },
    ],
    defaultVariantId: 'control_immediate_paywall',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  'AB-003': {
    id: 'AB-003',
    name: 'Rush Delivery Fee Default Setting',
    description: 'Test different default rush percentages in project creation modal',
    hypothesis: 'Defaulting to 25% with clear delivery turnaround estimates increases rush upgrade adoption from 8% to 15%',
    status: 'running',
    targetAudience: 'employer',
    variants: [
      { id: 'control_no_default', name: 'No Default (Empty input)', weight: 34, metadata: { defaultPercentage: 0 } },
      { id: 'variant_15_percent', name: '15% Rush Surcharge Default', weight: 33, metadata: { defaultPercentage: 15 } },
      { id: 'variant_25_percent', name: '25% Rush Surcharge Default', weight: 33, metadata: { defaultPercentage: 25 } },
    ],
    defaultVariantId: 'control_no_default',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  'AB-005': {
    id: 'AB-005',
    name: 'Tiered KYC Gateway Threshold',
    description: 'Test threshold for requiring biometric verification on contract funding',
    hypothesis: 'Setting the KYC exempt threshold to 0.1 ETH maximizes user activation while keeping fraud below 0.1%',
    status: 'running',
    targetAudience: 'all',
    variants: [
      { id: 'threshold_0_05_eth', name: '0.05 ETH Exemption Threshold', weight: 50, metadata: { thresholdEth: 0.05 } },
      { id: 'threshold_0_10_eth', name: '0.10 ETH Exemption Threshold', weight: 50, metadata: { thresholdEth: 0.10 } },
    ],
    defaultVariantId: 'threshold_0_10_eth',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  'AB-010': {
    id: 'AB-010',
    name: 'On-Chain Reputation Badge UI Visibility',
    description: 'Test prominent soulbound on-chain reputation badge vs traditional star rating only',
    hypothesis: 'Displaying cryptographic on-chain verification badges next to proposal cards increases employer hiring confidence and decreases time-to-hire by 18%',
    status: 'running',
    targetAudience: 'employer',
    variants: [
      { id: 'stars_only', name: 'Traditional Star Rating Only', weight: 50 },
      { id: 'onchain_verified_badge', name: 'Smart Contract Escrow Verified Badge', weight: 50, metadata: { showBadge: true, highlightEscrowStats: true } },
    ],
    defaultVariantId: 'stars_only',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
};

// In-memory test overrides (useful for QA / integration tests)
const variantOverrides = new Map<string, string>();

/**
 * Deterministically buckets a user into an experiment variant using SHA-256 hash.
 */
function hashToBucket(userId: string, experimentId: string): number {
  const hash = createHash('sha256').update(`${experimentId}:${userId}`).digest('hex');
  const intVal = parseInt(hash.substring(0, 8), 16);
  return intVal % 100; // 0 to 99
}

/**
 * Get the active variant for a user in an experiment.
 */
export function getExperimentVariant(
  experimentId: string,
  userId: string,
  userRole?: string
): ServiceResult<UserExperimentAssignment> {
  const experiment = REGISTERED_EXPERIMENTS[experimentId];
  if (!experiment) {
    return errorResult('NOT_FOUND', `Experiment ${experimentId} not found`);
  }

  const fallbackVar = experiment.variants.find(v => v.id === experiment.defaultVariantId) ?? experiment.variants[0] ?? { id: 'default', name: 'Default', weight: 100 };

  // Check for test override
  const overrideKey = `${experimentId}:${userId}`;
  if (variantOverrides.has(overrideKey)) {
    const varId = variantOverrides.get(overrideKey)!;
    const variant = experiment.variants.find(v => v.id === varId);
    if (variant) {
      return successResult({
        experimentId,
        variantId: variant.id,
        variantName: variant.name,
        ...(variant.metadata !== undefined ? { metadata: variant.metadata } : {}),
      });
    }
  }

  // If experiment is not running or role does not match target audience, return default
  if (experiment.status !== 'running') {
    return successResult({
      experimentId,
      variantId: fallbackVar.id,
      variantName: fallbackVar.name,
      ...(fallbackVar.metadata !== undefined ? { metadata: fallbackVar.metadata } : {}),
    });
  }

  if (experiment.targetAudience !== 'all' && userRole && experiment.targetAudience !== userRole) {
    return successResult({
      experimentId,
      variantId: fallbackVar.id,
      variantName: fallbackVar.name,
      ...(fallbackVar.metadata !== undefined ? { metadata: fallbackVar.metadata } : {}),
    });
  }

  // Deterministic bucketing
  const bucket = hashToBucket(userId, experimentId);
  let cumulativeWeight = 0;
  for (const variant of experiment.variants) {
    cumulativeWeight += variant.weight;
    if (bucket < cumulativeWeight) {
      return successResult({
        experimentId,
        variantId: variant.id,
        variantName: variant.name,
        ...(variant.metadata !== undefined ? { metadata: variant.metadata } : {}),
      });
    }
  }

  // Fallback to default variant
  return successResult({
    experimentId,
    variantId: fallbackVar.id,
    variantName: fallbackVar.name,
    ...(fallbackVar.metadata !== undefined ? { metadata: fallbackVar.metadata } : {}),
  });
}

/**
 * List all active experiments and user assignments.
 */
export function getAllUserExperiments(userId: string, userRole?: string): ServiceResult<UserExperimentAssignment[]> {
  try {
    const assignments: UserExperimentAssignment[] = [];
    for (const expId of Object.keys(REGISTERED_EXPERIMENTS)) {
      const res = getExperimentVariant(expId, userId, userRole);
      if (res.success) {
        assignments.push(res.data);
      }
    }
    return successResult(assignments);
  } catch (error) {
    logger.error('Failed to get user experiments', { error, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * List all configured experiments metadata (for admin or catalog).
 */
export function getRegisteredExperiments(): ServiceResult<Experiment[]> {
  return successResult(Object.values(REGISTERED_EXPERIMENTS));
}

/**
 * Set a variant override for testing/QA.
 */
export function setVariantOverride(experimentId: string, userId: string, variantId: string): void {
  variantOverrides.set(`${experimentId}:${userId}`, variantId);
}

/**
 * Clear test overrides.
 */
export function clearVariantOverrides(): void {
  variantOverrides.clear();
}
