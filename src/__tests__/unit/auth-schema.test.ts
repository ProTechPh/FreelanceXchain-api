import { describe, it, expect } from '@jest/globals';
import {
  validateEmail,
  validateRole,
  validateRegisterInput,
  validateLoginInput,
  validatePasswordResetInput,
  validateChangePasswordInput,
} from '../../validators/auth.schema.js';

describe('auth.schema', () => {
  describe('validateEmail', () => {
    it('returns false for invalid types and lengths', () => {
      expect(validateEmail(null)).toBe(false);
      expect(validateEmail('a@b')).toBe(false);
      expect(validateEmail('a'.repeat(250) + '@example.com')).toBe(false);
      expect(validateEmail('user@example.com')).toBe(true);
    });
  });

  describe('validateRole', () => {
    it('validates user roles', () => {
      expect(validateRole('freelancer')).toBe(true);
      expect(validateRole('employer')).toBe(true);
      expect(validateRole('admin')).toBe(false);
    });
  });

  describe('validateRegisterInput', () => {
    it('handles invalid inputs', () => {
      const res = validateRegisterInput({ email: 'bad', password: 123, role: 'invalid' });
      expect(res.valid).toBe(false);
      expect(res.errors).toHaveLength(3);
    });

    it('handles weak password', () => {
      const res = validateRegisterInput({ email: 'test@example.com', password: 'weak', role: 'freelancer' });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'password')).toBe(true);
    });
  });

  describe('validateLoginInput', () => {
    it('handles invalid login input', () => {
      const res = validateLoginInput({ email: 'bad', password: '' });
      expect(res.valid).toBe(false);
      expect(res.errors).toHaveLength(2);
    });
  });

  describe('validatePasswordResetInput', () => {
    it('handles userId present (line 119)', () => {
      const res = validatePasswordResetInput({
        secret: 'my-secret',
        userId: 'user-xyz',
        password: 'ValidPassword123!',
      });
      expect(res.valid).toBe(true);
      expect(res.userId).toBe('user-xyz');
      expect(res.secret).toBe('my-secret');
    });

    it('handles accessToken fallback and weak password', () => {
      const res = validatePasswordResetInput({
        accessToken: 'access-token',
        password: 'weak',
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'password')).toBe(true);
    });

    it('handles missing secret and missing password', () => {
      const res = validatePasswordResetInput({});
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'secret')).toBe(true);
      expect(res.errors.some((e) => e.field === 'password')).toBe(true);
    });

    it('falls back to an empty object when the body is null', () => {
      const res = validatePasswordResetInput(null);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'secret')).toBe(true);
      expect(res.errors.some((e) => e.field === 'password')).toBe(true);
    });
  });

  describe('validateChangePasswordInput', () => {
    it('handles missing newPassword (line 143)', () => {
      const res = validateChangePasswordInput({
        currentPassword: 'OldPassword123!',
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toEqual(
        expect.arrayContaining([{ field: 'newPassword', message: 'Enter a new password.' }])
      );
    });

    it('handles weak newPassword (line 140)', () => {
      const res = validateChangePasswordInput({
        currentPassword: 'OldPassword123!',
        newPassword: 'short',
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'newPassword')).toBe(true);
    });

    it('handles missing currentPassword and same password', () => {
      const missingCurrent = validateChangePasswordInput({
        newPassword: 'NewPassword123!',
      });
      expect(missingCurrent.valid).toBe(false);

      const same = validateChangePasswordInput({
        currentPassword: 'Password123!',
        newPassword: 'Password123!',
      });
      expect(same.valid).toBe(false);
      expect(same.errors.some((e) => e.message.includes('must be different'))).toBe(true);
    });

    it('handles valid change password input', () => {
      const res = validateChangePasswordInput({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      });
      expect(res.valid).toBe(true);
      expect(res.currentPassword).toBe('OldPassword123!');
      expect(res.newPassword).toBe('NewPassword123!');
    });

    it('falls back to an empty object when the body is null', () => {
      const res = validateChangePasswordInput(null);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'currentPassword')).toBe(true);
      expect(res.errors.some((e) => e.field === 'newPassword')).toBe(true);
    });
  });
});
