/**
 * Shared validation functions.
 * Extracted from route handlers to enforce DRY and single-responsibility.
 */

import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './constants.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ValidationError = {
  field: string;
  message: string;
};

// ── Email ─────────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MIN_LENGTH = 5;
const EMAIL_MAX_LENGTH = 254;

/**
 * Validate email format.
 * Checks for proper `local@domain.tld` format with RFC 5322 length limits.
 */
export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  if (email.length < EMAIL_MIN_LENGTH || email.length > EMAIL_MAX_LENGTH) return false;
  return EMAIL_REGEX.test(email);
}

// ── Password ──────────────────────────────────────────────────────────────────

export type PasswordValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validate password strength.
 * Requirements: min 8 chars, max 72 chars, uppercase, lowercase, number, special char.
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[@$!%*?&]/.test(password)) {
    errors.push('Password must contain at least one special character (@$!%*?&)');
  }

  return { valid: errors.length === 0, errors };
}

// ── Role ──────────────────────────────────────────────────────────────────────

type UserRole = 'freelancer' | 'employer';

/**
 * Validate that a value is a valid user role.
 */
export function isValidRole(role: unknown): role is UserRole {
  return role === 'freelancer' || role === 'employer';
}

// ── Wallet Address ────────────────────────────────────────────────────────────

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Validate Ethereum wallet address format.
 */
export function isValidWalletAddress(address: unknown): address is string {
  return typeof address === 'string' && WALLET_REGEX.test(address);
}

// ── UUID ──────────────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID v4 format.
 */
export function isValidUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

// ── Rating ────────────────────────────────────────────────────────────────────

/**
 * Validate that a rating is an integer between 1 and 5.
 */
export function isValidRating(rating: unknown): rating is number {
  return typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

// ── Composite Validators ──────────────────────────────────────────────────────

/**
 * Validate register input fields and return all errors at once.
 */
export function validateRegisterInput(
  email: unknown,
  password: unknown,
  role: unknown
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isValidEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  if (typeof password === 'string') {
    const result = validatePasswordStrength(password);
    if (!result.valid) {
      result.errors.forEach(msg => errors.push({ field: 'password', message: msg }));
    }
  } else {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (!isValidRole(role)) {
    errors.push({ field: 'role', message: 'Role must be freelancer or employer' });
  }

  return errors;
}

/**
 * Validate login input fields.
 */
export function validateLoginInput(
  email: unknown,
  password: unknown
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isValidEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }
  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  return errors;
}
