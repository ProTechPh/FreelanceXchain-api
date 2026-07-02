import { describe, it, expect } from '@jest/globals';
import {
  isValidEmail,
  validatePasswordStrength,
  isValidRole,
  isValidWalletAddress,
  isValidUUID,
  isValidRating,
  validateRegisterInput,
  validateLoginInput,
} from '../../utils/validators.js';

describe('validators', () => {
  describe('isValidEmail', () => {
    it('returns true for valid email', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });
    it('returns false for non-string', () => {
      expect(isValidEmail(123)).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
    });
    it('returns false for too short email', () => {
      expect(isValidEmail('a@b')).toBe(false);
    });
    it('returns false for too long email', () => {
      expect(isValidEmail('a'.repeat(250) + '@b.com')).toBe(false);
    });
    it('returns false for missing @', () => {
      expect(isValidEmail('userexample.com')).toBe(false);
    });
    it('returns false for missing domain', () => {
      expect(isValidEmail('user@')).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('returns valid for strong password', () => {
      const result = validatePasswordStrength('StrongP@ss1');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    it('returns error for too short password', () => {
      const result = validatePasswordStrength('Sh0!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('at least'));
    });
    it('returns error for too long password', () => {
      const result = validatePasswordStrength('A'.repeat(73) + '1b@');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('at most'));
    });
    it('returns error for missing lowercase', () => {
      const result = validatePasswordStrength('PASSWORD1@');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('lowercase'));
    });
    it('returns error for missing uppercase', () => {
      const result = validatePasswordStrength('password1@');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('uppercase'));
    });
    it('returns error for missing number', () => {
      const result = validatePasswordStrength('Password@');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('number'));
    });
    it('returns error for missing special char', () => {
      const result = validatePasswordStrength('Password1abc');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('special'));
    });
  });

  describe('isValidRole', () => {
    it('returns true for freelancer', () => {
      expect(isValidRole('freelancer')).toBe(true);
    });
    it('returns true for employer', () => {
      expect(isValidRole('employer')).toBe(true);
    });
    it('returns false for admin', () => {
      expect(isValidRole('admin')).toBe(false);
    });
    it('returns false for non-string', () => {
      expect(isValidRole(123)).toBe(false);
      expect(isValidRole(null)).toBe(false);
    });
  });

  describe('isValidWalletAddress', () => {
    it('returns true for valid address', () => {
      expect(isValidWalletAddress('0x1234567890123456789012345678901234567890')).toBe(true);
    });
    it('returns false for missing 0x prefix', () => {
      expect(isValidWalletAddress('1234567890123456789012345678901234567890')).toBe(false);
    });
    it('returns false for too short', () => {
      expect(isValidWalletAddress('0x1234')).toBe(false);
    });
    it('returns false for non-string', () => {
      expect(isValidWalletAddress(123)).toBe(false);
    });
    it('returns false for invalid chars', () => {
      expect(isValidWalletAddress('0xGGGG567890123456789012345678901234567890')).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    it('returns true for valid UUID', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });
    it('returns false for invalid UUID', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });
    it('returns false for non-string', () => {
      expect(isValidUUID(123)).toBe(false);
    });
  });

  describe('isValidRating', () => {
    it('returns true for valid rating', () => {
      expect(isValidRating(1)).toBe(true);
      expect(isValidRating(3)).toBe(true);
      expect(isValidRating(5)).toBe(true);
    });
    it('returns false for out of range', () => {
      expect(isValidRating(0)).toBe(false);
      expect(isValidRating(6)).toBe(false);
    });
    it('returns false for non-integer', () => {
      expect(isValidRating(3.5)).toBe(false);
    });
    it('returns false for non-number', () => {
      expect(isValidRating('3')).toBe(false);
    });
  });

  describe('validateRegisterInput', () => {
    it('returns empty errors for valid input', () => {
      const errors = validateRegisterInput('test@test.com', 'StrongP@ss1', 'freelancer');
      expect(errors).toHaveLength(0);
    });
    it('returns error for invalid email', () => {
      const errors = validateRegisterInput('bad', 'StrongP@ss1', 'freelancer');
      expect(errors).toContainEqual(expect.objectContaining({ field: 'email' }));
    });
    it('returns error for weak password', () => {
      const errors = validateRegisterInput('test@test.com', 'weak', 'freelancer');
      expect(errors).toContainEqual(expect.objectContaining({ field: 'password' }));
    });
    it('returns error for non-string password', () => {
      const errors = validateRegisterInput('test@test.com', 123, 'freelancer');
      expect(errors).toContainEqual(expect.objectContaining({ field: 'password' }));
    });
    it('returns error for invalid role', () => {
      const errors = validateRegisterInput('test@test.com', 'StrongP@ss1', 'admin');
      expect(errors).toContainEqual(expect.objectContaining({ field: 'role' }));
    });
  });

  describe('validateLoginInput', () => {
    it('returns empty errors for valid input', () => {
      const errors = validateLoginInput('test@test.com', 'password');
      expect(errors).toHaveLength(0);
    });
    it('returns error for invalid email', () => {
      const errors = validateLoginInput('bad', 'password');
      expect(errors).toContainEqual(expect.objectContaining({ field: 'email' }));
    });
    it('returns error for missing password', () => {
      const errors = validateLoginInput('test@test.com', null);
      expect(errors).toContainEqual(expect.objectContaining({ field: 'password' }));
    });
    it('returns error for empty string password', () => {
      const errors = validateLoginInput('test@test.com', '');
      expect(errors).toContainEqual(expect.objectContaining({ field: 'password' }));
    });
  });
});
