import { UserRole } from '../models/user.js';
import type { PlanTier, SubscriptionStatus } from '../models/subscription.js';

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
    name?: string;
    email: string;
    role: UserRole;
    walletAddress: string;
    kycStatus?: string;
    createdAt: string;
    authProvider?: 'email' | 'oauth';
    emailVerification?: boolean;
    /**
     * Billing entitlement, computed server-side. The frontend gates on THIS,
     * never on the raw Stripe status, so a grace period stays a server
     * decision. Optional so an older client still type-checks.
     */
    plan?: PlanTier;
    planStatus?: SubscriptionStatus;
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
  | 'MFA_VERIFY_FAILED'
  | 'UPDATE_FAILED'
  | 'ACTIVE_CONTRACTS_EXIST'
  | 'DELETE_FAILED'
  | 'EMAIL_NOT_VERIFIED'
  | 'WALLET_LOCKED'
  | 'REQUEST_FAILED'
  | 'INVALID_CONFIRMATION_CODE'
  | 'MAX_ATTEMPTS_EXCEEDED'
  | 'CONFIRMATION_REQUIRED'
  | 'CONFIRMATION_CODE_REQUIRED';
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
