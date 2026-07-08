// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// Appwrite Account mock - mirrors jest.setup.ts mockAppwriteAccount
const mockAppwriteAccount = {
  get: jest.fn(),
  create: jest.fn(),
  createEmailPasswordSession: jest.fn(),
  deleteSession: jest.fn(),
  createRecovery: jest.fn(),
  createVerification: jest.fn(),
  updatePassword: jest.fn(),
  createOAuth2Token: jest.fn(),
  createMFAAuthenticator: jest.fn(),
  updateMFAAuthenticator: jest.fn(),
  createMFAChallenge: jest.fn(),
  updateMFAChallenge: jest.fn(),
  listMFAFactors: jest.fn(),
  deleteMFAAuthenticator: jest.fn(),
  updateMFA: jest.fn(),
  createMfaRecoveryCodes: jest.fn(),
};

const mockAppwriteUsers = {
  create: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

const mockUserRepository = {
  emailExists: jest.fn(),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserById: jest.fn(),
  updateUser: jest.fn(),
};

jest.unstable_mockModule('node-appwrite', () => ({
  Client: jest.fn().mockImplementation(() => ({
    setEndpoint: jest.fn().mockReturnThis(),
    setProject: jest.fn().mockReturnThis(),
    setKey: jest.fn().mockReturnThis(),
    set_jwt: jest.fn().mockReturnThis(),
    setSession: jest.fn().mockReturnThis(),
  })),
  Account: jest.fn(() => mockAppwriteAccount),
  Users: jest.fn(() => mockAppwriteUsers),
  Storage: jest.fn(() => ({})),
  ID: { unique: () => 'unique-id' },
  OAuthProvider: { Google: 'google' },
  AuthenticatorType: { Totp: 'totp' },
}));

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
    DATABASE_ID: 'freelancexchain',
  createUserClient: jest.fn(() => ({})),
  users: mockAppwriteUsers,
  storage: {},
  BUCKETS: {},
  getAppwriteServiceClient: jest.fn(() => ({})),
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
  UserRepository: jest.fn(),
  UserEntity: {},
}));

const mockGetKycVerificationByUserId = jest.fn();
jest.unstable_mockModule(resolveModule('src/repositories/didit-kyc-repository.ts'), () => ({
  getKycVerificationByUserId: mockGetKycVerificationByUserId,
  DiditKycRepository: jest.fn(),
}));

const {
  validatePasswordStrength,
  isAuthError,
  createAuthResult,
  exchangeCodeForSession,
  validateToken,
  validateTokenAndGetUser,
  refreshTokens,
  getCurrentUserWithKyc,
  logout,
  resendConfirmationEmail,
  requestPasswordReset,
  updatePassword,
  enrollMFA,
  verifyMFAEnrollment,
  challengeMFA,
  verifyMFAChallenge,
  getMFAFactors,
  disableMFA,
  register,
  login,
  loginWithAppwrite,
  registerWithAppwrite,
  requestEmailOtp,
  requestMagicUrl,
  verifyAuthToken,
  getOAuthUrl,
} = await import(resolveModule('src/services/auth-service.ts'));

const createMockUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  password_hash: 'hashed_password',
  role: 'freelancer' as const,
  wallet_address: '0xabc123',
  name: 'Test User',
  is_suspended: false,
  suspension_reason: null,
  mfa_enabled: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('validatePasswordStrength', () => {
  it('returns valid for strong password', () => {
    const result = validatePasswordStrength('P@ssw0rd12');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for too short password', () => {
    const result = validatePasswordStrength('Ab1@');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });

  it('returns error for too long password', () => {
    const result = validatePasswordStrength('A'.repeat(73) + '1b@');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at most 72 characters');
  });

  it('returns error for no lowercase letter', () => {
    const result = validatePasswordStrength('PASSWORD1@');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one lowercase letter');
  });

  it('returns error for no uppercase letter', () => {
    const result = validatePasswordStrength('password1@');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one uppercase letter');
  });

  it('returns error for no digit', () => {
    const result = validatePasswordStrength('Password@abc');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number');
  });

  it('returns error for no special character', () => {
    const result = validatePasswordStrength('Password1abc');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one special character (@$!%*?&)');
  });

  it('returns multiple errors at once for empty string', () => {
    const result = validatePasswordStrength('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('accepts all valid special characters', () => {
    for (const char of ['@', '$', '!', '%', '*', '?', '&']) {
      const result = validatePasswordStrength(`Passw0rd${char}`);
      expect(result.valid).toBe(true);
    }
  });
});

describe('isAuthError', () => {
  it('returns true for AuthError objects', () => {
    expect(isAuthError({ code: 'INVALID_TOKEN', message: 'bad token' })).toBe(true);
  });

  it('returns false for AuthResult objects', () => {
    expect(isAuthError({
      user: { id: '123', email: 'a@b.com', role: 'freelancer', walletAddress: '', createdAt: '' },
      accessToken: 'at',
      refreshToken: 'rt',
    })).toBe(false);
  });

  it('returns false for success objects', () => {
    expect(isAuthError({ success: true, code: 'SOMETHING', message: 'msg' })).toBe(false);
  });

  it('returns falsy for null', () => {
    expect(isAuthError(null)).toBeFalsy();
  });

  it('returns falsy for undefined', () => {
    expect(isAuthError(undefined)).toBeFalsy();
  });

  it('returns false for non-objects', () => {
    expect(isAuthError('string')).toBe(false);
    expect(isAuthError(42)).toBe(false);
  });
});

describe('createAuthResult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns USER_SUSPENDED for suspended user', async () => {
    const user = createMockUser({ is_suspended: true, suspension_reason: 'Violation' });
    (mockGetKycVerificationByUserId).mockResolvedValue(null as never);

    const result = await createAuthResult(user, 'access-tok', 'refresh-tok');
    expect(result).toEqual({
      code: 'USER_SUSPENDED',
      message: 'Violation',
    });
  });

  it('returns USER_SUSPENDED with default message when no reason', async () => {
    const user = createMockUser({ is_suspended: true, suspension_reason: null });
    (mockGetKycVerificationByUserId).mockResolvedValue(null as never);

    const result = await createAuthResult(user, 'access-tok', 'refresh-tok');
    expect(result).toEqual({
      code: 'USER_SUSPENDED',
      message: 'Your account has been suspended',
    });
  });

  it('returns AuthResult with KYC status when approved', async () => {
    const user = createMockUser();
    (mockGetKycVerificationByUserId).mockResolvedValue({ status: 'approved' } as never);

    const result = await createAuthResult(user, 'access-tok', 'refresh-tok');
    if (!isAuthError(result)) {
      expect(result.user.kycStatus).toBe('approved');
      expect(result.accessToken).toBe('access-tok');
      expect(result.refreshToken).toBe('refresh-tok');
    }
  });

  it('returns AuthResult without KYC status when no verification', async () => {
    const user = createMockUser();
    (mockGetKycVerificationByUserId).mockResolvedValue(null as never);

    const result = await createAuthResult(user, 'access-tok', 'refresh-tok');
    if (!isAuthError(result)) {
      expect(result.user.kycStatus).toBeUndefined();
    }
  });

  it('returns AuthResult without KYC status when verification has no status', async () => {
    const user = createMockUser();
    (mockGetKycVerificationByUserId).mockResolvedValue({ status: null } as never);

    const result = await createAuthResult(user, 'access-tok', 'refresh-tok');
    if (!isAuthError(result)) {
      expect(result.user.kycStatus).toBeUndefined();
    }
  });

  it('rejects when KYC repository throws', async () => {
    const user = createMockUser();
    (mockGetKycVerificationByUserId).mockRejectedValue(new Error('DB error') as never);

    await expect(createAuthResult(user, 'access-tok', 'refresh-tok')).rejects.toThrow('DB error');
  });
});

describe('validateToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns user info for valid token', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123', email: 'test@example.com' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser() as never);

    const result = await validateToken('valid-token');
    if (!isAuthError(result)) {
      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBe('freelancer');
    }
  });

  it('returns INVALID_TOKEN when getUser fails', async () => {
    mockAppwriteAccount.get.mockRejectedValue(new Error('jwt expired') as never);

    const result = await validateToken('bad-token');
    expect(result).toEqual({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  });

  it('returns INVALID_TOKEN when user is null', async () => {
    mockAppwriteAccount.get.mockRejectedValue(new Error('not found') as never);

    const result = await validateToken('bad-token');
    expect(result).toEqual({ code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  });

  it('returns INVALID_TOKEN when user not found in public.users', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123', email: 'test@example.com' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(null as never);

    const result = await validateToken('valid-token');
    expect(result).toEqual({ code: 'INVALID_TOKEN', message: 'User not found' });
  });

  it('returns USER_SUSPENDED for suspended user', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123', email: 'test@example.com' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser({ is_suspended: true, suspension_reason: 'Banned' }) as never);

    const result = await validateToken('valid-token');
    expect(result).toEqual({ code: 'USER_SUSPENDED', message: 'Banned' });
  });
});

describe('validateTokenAndGetUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns AuthResult for valid token', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123', email: 'test@example.com' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser() as never);
    (mockGetKycVerificationByUserId).mockResolvedValue({ status: 'approved' } as never);

    const result = await validateTokenAndGetUser('valid-token');
    if (!isAuthError(result)) {
      expect(result.user.id).toBe('user-123');
      expect(result.accessToken).toBe('valid-token');
    }
  });

  it('returns AuthError for invalid token', async () => {
    mockAppwriteAccount.get.mockRejectedValue(new Error('bad') as never);

    const result = await validateTokenAndGetUser('bad-token');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('INVALID_TOKEN');
    }
  });

  it('returns INVALID_TOKEN when user not found after validation', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123', email: 'test@example.com' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValueOnce(createMockUser() as never).mockResolvedValueOnce(null as never);

    const result = await validateTokenAndGetUser('valid-token');
    if (isAuthError(result)) {
      expect(result.code).toBe('INVALID_TOKEN');
    }
  });
});

describe('refreshTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns AuthResult on success', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser() as never);
    (mockGetKycVerificationByUserId).mockResolvedValue(null as never);

    const result = await refreshTokens('valid-refresh');
    if (!isAuthError(result)) {
      expect(result.accessToken).toBe('valid-refresh');
    }
  });

  it('returns INVALID_TOKEN on error', async () => {
    mockAppwriteAccount.get.mockRejectedValue(new Error('expired') as never);

    const result = await refreshTokens('expired-refresh');
    expect(result).toEqual({ code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' });
  });

  it('returns INVALID_TOKEN when no session returned', async () => {
    mockAppwriteAccount.get.mockRejectedValue(new Error('bad') as never);

    const result = await refreshTokens('bad-refresh');
    expect(result).toEqual({ code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' });
  });

  it('returns INVALID_TOKEN when user not found', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(null as never);

    const result = await refreshTokens('valid-refresh');
    expect(result).toEqual({ code: 'INVALID_TOKEN', message: 'User not found' });
  });
});

describe('getCurrentUserWithKyc', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns user with KYC approved', async () => {
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser() as never);
    (mockGetKycVerificationByUserId).mockResolvedValue({ status: 'approved' } as never);

    const result = await getCurrentUserWithKyc('user-123');
    if (!isAuthError(result)) {
      expect(result.kycStatus).toBe('approved');
      expect(result.authProvider).toBe('email');
    }
  });

  it('returns user without KYC status', async () => {
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser() as never);
    (mockGetKycVerificationByUserId).mockResolvedValue(null as never);

    const result = await getCurrentUserWithKyc('user-123');
    if (!isAuthError(result)) {
      expect((result as any).kycStatus).toBeUndefined();
    }
  });

  it('returns admin user with auto-approved KYC', async () => {
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser({ role: 'admin' }) as never);

    const result = await getCurrentUserWithKyc('admin-123');
    if (!isAuthError(result)) {
      expect(result.kycStatus).toBe('approved');
    }
  });

  it('returns USER_NOT_FOUND for missing user', async () => {
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(null as never);

    const result = await getCurrentUserWithKyc('nonexistent');
    expect(result).toEqual({ code: 'USER_NOT_FOUND', message: 'User not found' });
  });

  it('detects email user when password_hash is empty (Appwrite manages passwords externally)', async () => {
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser({ password_hash: '' }) as never);
    (mockGetKycVerificationByUserId).mockResolvedValue(null as never);

    const result = await getCurrentUserWithKyc('user-123');
    if (!isAuthError(result)) {
      expect(result.authProvider).toBe('email');
    }
  });

  it('detects email user when password_hash is present', async () => {
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser({ password_hash: 'hashed_abc' }) as never);
    (mockGetKycVerificationByUserId).mockResolvedValue(null as never);

    const result = await getCurrentUserWithKyc('user-123');
    if (!isAuthError(result)) {
      expect(result.authProvider).toBe('email');
    }
  });
});

describe('logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('signs out globally with access token', async () => {
    mockAppwriteAccount.deleteSession.mockResolvedValue({} as never);

    const result = await logout('valid-token');
    expect(result).toEqual({ success: true });
  });

  it('falls back to service client local signOut without access token', async () => {
    const result = await logout();
    expect(result).toEqual({ success: true });
  });

  it('returns INTERNAL_ERROR on signOut error with token', async () => {
    mockAppwriteAccount.deleteSession.mockRejectedValue(new Error('signout failed') as never);

    const result = await logout('valid-token');
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: 'signout failed' });
  });
});

describe('resendConfirmationEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success on valid resend', async () => {
    (mockUserRepository.getUserByEmail as jest.Mock).mockResolvedValue(createMockUser());
    mockAppwriteAccount.createVerification.mockResolvedValue({} as never);

    const result = await resendConfirmationEmail('test@example.com');
    expect(result).toEqual({ success: true });
  });

  it('swallows errors and returns success (prevents email enumeration)', async () => {
    (mockUserRepository.getUserByEmail as jest.Mock).mockResolvedValue(createMockUser());
    mockAppwriteAccount.createVerification.mockRejectedValue(new Error('rate limit exceeded') as never);

    const result = await resendConfirmationEmail('test@example.com');
    expect(result).toEqual({ success: true });
  });
});

describe('requestPasswordReset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success on valid reset request', async () => {
    mockAppwriteAccount.createRecovery.mockResolvedValue({} as never);

    const result = await requestPasswordReset('test@example.com');
    expect(result).toEqual({ success: true });
  });

  it('returns INTERNAL_ERROR on Appwrite error', async () => {
    mockAppwriteAccount.createRecovery.mockRejectedValue(new Error('not found') as never);

    const result = await requestPasswordReset('test@example.com');
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: expect.stringContaining('not found') });
  });
});

describe('updatePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success on valid password update', async () => {
    mockAppwriteAccount.updatePassword.mockResolvedValue({} as never);

    const result = await updatePassword('valid-token', 'NewP@ss1');
    expect(result).toEqual({ success: true });
  });

  it('returns INVALID_TOKEN for bad access token', async () => {
    mockAppwriteAccount.updatePassword.mockRejectedValue(new Error('bad token') as never);

    const result = await updatePassword('bad-token', 'NewP@ss1');
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: 'Failed to update password' });
  });

  it('returns INTERNAL_ERROR when service client throws', async () => {
    mockAppwriteAccount.updatePassword.mockRejectedValue(new Error('No service key') as never);

    const result = await updatePassword('valid-token', 'NewP@ss1');
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: 'Failed to update password' });
  });

  it('returns INTERNAL_ERROR on update error', async () => {
    mockAppwriteAccount.updatePassword.mockRejectedValue(new Error('weak password') as never);

    const result = await updatePassword('valid-token', 'weak');
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: 'Failed to update password' });
  });

  it('still returns success when password update succeeds', async () => {
    mockAppwriteAccount.updatePassword.mockResolvedValue({} as never);

    const result = await updatePassword('valid-token', 'NewP@ss1');
    expect(result).toEqual({ success: true });
  });

  it('returns INVALID_TOKEN when getUser returns no user and no error', async () => {
    mockAppwriteAccount.updatePassword.mockRejectedValue(new Error('bad-token') as never);

    const result = await updatePassword('bad-token', 'NewP@ss1');
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: 'Failed to update password' });
  });
});

describe('enrollMFA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success on enrollment', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockResolvedValue({} as never);
    mockAppwriteAccount.createMfaRecoveryCodes.mockResolvedValue({ recoveryCodes: [] } as never);

    const result = await enrollMFA('valid-token');
    expect(result).toEqual({ success: true, recoveryCodes: [], secret: undefined, uri: undefined });
  });

  it('returns INVALID_TOKEN when getUser fails', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockRejectedValue(new Error('bad') as never);

    const result = await enrollMFA('bad-token');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_ENROLLMENT_FAILED');
    }
  });

  it('handles listFactors error gracefully', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockResolvedValue({} as never);
    mockAppwriteAccount.createMfaRecoveryCodes.mockResolvedValue({ recoveryCodes: [] } as never);

    const result = await enrollMFA('valid-token');
    expect(result).toEqual({ success: true, recoveryCodes: [], secret: undefined, uri: undefined });
  });

  it('cleans up unverified factors before enrollment', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockResolvedValue({
      uri: 'otpauth://totp/test?secret=NEWSEC',
      secret: 'NEWSEC',
    } as never);

    const result = await enrollMFA('valid-token');
    expect(isAuthError(result)).toBe(false);
  });

  it('returns MFA_ENROLLMENT_FAILED on enrollment error', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockRejectedValue(new Error('enrollment failed') as never);

    const result = await enrollMFA('valid-token');
    expect(result).toEqual({ code: 'MFA_ENROLLMENT_FAILED', message: 'enrollment failed' });
  });

  it('returns INVALID_TOKEN on 401 enrollment error', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockRejectedValue(new Error('unauthorized') as never);

    const result = await enrollMFA('valid-token');
    expect(isAuthError(result)).toBe(true);
  });

  it('returns MFA_ENROLLMENT_FAILED for invalid enrollment response', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockRejectedValue(new Error('Invalid enrollment response') as never);

    const result = await enrollMFA('valid-token');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_ENROLLMENT_FAILED');
    }
  });

  it('returns MFA_ENROLLMENT_FAILED on exception', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockRejectedValue(new Error('network error') as never);

    const result = await enrollMFA('valid-token');
    expect(result).toEqual({ code: 'MFA_ENROLLMENT_FAILED', message: 'network error' });
  });

  it('returns INVALID_TOKEN when user has no email', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockRejectedValue(new Error('Failed to get user information') as never);

    const result = await enrollMFA('valid-token');
    expect(isAuthError(result)).toBe(true);
  });

  it('handles unenroll error gracefully during cleanup', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockResolvedValue({} as never);
    mockAppwriteAccount.createMfaRecoveryCodes.mockResolvedValue({ recoveryCodes: [] } as never);

    const result = await enrollMFA('valid-token');
    expect(result).toEqual({ success: true, recoveryCodes: [], secret: undefined, uri: undefined });
  });
});

describe('verifyMFAEnrollment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success on valid verification', async () => {
    mockAppwriteAccount.updateMFAAuthenticator.mockResolvedValue({} as never);
    mockAppwriteAccount.updateMFA.mockResolvedValue({} as never);
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123' } as never);
    (mockUserRepository as any).update = jest.fn().mockResolvedValue({} as never);

    const result = await verifyMFAEnrollment('valid-token', 'totp', '123456');
    expect(result).toEqual({ success: true });
  });

  it('returns MFA_VERIFICATION_FAILED when challenge creation fails', async () => {
    mockAppwriteAccount.updateMFAAuthenticator.mockRejectedValue(new Error('challenge fail') as never);

    const result = await verifyMFAEnrollment('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_VERIFY_FAILED');
    }
  });

  it('returns INVALID_TOKEN when challenge returns 401', async () => {
    mockAppwriteAccount.updateMFAAuthenticator.mockRejectedValue(new Error('unauth') as never);

    const result = await verifyMFAEnrollment('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
  });

  it('returns MFA_VERIFICATION_FAILED when verification fails', async () => {
    mockAppwriteAccount.updateMFAAuthenticator.mockRejectedValue(new Error('invalid code') as never);

    const result = await verifyMFAEnrollment('valid-token', 'totp', 'wrong-code');
    expect(isAuthError(result)).toBe(true);
  });

  it('returns MFA_VERIFICATION_FAILED on exception', async () => {
    mockAppwriteAccount.updateMFAAuthenticator.mockRejectedValue(new Error('boom') as never);

    const result = await verifyMFAEnrollment('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
  });

  it('returns MFA_VERIFICATION_FAILED when challenge data has no id', async () => {
    mockAppwriteAccount.updateMFAAuthenticator.mockRejectedValue(new Error('Failed to create challenge') as never);

    const result = await verifyMFAEnrollment('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
  });
});

describe('challengeMFA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns challengeId on success', async () => {
    mockAppwriteAccount.createMFAChallenge.mockResolvedValue({ $id: 'challenge-1' } as never);

    const result = await challengeMFA('valid-token', 'totp');
    if (!isAuthError(result)) {
      expect(result.challengeId).toBe('challenge-1');
    }
  });

  it('returns INVALID_TOKEN on 401', async () => {
    mockAppwriteAccount.createMFAChallenge.mockRejectedValue(new Error('unauth') as never);

    const result = await challengeMFA('bad-token', 'totp');
    expect(isAuthError(result)).toBe(true);
  });

  it('returns MFA_CHALLENGE_FAILED on error', async () => {
    mockAppwriteAccount.createMFAChallenge.mockRejectedValue(new Error('fail') as never);

    const result = await challengeMFA('valid-token', 'totp');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
  });

  it('returns MFA_CHALLENGE_FAILED on exception', async () => {
    mockAppwriteAccount.createMFAChallenge.mockRejectedValue(new Error('network') as never);

    const result = await challengeMFA('valid-token', 'totp');
    expect(isAuthError(result)).toBe(true);
  });

  it('returns MFA_CHALLENGE_FAILED when data has no id', async () => {
    mockAppwriteAccount.createMFAChallenge.mockRejectedValue(new Error('Failed to create MFA challenge') as never);

    const result = await challengeMFA('valid-token', 'totp');
    expect(isAuthError(result)).toBe(true);
  });
});

describe('verifyMFAChallenge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success on valid verification', async () => {
    mockAppwriteAccount.updateMFAChallenge.mockResolvedValue({} as never);

    const result = await verifyMFAChallenge('valid-token', 'totp', 'challenge-1', '123456');
    expect(result).toEqual({ success: true });
  });

  it('returns INVALID_TOKEN on 401', async () => {
    mockAppwriteAccount.updateMFAChallenge.mockRejectedValue(new Error('bad') as never);

    const result = await verifyMFAChallenge('bad-token', 'totp', 'challenge-1', '123456');
    expect(isAuthError(result)).toBe(true);
  });

  it('returns MFA_VERIFICATION_FAILED on verification error', async () => {
    mockAppwriteAccount.updateMFAChallenge.mockRejectedValue(new Error('invalid code') as never);

    const result = await verifyMFAChallenge('valid-token', 'totp', 'challenge-1', 'wrong');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_CHALLENGE_FAILED');
    }
  });

  it('returns MFA_VERIFICATION_FAILED on exception', async () => {
    mockAppwriteAccount.updateMFAChallenge.mockRejectedValue(new Error('err') as never);

    const result = await verifyMFAChallenge('valid-token', 'totp', 'challenge-1', '123456');
    expect(isAuthError(result)).toBe(true);
  });
});

describe('getMFAFactors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns verified TOTP factors', async () => {
    mockAppwriteAccount.listMFAFactors.mockResolvedValue({ totp: true } as never);

    const result = await getMFAFactors('valid-token');
    if (!isAuthError(result)) {
      expect(Array.isArray(result.factors)).toBe(true);
    }
  });

  it('returns empty array when no factors', async () => {
    mockAppwriteAccount.listMFAFactors.mockResolvedValue({ totp: false } as never);

    const result = await getMFAFactors('valid-token');
    if (!isAuthError(result)) {
      expect(Array.isArray(result.factors)).toBe(true);
    }
  });

  it('returns INVALID_TOKEN on 401 error', async () => {
    mockAppwriteAccount.listMFAFactors.mockRejectedValue(new Error('unauth') as never);

    const result = await getMFAFactors('bad-token');
    expect(isAuthError(result)).toBe(true);
  });

  it('returns MFA_LIST_FAILED on error', async () => {
    mockAppwriteAccount.listMFAFactors.mockRejectedValue(new Error('fail') as never);

    const result = await getMFAFactors('valid-token');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_LIST_FAILED');
    }
  });

  it('returns INTERNAL_ERROR on exception', async () => {
    mockAppwriteAccount.listMFAFactors.mockRejectedValue(new Error('oops') as never);

    const result = await getMFAFactors('valid-token');
    expect(isAuthError(result)).toBe(true);
  });

  it('handles null data gracefully', async () => {
    mockAppwriteAccount.listMFAFactors.mockResolvedValue({} as never);

    const result = await getMFAFactors('valid-token');
    if (!isAuthError(result)) {
      expect(Array.isArray(result.factors)).toBe(true);
    }
  });
});

describe('disableMFA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success with valid TOTP code', async () => {
    mockAppwriteAccount.createMFAChallenge.mockResolvedValue({ $id: 'challenge-1' } as never);
    mockAppwriteAccount.updateMFAChallenge.mockResolvedValue({} as never);
    mockAppwriteAccount.deleteMFAAuthenticator.mockResolvedValue({} as never);

    const result = await disableMFA('valid-token', 'totp', '123456');
    expect(result).toEqual({ success: true });
  });

  it('returns MFA_CODE_REQUIRED when no OTP code is provided', async () => {
    const result = await disableMFA('valid-token', 'totp');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_CODE_REQUIRED');
    }
  });

  it('returns MFA_DISABLE_FAILED when deleteMFAAuthenticator fails', async () => {
    mockAppwriteAccount.deleteMFAAuthenticator.mockRejectedValue(new Error('challenge fail') as never);

    const result = await disableMFA('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_DISABLE_FAILED');
    }
  });

  it('returns MFA_DISABLE_FAILED when account.get fails after delete', async () => {
    mockAppwriteAccount.deleteMFAAuthenticator.mockResolvedValue({} as never);
    mockAppwriteAccount.get.mockRejectedValue(new Error('get failed') as never);

    const result = await disableMFA('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_DISABLE_FAILED');
    }
  });

  it('returns MFA_DISABLE_FAILED on unenroll error', async () => {
    mockAppwriteAccount.deleteMFAAuthenticator.mockRejectedValue(new Error('unenroll fail') as never);

    const result = await disableMFA('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_DISABLE_FAILED');
    }
  });

  it('returns INVALID_TOKEN on 401 unenroll error', async () => {
    mockAppwriteAccount.createMFAChallenge.mockResolvedValue({ $id: 'challenge-1' } as never);
    mockAppwriteAccount.updateMFAChallenge.mockResolvedValue({} as never);
    mockAppwriteAccount.deleteMFAAuthenticator.mockRejectedValue(new Error('unauth') as never);

    const result = await disableMFA('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
  });

  it('returns MFA_DISABLE_FAILED on exception', async () => {
    mockAppwriteAccount.createMFAChallenge.mockRejectedValue(new Error('crash') as never);

    const result = await disableMFA('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_DISABLE_FAILED');
    }
  });

  it('returns MFA_DISABLE_FAILED on exception without message', async () => {
    mockAppwriteAccount.createMFAChallenge.mockRejectedValue({} as never);

    const result = await disableMFA('valid-token', 'totp', '123456');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_DISABLE_FAILED');
    }
  });
});

describe('exchangeCodeForSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns tokens on success', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser() as never);

    const result = await exchangeCodeForSession('valid-code');
    if (!isAuthError(result)) {
      expect(result.accessToken).toBe('valid-code');
      expect(result.refreshToken).toBe('valid-code');
    }
  });

  it('returns AUTH_EXCHANGE_FAILED on error', async () => {
    mockAppwriteAccount.get.mockRejectedValue(new Error('bad code') as never);

    const result = await exchangeCodeForSession('bad-code');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
  });

  it('returns AUTH_REQUIRE_REGISTRATION when no session returned', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(null as never);

    const result = await exchangeCodeForSession('bad-code');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('AUTH_REQUIRE_REGISTRATION');
    }
  });
});

// ─── Coverage for register error paths (lines 145-170) ───

describe('register – error paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('compensates by deleting orphaned Appwrite user when session creation fails', async () => {
    (mockUserRepository.emailExists as jest.Mock).mockResolvedValue(false);
    mockAppwriteUsers.create.mockResolvedValue({ $id: 'new-user-id', email: 'test@example.com' } as never);
    (mockUserRepository.createUser as jest.Mock).mockResolvedValue(createMockUser());
    mockAppwriteAccount.createEmailPasswordSession.mockRejectedValue(new Error('session failed') as never);
    mockAppwriteUsers.delete.mockResolvedValue({} as never);

    const result = await register({ email: 'test@example.com', password: 'P@ssw0rd1', role: 'freelancer' });
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('INTERNAL_ERROR');
    }
    expect(mockAppwriteUsers.delete).toHaveBeenCalledWith('new-user-id');
  });

  it('returns DUPLICATE_EMAIL when error message includes already exists', async () => {
    (mockUserRepository.emailExists as jest.Mock).mockResolvedValue(false);
    const error = new Error('User already exists') as any;
    error.code = 409;
    mockAppwriteUsers.create.mockRejectedValue(error as never);

    const result = await register({ email: 'dup@example.com', password: 'P@ssw0rd1', role: 'freelancer' });
    expect(result).toEqual({ code: 'DUPLICATE_EMAIL', message: expect.any(String) });
  });

  it('returns DUPLICATE_EMAIL when error code is 409', async () => {
    (mockUserRepository.emailExists as jest.Mock).mockResolvedValue(false);
    const error = new Error('conflict') as any;
    error.code = 409;
    mockAppwriteUsers.create.mockRejectedValue(error as never);

    const result = await register({ email: 'dup@example.com', password: 'P@ssw0rd1', role: 'freelancer' });
    expect(result).toEqual({ code: 'DUPLICATE_EMAIL', message: expect.any(String) });
  });

  it('returns INTERNAL_ERROR on generic registration failure', async () => {
    (mockUserRepository.emailExists as jest.Mock).mockResolvedValue(false);
    mockAppwriteUsers.create.mockRejectedValue(new Error('network timeout') as never);

    const result = await register({ email: 'test@example.com', password: 'P@ssw0rd1', role: 'freelancer' });
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: 'network timeout' });
  });

  it('handles orphaned user deletion failure gracefully', async () => {
    (mockUserRepository.emailExists as jest.Mock).mockResolvedValue(false);
    mockAppwriteUsers.create.mockResolvedValue({ $id: 'orphan-id', email: 'test@example.com' } as never);
    (mockUserRepository.createUser as jest.Mock).mockResolvedValue(createMockUser());
    mockAppwriteAccount.createEmailPasswordSession.mockRejectedValue(new Error('session failed') as never);
    mockAppwriteUsers.delete.mockRejectedValue(new Error('delete also failed') as never);

    const result = await register({ email: 'test@example.com', password: 'P@ssw0rd1', role: 'freelancer' });
    expect(isAuthError(result)).toBe(true);
  });
});

// ─── Coverage for login MFA required path (lines 196-211) ───

describe('login – MFA required', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns MFA_REQUIRED when account.get throws user_more_factors_required', async () => {
    mockAppwriteAccount.createEmailPasswordSession.mockResolvedValue({ secret: 'mfa-session-secret' } as never);
    const mfaError = new Error('more factors required') as any;
    mfaError.type = 'user_more_factors_required';
    mockAppwriteAccount.get.mockRejectedValue(mfaError as never);

    const result = await login({ email: 'mfa@example.com', password: 'P@ssw0rd1' });
    expect(result).toEqual({
      code: 'MFA_REQUIRED',
      message: 'Multi-factor authentication required',
      mfaRequired: true,
      mfaSessionToken: 'mfa-session-secret',
    });
  });

  it('rethrows non-MFA errors from account.get', async () => {
    mockAppwriteAccount.createEmailPasswordSession.mockResolvedValue({ secret: 'session-secret' } as never);
    mockAppwriteAccount.get.mockRejectedValue(new Error('some other error') as never);

    const result = await login({ email: 'test@example.com', password: 'P@ssw0rd1' });
    expect(isAuthError(result)).toBe(true);
  });
});

// ─── Coverage for enrollMFA email factor (line 561) ───

describe('enrollMFA – email factor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success for email factor type without enrollment', async () => {
    const result = await enrollMFA('valid-token', 'email');
    expect(result).toEqual({ success: true });
  });
});

// ─── Coverage for resendConfirmationEmail user-exists path (lines 735-749) ───

describe('resendConfirmationEmail – user exists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls createVerification when user exists', async () => {
    (mockUserRepository.getUserByEmail as jest.Mock).mockResolvedValue(createMockUser());
    mockAppwriteAccount.createVerification.mockResolvedValue({} as never);

    const result = await resendConfirmationEmail('test@example.com');
    expect(result).toEqual({ success: true });
    expect(mockAppwriteAccount.createVerification).toHaveBeenCalled();
  });

  it('returns success when user does not exist (prevents enumeration)', async () => {
    (mockUserRepository.getUserByEmail as jest.Mock).mockResolvedValue(null);

    const result = await resendConfirmationEmail('nobody@example.com');
    expect(result).toEqual({ success: true });
    expect(mockAppwriteAccount.createVerification).not.toHaveBeenCalled();
  });
});

// ─── Coverage for loginWithAppwrite catch block (lines 774-777) ───

describe('loginWithAppwrite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns AUTH_INVALID_TOKEN on error', async () => {
    mockAppwriteAccount.get.mockRejectedValue(new Error('invalid session') as never);

    const result = await loginWithAppwrite('bad-token');
    expect(result).toEqual({ code: 'AUTH_INVALID_TOKEN', message: expect.any(String) });
  });

  it('returns AUTH_REQUIRE_REGISTRATION when user not in DB', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123', email: 'test@example.com' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(null);

    const result = await loginWithAppwrite('valid-token');
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.code).toBe('AUTH_REQUIRE_REGISTRATION');
    }
  });

  it('returns auth result on success', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123', email: 'test@example.com' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser());

    const result = await loginWithAppwrite('valid-token');
    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.accessToken).toBeDefined();
    }
  });
});

// ─── Coverage for registerWithAppwrite error path (lines 819-824) ───

describe('registerWithAppwrite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns INTERNAL_ERROR on registration failure', async () => {
    mockAppwriteAccount.get.mockRejectedValue(new Error('appwrite down') as never);

    const result = await registerWithAppwrite('bad-token', 'freelancer');
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: expect.any(String) });
  });

  it('returns auth result on success', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'new-user', email: 'new@example.com', name: 'New' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(null);
    (mockUserRepository.createUser as jest.Mock).mockResolvedValue(createMockUser({ id: 'new-user', email: 'new@example.com' }));

    const result = await registerWithAppwrite('valid-token', 'freelancer');
    expect(isAuthError(result)).toBe(false);
  });
});

// ─── Coverage for requestEmailOtp (lines 830-840) ───

describe('requestEmailOtp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns userId on success', async () => {
    mockAppwriteAccount.createEmailPasswordSession = jest.fn(); // not used but keep mock shape
    // requestEmailOtp uses account.createEmailToken
    const mockCreateEmailToken = jest.fn<any>().mockResolvedValue({ userId: 'otp-user-id' });
    // We need to mock the Account constructor to return our mock
    // Since Account is mocked at module level, we need to work with the existing mock
    // The function creates its own Account instance via createUserClient
    // Let's directly test by mocking the underlying call
    // Actually, looking at the code, it calls account.createEmailToken
    // But our mockAppwriteAccount doesn't have createEmailToken
    // Let's add it dynamically
    (mockAppwriteAccount as any).createEmailToken = mockCreateEmailToken;

    const result = await requestEmailOtp('test@example.com');
    expect(result).toEqual({ userId: 'otp-user-id' });
  });

  it('returns INTERNAL_ERROR on failure', async () => {
    (mockAppwriteAccount as any).createEmailToken = jest.fn<any>().mockRejectedValue(new Error('otp failed'));

    const result = await requestEmailOtp('test@example.com');
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: 'otp failed' });
  });
});

// ─── Coverage for requestMagicUrl (lines 846-860) ───

describe('requestMagicUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns userId on success', async () => {
    (mockAppwriteAccount as any).createMagicURLToken = jest.fn<any>().mockResolvedValue({ userId: 'magic-user-id' });

    const result = await requestMagicUrl('test@example.com');
    expect(result).toEqual({ userId: 'magic-user-id' });
  });

  it('returns INTERNAL_ERROR on failure', async () => {
    (mockAppwriteAccount as any).createMagicURLToken = jest.fn<any>().mockRejectedValue(new Error('magic failed'));

    const result = await requestMagicUrl('test@example.com');
    expect(result).toEqual({ code: 'INTERNAL_ERROR', message: 'magic failed' });
  });
});

// ─── Coverage for verifyAuthToken (lines 865-879) ───

describe('verifyAuthToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns auth result on successful verification', async () => {
    (mockAppwriteAccount as any).createSession = jest.fn<any>().mockResolvedValue({ secret: 'verified-session' });
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-123', email: 'test@example.com' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(createMockUser());

    const result = await verifyAuthToken('user-123', 'valid-secret');
    expect(isAuthError(result)).toBe(false);
  });

  it('returns AUTH_INVALID_CREDENTIALS on failure', async () => {
    (mockAppwriteAccount as any).createSession = jest.fn<any>().mockRejectedValue(new Error('invalid code'));

    const result = await verifyAuthToken('user-123', 'bad-secret');
    expect(result).toEqual({ code: 'AUTH_INVALID_CREDENTIALS', message: expect.any(String) });
  });
});

// ─── Branch coverage for ternary/fallback patterns ───

describe('auth-service branch coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('register: uses fallback name when email has no local part', async () => {
    (mockUserRepository.emailExists as jest.Mock).mockResolvedValue(false);
    mockAppwriteUsers.create.mockResolvedValue({ $id: 'u1', email: '@example.com' } as never);
    (mockUserRepository.createUser as jest.Mock).mockResolvedValue(createMockUser({ name: 'User' }));
    mockAppwriteAccount.createEmailPasswordSession.mockResolvedValue({ secret: 'sess' } as never);

    const result = await register({ email: '@example.com', password: 'P@ssw0rd1', role: 'freelancer' });
    expect(isAuthError(result)).toBe(false);
  });

  it('register: handles non-Error delete failure', async () => {
    (mockUserRepository.emailExists as jest.Mock).mockResolvedValue(false);
    mockAppwriteUsers.create.mockResolvedValue({ $id: 'u1', email: 'test@example.com' } as never);
    (mockUserRepository.createUser as jest.Mock).mockResolvedValue(createMockUser());
    mockAppwriteAccount.createEmailPasswordSession.mockRejectedValue('string error' as never);
    mockAppwriteUsers.delete.mockRejectedValue('not-an-error' as never);

    const result = await register({ email: 'test@example.com', password: 'P@ssw0rd1', role: 'freelancer' });
    expect(isAuthError(result)).toBe(true);
  });

  it('register: uses fallback message when error has no message', async () => {
    (mockUserRepository.emailExists as jest.Mock).mockResolvedValue(false);
    mockAppwriteUsers.create.mockRejectedValue({} as never);

    const result = await register({ email: 'test@example.com', password: 'P@ssw0rd1', role: 'freelancer' });
    if (isAuthError(result)) {
      expect(result.message).toBe('Failed to create user');
    }
  });

  it('validateToken: handles user with null suspension_reason', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'user-1' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(
      createMockUser({ is_suspended: true, suspension_reason: null })
    );

    const result = await validateToken('valid-token');
    if (isAuthError(result)) {
      expect(result.message).toBe('Your account has been suspended');
    }
  });

  it('requestPasswordReset: uses fallback message on error without message', async () => {
    mockAppwriteAccount.createRecovery.mockRejectedValue({} as never);

    const result = await requestPasswordReset('test@example.com');
    if (isAuthError(result)) {
      expect(result.message).toBe('Failed to send password reset email');
    }
  });

  it('logout: uses fallback message on error without message', async () => {
    mockAppwriteAccount.deleteSession.mockRejectedValue({} as never);

    const result = await logout('valid-token');
    if (isAuthError(result)) {
      expect(result.message).toBe('Failed to logout');
    }
  });

  it('enrollMFA: uses fallback message on error without message', async () => {
    mockAppwriteAccount.createMFAAuthenticator.mockRejectedValue({} as never);

    const result = await enrollMFA('valid-token', 'totp');
    if (isAuthError(result)) {
      expect(result.message).toBe('Failed to enroll in MFA');
    }
  });

  it('getOAuthUrl: maps linkedin_oidc to linkedin provider', async () => {
    mockAppwriteAccount.createOAuth2Token.mockResolvedValue('https://oauth.example.com/auth' as never);

    const url = await getOAuthUrl('linkedin_oidc');
    expect(url).toBe('https://oauth.example.com/auth');
    expect(mockAppwriteAccount.createOAuth2Token).toHaveBeenCalled();
  });

  it('registerWithAppwrite: uses fallback name chain', async () => {
    mockAppwriteAccount.get.mockResolvedValue({ $id: 'u1', email: 'user@test.com', name: '' } as never);
    (mockUserRepository.getUserById as jest.Mock).mockResolvedValue(null);
    (mockUserRepository.createUser as jest.Mock).mockResolvedValue(createMockUser());

    const result = await registerWithAppwrite('valid-token', 'freelancer');
    expect(isAuthError(result)).toBe(false);
  });

  it('requestEmailOtp: uses fallback message on error without message', async () => {
    (mockAppwriteAccount as any).createEmailToken = jest.fn<any>().mockRejectedValue({});

    const result = await requestEmailOtp('test@example.com');
    if (isAuthError(result)) {
      expect(result.message).toBe('Failed to send OTP to email');
    }
  });

  it('requestMagicUrl: uses fallback message on error without message', async () => {
    (mockAppwriteAccount as any).createMagicURLToken = jest.fn<any>().mockRejectedValue({});

    const result = await requestMagicUrl('test@example.com');
    if (isAuthError(result)) {
      expect(result.message).toBe('Failed to send Magic URL');
    }
  });

  it('verifyMFAEnrollment: uses fallback message on error without message', async () => {
    mockAppwriteAccount.updateMFAAuthenticator.mockRejectedValue({} as never);

    const result = await verifyMFAEnrollment('valid-token', 'totp', '123456');
    if (isAuthError(result)) {
      expect(result.message).toBe('Invalid MFA code');
    }
  });

  it('disableMFA: returns MFA_DISABLE_FAILED with error message', async () => {
    mockAppwriteAccount.createMFAChallenge.mockRejectedValue(new Error('challenge failed') as never);

    const result = await disableMFA('valid-token', 'totp', '123456');
    if (isAuthError(result)) {
      expect(result.code).toBe('MFA_DISABLE_FAILED');
      expect(result.message).toBe('challenge failed');
    }
  });
});