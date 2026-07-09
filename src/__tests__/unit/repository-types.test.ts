import { describe, it, expect } from '@jest/globals';
import { RepositoryError } from '../../repositories/types.js';

describe('RepositoryError', () => {
  it('should set name, message, operation, and collection', () => {
    const error = new RepositoryError('Something failed', 'create', 'users');

    expect(error.name).toBe('RepositoryError');
    expect(error.message).toBe('Something failed');
    expect(error.operation).toBe('create');
    expect(error.collection).toBe('users');
    expect(error.cause).toBeUndefined();
  });

  it('should set cause when provided', () => {
    const originalError = new Error('original');
    const error = new RepositoryError('Wrapped error', 'get', 'projects', originalError);

    expect(error.cause).toBe(originalError);
  });

  it('should be an instance of Error', () => {
    const error = new RepositoryError('test', 'delete', 'contracts');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RepositoryError);
  });

  it('should preserve the stack trace', () => {
    const error = new RepositoryError('stack test', 'update', 'milestones');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('RepositoryError');
  });
});
