// @ts-nocheck
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
const adminCreateSession = jest.fn<any>();
const adminCreateEmailSession = jest.fn<any>();
const usersCreateSession = jest.fn<any>();
const usersGet = jest.fn<any>();
const guestCreateSession = jest.fn<any>();
const accountGet = jest.fn<any>();
const accountDeleteSession = jest.fn<any>();
const accountDeleteSessions = jest.fn<any>();
const accountUpdateRecovery = jest.fn<any>();
const accountUpdatePassword = jest.fn<any>();
const accountCreateVerification = jest.fn<any>();
const createOAuth2Token = jest.fn<any>();
const userGetById = jest.fn<any>();
const userGetByEmail = jest.fn<any>();
const userEmailExists = jest.fn<any>();
const getContractsByFreelancer = jest.fn<any>();
const getContractsByEmployer = jest.fn<any>();
const fetchMock = jest.fn<any>();
const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
const checkAccountLockout = jest.fn<any>();
const recordFailedLogin = jest.fn<any>();
const resetFailedLogins = jest.fn<any>();

const config = {
  server: { nodeEnv: 'production' },
  appwrite: { endpoint: 'https://appwrite.example/v1', projectId: 'Project-ID' },
};

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({ config }));
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({ logger }));
jest.unstable_mockModule('node-appwrite', () => ({
  ID: { unique: () => 'unique-id' },
  OAuthProvider: {}, AuthenticatorType: {}, AuthenticationFactor: {},
  Account: jest.fn(function(client: { token?: string }) {
    return {
      createSession: guestCreateSession,
      get: accountGet,
      deleteSession: accountDeleteSession,
      deleteSessions: accountDeleteSessions,
      updateRecovery: accountUpdateRecovery,
      updatePassword: accountUpdatePassword,
      createVerification: accountCreateVerification,
      createOAuth2Token,
    };
  }),
}));
jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  account: {
    createSession: adminCreateSession,
    createEmailPasswordSession: adminCreateEmailSession,
  },
  createUserClient: jest.fn((token: string) => ({ token })),
  users: {
    createSession: usersCreateSession,
    get: usersGet,
    delete: jest.fn(),
    create: jest.fn().mockResolvedValue({ $id: 'new-appwrite-user-id' }),
  },
}));
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: {
    getUserById: userGetById,
    getUserByEmail: userGetByEmail,
    emailExists: userEmailExists,
    createUser: jest.fn().mockImplementation((u: any) => Promise.resolve({ ...u, id: u.id || 'new-user-id' })),
    updateUser: jest.fn(), deleteUser: jest.fn(),
  },
}));
jest.unstable_mockModule(resolveModule('src/repositories/didit-kyc-repository.ts'), () => ({
  getKycVerificationByUserId: jest.fn().mockResolvedValue(null),
}));
jest.unstable_mockModule(resolveModule('src/repositories/contract-repository.ts'), () => ({
  contractRepository: {
    getContractsByFreelancer,
    getContractsByEmployer,
  },
}));
for (const [modulePath, exportName] of [
  ['src/repositories/freelancer-profile-repository.ts', 'freelancerProfileRepository'],
  ['src/repositories/employer-profile-repository.ts', 'employerProfileRepository'],
  ['src/repositories/email-preference-repository.ts', 'emailPreferenceRepository'],
  ['src/repositories/favorites-repository.ts', 'favoriteRepository'],
] as const) {
  jest.unstable_mockModule(resolveModule(modulePath), () => ({
    [exportName]: {},
  }));
}
jest.unstable_mockModule(resolveModule('src/services/email-delivery-service.ts'), () => ({
  sendAccountDeletionCodeEmail: jest.fn(), sendAccountDeletedEmail: jest.fn(),
}));
jest.unstable_mockModule(resolveModule('src/services/subscription-service.ts'), () => ({
  getEntitlement: jest.fn().mockResolvedValue({
    success: true,
    data: { plan: 'free', status: 'none', currentPeriodEnd: null, cancelAtPeriodEnd: false },
  }),
}));
jest.unstable_mockModule(resolveModule('src/utils/disposable-email.ts'), () => ({
  isDisposableEmail: jest.fn(() => false),
}));
jest.unstable_mockModule(resolveModule('src/utils/login-security.ts'), () => ({
  checkAccountLockout,
  recordFailedLogin,
  resetFailedLogins,
}));

global.fetch = fetchMock;
const auth = await import('../../services/auth-service.js');
const { getEntitlement } = await import('../../services/subscription-service.js');

const publicUser = {
  id: 'user-1', email: 'user@example.com', name: 'User', role: 'freelancer',
  wallet_address: '', is_suspended: false, suspension_reason: null,
  created_at: '2025-01-01', updated_at: '2025-01-01',
};

const response = ({
  ok = true, status = 200, json = {}, text = '', cookie = null, cookies = [],
}: any = {}) => ({
  ok, status,
  json: jest.fn().mockResolvedValue(json),
  text: jest.fn().mockResolvedValue(text),
  headers: {
    get: jest.fn((name: string) => name.toLowerCase() === 'set-cookie' ? cookie : null),
    getSetCookie: jest.fn(() => cookies),
  },
});

describe('auth service production session exchange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usersCreateSession.mockResolvedValue({ $id: 'session-1', secret: 'users-session-secret' });
    adminCreateSession.mockResolvedValue({ secret: 'admin-session-secret' });
    adminCreateEmailSession.mockResolvedValue({ secret: 'email-session-secret' });
    guestCreateSession.mockResolvedValue({ secret: 'guest-session-secret' });
    accountGet.mockResolvedValue({ $id: 'user-1', emailVerification: true });
    accountDeleteSession.mockResolvedValue({});
    checkAccountLockout.mockReturnValue({ isLocked: false });
    recordFailedLogin.mockReturnValue({ isLocked: false, remainingAttempts: 4 });
    usersGet.mockResolvedValue({ emailVerification: true, passwordUpdate: '2025-01-01' });
    userGetById.mockResolvedValue(publicUser);
    userGetByEmail.mockResolvedValue(publicUser);
    userEmailExists.mockResolvedValue(false);
    accountCreateVerification.mockResolvedValue({});
    getContractsByFreelancer.mockResolvedValue({ items: [] });
    getContractsByEmployer.mockResolvedValue({ items: [] });
    fetchMock.mockResolvedValue(response());
  });

  it.each([
    [['users:view'], ['users:view']],
    ['["kyc:view"]', ['kyc:view']],
    ['{bad-json', undefined],
  ])('normalizes stored permissions from %p', async (permissions, expected) => {
    const result = await auth.createAuthResult({ ...publicUser, permissions }, 'session-secret');

    expect(result.user.permissions).toEqual(expected);
    expect(result.user.emailVerification).toBe(true);
  });

  it('marks OAuth-authenticated users and tolerates metadata lookup failures in auth results', async () => {
    usersGet.mockResolvedValueOnce({ emailVerification: true, passwordUpdate: '' });
    const oauthResult = await auth.createAuthResult(publicUser, 'session-secret');
    expect(oauthResult.user).toMatchObject({ authProvider: 'oauth', emailVerification: true });

    usersGet.mockRejectedValueOnce(new Error('metadata unavailable'));
    const fallbackResult = await auth.createAuthResult(publicUser, 'session-secret');
    expect(fallbackResult.user).toMatchObject({ authProvider: 'email', emailVerification: false });
  });

  it('uses the server-side users session when Appwrite supplies a secret', async () => {
    const result = await auth.verifyAuthToken('user-1', 'one-time-secret');

    expect(result.user.id).toBe('user-1');
    expect(usersCreateSession).toHaveBeenCalledWith('user-1');
    expect(guestCreateSession).not.toHaveBeenCalled();
  });

  it('falls back to the guest SDK token exchange when users.createSession fails', async () => {
    usersCreateSession.mockRejectedValueOnce(new Error('not supported'));

    const result = await auth.verifyAuthToken('user-1', 'one-time-secret');

    expect(result.user.id).toBe('user-1');
    expect(guestCreateSession).toHaveBeenCalledWith({ userId: 'user-1', secret: 'one-time-secret' });
  });

  it('retries a JWT-shaped token with its raw value after decoded-secret exchange fails', async () => {
    const payload = Buffer.from(JSON.stringify({ secret: 'decoded-secret' })).toString('base64url');
    const jwtSecret = `eyHeader.${payload}.signature`;
    usersCreateSession.mockRejectedValueOnce(new Error('not supported'));
    guestCreateSession
      .mockRejectedValueOnce(new Error('decoded rejected'))
      .mockResolvedValueOnce({ secret: 'raw-jwt-session' });

    const result = await auth.verifyAuthToken('user-1', jwtSecret);

    expect(result.user.id).toBe('user-1');
    expect(guestCreateSession).toHaveBeenNthCalledWith(1, { userId: 'user-1', secret: 'decoded-secret' });
    expect(guestCreateSession).toHaveBeenNthCalledWith(2, { userId: 'user-1', secret: jwtSecret });
  });

  it('falls back to HTTP and reads the session secret from JSON', async () => {
    usersCreateSession.mockRejectedValueOnce(new Error('not supported'));
    guestCreateSession.mockRejectedValueOnce(new Error('guest exchange failed'));
    fetchMock.mockResolvedValueOnce(response({ json: { secret: 'http-json-secret' } }));

    const result = await auth.verifyAuthToken('user-1', 'one-time-secret');

    expect(result.user.id).toBe('user-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://appwrite.example/v1/account/sessions/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    ['a_session_project-id=project%20cookie; Path=/', [], 'project cookie'],
    [null, ['a_session_other=generic-cookie; Path=/'], 'generic-cookie'],
  ])('reads HTTP session cookies from provider headers', async (cookie, cookies, expectedSecret) => {
    usersCreateSession.mockRejectedValueOnce(new Error('not supported'));
    guestCreateSession.mockRejectedValueOnce(new Error('guest exchange failed'));
    fetchMock.mockResolvedValueOnce(response({ json: {}, cookie, cookies }));

    const result = await auth.verifyAuthToken('user-1', 'one-time-secret');

    expect(result.user.id).toBe('user-1');
    expect(accountGet).toHaveBeenCalled();
  });

  it('uses the admin session as the last fallback for an HTTP error', async () => {
    usersCreateSession.mockRejectedValueOnce(new Error('not supported'));
    guestCreateSession.mockRejectedValueOnce(new Error('guest exchange failed'));
    fetchMock.mockResolvedValueOnce(response({ ok: false, status: 401, text: 'invalid token' }));

    const result = await auth.verifyAuthToken('user-1', 'one-time-secret');

    expect(result.user.id).toBe('user-1');
    expect(adminCreateSession).toHaveBeenCalledWith({ userId: 'user-1', secret: 'one-time-secret' });
  });

  it('returns invalid credentials when every token exchange path fails', async () => {
    usersCreateSession.mockRejectedValueOnce(new Error('not supported'));
    guestCreateSession.mockRejectedValueOnce(new Error('guest exchange failed'));
    adminCreateSession.mockRejectedValueOnce(new Error('admin exchange failed'));
    fetchMock.mockResolvedValueOnce(response({ ok: false, status: 401, text: 'invalid token' }));

    await expect(auth.verifyAuthToken('user-1', 'one-time-secret')).resolves.toEqual({
      code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid or expired code/token',
    });
  });

  it('returns registration-required with the exchanged session attached', async () => {
    userGetById.mockResolvedValueOnce(null);

    const result = await auth.verifyAuthToken('new-user', 'one-time-secret');

    expect(result).toEqual({
      code: 'AUTH_REQUIRE_REGISTRATION',
      message: 'User authenticated but profile not found. Please register.',
      accessToken: 'users-session-secret',
    });
  });

  it('passes through non-registration authentication errors', async () => {
    userGetById.mockResolvedValueOnce({ ...publicUser, is_suspended: true, suspension_reason: 'Policy review' });

    const result = await auth.verifyAuthToken('user-1', 'one-time-secret');

    expect(result).toEqual({ code: 'USER_SUSPENDED', message: 'Policy review' });
  });

  it('reports a missing token-session secret after a successful HTTP exchange', async () => {
    usersCreateSession.mockRejectedValueOnce(new Error('not supported'));
    guestCreateSession.mockRejectedValueOnce(new Error('guest exchange failed'));
    fetchMock.mockResolvedValueOnce(response({ json: {}, cookie: null, cookies: [] }));

    await expect(auth.verifyAuthToken('user-1', 'one-time-secret')).resolves.toEqual({
      code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid or expired code/token',
    });
  });

  it('uses the direct admin email session in production when available', async () => {
    const result = await auth.login({ email: 'USER@example.com', password: 'Password1!' });

    expect(result.user.id).toBe('user-1');
    expect(adminCreateEmailSession).toHaveBeenCalledWith({
      email: 'user@example.com', password: 'Password1!',
    });
  });

  it('falls back to the email-session HTTP endpoint and reads its cookie', async () => {
    adminCreateEmailSession.mockRejectedValueOnce(new Error('admin login unavailable'));
    fetchMock.mockResolvedValueOnce(response({
      json: {}, cookie: 'a_session_project-id=email-cookie; Path=/',
    }));

    const result = await auth.login({ email: 'user@example.com', password: 'Password1!' });

    expect(result.user.id).toBe('user-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://appwrite.example/v1/account/sessions/email',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reports invalid credentials when the email-session HTTP endpoint rejects the login', async () => {
    adminCreateEmailSession.mockRejectedValueOnce(new Error('admin login unavailable'));
    fetchMock.mockResolvedValueOnce(response({ ok: false, status: 401, text: 'bad credentials' }));

    const result = await auth.login({ email: 'user@example.com', password: 'wrong' });

    expect(result).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('reports missing secrets from successful email-session responses', async () => {
    adminCreateEmailSession.mockRejectedValueOnce(new Error('admin login unavailable'));
    fetchMock.mockResolvedValueOnce(response({ json: {}, cookie: null, cookies: [] }));

    const result = await auth.login({ email: 'user@example.com', password: 'wrong' });

    expect(result).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('blocks a login that is already locked and reports a newly triggered lock', async () => {
    checkAccountLockout.mockReturnValueOnce({ isLocked: true, remainingMinutes: 7 });
    const alreadyLocked = await auth.login({ email: 'user@example.com', password: 'wrong' });
    expect(alreadyLocked).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect(adminCreateEmailSession).not.toHaveBeenCalled();

    checkAccountLockout.mockReturnValueOnce({ isLocked: false });
    adminCreateEmailSession.mockRejectedValueOnce(new Error('bad credentials'));
    fetchMock.mockResolvedValueOnce(response({ ok: false, status: 401, text: 'bad credentials' }));
    recordFailedLogin.mockReturnValueOnce({ isLocked: true, remainingAttempts: 0, lockedUntil: Date.now() + 1000 });
    const newlyLocked = await auth.login({ email: 'user@example.com', password: 'wrong' });
    expect(newlyLocked).toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });

  it('logs cleanup failure when an unverified login session cannot be deleted', async () => {
    accountGet.mockResolvedValueOnce({ $id: 'user-1', emailVerification: false });
    accountDeleteSession.mockRejectedValueOnce(new Error('cleanup failed'));

    const result = await auth.login({ email: 'user@example.com', password: 'Password1!' });

    expect(result).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to delete unverified email session', expect.any(Object),
    );
  });

  it('constructs and returns the OAuth URL with custom redirect URL', async () => {
    const url = await auth.getOAuthUrl('google', 'https://frontend.example/');
    expect(url).toContain('/account/tokens/oauth2/google');
    expect(url).toContain('success=https%3A%2F%2Ffrontend.example%2Fauth%2Fcallback');
    expect(url).toContain('failure=https%3A%2F%2Ffrontend.example%2Flogin%3Ferror%3Doauth_failed');
  });

  it('reads OAuth provider metadata for the current user and tolerates provider failure', async () => {
    usersGet.mockResolvedValueOnce({ emailVerification: true, passwordUpdate: '' });
    const oauthUser = await auth.getCurrentUserWithKyc('user-1');
    expect(oauthUser).toMatchObject({ authProvider: 'oauth', emailVerification: true });

    usersGet.mockRejectedValueOnce(new Error('metadata unavailable'));
    const fallbackUser = await auth.getCurrentUserWithKyc('user-1');
    expect(fallbackUser).toMatchObject({ authProvider: 'email', emailVerification: false });
  });

  it('re-throws non-duplicate email error during register (line 470)', async () => {
    userEmailExists.mockRejectedValueOnce(new Error('Database timeout'));
    await expect(
      auth.register({
        email: 'test@example.com',
        password: 'Password1!',
        name: 'Test',
        role: 'freelancer',
      })
    ).rejects.toThrow('Database timeout');
  });

  it('resets failed logins when password reset succeeds (line 746)', async () => {
    accountUpdateRecovery.mockResolvedValueOnce({});
    userGetById.mockResolvedValueOnce({ email: 'user@example.com' });

    const result = await auth.resetPasswordWithRecovery('user-1', 'secret-1', 'NewPassword1!');
    expect(result).toEqual({ success: true });
    expect(resetFailedLogins).toHaveBeenCalledWith('user@example.com');
  });

  it('attempts fallback single session deletion when deleteSessions fails during direct password update (lines 884-888)', async () => {
    accountUpdatePassword.mockResolvedValueOnce({});
    accountDeleteSessions.mockRejectedValueOnce(new Error('bulk delete failed'));
    accountDeleteSession.mockRejectedValueOnce(new Error('single delete failed'));

    const result = await auth.changePassword('test-token', 'OldPassword1!', 'NewPassword2!');
    expect(result).toEqual({ success: true });
    expect(logger.debug).toHaveBeenCalledWith(
      'deleteSessions failed during password reset, trying single session deletion',
      expect.any(Object),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'Current session deletion failed during password reset',
      expect.any(Object),
    );
  });

  it('logs warning when email verification dispatch fails silently upon register (line 346)', async () => {
    accountCreateVerification.mockRejectedValueOnce(new Error('verification failed'));
    const result = await auth.register({
      email: 'newuser@example.com',
      password: 'Password1!',
      name: 'New User',
      role: 'freelancer',
    });
    expect(result).toHaveProperty('user');
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to send verification email upon registration',
      expect.objectContaining({ error: 'verification failed', email: 'newuser@example.com' })
    );
  });

  it('throws ActiveContractsError when employer has active contracts during account deletion (line 1472)', async () => {
    getContractsByFreelancer.mockResolvedValueOnce({ items: [] });
    getContractsByEmployer.mockResolvedValueOnce({ items: [{ status: 'active' }] });

    const result = await auth.requestAccountDeletion('user-1');
    expect(result).toEqual({
      code: 'ACTIVE_CONTRACTS_EXIST',
      message: 'Cannot delete account while you have active or disputed contracts with pending escrow funds. Please complete or resolve active contracts first.',
    });
  });

  describe('HTTP fallback edge cases (production)', () => {
    // Headers deliberately omit getSetCookie() so the fallback takes the
    // "no getSetCookie" side of the conditional at the call sites.
    const headersWithoutGetSetCookie = (cookie: string | null) => ({
      get: jest.fn((name: string) => (name.toLowerCase() === 'set-cookie' ? cookie : null)),
    });

    it('reports invalid credentials when the token HTTP fallback returns an unparsable body with no cookies', async () => {
      usersCreateSession.mockRejectedValueOnce(new Error('not supported'));
      guestCreateSession.mockRejectedValueOnce(new Error('guest exchange failed'));
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error('malformed json')),
        text: jest.fn().mockResolvedValue(''),
        headers: headersWithoutGetSetCookie(null),
      });

      await expect(auth.verifyAuthToken('user-1', 'one-time-secret')).resolves.toEqual({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid or expired code/token',
      });
    });

    it('reads the email-session secret from the set-cookie header when the body is unparsable', async () => {
      adminCreateEmailSession.mockRejectedValueOnce(new Error('admin login unavailable'));
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error('malformed json')),
        text: jest.fn().mockResolvedValue(''),
        headers: headersWithoutGetSetCookie('a_session_project-id=email-cookie; Path=/'),
      });

      const result = await auth.login({ email: 'user@example.com', password: 'Password1!' });

      expect(result.user.id).toBe('user-1');
      expect(accountGet).toHaveBeenCalled();
    });

    it('returns the secret from the email-session JSON body when present', async () => {
      adminCreateEmailSession.mockRejectedValueOnce(new Error('admin login unavailable'));
      fetchMock.mockResolvedValueOnce(response({ json: { secret: 'email-json-secret' } }));

      const result = await auth.login({ email: 'user@example.com', password: 'Password1!' });

      expect(result.user.id).toBe('user-1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://appwrite.example/v1/account/sessions/email',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('login hardening edge cases', () => {
    it('falls back to the 15 minute lockout duration when remainingMinutes is missing', async () => {
      checkAccountLockout.mockReturnValueOnce({ isLocked: true });

      const result = await auth.login({ email: 'user@example.com', password: 'wrong' });

      expect(result).toMatchObject({ code: 'ACCOUNT_LOCKED' });
      expect(result.message).toContain('after 15 minutes');
    });

    it('treats an account without emailVerification metadata as unverified', async () => {
      accountGet.mockResolvedValueOnce({ $id: 'user-1' });

      const result = await auth.login({ email: 'user@example.com', password: 'Password1!' });

      expect(result).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    });

    it('reports a single attempt remaining after a failed login', async () => {
      adminCreateEmailSession.mockRejectedValueOnce(new Error('bad credentials'));
      fetchMock.mockResolvedValueOnce(response({ ok: false, status: 401, text: 'bad credentials' }));
      recordFailedLogin.mockReturnValueOnce({ isLocked: false, remainingAttempts: 1 });

      const result = await auth.login({ email: 'user@example.com', password: 'wrong' });

      expect(result).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(result.message).toBe(
        'Invalid email or password. 1 attempt remaining before your account is locked.',
      );
    });

    it('reports multiple attempts remaining after a failed login', async () => {
      adminCreateEmailSession.mockRejectedValueOnce(new Error('bad credentials'));
      fetchMock.mockResolvedValueOnce(response({ ok: false, status: 401, text: 'bad credentials' }));
      recordFailedLogin.mockReturnValueOnce({ isLocked: false, remainingAttempts: 2 });

      const result = await auth.login({ email: 'user@example.com', password: 'wrong' });

      expect(result).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(result.message).toBe(
        'Invalid email or password. 2 attempts remaining before your account is locked.',
      );
    });
  });

  describe('getCurrentUserWithKyc metadata edge cases', () => {
    it('defaults emailVerification to false when the Appwrite metadata omits it', async () => {
      usersGet.mockResolvedValueOnce({ passwordUpdate: '2025-01-01' });

      const result = await auth.getCurrentUserWithKyc('user-1');

      expect(result).toMatchObject({ emailVerification: false, authProvider: 'email' });
    });

    it('falls back to the free plan when the entitlement lookup fails', async () => {
      getEntitlement.mockResolvedValueOnce({ success: false });

      const result = await auth.getCurrentUserWithKyc('user-1');

      expect(result).toMatchObject({ plan: 'free', planStatus: 'none' });
    });
  });
});
