/**
 * Named constants to replace magic numbers and strings across the codebase.
 * Centralizes domain values for consistency and searchability.
 */

// ── Time ──────────────────────────────────────────────────────────────────────
export const SECONDS_PER_DAY = 86_400;
export const MILLISECONDS_PER_DAY = 86_400_000;

// ── Blockchain ────────────────────────────────────────────────────────────────
export const DEFAULT_CURRENCY = 'ETH';

// ── Reputation ────────────────────────────────────────────────────────────────
/** Lambda for exponential time-decay in reputation scoring. */
export const DEFAULT_REPUTATION_DECAY_LAMBDA = 0.01;
export const DEFAULT_REPUTATION_SCORE = 50;

// ── AI / LLM ──────────────────────────────────────────────────────────────────
export const AI_MAX_RETRIES = 3;
export const AI_INITIAL_RETRY_DELAY_MS = 1_000;
export const AI_REQUEST_TIMEOUT_MS = 300_000; // 5 minutes
export const AI_DEFAULT_TEMPERATURE = 0.7;
export const AI_DEFAULT_MAX_OUTPUT_TOKENS = 2_048;

// ── Matching ──────────────────────────────────────────────────────────────────
export const DEFAULT_RECOMMENDATION_LIMIT = 10;
export const REPUTATION_WEIGHT = 0.3;
export const SKILL_MATCH_WEIGHT = 0.7;

// ── Pagination ────────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export const MAX_OFFSET = 1_000_000;

// ── Password ──────────────────────────────────────────────────────────────────
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

// ── File Upload ───────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_TOTAL_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
export const MAX_FILE_COUNT = 10;
export const MAX_FILENAME_LENGTH = 255;
