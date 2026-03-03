// Utilities barrel export
// This file will export all utility functions as they are created

export { generateId } from './id.js';

/**
 * Clamp a pagination limit to safe bounds.
 * Handles NaN, negative, zero, and excessively large values.
 * @param raw - The raw value from query params (already parsed to number)
 * @param defaultVal - Default if raw is falsy/NaN (default: 20)
 * @param max - Maximum allowed value (default: 100)
 * @returns A safe integer between 1 and max
 */
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
