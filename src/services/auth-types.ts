import { UserRole } from '../models/user.js';

export type RegisterInput = {
  email: string;
  password: string;
  role: UserRole;
  walletAddress?: string;
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
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'MFA_ENROLLMENT_FAILED'
  | 'MFA_VERIFICATION_FAILED'
  | 'MFA_CHALLENGE_FAILED'
  | 'MFA_LIST_FAILED'
  | 'MFA_DISABLE_FAILED';
  message: string;
};
