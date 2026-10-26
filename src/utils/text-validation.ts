/**
 * Minimum-length checks count only letters and digits, so input made of
 * spaces, dots or other filler ("  .  .  .  ") can't satisfy a "describe this
 * in at least N characters" rule. Maximum-length checks still use the raw
 * length, since that is what gets stored.
 */
const MEANINGFUL_CHAR = /[\p{L}\p{N}]/gu;

export function countMeaningfulChars(value: string): number {
  return value.match(MEANINGFUL_CHAR)?.length ?? 0;
}

export function hasMinMeaningfulChars(value: unknown, min: number): value is string {
  return typeof value === 'string' && countMeaningfulChars(value) >= min;
}
