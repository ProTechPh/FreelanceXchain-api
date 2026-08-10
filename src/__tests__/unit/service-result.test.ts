import { describe, it, expect } from '@jest/globals';
import { successResult, errorResult } from '../../types/service-result.js';

describe('successResult', () => {
  it('returns a success-shaped result with the provided data', () => {
    const data = { id: 'u-1', name: 'Ada' };
    const result = successResult(data);

    expect(result).toEqual({ success: true, data });
    expect(result.success).toBe(true);
  });

  it('preserves the exact data reference', () => {
    const data = { id: 'u-1' };
    const result = successResult(data);

    expect(result.data).toBe(data);
  });

  it('does not widen the success flag when used in a union return position', () => {
    const result: { success: true; data: string } | { success: false; error: { code: string } } =
      successResult('ok');

    expect(result).toEqual({ success: true, data: 'ok' });
  });
});

describe('errorResult', () => {
  it('returns a failure result with code and message only', () => {
    const result = errorResult('NOT_FOUND', 'User not found');

    expect(result).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' },
    });
    expect(result.success).toBe(false);
  });

  it('omits details and retryAfter when not provided', () => {
    const result = errorResult('NOT_FOUND', 'User not found');

    expect('details' in result.error).toBe(false);
    expect('retryAfter' in result.error).toBe(false);
  });

  it('includes details when provided', () => {
    const details = ['field: email', 'field: name'];
    const result = errorResult('VALIDATION_ERROR', 'Invalid input', details);

    expect(result.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details,
    });
    expect('retryAfter' in result.error).toBe(false);
  });

  it('includes retryAfter when provided', () => {
    const retryAfter = '2026-08-11T00:00:00.000Z';
    const result = errorResult('RETRY_COOLDOWN', 'Please wait before retrying', undefined, retryAfter);

    expect(result.error).toEqual({
      code: 'RETRY_COOLDOWN',
      message: 'Please wait before retrying',
      retryAfter,
    });
    expect('details' in result.error).toBe(false);
  });

  it('includes both details and retryAfter when both are provided', () => {
    const details = ['service: didit'];
    const retryAfter = '2026-08-11T00:00:00.000Z';
    const result = errorResult('RATE_LIMIT_EXCEEDED', 'Too many requests', details, retryAfter);

    expect(result.error).toEqual({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      details,
      retryAfter,
    });
  });
});
