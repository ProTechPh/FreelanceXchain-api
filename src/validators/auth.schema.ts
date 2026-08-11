/**
 * Auth request validation helpers.
 *
 * Extracted from auth-routes so route files stay thin and the validation rules
 * are unit-testable in isolation (per backend layering guidelines).
 */
import type { UserRole } from '../models/user.js';
import type { RegisterInput, LoginInput } from '../services/auth-types.js';
import { validatePasswordStrength } from '../services/auth-service.js';

export const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

export type ValidationError = { field: string; message: string };

/**
 * Validate email format
 * Now checks for proper local@domain.tld format with maximum length
 */
export function validateEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  if (email.length < 5 || email.length > 254) return false;
  // RFC 5322 simplified: local-part@domain.tld
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateRole(role: unknown): role is UserRole {
  return role === 'freelancer' || role === 'employer';
}

export function validateRegisterInput(body: unknown): { valid: boolean; errors: ValidationError[]; input?: RegisterInput } {
  const { email, password, role } = body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!validateEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  if (typeof password === 'string') {
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      passwordValidation.errors.forEach(err => errors.push({ field: 'password', message: err }));
    }
  } else {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (!validateRole(role)) {
    errors.push({ field: 'role', message: 'Role must be freelancer or employer' });
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], input: { email: email as string, password: password as string, role: role as UserRole } };
}

export function validateLoginInput(body: unknown): { valid: boolean; errors: ValidationError[]; input?: LoginInput } {
  const { email, password } = body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!validateEmail(email)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }
  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], input: { email: email as string, password: password as string } };
}

export function validatePasswordResetInput(body: unknown): { valid: boolean; errors: ValidationError[]; accessToken?: string; password?: string } {
  const { accessToken, password } = body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (!accessToken || typeof accessToken !== 'string') {
    errors.push({ field: 'accessToken', message: 'Access token is required' });
  }

  if (typeof password === 'string') {
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      passwordValidation.errors.forEach(err => errors.push({ field: 'password', message: err }));
    }
  } else {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], accessToken: accessToken as string, password: password as string };
}
