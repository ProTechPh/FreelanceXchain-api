// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { UserEntity } from '../../repositories/user-repository.js';
import { UserRole } from '../../models/user.js';
import { RegisterInput, LoginInput, AuthResult, AuthError } from '../../services/auth-types.js';
import { generateId } from '../../utils/id.js';

// In-memory user store for testing - uses entity type with snake_case
let userStore: Map<string, UserEntity> = new Map();
// Password store to verify login (email -> plain password)
let passwordStore: Map<string, string> = new Map();
(globalThis as any).mockPasswordStore = passwordStore;
const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
// Use low cost factor for fast test execution
const BCRYPT_TEST_ROUNDS = 4;

// --- Module Mocks ---

const mockAdminAccount = {
  createEmailPasswordSession: jest.fn((params: { email: string; password: string }) =>
    global.mockAppwriteAccount.createEmailPasswordSession(params.email, params.password)
  ),
  createSession: jest.fn((params: { userId: string; secret: string }) =>
    global.mockAppwriteAccount.createSession(params.userId, params.secret)
  ),
};

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule(resolveModule('src/repositories/didit-kyc-repository.ts'), () => ({
  getKycVerificationByUserId: jest.fn().mockResolvedValue(null),
  createKycVerification: jest.fn(),
  updateKycVerification: jest.fn(),
  getKycVerificationById: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    emailExists: jest.fn().mockResolvedValue(false),
    createUser: jest.fn().mockImplementation(async (user) => ({
      ...user,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    getUserByEmail: jest.fn().mockResolvedValue(null),
    getUserById: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    updateUser: jest.fn().mockResolvedValue({}),
  },
  UserRepository: jest.fn(),
  UserEntity: {} as UserEntity,
}));

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  account: mockAdminAccount,
  createUserClient: jest.fn(() => ({})),
  users: {
    create: jest.fn().mockResolvedValue({ $id: 'test-appwrite-user-id' }),
    delete: jest.fn().mockResolvedValue({}),
    createSession: jest.fn().mockResolvedValue({ $id: 'session-1', secret: 'test-session-secret' }),
    deleteSession: jest.fn().mockResolvedValue({}),
  },
}));

// --- Imports after mocking ---

const {
  validatePasswordStrength,
  createAuthResult,
  register,
  login,
  refreshTokens,
  validateToken,
  validateTokenAndGetUser,
  requestPasswordReset,
  updatePassword,
  updateUserWallet,
  isAuthError,
  logout,
  getCurrentUserWithKyc,
  getOAuthUrl,
  exchangeCodeForSession,
  enrollMFA,
  verifyMFAEnrollment,
  challengeMFA,
  verifyMFAChallenge,
  getMFAFactors,
  disableMFA,
  resendConfirmationEmail,
  loginWithAppwrite,
  registerWithAppwrite,
  requestEmailOtp,
  requestMagicUrl,
  verifyAuthToken,
} = await import('../../services/auth-service.js');

const { userRepository } = await import('../../repositories/user-repository.js');
const { getKycVerificationByUserId } = await import('../../repositories/didit-kyc-repository.js');
const { logger } = await import('../../config/logger.js');
const { account: adminAccount, createUserClient, users } = await import('../../config/appwrite.js');

// Add missing methods to the global mockAppwriteAccount from jest.setup.ts
global.mockAppwriteAccount.createMfaRecoveryCodes = jest.fn().mockResolvedValue({ recoveryCodes: ['code1', 'code2'] });
global.mockAppwriteAccount.updateMFA = jest.fn().mockResolvedValue({});
global.mockAppwriteAccount.createVerification = jest.fn().mockResolvedValue({});
global.mockAppwriteAccount.createEmailToken = jest.fn().mockResolvedValue({ userId: 'test-user-id' });
global.mockAppwriteAccount.createMagicURLToken = jest.fn().mockResolvedValue({ userId: 'test-user-id' });
global.mockAppwriteAccount.createSession = jest.fn().mockResolvedValue({ secret: 'new-session-secret' });

// Helper: default user entity for tests
const defaultUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  password_hash: '',
  role: 'freelancer' as const,
  wallet_address: '0x123',
  name: 'test',
  is_suspended: false,
  suspension_reason: null,
  mfa_enabled: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

// Custom arbitraries for property-based testing
const validEmailArbitrary = () =>
  fc.tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
    fc.constantFrom('test.com', 'example.org', 'mail.net')
  ).map(([local, domain]) => `${local}@${domain}`);
const validPasswordArbitrary = () =>
  fc.tuple(
    fc.stringMatching(/^[A-Z][a-z]{3,6}$/),
    fc.stringMatching(/^[0-9]{2,4}$/),
    fc.stringMatching(/^[a-z]{2,4}$/)
  ).map(([upper, nums, lower]) => `${upper}${nums}${lower}`);
const validRoleArbitrary = () =>
  fc.constantFrom<UserRole>('freelancer', 'employer');
const validRegistrationDataArbitrary = () =>
  fc.record({
    email: validEmailArbitrary(),
    password: validPasswordArbitrary(),
    role: validRoleArbitrary(),
  });

// ============================================================
// Property-based tests (original)
// ============================================================

describe('Auth Service - Registration Properties', () => {
  beforeEach(() => {
    userStore.clear();
    passwordStore.clear();
    jest.clearAllMocks();
    // Set up in-memory store implementations for property-based tests
    userRepository.emailExists.mockImplementation(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email === email.toLowerCase()) return true;
      }
      return false;
    });
    userRepository.createUser.mockImplementation(async (user: Omit<UserEntity, 'created_at' | 'updated_at'>) => {
      const now = new Date().toISOString();
      if (user.password_hash) {
        passwordStore.set(user.email.toLowerCase(), user.password_hash);
      }
      const entity: UserEntity = { ...user, created_at: now, updated_at: now };
      userStore.set(user.id, entity);
      return entity;
    });
    userRepository.getUserByEmail.mockImplementation(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email === email.toLowerCase()) return user;
      }
      return null;
    });
    userRepository.getUserById.mockImplementation(async (id: string) => {
      return userStore.get(id) ?? null;
    });
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 1: Registration creates unique accounts**
   * **Validates: Requirements 1.1, 1.3**
   *
   * For any valid registration data with unique email, the system shall create
   * exactly one user account and return valid authentication credentials
   * containing the specified role.
   */
  it('Property 1: Registration creates unique accounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        async (registrationData: RegisterInput) => {
          userStore.clear();
          passwordStore.clear();
          const result = await register(registrationData);
          expect(isAuthError(result)).toBe(false);
          if (!isAuthError(result)) {
            const authResult = result as AuthResult;
            expect(authResult.user.email).toBe(registrationData.email.toLowerCase());
            expect(authResult.user.role).toBe(registrationData.role);
            expect(authResult.accessToken).toBeDefined();
            expect(authResult.refreshToken).toBeDefined();
            // Verify access token contains claims (email comes from mock Appwrite session)
            const decoded = jwt.verify(authResult.accessToken, 'test-secret') as {
              userId: string;
              email: string;
              role: UserRole;
              type: string;
            };
            expect(decoded.type).toBe('access');
            expect(decoded.role).toBeDefined();
            expect(userStore.size).toBe(1);
            const storedUser = userStore.get(authResult.user.id);
            expect(storedUser).toBeDefined();
            expect(storedUser?.email).toBe(registrationData.email.toLowerCase());
            expect(storedUser?.role).toBe(registrationData.role);
            // Note: Password hash verification is not applicable here because
            // Appwrite Auth handles password storage internally.
            // The public.users table stores an empty password_hash when using Appwrite Auth.
          }
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
  /**
   * **Feature: blockchain-freelance-marketplace, Property 2: Duplicate email rejection**
   * **Validates: Requirements 1.2**
   *
   * For any email that is already registered, attempting to register again
   * with that email shall be rejected with a duplicate email error,
   * and no new account shall be created.
   */
  it('Property 2: Duplicate email rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        validPasswordArbitrary(),
        validRoleArbitrary(),
        async (firstRegistration: RegisterInput, secondPassword: string, secondRole: UserRole) => {
          userStore.clear();
          passwordStore.clear();
          // First registration should succeed
          const firstResult = await register(firstRegistration);
          expect(isAuthError(firstResult)).toBe(false);
          const userCountAfterFirst = userStore.size;
          expect(userCountAfterFirst).toBe(1);
          // Second registration with same email should fail
          const secondRegistration: RegisterInput = {
            email: firstRegistration.email,
            password: secondPassword,
            role: secondRole,
          };
          const secondResult = await register(secondRegistration);
          expect(isAuthError(secondResult)).toBe(true);
          if (isAuthError(secondResult)) {
            const error = secondResult as AuthError;
            expect(error.code).toBe('DUPLICATE_EMAIL');
          }
          // No new user should be created
          expect(userStore.size).toBe(userCountAfterFirst);
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
  /**
   * Additional test: Case-insensitive email duplicate detection
   * Emails should be treated as case-insensitive for duplicate detection
   */
  it('Property 2 (extended): Case-insensitive duplicate email rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        async (registrationData: RegisterInput) => {
          userStore.clear();
          passwordStore.clear();
          // First registration with lowercase email
          const firstResult = await register(registrationData);
          expect(isAuthError(firstResult)).toBe(false);
          // Second registration with uppercase email should also fail
          const upperCaseRegistration: RegisterInput = {
            ...registrationData,
            email: registrationData.email.toUpperCase(),
          };
          const secondResult = await register(upperCaseRegistration);
          expect(isAuthError(secondResult)).toBe(true);
          if (isAuthError(secondResult)) {
            expect((secondResult as AuthError).code).toBe('DUPLICATE_EMAIL');
          }
          // Still only one user
          expect(userStore.size).toBe(1);
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
});

describe('Auth Service - Authentication Properties', () => {
  beforeEach(() => {
    userStore.clear();
    passwordStore.clear();
    jest.clearAllMocks();
    // Set up in-memory store implementations for property-based tests
    userRepository.emailExists.mockImplementation(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email === email.toLowerCase()) return true;
      }
      return false;
    });
    userRepository.createUser.mockImplementation(async (user: Omit<UserEntity, 'created_at' | 'updated_at'>) => {
      const now = new Date().toISOString();
      if (user.password_hash) {
        passwordStore.set(user.email.toLowerCase(), user.password_hash);
      }
      const entity: UserEntity = { ...user, created_at: now, updated_at: now };
      userStore.set(user.id, entity);
      return entity;
    });
    userRepository.getUserByEmail.mockImplementation(async (email: string) => {
      for (const user of userStore.values()) {
        if (user.email === email.toLowerCase()) return user;
      }
      return null;
    });
    userRepository.getUserById.mockImplementation(async (id: string) => {
      return userStore.get(id) ?? null;
    });
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 3: Invalid credentials rejection**
   * **Validates: Requirements 1.4**
   *
   * For any login attempt with credentials that do not match a registered user,
   * the system shall reject authentication and return an invalid credentials error.
   */
  it('Property 3: Invalid credentials rejection - non-existent email', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArbitrary(),
        validPasswordArbitrary(),
        async (email: string, password: string) => {
          // Clear store - no users registered
          userStore.clear();
          passwordStore.clear();
          const loginInput: LoginInput = { email, password };
          const result = await login(loginInput);
          expect(isAuthError(result)).toBe(true);
          if (isAuthError(result)) {
            const error = result as AuthError;
            expect(error.code).toBe('INVALID_CREDENTIALS');
          }
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
  /**
   * **Feature: blockchain-freelance-marketplace, Property 3: Invalid credentials rejection**
   * **Validates: Requirements 1.4**
   *
   * For any registered user, login with wrong password shall be rejected.
   */
  it('Property 3: Invalid credentials rejection - wrong password', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        validPasswordArbitrary(),
        async (registrationData: RegisterInput, wrongPassword: string) => {
          userStore.clear();
          passwordStore.clear();
          const registerResult = await register(registrationData);
          expect(isAuthError(registerResult)).toBe(false);
          // Ensure wrong password is different from correct password
          if (wrongPassword === registrationData.password) {
            return; // Skip this test case
          }
          const loginInput: LoginInput = {
            email: registrationData.email,
            password: wrongPassword,
          };
          const loginResult = await login(loginInput);
          expect(isAuthError(loginResult)).toBe(true);
          if (isAuthError(loginResult)) {
            const error = loginResult as AuthError;
            expect(error.code).toBe('INVALID_CREDENTIALS');
          }
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
  /**
   * Additional test: Successful login with correct credentials
   * For any registered user, login with correct credentials shall succeed.
   */
  it('Property 3 (complement): Successful login with correct credentials', async () => {
    await fc.assert(
      fc.asyncProperty(
        validRegistrationDataArbitrary(),
        async (registrationData: RegisterInput) => {
          userStore.clear();
          passwordStore.clear();
          const registerResult = await register(registrationData);
          expect(isAuthError(registerResult)).toBe(false);
          const loginInput: LoginInput = {
            email: registrationData.email,
            password: registrationData.password,
          };
          const loginResult = await login(loginInput);
          expect(isAuthError(loginResult)).toBe(false);
          if (!isAuthError(loginResult)) {
            const authResult = loginResult as AuthResult;
            expect(authResult.user.email).toBe(registrationData.email.toLowerCase());
            expect(authResult.user.role).toBe(registrationData.role);
            expect(authResult.accessToken).toBeDefined();
            expect(authResult.refreshToken).toBeDefined();
          }
        }
      ),
      { numRuns: 20 }
    );
  }, 60000);
});

// ═══════════════════════════════════════════════════════════════
// Merged from auth-service-complete.test.ts
// ═══════════════════════════════════════════════════════════════

describe('auth-service comprehensive coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mockAppwriteAccount methods to clean state with defaults
    const maa = global.mockAppwriteAccount;
    maa.get.mockReset().mockResolvedValue({ $id: 'test-user-id', email: 'test@example.com' });
    maa.create.mockReset().mockResolvedValue({ $id: 'test-user-id' });
    maa.createEmailPasswordSession.mockReset().mockResolvedValue({ secret: 'test-session-secret' });
    maa.deleteSession.mockReset().mockResolvedValue({});
    maa.createRecovery.mockReset().mockResolvedValue({});
    maa.updatePassword.mockReset().mockResolvedValue({});
    maa.createOAuth2Token.mockReset().mockResolvedValue('https://mock-oauth-url.com');
    maa.createMFAAuthenticator.mockReset().mockResolvedValue({ uri: 'otpauth://...', secret: 'MOCK' });
    maa.updateMFAAuthenticator.mockReset().mockResolvedValue({});
    maa.createMFAChallenge.mockReset().mockResolvedValue({ $id: 'challenge-id' });
    maa.updateMFAChallenge.mockReset().mockResolvedValue({});
    maa.listMFAFactors.mockReset().mockResolvedValue({ totp: true });
    maa.deleteMFAAuthenticator.mockReset().mockResolvedValue({});
    maa.createMfaRecoveryCodes.mockReset().mockResolvedValue({ recoveryCodes: ['code1', 'code2'] });
    maa.updateMFA.mockReset().mockResolvedValue({});
    maa.createVerification.mockReset().mockResolvedValue({});
    maa.createEmailToken.mockReset().mockResolvedValue({ userId: 'test-user-id' });
    maa.createMagicURLToken.mockReset().mockResolvedValue({ userId: 'test-user-id' });
    maa.createSession.mockReset().mockResolvedValue({ secret: 'new-session-secret' });

    userRepository.emailExists.mockReset().mockResolvedValue(false);
    userRepository.createUser.mockReset().mockImplementation(async (user) => ({
      ...user,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    userRepository.getUserByEmail.mockReset().mockResolvedValue(null);
    userRepository.getUserById.mockReset().mockResolvedValue(null);
    userRepository.update.mockReset().mockResolvedValue({});

    // Reset KYC mock
    getKycVerificationByUserId.mockReset().mockResolvedValue(null);

    users.create.mockReset().mockResolvedValue({ $id: 'test-appwrite-user-id' });
    users.delete.mockReset().mockResolvedValue({});

    // Set env vars for redirect URL tests
    process.env.PUBLIC_URL = 'http://localhost:3000';
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  // ----------------------------------------------------------
  // 1. validatePasswordStrength (lines 32-57)
  // ----------------------------------------------------------
  describe('validatePasswordStrength', () => {
    it('should reject password shorter than minimum length', () => {
      const result = validatePasswordStrength('Ab1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should reject password longer than maximum length', () => {
      const longPassword = 'A'.repeat(60) + 'a1!' + 'B'.repeat(10);
      const result = validatePasswordStrength(longPassword);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at most 72 characters');
    });

    it('should reject password without uppercase letter', () => {
      const result = validatePasswordStrength('abcdefg1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase letter', () => {
      const result = validatePasswordStrength('ABCDEFG1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without digit', () => {
      const result = validatePasswordStrength('Abcdefgh!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject password without special character', () => {
      const result = validatePasswordStrength('Abcdefg1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character (@$!%*?&)');
    });

    it('should accept valid password meeting all requirements', () => {
      const result = validatePasswordStrength('Abcdef1!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report multiple errors for password with multiple violations', () => {
      const result = validatePasswordStrength('abc');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  // ----------------------------------------------------------
  // 2. createAuthResult suspended branch (line 62)
  // ----------------------------------------------------------
  describe('createAuthResult', () => {
    it('should return USER_SUSPENDED for suspended user with suspension reason', async () => {
      const suspendedUser = { ...defaultUser, is_suspended: true, suspension_reason: 'Terms violation' };
      const result = await createAuthResult(suspendedUser, 'tok', 'tok');
      expect(result).toEqual({
        code: 'USER_SUSPENDED',
        message: 'Terms violation',
      });
    });

    it('should return USER_SUSPENDED with default message when no suspension reason', async () => {
      const suspendedUser = { ...defaultUser, is_suspended: true, suspension_reason: null };
      const result = await createAuthResult(suspendedUser, 'tok', 'tok');
      expect(result).toEqual({
        code: 'USER_SUSPENDED',
        message: 'Your account has been suspended',
      });
    });

    it('should return AuthResult with KYC status when verification exists', async () => {
      getKycVerificationByUserId.mockResolvedValueOnce({ status: 'approved' });
      const result = await createAuthResult(defaultUser, 'tok', 'tok');
      expect(result).toHaveProperty('user.kycStatus', 'approved');
      expect(result).toHaveProperty('accessToken', 'tok');
      expect(result).toHaveProperty('refreshToken', 'tok');
    });

    it('should return AuthResult without KYC status when no verification', async () => {
      getKycVerificationByUserId.mockResolvedValueOnce(null);
      const result = await createAuthResult(defaultUser, 'tok', 'tok');
      expect(result).toHaveProperty('user.id', 'test-user-id');
      expect(result).not.toHaveProperty('user.kycStatus');
    });
  });

  // ----------------------------------------------------------
  // 3. register catch/compensation (lines 145-170)
  // ----------------------------------------------------------
  describe('register', () => {
    const validInput = { email: 'Test@Example.com', password: 'Password1!', role: 'freelancer' as const };

    it('should return DUPLICATE_EMAIL when email already exists in DB', async () => {
      userRepository.emailExists.mockResolvedValueOnce(true);
      const result = await register(validInput);
      expect(result).toEqual({
        code: 'DUPLICATE_EMAIL',
        message: 'An account with this email already exists',
      });
    });

    it('should compensate by deleting orphaned Appwrite user when session creation fails', async () => {
      users.create.mockResolvedValueOnce({ $id: 'orphan-uid' });
      userRepository.createUser.mockResolvedValueOnce({
        ...defaultUser,
        id: 'orphan-uid',
        email: 'test@example.com',
      });
      global.mockAppwriteAccount.createEmailPasswordSession.mockRejectedValueOnce(new Error('Session failed'));

      const result = await register(validInput);
      expect(users.delete).toHaveBeenCalledWith('orphan-uid');
      expect(logger.warn).toHaveBeenCalledWith(
        'Compensated: deleted orphaned Appwrite user after registration failure',
        expect.objectContaining({ appwriteUserId: 'orphan-uid' })
      );
      expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
    });

    it('should log CRITICAL error when orphaned user deletion also fails', async () => {
      users.create.mockResolvedValueOnce({ $id: 'orphan-uid' });
      userRepository.createUser.mockResolvedValueOnce({
        ...defaultUser,
        id: 'orphan-uid',
        email: 'test@example.com',
      });
      global.mockAppwriteAccount.createEmailPasswordSession.mockRejectedValueOnce(new Error('Session failed'));
      users.delete.mockRejectedValueOnce(new Error('Delete failed'));

      const result = await register(validInput);
      expect(logger.error).toHaveBeenCalledWith(
        'CRITICAL: Failed to delete orphaned Appwrite user',
        expect.objectContaining({ appwriteUserId: 'orphan-uid', deleteError: 'Delete failed' })
      );
      expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
    });

    it('should return DUPLICATE_EMAIL when Appwrite reports already exists in message', async () => {
      users.create.mockRejectedValueOnce(new Error('A user with the same id, email, or phone already exists'));

      const result = await register(validInput);
      expect(result).toEqual({
        code: 'DUPLICATE_EMAIL',
        message: 'An account with this email already exists',
      });
    });

    it('should return DUPLICATE_EMAIL when Appwrite returns error code 409', async () => {
      const error = new Error('Conflict');
      (error as any).code = 409;
      users.create.mockRejectedValueOnce(error);

      const result = await register(validInput);
      expect(result).toEqual({
        code: 'DUPLICATE_EMAIL',
        message: 'An account with this email already exists',
      });
    });

    it('should return INTERNAL_ERROR for other registration failures', async () => {
      users.create.mockRejectedValueOnce(new Error('Service unavailable'));

      // BUG-5 fix: raw upstream error details must NOT leak to the client (CWE-209).
      const result = await register(validInput);
      expect(result).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Failed to create user',
      });
    });

    it('should successfully register and return AuthResult on happy path', async () => {
      users.create.mockResolvedValueOnce({ $id: 'new-appwrite-uid' });
      userRepository.createUser.mockResolvedValueOnce({
        ...defaultUser,
        id: 'new-appwrite-uid',
        email: 'test@example.com',
      });

      const result = await register(validInput);
      expect(isAuthError(result)).toBe(false);
      expect(adminAccount.createEmailPasswordSession).toHaveBeenCalledWith({
        email: validInput.email.toLowerCase(),
        password: validInput.password,
      });
      if (!isAuthError(result)) {
        expect(result.user.email).toBe('test@example.com');
        expect(result.user.id).toBe('new-appwrite-uid');
        expect(result.accessToken).toBe('test-session-secret');
        expect(result.refreshToken).toBe('test-session-secret');
      }
    });
  });

  // ----------------------------------------------------------
  // 4. login MFA branch (lines 196-211)
  // ----------------------------------------------------------
  describe('login', () => {
    const validLogin = { email: 'test@example.com', password: 'Password1!' };

    it('should bind the created session before checking the authenticated account', async () => {
      userRepository.getUserByEmail.mockResolvedValueOnce(defaultUser);

      const result = await login(validLogin);

      expect(isAuthError(result)).toBe(false);
      expect(adminAccount.createEmailPasswordSession).toHaveBeenCalledWith({
        email: validLogin.email,
        password: validLogin.password,
      });
      expect(createUserClient).toHaveBeenCalledWith('test-session-secret');
    });

    it('should reject a session response without an authentication secret', async () => {
      global.mockAppwriteAccount.createEmailPasswordSession.mockResolvedValueOnce({ secret: '' });

      const result = await login(validLogin);

      expect(result).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      expect(createUserClient).not.toHaveBeenCalled();
    });

    it('should return MFA_REQUIRED when account.get throws user_more_factors_required', async () => {
      global.mockAppwriteAccount.get.mockRejectedValueOnce({
        type: 'user_more_factors_required',
        message: 'MFA required',
      });

      const result = await login(validLogin);
      expect(result).toHaveProperty('code', 'MFA_REQUIRED');
      expect(result).toHaveProperty('mfaRequired', true);
      expect(result).toHaveProperty('mfaSessionToken', 'test-session-secret');
    });

    it('should return INVALID_CREDENTIALS when user profile not found in DB', async () => {
      userRepository.getUserByEmail.mockResolvedValueOnce(null);

      const result = await login(validLogin);
      expect(result).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'User profile not found',
      });
    });

    it('should return INVALID_CREDENTIALS when createEmailPasswordSession fails', async () => {
      global.mockAppwriteAccount.createEmailPasswordSession.mockRejectedValueOnce(new Error('Bad credentials'));

      const result = await login(validLogin);
      expect(result).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    });

    it('should return INVALID_CREDENTIALS when account.get throws non-MFA error', async () => {
      global.mockAppwriteAccount.get.mockRejectedValueOnce(new Error('Server error'));

      const result = await login(validLogin);
      expect(result).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    });

    it('should successfully login and return AuthResult via createAuthResult', async () => {
      userRepository.getUserByEmail.mockResolvedValueOnce(defaultUser);

      const result = await login(validLogin);
      expect(isAuthError(result)).toBe(false);
      if (!isAuthError(result)) {
        expect(result.user.email).toBe('test@example.com');
        expect(result.accessToken).toBe('test-session-secret');
      }
    });
  });

  // ----------------------------------------------------------
  // 5. refreshTokens (lines 239-267)
  // ----------------------------------------------------------
  describe('refreshTokens', () => {
    it('should return AuthResult on successful token refresh', async () => {
      userRepository.getUserById.mockResolvedValueOnce(defaultUser);

      const result = await refreshTokens('valid-refresh-token');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'valid-refresh-token');
    });

    it('should return INVALID_TOKEN when user not found in DB', async () => {
      userRepository.getUserById.mockResolvedValueOnce(null);

      const result = await refreshTokens('valid-refresh-token');
      expect(result).toEqual({
        code: 'INVALID_TOKEN',
        message: 'User not found',
      });
    });

    it('should return INVALID_TOKEN when Appwrite rejects the token', async () => {
      global.mockAppwriteAccount.get.mockRejectedValueOnce(new Error('Invalid session'));

      const result = await refreshTokens('bad-token');
      expect(result).toEqual({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    });
  });

  // ----------------------------------------------------------
  // 6. validateToken (lines 272-312)
  // ----------------------------------------------------------
  describe('validateToken', () => {
    it('should return INVALID_TOKEN when user not found in DB', async () => {
      userRepository.getUserById.mockResolvedValueOnce(null);

      const result = await validateToken('valid-token');
      expect(result).toEqual({
        code: 'INVALID_TOKEN',
        message: 'User not found',
      });
    });

    it('should return USER_SUSPENDED for suspended user with reason', async () => {
      userRepository.getUserById.mockResolvedValueOnce({
        ...defaultUser,
        is_suspended: true,
        suspension_reason: 'Fraud detected',
      });

      const result = await validateToken('valid-token');
      expect(result).toEqual({
        code: 'USER_SUSPENDED',
        message: 'Fraud detected',
      });
    });

    it('should return USER_SUSPENDED with default message when no suspension reason', async () => {
      userRepository.getUserById.mockResolvedValueOnce({
        ...defaultUser,
        is_suspended: true,
        suspension_reason: null,
      });

      const result = await validateToken('valid-token');
      expect(result).toEqual({
        code: 'USER_SUSPENDED',
        message: 'Your account has been suspended',
      });
    });

    it('should return INVALID_TOKEN on validation failure (catch block)', async () => {
      global.mockAppwriteAccount.get.mockRejectedValueOnce(new Error('Token expired'));

      const result = await validateToken('expired-token');
      expect(result).toEqual({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
    });

    it('should return user info on successful validation', async () => {
      userRepository.getUserById.mockResolvedValueOnce(defaultUser);

      const result = await validateToken('valid-token');
      expect(result).toEqual({
        id: 'test-user-id',
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'freelancer',
      });
    });
  });

  // ----------------------------------------------------------
  // 7. validateTokenAndGetUser (lines 317-334)
  // ----------------------------------------------------------
  describe('validateTokenAndGetUser', () => {
    it('should passthrough error when validateToken fails', async () => {
      global.mockAppwriteAccount.get.mockRejectedValueOnce(new Error('Invalid'));

      const result = await validateTokenAndGetUser('bad-token');
      expect(isAuthError(result)).toBe(true);
      expect(result).toHaveProperty('code', 'INVALID_TOKEN');
    });

    it('should return INVALID_TOKEN when user not found after successful validation', async () => {
      // First call to getUserById (in validateToken) returns user
      userRepository.getUserById.mockResolvedValueOnce(defaultUser);
      // Second call to getUserById (in validateTokenAndGetUser) returns null
      userRepository.getUserById.mockResolvedValueOnce(null);

      const result = await validateTokenAndGetUser('valid-token');
      expect(result).toEqual({
        code: 'INVALID_TOKEN',
        message: 'User not found',
      });
    });

    it('should return AuthResult on successful validation and user lookup', async () => {
      userRepository.getUserById.mockResolvedValue(defaultUser);

      const result = await validateTokenAndGetUser('valid-token');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'valid-token');
    });
  });

  // ----------------------------------------------------------
  // 8. requestPasswordReset (lines 339-364)
  // ----------------------------------------------------------
  describe('requestPasswordReset', () => {
    it('should return success on successful password reset request', async () => {
      const result = await requestPasswordReset('test@example.com');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.createRecovery).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' })
      );
    });

    it('should return INTERNAL_ERROR on failure', async () => {
      global.mockAppwriteAccount.createRecovery.mockRejectedValueOnce(new Error('Service down'));

      const result = await requestPasswordReset('test@example.com');
      expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // 9. updatePassword (lines 369-388)
  // ----------------------------------------------------------
  describe('updatePassword', () => {
    it('should return success on successful password update', async () => {
      const result = await updatePassword('token', 'NewPass1!');
      expect(result).toEqual({ success: true });
    });

    it('should return INTERNAL_ERROR on failure', async () => {
      global.mockAppwriteAccount.updatePassword.mockRejectedValueOnce(new Error('Update failed'));

      const result = await updatePassword('token', 'NewPass1!');
      expect(result).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Failed to update password',
      });
    });

    // BLF-4.2: deleteSessions failure should not prevent password update
    it('should still succeed when deleteSessions throws a non-Error value', async () => {
      global.mockAppwriteAccount.deleteSessions = jest.fn().mockRejectedValueOnce('string-error');

      const result = await updatePassword('token', 'NewPass1!');
      expect(result).toEqual({ success: true });
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to invalidate sessions after password change',
        expect.objectContaining({ error: 'string-error' }),
      );
    });

    it('should still succeed when deleteSessions throws an Error instance', async () => {
      global.mockAppwriteAccount.deleteSessions = jest.fn().mockRejectedValueOnce(new Error('session failure'));

      const result = await updatePassword('token', 'NewPass1!');
      expect(result).toEqual({ success: true });
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to invalidate sessions after password change',
        expect.objectContaining({ error: 'session failure' }),
      );
    });
  });

  // ----------------------------------------------------------
  // 10. logout (lines 397-420)
  // ----------------------------------------------------------
  describe('logout', () => {
    it('should return success immediately when no token provided', async () => {
      const result = await logout(undefined);
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.deleteSession).not.toHaveBeenCalled();
    });

    it('should return success on successful session deletion', async () => {
      const result = await logout('valid-token');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.deleteSession).toHaveBeenCalledWith({ sessionId: 'current' });
    });

    it('should return INTERNAL_ERROR when session deletion fails', async () => {
      global.mockAppwriteAccount.deleteSession.mockRejectedValueOnce(new Error('Delete failed'));

      const result = await logout('valid-token');
      expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // 11. getCurrentUserWithKyc (lines 425-466)
  // ----------------------------------------------------------
  describe('getCurrentUserWithKyc', () => {
    it('should return USER_NOT_FOUND when user does not exist', async () => {
      userRepository.getUserById.mockResolvedValueOnce(null);

      const result = await getCurrentUserWithKyc('nonexistent');
      expect(result).toEqual({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    });

    it('should return kycStatus approved for admin users without DB lookup', async () => {
      userRepository.getUserById.mockResolvedValueOnce({
        ...defaultUser,
        role: 'admin',
      });

      const result = await getCurrentUserWithKyc('test-user-id');
      expect(result).toHaveProperty('kycStatus', 'approved');
      expect(result).toHaveProperty('role', 'admin');
      expect(result).toHaveProperty('authProvider', 'email');
      expect(getKycVerificationByUserId).not.toHaveBeenCalled();
    });

    it('should return KYC status for non-admin users with verification', async () => {
      userRepository.getUserById.mockResolvedValueOnce({
        ...defaultUser,
        role: 'freelancer',
      });
      getKycVerificationByUserId.mockResolvedValueOnce({ status: 'pending' });

      const result = await getCurrentUserWithKyc('test-user-id');
      expect(result).toHaveProperty('kycStatus', 'pending');
      expect(result).toHaveProperty('authProvider', 'email');
      expect(getKycVerificationByUserId).toHaveBeenCalledWith('test-user-id');
    });

    it('should return without kycStatus when no verification exists for non-admin', async () => {
      userRepository.getUserById.mockResolvedValueOnce({
        ...defaultUser,
        role: 'freelancer',
      });
      getKycVerificationByUserId.mockResolvedValueOnce(null);

      const result = await getCurrentUserWithKyc('test-user-id');
      expect(result).not.toHaveProperty('kycStatus');
      expect(result).toHaveProperty('authProvider', 'email');
    });
  });

  // ----------------------------------------------------------
  // 12. getOAuthUrl (lines 471-490)
  // ----------------------------------------------------------
  describe('getOAuthUrl', () => {
    it('should map linkedin_oidc provider to linkedin for Appwrite', async () => {
      await getOAuthUrl('linkedin_oidc');
      expect(global.mockAppwriteAccount.createOAuth2Token).toHaveBeenCalledWith(
        'linkedin',
        'http://localhost:3000/auth/callback',
        'http://localhost:3000/login?error=oauth_failed'
      );
    });

    it('should pass provider name directly for non-linkedin providers', async () => {
      await getOAuthUrl('google');
      expect(global.mockAppwriteAccount.createOAuth2Token).toHaveBeenCalledWith(
        'google',
        expect.any(String),
        expect.any(String)
      );
    });

    it('should strip trailing slashes from env URLs', async () => {
      process.env.PUBLIC_URL = 'http://localhost:3000/';
      await getOAuthUrl('github');
      expect(global.mockAppwriteAccount.createOAuth2Token).toHaveBeenCalledWith(
        'github',
        'http://localhost:3000/auth/callback',
        'http://localhost:3000/login?error=oauth_failed'
      );
    });
  });

  // ----------------------------------------------------------
  // 13. exchangeCodeForSession (lines 495-525)
  // ----------------------------------------------------------
  describe('exchangeCodeForSession', () => {
    it('should return tokens when user found in DB', async () => {
      userRepository.getUserById.mockResolvedValueOnce(defaultUser);

      const result = await exchangeCodeForSession('oauth-session-token');
      expect(result).toEqual({
        accessToken: 'oauth-session-token',
        refreshToken: 'oauth-session-token',
      });
    });

    it('should return AUTH_REQUIRE_REGISTRATION when user not found in DB', async () => {
      userRepository.getUserById.mockResolvedValueOnce(null);

      const result = await exchangeCodeForSession('oauth-session-token');
      expect(result).toHaveProperty('code', 'AUTH_REQUIRE_REGISTRATION');
    });

    it('should return INTERNAL_ERROR when session verification fails', async () => {
      global.mockAppwriteAccount.get.mockRejectedValueOnce(new Error('Session invalid'));

      const result = await exchangeCodeForSession('bad-token');
      expect(result).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Failed to verify OAuth session',
      });
    });
  });

  // ----------------------------------------------------------
  // 14. enrollMFA (lines 533-569)
  // ----------------------------------------------------------
  describe('enrollMFA', () => {
    it('should enroll TOTP with recovery codes and secret', async () => {
      global.mockAppwriteAccount.createMFAAuthenticator.mockResolvedValueOnce({
        uri: 'otpauth://totp/test',
        secret: 'SUPERSECRET',
      });
      global.mockAppwriteAccount.createMfaRecoveryCodes.mockResolvedValueOnce({
        recoveryCodes: ['recovery-1', 'recovery-2'],
      });

      const result = await enrollMFA('token', 'totp');
      expect(result).toEqual({
        success: true,
        recoveryCodes: ['recovery-1', 'recovery-2'],
        secret: 'SUPERSECRET',
        uri: 'otpauth://totp/test',
      });
    });

    it('should gracefully handle recovery codes already existing', async () => {
      global.mockAppwriteAccount.createMfaRecoveryCodes.mockRejectedValueOnce(
        new Error('Recovery codes already exist')
      );

      const result = await enrollMFA('token', 'totp');
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('recoveryCodes', []);
    });

    it('should return success for email factor type without authenticator enrollment', async () => {
      const result = await enrollMFA('token', 'email');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.createMFAAuthenticator).not.toHaveBeenCalled();
    });

    it('should return MFA_ENROLLMENT_FAILED on error', async () => {
      global.mockAppwriteAccount.createMFAAuthenticator.mockRejectedValueOnce(new Error('Enrollment error'));

      const result = await enrollMFA('token', 'totp');
      expect(result).toEqual({
        code: 'MFA_ENROLLMENT_FAILED',
        message: 'Enrollment error',
      });
    });
  });

  // ----------------------------------------------------------
  // 15. verifyMFAEnrollment (lines 574-602)
  // ----------------------------------------------------------
  describe('verifyMFAEnrollment', () => {
    it('should verify TOTP authenticator and enable MFA in DB', async () => {
      userRepository.getUserById.mockResolvedValueOnce(defaultUser);

      const result = await verifyMFAEnrollment('token', 'totp', '123456');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.updateMFAAuthenticator).toHaveBeenCalledWith({
        type: 'totp',
        otp: '123456',
      });
      expect(global.mockAppwriteAccount.updateMFA).toHaveBeenCalledWith(true);
      expect(userRepository.update).toHaveBeenCalledWith('test-user-id', { mfa_enabled: true });
    });

    it('should skip authenticator verification for email factor and still enable MFA', async () => {
      userRepository.getUserById.mockResolvedValueOnce(defaultUser);

      const result = await verifyMFAEnrollment('token', 'email', '654321');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.updateMFAAuthenticator).not.toHaveBeenCalled();
      expect(global.mockAppwriteAccount.updateMFA).toHaveBeenCalledWith(true);
    });

    it('should return MFA_VERIFY_FAILED on error', async () => {
      global.mockAppwriteAccount.updateMFAAuthenticator.mockRejectedValueOnce(new Error('Invalid OTP'));

      const result = await verifyMFAEnrollment('token', 'totp', 'wrong');
      expect(result).toEqual({
        code: 'MFA_VERIFY_FAILED',
        message: 'Invalid OTP',
      });
    });
  });

  // ----------------------------------------------------------
  // 16. challengeMFA (lines 607-623)
  // ----------------------------------------------------------
  describe('challengeMFA', () => {
    it('should create MFA challenge and return challengeId', async () => {
      const result = await challengeMFA('token', 'totp');
      expect(result).toEqual({ challengeId: 'challenge-id' });
      expect(global.mockAppwriteAccount.createMFAChallenge).toHaveBeenCalledWith({ factor: 'totp' });
    });

    it('should return INTERNAL_ERROR on failure', async () => {
      global.mockAppwriteAccount.createMFAChallenge.mockRejectedValueOnce(new Error('Challenge error'));

      const result = await challengeMFA('token', 'totp');
      expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
      expect(result).toHaveProperty('message', 'Challenge error');
    });
  });

  // ----------------------------------------------------------
  // 17. verifyMFAChallenge (lines 628-647)
  // ----------------------------------------------------------
  describe('verifyMFAChallenge', () => {
    it('should verify MFA challenge successfully', async () => {
      const result = await verifyMFAChallenge('token', 'totp', 'challenge-id', '123456');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.updateMFAChallenge).toHaveBeenCalledWith({
        challengeId: 'challenge-id',
        otp: '123456',
      });
    });

    it('should return MFA_CHALLENGE_FAILED on error', async () => {
      global.mockAppwriteAccount.updateMFAChallenge.mockRejectedValueOnce(new Error('Bad code'));

      const result = await verifyMFAChallenge('token', 'totp', 'challenge-id', 'wrong');
      expect(result).toEqual({
        code: 'MFA_CHALLENGE_FAILED',
        message: 'Bad code',
      });
    });
  });

  // ----------------------------------------------------------
  // 18. getMFAFactors (lines 652-670)
  // ----------------------------------------------------------
  describe('getMFAFactors', () => {
    it('should return enrolled TOTP factor', async () => {
      global.mockAppwriteAccount.listMFAFactors.mockResolvedValueOnce({ totp: true });

      const result = await getMFAFactors('token');
      expect(result).toEqual({
        factors: [{ id: 'totp', type: 'totp' }],
      });
    });

    it('should return both TOTP and email factors when both enrolled', async () => {
      global.mockAppwriteAccount.listMFAFactors.mockResolvedValueOnce({ totp: true, email: true });

      const result = await getMFAFactors('token');
      expect(result).toEqual({
        factors: [
          { id: 'totp', type: 'totp' },
          { id: 'email', type: 'email' },
        ],
      });
    });

    it('should return empty factors when none enrolled', async () => {
      global.mockAppwriteAccount.listMFAFactors.mockResolvedValueOnce({ totp: false, email: false });

      const result = await getMFAFactors('token');
      expect(result).toEqual({ factors: [] });
    });

    it('should return MFA_LIST_FAILED on error', async () => {
      global.mockAppwriteAccount.listMFAFactors.mockRejectedValueOnce(new Error('List error'));

      const result = await getMFAFactors('token');
      expect(result).toEqual({
        code: 'MFA_LIST_FAILED',
        message: 'List error',
      });
    });
  });

  // ----------------------------------------------------------
  // 19. disableMFA (lines 675-718)
  // ----------------------------------------------------------
  describe('disableMFA', () => {
    it('should return MFA_CODE_REQUIRED when OTP code is not provided', async () => {
      const result = await disableMFA('token', 'totp');
      expect(result).toEqual({
        code: 'MFA_CODE_REQUIRED',
        message: 'OTP code is required to disable MFA',
      });
    });

    it('should disable TOTP MFA: challenge, verify, delete authenticator, update flags', async () => {
      userRepository.getUserById.mockResolvedValueOnce(defaultUser);

      const result = await disableMFA('token', 'totp', '123456');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.createMFAChallenge).toHaveBeenCalledWith({ factor: 'totp' });
      expect(global.mockAppwriteAccount.updateMFAChallenge).toHaveBeenCalledWith({
        challengeId: 'challenge-id',
        otp: '123456',
      });
      expect(global.mockAppwriteAccount.deleteMFAAuthenticator).toHaveBeenCalledWith({ type: 'totp' });
      expect(global.mockAppwriteAccount.updateMFA).toHaveBeenCalledWith(false);
      expect(userRepository.update).toHaveBeenCalledWith('test-user-id', { mfa_enabled: false });
    });

    it('should disable email MFA without deleting authenticator', async () => {
      userRepository.getUserById.mockResolvedValueOnce(defaultUser);

      const result = await disableMFA('token', 'email', '123456');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.createMFAChallenge).toHaveBeenCalledWith({ factor: 'email' });
      expect(global.mockAppwriteAccount.deleteMFAAuthenticator).not.toHaveBeenCalled();
      expect(global.mockAppwriteAccount.updateMFA).toHaveBeenCalledWith(false);
    });

    it('should return MFA_DISABLE_FAILED on error', async () => {
      global.mockAppwriteAccount.createMFAChallenge.mockRejectedValueOnce(new Error('Disable error'));

      const result = await disableMFA('token', 'totp', '123456');
      expect(result).toEqual({
        code: 'MFA_DISABLE_FAILED',
        message: 'Disable error',
      });
    });
  });

  // ----------------------------------------------------------
  // 20. resendConfirmationEmail (lines 723-751)
  // ----------------------------------------------------------
  describe('resendConfirmationEmail', () => {
    it('should create verification when user found', async () => {
      userRepository.getUserByEmail.mockResolvedValueOnce(defaultUser);

      const result = await resendConfirmationEmail('test@example.com');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.createVerification).toHaveBeenCalledWith(
        'http://localhost:3000/verify-email'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Confirmation email sent',
        expect.objectContaining({ email: 'test@example.com' })
      );
    });

    it('should return success without sending when user not found (prevent enumeration)', async () => {
      userRepository.getUserByEmail.mockResolvedValueOnce(null);

      const result = await resendConfirmationEmail('unknown@example.com');
      expect(result).toEqual({ success: true });
      expect(global.mockAppwriteAccount.createVerification).not.toHaveBeenCalled();
    });

    it('should return success even on error (prevent enumeration)', async () => {
      userRepository.getUserByEmail.mockResolvedValueOnce(defaultUser);
      global.mockAppwriteAccount.createVerification.mockRejectedValueOnce(new Error('Send failed'));

      const result = await resendConfirmationEmail('test@example.com');
      expect(result).toEqual({ success: true });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to resend confirmation email',
        expect.objectContaining({ email: 'test@example.com' })
      );
    });
  });

  // ----------------------------------------------------------
  // 21. loginWithAppwrite catch (lines 774-777)
  // ----------------------------------------------------------
  describe('loginWithAppwrite', () => {
    it('should return AUTH_REQUIRE_REGISTRATION when user not found in DB', async () => {
      userRepository.getUserById.mockResolvedValueOnce(null);

      const result = await loginWithAppwrite('valid-token');
      expect(result).toHaveProperty('code', 'AUTH_REQUIRE_REGISTRATION');
    });

    it('should return AUTH_INVALID_TOKEN when account.get() throws', async () => {
      global.mockAppwriteAccount.get.mockRejectedValueOnce(new Error('Token expired'));

      const result = await loginWithAppwrite('expired-token');
      expect(result).toEqual({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid or expired authentication token.',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Login with Appwrite token failed',
        expect.objectContaining({ error: 'Token expired' })
      );
    });
  });

  // ----------------------------------------------------------
  // 22. registerWithAppwrite catch (lines 819-825)
  // ----------------------------------------------------------
  describe('registerWithAppwrite', () => {
    it('should return DUPLICATE_EMAIL when user already exists in DB', async () => {
      userRepository.getUserById.mockResolvedValueOnce({ id: 'existing-user' });

      const result = await registerWithAppwrite('valid-token', 'freelancer');
      expect(result).toHaveProperty('code', 'DUPLICATE_EMAIL');
    });

    it('should create user and return AuthResult on success', async () => {
      userRepository.getUserById.mockResolvedValueOnce(null);
      userRepository.createUser.mockResolvedValueOnce({
        ...defaultUser,
        id: 'new-user',
        email: 'test@example.com',
        role: 'employer',
      });

      const result = await registerWithAppwrite('valid-token', 'employer');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'valid-token');
    });

    it('should return INTERNAL_ERROR when account.get() throws', async () => {
      global.mockAppwriteAccount.get.mockRejectedValueOnce(new Error('Invalid token'));

      const result = await registerWithAppwrite('bad-token', 'freelancer');
      expect(result).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Failed to complete registration.',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Appwrite registration failed',
        expect.objectContaining({ error: 'Invalid token' })
      );
    });
  });

  // ----------------------------------------------------------
  // 23. requestEmailOtp (lines 830-841)
  // ----------------------------------------------------------
  describe('requestEmailOtp', () => {
    it('should return userId on successful OTP request', async () => {
      global.mockAppwriteAccount.createEmailToken.mockResolvedValueOnce({ userId: 'otp-user-123' });

      const result = await requestEmailOtp('test@example.com');
      expect(result).toEqual({ userId: 'otp-user-123' });
    });

    it('should return a generic INTERNAL_ERROR without leaking upstream error details', async () => {
      global.mockAppwriteAccount.createEmailToken.mockRejectedValueOnce(new Error('OTP send failed'));

      const result = await requestEmailOtp('test@example.com');
      expect(result).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Failed to send OTP to email',
      });
    });

    it('should return the identical error for every upstream failure (no account-enumeration oracle)', async () => {
      const upstreamErrors = [new Error('OTP send failed'), new Error('user_not_found')];
      const results: unknown[] = [];
      for (const error of upstreamErrors) {
        global.mockAppwriteAccount.createEmailToken.mockRejectedValueOnce(error);
        results.push(await requestEmailOtp('test@example.com'));
      }
      expect(results[0]).toEqual(results[1]);
      expect(results[0]).toEqual({ code: 'INTERNAL_ERROR', message: 'Failed to send OTP to email' });
    });
  });

  // ----------------------------------------------------------
  // 24. requestMagicUrl (lines 846-860)
  // ----------------------------------------------------------
  describe('requestMagicUrl', () => {
    it('should return userId on successful Magic URL request', async () => {
      global.mockAppwriteAccount.createMagicURLToken.mockResolvedValueOnce({ userId: 'magic-user-456' });

      const result = await requestMagicUrl('test@example.com');
      expect(result).toEqual({ userId: 'magic-user-456' });
    });

    it('should return a generic INTERNAL_ERROR without leaking upstream error details', async () => {
      global.mockAppwriteAccount.createMagicURLToken.mockRejectedValueOnce(new Error('Magic URL failed'));

      const result = await requestMagicUrl('test@example.com');
      expect(result).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Failed to send Magic URL',
      });
    });

    it('should return the identical error for every upstream failure (no account-enumeration oracle)', async () => {
      const upstreamErrors = [new Error('Magic URL failed'), new Error('user_not_found')];
      const results: unknown[] = [];
      for (const error of upstreamErrors) {
        global.mockAppwriteAccount.createMagicURLToken.mockRejectedValueOnce(error);
        results.push(await requestMagicUrl('test@example.com'));
      }
      expect(results[0]).toEqual(results[1]);
      expect(results[0]).toEqual({ code: 'INTERNAL_ERROR', message: 'Failed to send Magic URL' });
    });
  });

  // ----------------------------------------------------------
  // 25. verifyAuthToken (lines 865-879)
  // ----------------------------------------------------------
  describe('verifyAuthToken', () => {
    it('should verify token and return AuthResult via loginWithAppwrite', async () => {
      global.mockAppwriteAccount.createSession.mockResolvedValueOnce({ secret: 'verified-session-secret' });
      userRepository.getUserById.mockResolvedValueOnce(defaultUser);

      const result = await verifyAuthToken('user-id', 'otp-code');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'verified-session-secret');
      expect(adminAccount.createSession).toHaveBeenCalledWith({
        userId: 'user-id',
        secret: 'otp-code',
      });
      expect(global.mockAppwriteAccount.createSession).toHaveBeenCalledWith('user-id', 'otp-code');
    });

    it('should return AUTH_INVALID_CREDENTIALS when session creation fails', async () => {
      global.mockAppwriteAccount.createSession.mockRejectedValueOnce(new Error('Invalid code'));

      const result = await verifyAuthToken('user-id', 'wrong-code');
      expect(result).toEqual({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid or expired code/token',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Token verification failed',
        expect.objectContaining({ error: 'Invalid code' })
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Merged from auth-service-branch-coverage.test.ts
// ═══════════════════════════════════════════════════════════════

describe('auth-service - branch coverage gaps', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const maa = global.mockAppwriteAccount;
    maa.get.mockReset().mockResolvedValue({ $id: 'test-user-id', email: 'test@example.com' });
    maa.createEmailPasswordSession.mockReset().mockResolvedValue({ secret: 'test-session-secret' });
    maa.deleteSession.mockReset().mockResolvedValue({});
    maa.createRecovery.mockReset().mockResolvedValue({});
    maa.createMFAAuthenticator.mockReset().mockResolvedValue({ uri: 'otpauth://...', secret: 'MOCK' });
    maa.updateMFAAuthenticator.mockReset().mockResolvedValue({});
    maa.createMFAChallenge.mockReset().mockResolvedValue({ $id: 'challenge-id' });
    maa.updateMFAChallenge.mockReset().mockResolvedValue({});
    maa.listMFAFactors.mockReset().mockResolvedValue({ totp: true });
    maa.deleteMFAAuthenticator.mockReset().mockResolvedValue({});
    maa.createMfaRecoveryCodes.mockReset().mockResolvedValue({ recoveryCodes: ['code1', 'code2'] });
    maa.updateMFA.mockReset().mockResolvedValue({});
    maa.createVerification.mockReset().mockResolvedValue({});
    maa.createEmailToken.mockReset().mockResolvedValue({ userId: 'test-user-id' });
    maa.createMagicURLToken.mockReset().mockResolvedValue({ userId: 'test-user-id' });
    maa.createSession.mockReset().mockResolvedValue({ secret: 'new-session-secret' });

    userRepository.emailExists.mockReset().mockResolvedValue(false);
    userRepository.createUser.mockReset().mockImplementation(async (user) => ({
      ...user,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    userRepository.getUserByEmail.mockReset().mockResolvedValue(null);
    userRepository.getUserById.mockReset().mockResolvedValue(null);
    userRepository.update.mockReset().mockResolvedValue({});

    users.create.mockReset().mockResolvedValue({ $id: 'test-appwrite-user-id' });
    users.delete.mockReset().mockResolvedValue({});

    process.env.PUBLIC_URL = 'http://localhost:3000';
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  // Line 119: register with email where split('@')[0] is empty
  it('L119: should use "User" as name when email local part is empty', async () => {
    users.create.mockResolvedValueOnce({ $id: 'test-uid' });
    userRepository.createUser.mockResolvedValueOnce({
      ...defaultUser,
      id: 'test-uid',
      email: '@example.com',
      name: 'User',
    });

    const result = await register({ email: '@example.com', password: 'Password1!', role: 'freelancer' });
    expect(result).toHaveProperty('user');
    expect(userRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'User' })
    );
  });

  // Line 156: register catch with non-Error deleteError
  it('L156: should handle non-Error deleteError in compensation', async () => {
    users.create.mockResolvedValueOnce({ $id: 'orphan-uid' });
    userRepository.createUser.mockResolvedValueOnce({
      ...defaultUser,
      id: 'orphan-uid',
    });
    global.mockAppwriteAccount.createEmailPasswordSession.mockRejectedValueOnce(new Error('Session failed'));
    users.delete.mockRejectedValueOnce('string error, not an Error');

    const result = await register({ email: 'test@example.com', password: 'Password1!', role: 'freelancer' });
    expect(logger.error).toHaveBeenCalledWith(
      'CRITICAL: Failed to delete orphaned Appwrite user',
      expect.objectContaining({ deleteError: 'string error, not an Error' })
    );
    expect(result).toHaveProperty('code', 'INTERNAL_ERROR');
  });

  // Line 172: register catch with error that has falsy message
  it('L172: should use fallback message when error has no message', async () => {
    const error = new Error();
    error.message = '';
    users.create.mockRejectedValueOnce(error);

    const result = await register({ email: 'test@example.com', password: 'Password1!', role: 'freelancer' });
    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create user',
    });
  });

  // Lines 344-361: requestPasswordReset with FRONTEND_URL fallback
  it('L344-348: should use FRONTEND_URL when PUBLIC_URL not set', async () => {
    delete process.env.PUBLIC_URL;
    process.env.FRONTEND_URL = 'http://localhost:4000';

    const result = await requestPasswordReset('test@example.com');
    expect(result).toEqual({ success: true });
    expect(global.mockAppwriteAccount.createRecovery).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:4000/reset-password',
      })
    );
  });

  it('L344-348: should use default localhost when neither PUBLIC_URL nor FRONTEND_URL set', async () => {
    delete process.env.PUBLIC_URL;
    delete process.env.FRONTEND_URL;

    const result = await requestPasswordReset('test@example.com');
    expect(result).toEqual({ success: true });
    expect(global.mockAppwriteAccount.createRecovery).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:5173/reset-password',
      })
    );
  });

  it('L344-348: should strip trailing slashes from PUBLIC_URL', async () => {
    process.env.PUBLIC_URL = 'http://localhost:3000/';

    const result = await requestPasswordReset('test@example.com');
    expect(result).toEqual({ success: true });
    expect(global.mockAppwriteAccount.createRecovery).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:3000/reset-password',
      })
    );
  });

  // Line 417: logout with error that has no message
  it('L417: should use fallback message when logout error has no message', async () => {
    const error = new Error();
    error.message = '';
    global.mockAppwriteAccount.deleteSession.mockRejectedValueOnce(error);

    const result = await logout('valid-token');
    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Failed to logout',
    });
  });

  // Line 533: enrollMFA with default factorType (no argument)
  it('L533: should default to totp factorType when no argument provided', async () => {
    const result = await enrollMFA('token');
    expect(result).toHaveProperty('success', true);
    expect(global.mockAppwriteAccount.createMFAAuthenticator).toHaveBeenCalledWith({ type: 'totp' });
  });

  // Line 566: enrollMFA with error that has no message
  it('L566: should use fallback message when MFA enrollment error has no message', async () => {
    const error = new Error();
    error.message = '';
    global.mockAppwriteAccount.createMFAAuthenticator.mockRejectedValueOnce(error);

    const result = await enrollMFA('token', 'totp');
    expect(result).toEqual({
      code: 'MFA_ENROLLMENT_FAILED',
      message: 'Failed to enroll in MFA',
    });
  });

  // Line 599: verifyMFAEnrollment with error that has no message
  it('L599: should use fallback message when MFA verify error has no message', async () => {
    const error = new Error();
    error.message = '';
    global.mockAppwriteAccount.updateMFAAuthenticator.mockRejectedValueOnce(error);

    const result = await verifyMFAEnrollment('token', 'totp', '123456');
    expect(result).toEqual({
      code: 'MFA_VERIFY_FAILED',
      message: 'Invalid MFA code',
    });
  });

  // Line 644: verifyMFAChallenge with error that has no message
  it('L644: should use fallback message when MFA challenge error has no message', async () => {
    const error = new Error();
    error.message = '';
    global.mockAppwriteAccount.updateMFAChallenge.mockRejectedValueOnce(error);

    const result = await verifyMFAChallenge('token', 'totp', 'challenge-id', 'wrong');
    expect(result).toEqual({
      code: 'MFA_CHALLENGE_FAILED',
      message: 'Invalid MFA code',
    });
  });

  // Line 738: resendConfirmationEmail with FRONTEND_URL fallback
  it('L738: should use FRONTEND_URL when PUBLIC_URL not set in resendConfirmationEmail', async () => {
    delete process.env.PUBLIC_URL;
    process.env.FRONTEND_URL = 'http://localhost:4000';
    userRepository.getUserByEmail.mockResolvedValueOnce(defaultUser);

    const result = await resendConfirmationEmail('test@example.com');
    expect(result).toEqual({ success: true });
    expect(global.mockAppwriteAccount.createVerification).toHaveBeenCalledWith(
      'http://localhost:4000/verify-email'
    );
  });

  it('L738: should use default localhost when both URLs missing in resendConfirmationEmail', async () => {
    delete process.env.PUBLIC_URL;
    delete process.env.FRONTEND_URL;
    userRepository.getUserByEmail.mockResolvedValueOnce(defaultUser);

    const result = await resendConfirmationEmail('test@example.com');
    expect(result).toEqual({ success: true });
    expect(global.mockAppwriteAccount.createVerification).toHaveBeenCalledWith(
      'http://localhost:5173/verify-email'
    );
  });

  // Line 811: registerWithAppwrite with appwriteUser having no name and empty email prefix
  it('L811: should use "User" as name when appwrite user has no name and empty email prefix', async () => {
    userRepository.getUserById.mockResolvedValueOnce(null);
    global.mockAppwriteAccount.get.mockResolvedValueOnce({
      $id: 'new-uid',
      email: '@example.com',
      name: '',
      mfa: false,
    });
    userRepository.createUser.mockResolvedValueOnce({
      ...defaultUser,
      id: 'new-uid',
      email: '@example.com',
      name: 'User',
    });

    const result = await registerWithAppwrite('valid-token', 'freelancer');
    expect(result).toHaveProperty('user');
    expect(userRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'User' })
    );
  });

  it('L811: should use appwriteUser.name when available', async () => {
    userRepository.getUserById.mockResolvedValueOnce(null);
    global.mockAppwriteAccount.get.mockResolvedValueOnce({
      $id: 'new-uid',
      email: 'test@example.com',
      name: 'John Doe',
      mfa: false,
    });
    userRepository.createUser.mockResolvedValueOnce({
      ...defaultUser,
      id: 'new-uid',
      email: 'test@example.com',
      name: 'John Doe',
    });

    const result = await registerWithAppwrite('valid-token', 'freelancer');
    expect(result).toHaveProperty('user');
    expect(userRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'John Doe' })
    );
  });

  // Lines 839-858: requestEmailOtp and requestMagicUrl with error that has no message
  it('L839: should use fallback message when email OTP error has no message', async () => {
    const error = new Error();
    error.message = '';
    global.mockAppwriteAccount.createEmailToken.mockRejectedValueOnce(error);

    const result = await requestEmailOtp('test@example.com');
    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Failed to send OTP to email',
    });
  });

  it('L858: should use fallback message when magic URL error has no message', async () => {
    const error = new Error();
    error.message = '';
    global.mockAppwriteAccount.createMagicURLToken.mockRejectedValueOnce(error);

    const result = await requestMagicUrl('test@example.com');
    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Failed to send Magic URL',
    });
  });

  // Line 417: getMFAFactors error with message
  it('L668: should handle getMFAFactors with error that has no message', async () => {
    const error = new Error();
    error.message = '';
    global.mockAppwriteAccount.listMFAFactors.mockRejectedValueOnce(error);

    const { getMFAFactors } = await import('../../services/auth-service.js');
    const result = await getMFAFactors('token');
    expect(result).toEqual({
      code: 'MFA_LIST_FAILED',
      message: '',
    });
  });

  // Line 566: disableMFA error with no message
  it('L716: should handle disableMFA error with no message', async () => {
    const error = new Error();
    error.message = '';
    global.mockAppwriteAccount.createMFAChallenge.mockRejectedValueOnce(error);

    const { disableMFA } = await import('../../services/auth-service.js');
    const result = await disableMFA('token', 'totp', '123456');
    expect(result).toEqual({
      code: 'MFA_DISABLE_FAILED',
      message: '',
    });
  });
});

describe('auth-service - Additional Branch Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const maa = global.mockAppwriteAccount;
    maa.get.mockReset().mockResolvedValue({ $id: 'test-user-id', email: 'test@example.com' });
    maa.createEmailPasswordSession.mockReset().mockResolvedValue({ secret: 'test-session-secret' });
    maa.deleteSession.mockReset().mockResolvedValue({});
    maa.createRecovery.mockReset().mockResolvedValue({});
    maa.createMFAAuthenticator.mockReset().mockResolvedValue({ uri: 'otpauth://...', secret: 'MOCK' });
    maa.updateMFAAuthenticator.mockReset().mockResolvedValue({});
    maa.createMFAChallenge.mockReset().mockResolvedValue({ $id: 'challenge-id' });
    maa.updateMFAChallenge.mockReset().mockResolvedValue({});
    maa.listMFAFactors.mockReset().mockResolvedValue({ totp: true });
    maa.deleteMFAAuthenticator.mockReset().mockResolvedValue({});
    maa.createMfaRecoveryCodes.mockReset().mockResolvedValue({ recoveryCodes: ['code1', 'code2'] });
    maa.updateMFA.mockReset().mockResolvedValue({});
    maa.createVerification.mockReset().mockResolvedValue({});
    maa.createEmailToken.mockReset().mockResolvedValue({ userId: 'test-user-id' });
    maa.createMagicURLToken.mockReset().mockResolvedValue({ userId: 'test-user-id' });
    maa.createSession.mockReset().mockResolvedValue({ secret: 'new-session-secret' });

    userRepository.emailExists.mockReset().mockResolvedValue(false);
    userRepository.createUser.mockReset().mockImplementation(async (user) => ({
      ...user,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    userRepository.getUserByEmail.mockReset().mockResolvedValue(null);
    userRepository.getUserById.mockReset().mockResolvedValue(null);
    userRepository.update.mockReset().mockResolvedValue({});

    users.create.mockReset().mockResolvedValue({ $id: 'test-appwrite-user-id' });
    users.delete.mockReset().mockResolvedValue({});

    process.env.PUBLIC_URL = 'http://localhost:3000';
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  // L361: error.message || 'Failed to send password reset email' when message is falsy
  it('L361: should use fallback message when requestPasswordReset error has no message', async () => {
    const error = new Error();
    error.message = '';
    global.mockAppwriteAccount.createRecovery.mockRejectedValueOnce(error);

    const result = await requestPasswordReset('test@example.com');
    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Failed to send password reset email',
    });
  });

  // L851: requestMagicUrl with PUBLIC_URL fallback to FRONTEND_URL
  it('L851: should use FRONTEND_URL when PUBLIC_URL not set in requestMagicUrl', async () => {
    delete process.env.PUBLIC_URL;
    process.env.FRONTEND_URL = 'http://localhost:4000';

    const result = await requestMagicUrl('test@example.com');
    expect(result).toEqual({ userId: 'test-user-id' });
    expect(global.mockAppwriteAccount.createMagicURLToken).toHaveBeenCalledWith(
      expect.any(String),
      'test@example.com',
      'http://localhost:4000/auth/magic-url-callback'
    );
  });

  // L851: requestMagicUrl with default localhost when both env vars missing
  it('L851: should use default localhost when both URLs missing in requestMagicUrl', async () => {
    delete process.env.PUBLIC_URL;
    delete process.env.FRONTEND_URL;

    const result = await requestMagicUrl('test@example.com');
    expect(result).toEqual({ userId: 'test-user-id' });
    expect(global.mockAppwriteAccount.createMagicURLToken).toHaveBeenCalledWith(
      expect.any(String),
      'test@example.com',
      'http://localhost:5173/auth/magic-url-callback'
    );
  });

  // L851: requestMagicUrl with PUBLIC_URL having trailing slashes
  it('L851: should strip trailing slashes from PUBLIC_URL in requestMagicUrl', async () => {
    process.env.PUBLIC_URL = 'http://localhost:3000/';

    const result = await requestMagicUrl('test@example.com');
    expect(result).toEqual({ userId: 'test-user-id' });
    expect(global.mockAppwriteAccount.createMagicURLToken).toHaveBeenCalledWith(
      expect.any(String),
      'test@example.com',
      'http://localhost:3000/auth/magic-url-callback'
    );
  });

  // Helper coverage: getErrorMessage with a plain object that has a string message
  it('helpers: should surface a generic message from a plain object error in register', async () => {
    users.create.mockRejectedValueOnce({ message: 'Plain failure' });

    // BUG-5 fix: raw upstream error details must NOT leak to the client (CWE-209).
    const result = await register({ email: 'test@example.com', password: 'Password1!', role: 'freelancer' });
    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create user',
    });
  });

  // Helper coverage: getErrorType/getErrorMessage with a non-object (string) throw in login
  it('helpers: should handle a string throw from account.get during login', async () => {
    global.mockAppwriteAccount.get.mockRejectedValueOnce('connection reset');

    const result = await login({ email: 'test@example.com', password: 'Password1!' });
    expect(result).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
  });

  // Helper coverage: getErrorCode with a non-object (string) throw in register
  it('helpers: should fall back to generic message when register throws a string', async () => {
    users.create.mockRejectedValueOnce('boom');

    const result = await register({ email: 'test@example.com', password: 'Password1!', role: 'freelancer' });
    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create user',
    });
  });

  // Helper coverage: getErrorMessage when the thrown object has a non-string message
  it('helpers: should fall back to generic message when error message is not a string', async () => {
    users.create.mockRejectedValueOnce({ message: 42 });

    const result = await register({ email: 'test@example.com', password: 'Password1!', role: 'freelancer' });
    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Failed to create user',
    });
  });
});

describe('auth-service - updateUserWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update the wallet address successfully when none is set', async () => {
    userRepository.getUserById.mockResolvedValueOnce({ id: 'u-1', wallet_address: null });
    userRepository.updateUser.mockResolvedValueOnce({ id: 'u-1', wallet_address: '0x123' });

    const result = await updateUserWallet('u-1', '0x123');

    expect(userRepository.updateUser).toHaveBeenCalledWith('u-1', { wallet_address: '0x123' });
    expect(result).toEqual({ walletAddress: '0x123' });
  });

  it('should fall back to the requested address when the stored value is empty', async () => {
    userRepository.getUserById.mockResolvedValueOnce({ id: 'u-1', wallet_address: '' });
    userRepository.updateUser.mockResolvedValueOnce({ id: 'u-1', wallet_address: null });

    const result = await updateUserWallet('u-1', '0x123');

    expect(result).toEqual({ walletAddress: '0x123' });
  });

  it('should return WALLET_LOCKED when a different wallet is already set', async () => {
    userRepository.getUserById.mockResolvedValueOnce({ id: 'u-1', wallet_address: '0xOLD' });

    const result = await updateUserWallet('u-1', '0xNEW');

    expect(result).toEqual({ code: 'WALLET_LOCKED', message: 'Wallet address is already set and cannot be changed' });
    expect(userRepository.updateUser).not.toHaveBeenCalled();
  });

  it('should accept the same wallet in different casing without a write', async () => {
    userRepository.getUserById.mockResolvedValueOnce({ id: 'u-1', wallet_address: '0xAbC' });

    const result = await updateUserWallet('u-1', '0xabc');

    expect(result).toEqual({ walletAddress: '0xAbC' });
    expect(userRepository.updateUser).not.toHaveBeenCalled();
  });

  it('should return USER_NOT_FOUND when the user does not exist', async () => {
    userRepository.getUserById.mockResolvedValueOnce(null);

    const result = await updateUserWallet('missing', '0x123');

    expect(result).toEqual({ code: 'USER_NOT_FOUND', message: 'User not found' });
  });

  it('should return UPDATE_FAILED when the update throws', async () => {
    userRepository.getUserById.mockResolvedValueOnce({ id: 'u-1', wallet_address: null });
    userRepository.updateUser.mockRejectedValueOnce(new Error('DB error'));

    const result = await updateUserWallet('u-1', '0x123');

    expect(result).toEqual({ code: 'UPDATE_FAILED', message: 'Failed to update wallet address' });
  });
});
