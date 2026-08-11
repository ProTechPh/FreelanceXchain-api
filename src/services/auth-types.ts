import { UserRole } from '../models/user.js';

export type RegisterInput = {
  email: string;
  password: string;
  role: UserRole;
};

export type LoginInput = {
  email: string;
  password: string;
};









export type TokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
};

export type AuthResult = {
  user: {
    id: string;
    email: string;
    role: UserRole;
    walletAddress: string;
    kycStatus?: string;
    createdAt: string;
    authProvider?: 'email' | 'oauth';
  };
  accessToken: string;
  refreshToken: string;
};

export type AuthError = {
  code:
  | 'DUPLICATE_EMAIL'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'INVALID_TOKEN'
  | 'AUTH_EXCHANGE_FAILED'
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_REQUIRE_REGISTRATION'
  | 'USER_NOT_FOUND'
  | 'USER_SUSPENDED'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'MFA_ENROLLMENT_FAILED'
  | 'MFA_VERIFICATION_FAILED'
  | 'MFA_CHALLENGE_FAILED'
  | 'MFA_LIST_FAILED'
  | 'MFA_DISABLE_FAILED'
  | 'MFA_REQUIRED'
  | 'MFA_CODE_REQUIRED'
  | 'MFA_VERIFY_FAILED';
  message: string;
};

export type MfaRequiredResult = {
  code: 'MFA_REQUIRED';
  message: string;
  mfaRequired: true;
  /** Session token for MFA completion only — not a fully authenticated token */
  mfaSessionToken: string;
};

export type AuthResponse = AuthResult | AuthError | MfaRequiredResult;

/**
 * Type guard: returns true if the result is an AuthError (has code/message, no user/success).
 */
export function isAuthError(result: unknown): result is AuthError {
  return (
    result !== null &&
    typeof result === 'object' &&
    'code' in result &&
    'message' in result &&
    !('user' in result) &&
    !('success' in result)
  );
}
