import { describe, it, expect } from '@jest/globals';
import {
  UUID_PATTERN,
  isValidUUID,
  validateUUID,
  validateUUIDParams,
  hasValidId,
} from '../../utils/uuid-validation.js';

describe('uuid-validation', () => {
  const validUUID = '123e4567-e89b-12d3-a456-426614174000';
  const invalidUUID = 'not-a-uuid';

  describe('UUID_PATTERN', () => {
    it('matches valid UUIDs', () => {
      expect(UUID_PATTERN.test(validUUID)).toBe(true);
      expect(UUID_PATTERN.test('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true);
    });

    it('rejects invalid strings', () => {
      expect(UUID_PATTERN.test('12345')).toBe(false);
      expect(UUID_PATTERN.test('')).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    it('returns true for a valid UUID string', () => {
      expect(isValidUUID(validUUID)).toBe(true);
    });

    it('returns false for invalid UUID strings', () => {
      expect(isValidUUID(invalidUUID)).toBe(false);
      expect(isValidUUID('')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isValidUUID(null)).toBe(false);
      expect(isValidUUID(undefined)).toBe(false);
      expect(isValidUUID(12345)).toBe(false);
      expect(isValidUUID({})).toBe(false);
      expect(isValidUUID([])).toBe(false);
    });
  });

  describe('validateUUID', () => {
    it('returns null when value is a valid UUID', () => {
      expect(validateUUID(validUUID)).toBeNull();
      expect(validateUUID(validUUID, 'projectId')).toBeNull();
    });

    it('returns error when value is not a string', () => {
      expect(validateUUID(null)).toBe('id is required and must be a string');
      expect(validateUUID(123, 'contractId')).toBe('contractId is required and must be a string');
    });

    it('returns error when value is an invalid UUID string', () => {
      expect(validateUUID(invalidUUID)).toBe('id must be a valid UUID');
      expect(validateUUID('bad-id', 'milestoneId')).toBe('milestoneId must be a valid UUID');
    });
  });

  describe('validateUUIDParams', () => {
    it('returns null when all parameters are valid UUIDs', () => {
      const error = validateUUIDParams({
        projectId: validUUID,
        milestoneId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      });
      expect(error).toBeNull();
    });

    it('returns first error encountered when a param is invalid', () => {
      const error = validateUUIDParams({
        validId: validUUID,
        badParam: 'invalid',
        anotherBad: 123,
      });
      expect(error).toBe('badParam must be a valid UUID');
    });

    it('returns empty result for empty object', () => {
      expect(validateUUIDParams({})).toBeNull();
    });
  });

  describe('hasValidId', () => {
    it('delegates to isValidUUID', () => {
      expect(hasValidId(validUUID)).toBe(true);
      expect(hasValidId('invalid')).toBe(false);
      expect(hasValidId(null)).toBe(false);
    });
  });
});
