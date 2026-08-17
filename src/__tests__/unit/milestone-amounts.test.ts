import { describe, it, expect } from '@jest/globals';
import { rescaleMilestoneAmounts } from '../../utils/milestone-amounts.js';

describe('rescaleMilestoneAmounts', () => {
  it('scales amounts proportionally so the sum equals base + fee', () => {
    const result = rescaleMilestoneAmounts([500, 300, 200], 1000, 300);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(650); // 500 * 1.3
    expect(result[1]).toBe(390); // 300 * 1.3
    expect(result[2]).toBe(260); // remainder: 1300 - 650 - 390
    expect(result.reduce((a, b) => a + b, 0)).toBe(1300);
  });

  it('gives the full new total to a single milestone', () => {
    const result = rescaleMilestoneAmounts([1000], 1000, 300);
    expect(result).toEqual([1300]);
  });

  it('assigns the rounding remainder to the last milestone', () => {
    // 333 * 1.3 rounds to 432.9 per milestone; the last absorbs the remainder
    const result = rescaleMilestoneAmounts([333, 333, 334], 1000, 300);
    expect(result[0]).toBe(432.9);
    expect(result[1]).toBe(432.9);
    expect(result[2]).toBe(434.2);
    expect(result.reduce((a, b) => a + b, 0)).toBe(1300);
  });

  it('returns an empty array for empty input', () => {
    expect(rescaleMilestoneAmounts([], 1000, 300)).toEqual([]);
  });

  it('returns zero total when rush fee is zero', () => {
    const result = rescaleMilestoneAmounts([600, 400], 1000, 0);
    expect(result).toEqual([600, 400]);
  });

  it('does not mutate the input array', () => {
    const input = [600, 400];
    const result = rescaleMilestoneAmounts(input, 1000, 300);
    expect(input).toEqual([600, 400]);
    expect(result).not.toBe(input);
  });
});
