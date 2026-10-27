import { describe, expect, it } from '@jest/globals';
import { countMeaningfulChars, hasMinMeaningfulChars } from '../text-validation.js';

describe('text-validation', () => {
  it('counts only letters and digits', () => {
    expect(countMeaningfulChars('   .   .   .   ')).toBe(0);
    expect(countMeaningfulChars(' ​\n\t-_!?')).toBe(0);
    expect(countMeaningfulChars('Verified ID #42.')).toBe(12);
    expect(countMeaningfulChars('Pagpapatunay ñ 日本')).toBe(15);
  });

  it('rejects filler-only and non-string values', () => {
    expect(hasMinMeaningfulChars(' . '.repeat(100), 10)).toBe(false);
    expect(hasMinMeaningfulChars(undefined, 1)).toBe(false);
    expect(hasMinMeaningfulChars('Checked passport in person', 10)).toBe(true);
  });
});
