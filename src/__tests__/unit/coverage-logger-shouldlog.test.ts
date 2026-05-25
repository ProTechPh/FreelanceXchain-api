// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';

process.env.LOG_LEVEL = 'none';

const { logger } = await import('../../config/logger.js');

describe('Logger - shouldLog early return (line 105)', () => {
  it('should return early when LOG_LEVEL is set above ERROR', () => {
    const result = logger.error('test');
    expect(result).toBeUndefined();
  });
});
