// Utilities barrel export
// This file will export all utility functions as they are created

export { generateId } from './id.js';
export { asyncHandler } from './async-handler.js';
export { sendValidationError, sendErrorResponse } from './response-helpers.js';
export { getApiVersion } from './version.js';

/**
 * Safely extract a message string from an unknown thrown value.
 * Handles Error instances, Appwrite exceptions, and plain objects
 * (some SDK paths throw non-Error values).
 */
export function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const message = (error as Record<string, unknown>).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

/**
 * Extract a message string from an unknown thrown value, or return `fallback`
 * when no message can be derived. Centralizes the fallback so call sites don't
 * each add a `??` branch.
 */
export function getErrorMessageOr(error: unknown, fallback: string): string {
  return getErrorMessage(error) ?? fallback;
}

/**
 * Parse a field that may be a JSON string, a raw value, or nullish.
 * Returns `fallback` for null/undefined and for unparseable JSON strings.
 */
export function parseField<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

/**
 * Safely parse a JSON string, or return the value as-is if it's already an object.
 * Replaces the common `typeof x === 'string' ? JSON.parse(x) : x` pattern.
 */
export function safeJsonParse<T = unknown>(value: string | T): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value;
}

/**
 * Clamp a pagination limit to safe bounds.
 * Handles NaN, negative, zero, and excessively large values.
 * @param raw - The raw value from query params (already parsed to number)
 * @param defaultVal - Default if raw is falsy/NaN (default: 20)
 * @param max - Maximum allowed value (default: 100)
 * @returns A safe integer between 1 and max
 */
// Payment amounts: milestone_release records store the escrow milestone amount
// in wei (as a Number — readEscrowRecordedAmount returns
// Number(escrowMilestone.amount)); every other record type stores ETH units.
// Any amount above this threshold cannot be a realistic ETH-unit amount, so it
// is treated as wei. Shared by the payment-repository totals and the escrow
// reconciliation job so both interpret the payments log the same way.
const WEI_SCALE_THRESHOLD = 1e12;
const WEI_PER_ETH = 1e18;

/**
 * Normalize a stored payment amount to ETH units. `milestone_release` amounts
 * are wei-as-Number and get divided by 1e18; all other record types are already
 * ETH units and pass through unchanged.
 */
export function toEthUnits(amount: number, paymentType: string): number {
  if (paymentType === 'milestone_release' && amount > WEI_SCALE_THRESHOLD) {
    return amount / WEI_PER_ETH;
  }
  return amount;
}

export function clampLimit(raw: number | undefined | null, defaultVal = 20, max = 100): number {
  if (raw === undefined || raw === null || isNaN(raw) || !isFinite(raw)) return defaultVal;
  return Math.max(1, Math.min(Math.floor(raw), max));
}

/**
 * Clamp a pagination offset to safe bounds.
 * @param raw - The raw offset value
 * @returns A non-negative integer, capped at 1_000_000 to prevent excessive DB work
 */
export function clampOffset(raw: number | undefined | null): number {
  if (raw === undefined || raw === null || isNaN(raw) || !isFinite(raw)) return 0;
  return Math.min(Math.max(0, Math.floor(raw)), 1_000_000);
}
