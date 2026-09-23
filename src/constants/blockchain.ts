/**
 * Blockchain Constants
 * Centralizes blockchain-related magic values
 */

/**
 * Basis points (BPS) constants
 * 1 basis point = 0.01% = 0.0001
 */
export const FULL_RELEASE_BPS = 10000;        // 100% to freelancer
export const FULL_REFUND_BPS = 0;              // 0% to freelancer
export const DEFAULT_SPLIT_BPS = 5000;         // 50/50 split
export const MAX_BASIS_POINTS = 10000;         // 100%

/**
 * Common tolerance values for blockchain calculations
 */
export const SETTLED_TOTAL_TOLERANCE_ETH = 0.01;
export const DISPUTE_ROUNDING_TOLERANCE_ETH = 0.05;

/**
 * Contract status values (from smart contracts)
 */
export const ContractStatusOnChain = {
  DRAFT: 0,
  ACTIVE: 1,
  COMPLETED: 2,
  DISPUTED: 3,
  CANCELLED: 4,
} as const;

/**
 * Milestone status values (from smart contracts)
 */
export const MilestoneStatusOnChain = {
  PENDING: 0,
  SUBMITTED: 1,
  APPROVED: 2,
  REJECTED: 3,
  DISPUTED: 4,
  REFUNDED: 5,
} as const;

/**
 * Dispute decision types
 */
export const DisputeDecision = {
  FREELANCER_FAVOR: 'freelancer_favor',
  EMPLOYER_FAVOR: 'employer_favor',
  SPLIT: 'split',
} as const;

/**
 * Maximum revisions allowed per milestone
 */
export const MAX_MILESTONE_REVISIONS = 5;

/**
 * Network gas limits and timeouts
 */
export const TRANSACTION_TIMEOUT_MS = 60000;  // 1 minute
export const MAX_GAS_PRICE_GWEI = 100;
export const ESTIMATED_GAS_PER_MILESTONE = 150000;
