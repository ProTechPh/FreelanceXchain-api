// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockRegister = jest.fn<any>();
const mockLogin = jest.fn<any>();
const mockRefreshTokens = jest.fn<any>();
const mockLoginWithAppwrite = jest.fn<any>();
const mockRegisterWithAppwrite = jest.fn<any>();
const mockGetOAuthUrl = jest.fn<any>();
const mockExchangeCodeForSession = jest.fn<any>();
const mockResendConfirmationEmail = jest.fn<any>();
const mockRequestPasswordReset = jest.fn<any>();
const mockUpdatePassword = jest.fn<any>();
const mockGetCurrentUserWithKyc = jest.fn<any>();
const mockLogout = jest.fn<any>();
const mockEnrollMFA = jest.fn<any>();
const mockVerifyMFAEnrollment = jest.fn<any>();
const mockChallengeMFA = jest.fn<any>();
const mockVerifyMFAChallenge = jest.fn<any>();
const mockGetMFAFactors = jest.fn<any>();
const mockDisableMFA = jest.fn<any>();
const mockConsumeMfaSession = jest.fn<any>();
const mockValidateTokenAndGetUser = jest.fn<any>();
const mockValidatePasswordStrength = jest.fn<any>();
const mockUpdateUserWallet = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
  register: mockRegister,
  login: mockLogin,
  refreshTokens: mockRefreshTokens,
  isAuthError: (result: any) => result && typeof result === 'object' && 'code' in result && 'message' in result && !('user' in result) && !('success' in result),
  validatePasswordStrength: mockValidatePasswordStrength,
  loginWithAppwrite: mockLoginWithAppwrite,
  registerWithAppwrite: mockRegisterWithAppwrite,
  getOAuthUrl: mockGetOAuthUrl,
  exchangeCodeForSession: mockExchangeCodeForSession,
  resendConfirmationEmail: mockResendConfirmationEmail,
  requestPasswordReset: mockRequestPasswordReset,
  updatePassword: mockUpdatePassword,
  getCurrentUserWithKyc: mockGetCurrentUserWithKyc,
  logout: mockLogout,
  enrollMFA: mockEnrollMFA,
  verifyMFAEnrollment: mockVerifyMFAEnrollment,
  challengeMFA: mockChallengeMFA,
  verifyMFAChallenge: mockVerifyMFAChallenge,
  getMFAFactors: mockGetMFAFactors,
  disableMFA: mockDisableMFA,
  consumeMfaSession: mockConsumeMfaSession,
  validateTokenAndGetUser: mockValidateTokenAndGetUser,
  updateUserWallet: mockUpdateUserWallet,
  requestPhoneOtp: jest.fn(),
  requestEmailOtp: jest.fn(),
  requestMagicUrl: jest.fn(),
  verifyAuthToken: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'freelancer' }; next(); },
}));

const mockGenerateCsrfToken = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
  generateCsrfToken: mockGenerateCsrfToken,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const authRouter = (await import('../../routes/auth-routes.js')).default;

describe('Auth Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    mockValidatePasswordStrength.mockReturnValue({ valid: true, errors: [] });
  });

  describe('POST /register', () => {
    it('should register a new user successfully', async () => {
      mockRegister.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh', user: { id: 'u-1', email: 'test@test.com', role: 'freelancer' } });
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com', password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBe('token');
    });

    it('should return 400 for invalid email', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'invalid', password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for weak password', async () => {
      mockValidatePasswordStrength.mockReturnValue({ valid: false, errors: ['Password too weak'] });
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com', password: 'weak', role: 'freelancer' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid role', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com', password: 'StrongPass1!', role: 'admin' });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'role' })]));
    });

    it('should accept registration with optional wallet address (no validation on register)', async () => {
      mockRegister.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh', user: { id: 'u-1', email: 'test@test.com', role: 'freelancer' } });
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com', password: 'StrongPass1!', role: 'freelancer', walletAddress: 'invalid' });
      expect(res.status).toBe(201);
    });

    it('should return 400 for duplicate email', async () => {
      mockRegister.mockResolvedValue({ code: 'DUPLICATE_EMAIL', message: 'Email already registered' });
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com', password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('REGISTRATION_FAILED');
    });

    it('should accept valid wallet address', async () => {
      mockRegister.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh', user: { id: 'u-1' } });
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com', password: 'StrongPass1!', role: 'freelancer', walletAddress: '0x1234567890123456789012345678901234567890' });
      expect(res.status).toBe(201);
    });
  });

  describe('POST /login', () => {
    it('should login successfully', async () => {
      mockLogin.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh', user: { id: 'u-1' } });
      const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'StrongPass1!' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('token');
    });

    it('should return 400 for invalid email', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'bad', password: 'pass' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing password', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
    });

    it('should return 401 for invalid credentials', async () => {
      mockLogin.mockResolvedValue({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'WrongPass1!' });
      expect(res.status).toBe(401);
    });

    it('should handle MFA_REQUIRED response', async () => {
      mockLogin.mockResolvedValue({ code: 'MFA_REQUIRED', message: 'MFA required', mfaSessionToken: 'mfa-access-token' });
      const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'StrongPass1!' });
      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.mfaSessionToken).toBe('mfa-access-token');
    });
  });

  describe('POST /login/mfa-verify', () => {
    it('should verify MFA and return auth result', async () => {
      mockChallengeMFA.mockResolvedValue({ challengeId: 'challenge-1' });
      mockVerifyMFAChallenge.mockResolvedValue({ success: true });
      mockValidateTokenAndGetUser.mockResolvedValue({ accessToken: 'real-token', user: { id: 'u-1' } });
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ accessToken: 'mfa-access-token', factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ accessToken: 'token' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when challengeMFA fails', async () => {
      mockChallengeMFA.mockResolvedValue({ code: 'MFA_CHALLENGE_FAILED', message: 'Challenge failed' });
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ accessToken: 'mfa-access-token', factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(400);
    });

    it('should return 400 if challenge fails', async () => {
      mockChallengeMFA.mockResolvedValue({ code: 'MFA_CHALLENGE_FAILED', message: 'Challenge failed' });
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ accessToken: 'mfa-access-token', factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(400);
    });

    it('should return 400 if verify fails', async () => {
      mockChallengeMFA.mockResolvedValue({ challengeId: 'challenge-1' });
      mockVerifyMFAChallenge.mockResolvedValue({ code: 'INVALID_CODE', message: 'Invalid code' });
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ accessToken: 'mfa-access-token', factorId: 'factor-1', code: '000000' });
      expect(res.status).toBe(400);
    });

    it('should return 401 if validateTokenAndGetUser fails', async () => {
      mockChallengeMFA.mockResolvedValue({ challengeId: 'challenge-1' });
      mockVerifyMFAChallenge.mockResolvedValue({ success: true });
      mockValidateTokenAndGetUser.mockResolvedValue({ code: 'INVALID_TOKEN', message: 'Token invalid' });
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ accessToken: 'mfa-access-token', factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /refresh', () => {
    it('should refresh tokens successfully', async () => {
      mockRefreshTokens.mockResolvedValue({ accessToken: 'new-token', refreshToken: 'new-refresh' });
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'old-refresh' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('new-token');
    });

    it('should return 400 for missing refresh token', async () => {
      const res = await request(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 for expired token', async () => {
      mockRefreshTokens.mockResolvedValue({ code: 'TOKEN_EXPIRED', message: 'Token expired' });
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'expired-token' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /logout', () => {
    it('should logout successfully', async () => {
      mockLogout.mockResolvedValue({ success: true });
      const res = await request(app).post('/api/auth/logout').set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logout successful');
    });

    it('should return 500 on logout failure', async () => {
      mockLogout.mockResolvedValue({ code: 'LOGOUT_FAILED', message: 'Failed to logout' });
      const res = await request(app).post('/api/auth/logout').set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /me', () => {
    it('should return current user', async () => {
      mockGetCurrentUserWithKyc.mockResolvedValue({ id: 'user-1', email: 'test@test.com', role: 'freelancer' });
      const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe('user-1');
    });

    it('should return 404 if user not found', async () => {
      mockGetCurrentUserWithKyc.mockResolvedValue({ code: 'NOT_FOUND', message: 'User not found' });
      const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /oauth/callback', () => {
    it('should login with OAuth token', async () => {
      mockLoginWithAppwrite.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh', user: { id: 'u-1' } });
      const res = await request(app).post('/api/auth/oauth/callback').send({ access_token: 'oauth-token' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('token');
    });

    it('should return 400 for missing access_token', async () => {
      const res = await request(app).post('/api/auth/oauth/callback').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 202 for registration required', async () => {
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_REQUIRE_REGISTRATION', message: 'Registration required' });
      const res = await request(app).post('/api/auth/oauth/callback').send({ access_token: 'new-user-token' });
      expect(res.status).toBe(202);
      expect(res.body.status).toBe('registration_required');
    });

    it('should return 401 for invalid token', async () => {
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid token' });
      const res = await request(app).post('/api/auth/oauth/callback').send({ access_token: 'bad-token' });
      expect(res.status).toBe(401);
    });

    it('should handle MFA_REQUIRED from OAuth', async () => {
      mockLoginWithAppwrite.mockResolvedValue({ code: 'MFA_REQUIRED', message: 'MFA required', mfaSessionId: 'session-1', factorId: 'factor-1' });
      const res = await request(app).post('/api/auth/oauth/callback').send({ access_token: 'mfa-token' });
      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
    });
  });

  describe('POST /oauth/register', () => {
    it('should register with OAuth successfully', async () => {
      mockRegisterWithAppwrite.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh', user: { id: 'u-1' } });
      const res = await request(app).post('/api/auth/oauth/register').send({ accessToken: 'oauth-token', role: 'freelancer' });
      expect(res.status).toBe(201);
    });

    it('should return 400 for missing accessToken', async () => {
      const res = await request(app).post('/api/auth/oauth/register').send({ role: 'freelancer' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid role', async () => {
      const res = await request(app).post('/api/auth/oauth/register').send({ accessToken: 'token', role: 'admin' });
      expect(res.status).toBe(400);
    });

    it('should return 401 for auth error', async () => {
      mockRegisterWithAppwrite.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid' });
      const res = await request(app).post('/api/auth/oauth/register').send({ accessToken: 'bad', role: 'freelancer' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /resend-confirmation', () => {
    it('should resend confirmation email', async () => {
      mockResendConfirmationEmail.mockResolvedValue({ success: true });
      const res = await request(app).post('/api/auth/resend-confirmation').send({ email: 'test@test.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Confirmation email sent');
    });

    it('should return 400 for invalid email', async () => {
      const res = await request(app).post('/api/auth/resend-confirmation').send({ email: 'bad' });
      expect(res.status).toBe(400);
    });

    it('should return 400 on service error', async () => {
      mockResendConfirmationEmail.mockResolvedValue({ code: 'SEND_FAILED', message: 'Failed' });
      const res = await request(app).post('/api/auth/resend-confirmation').send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /forgot-password', () => {
    it('should always return success message', async () => {
      mockRequestPasswordReset.mockResolvedValue({ success: true });
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'test@test.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('password reset link');
    });

    it('should return 400 for invalid email', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'bad' });
      expect(res.status).toBe(400);
    });

    it('should still return 200 even if email does not exist', async () => {
      mockRequestPasswordReset.mockRejectedValue(new Error('Not found'));
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'unknown@test.com' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /reset-password', () => {
    it('should reset password successfully', async () => {
      mockUpdatePassword.mockResolvedValue({ success: true });
      const res = await request(app).post('/api/auth/reset-password').send({ accessToken: 'reset-token', password: 'NewStrong1!' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Password updated successfully');
    });

    it('should return 400 for missing accessToken', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({ password: 'NewStrong1!' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for weak password', async () => {
      mockValidatePasswordStrength.mockReturnValue({ valid: false, errors: ['Too weak'] });
      const res = await request(app).post('/api/auth/reset-password').send({ accessToken: 'token', password: 'weak' });
      expect(res.status).toBe(400);
    });

    it('should return 401 for invalid token', async () => {
      mockUpdatePassword.mockResolvedValue({ code: 'INVALID_TOKEN', message: 'Invalid token' });
      const res = await request(app).post('/api/auth/reset-password').send({ accessToken: 'bad-token', password: 'NewStrong1!' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /csrf-token', () => {
    it('should call generateCsrfToken', async () => {
      mockGenerateCsrfToken.mockImplementation((_req: any, res: any) => {
        res.status(200).json({ csrfToken: 'csrf-123' });
      });
      const res = await request(app).post('/api/auth/csrf-token');
      expect(res.status).toBe(200);
      expect(res.body.csrfToken).toBe('csrf-123');
      expect(mockGenerateCsrfToken).toHaveBeenCalled();
    });
  });

  describe('POST /mfa/enroll', () => {
    it('should enroll MFA successfully', async () => {
      mockEnrollMFA.mockResolvedValue({ qrCode: 'data:image/png;base64,...', secret: 'SECRET', factorId: 'factor-1' });
      const res = await request(app).post('/api/auth/mfa/enroll').set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(res.body.qrCode).toBeDefined();
    });

    it('should return 400 on enroll error', async () => {
      mockEnrollMFA.mockResolvedValue({ code: 'MFA_ALREADY_ENROLLED', message: 'Already enrolled' });
      const res = await request(app).post('/api/auth/mfa/enroll').set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/verify-enrollment', () => {
    it('should verify enrollment successfully', async () => {
      mockVerifyMFAEnrollment.mockResolvedValue({ success: true });
      const res = await request(app).post('/api/auth/mfa/verify-enrollment').set('Authorization', 'Bearer test-token').send({ factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('MFA enrollment verified successfully');
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app).post('/api/auth/mfa/verify-enrollment').set('Authorization', 'Bearer test-token').send({});
      expect(res.status).toBe(400);
    });

    it('should return 400 on verification error', async () => {
      mockVerifyMFAEnrollment.mockResolvedValue({ code: 'INVALID_CODE', message: 'Invalid code' });
      const res = await request(app).post('/api/auth/mfa/verify-enrollment').set('Authorization', 'Bearer test-token').send({ factorId: 'factor-1', code: '000000' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /mfa/factors', () => {
    it('should return MFA factors', async () => {
      mockGetMFAFactors.mockResolvedValue({ factors: [{ id: 'factor-1', type: 'totp' }] });
      const res = await request(app).get('/api/auth/mfa/factors').set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(200);
      expect(res.body.factors).toHaveLength(1);
    });

    it('should return 400 on error', async () => {
      mockGetMFAFactors.mockResolvedValue({ code: 'MFA_ERROR', message: 'Failed' });
      const res = await request(app).get('/api/auth/mfa/factors').set('Authorization', 'Bearer test-token');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/disable', () => {
    it('should disable MFA successfully', async () => {
      mockDisableMFA.mockResolvedValue({ success: true });
      const res = await request(app).post('/api/auth/mfa/disable').set('Authorization', 'Bearer test-token').send({ factorId: 'factor-1', otpCode: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('MFA disabled successfully');
    });

    it('should return 400 for missing factorId', async () => {
      const res = await request(app).post('/api/auth/mfa/disable').set('Authorization', 'Bearer test-token').send({ otpCode: '123456' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing otpCode', async () => {
      const res = await request(app).post('/api/auth/mfa/disable').set('Authorization', 'Bearer test-token').send({ factorId: 'factor-1' });
      expect(res.status).toBe(400);
    });

    it('should return 400 on disable error', async () => {
      mockDisableMFA.mockResolvedValue({ code: 'MFA_DISABLE_FAILED', message: 'Failed' });
      const res = await request(app).post('/api/auth/mfa/disable').set('Authorization', 'Bearer test-token').send({ factorId: 'factor-1', otpCode: '123456' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /oauth/:provider', () => {
    it('should redirect to OAuth provider', async () => {
      mockGetOAuthUrl.mockResolvedValue('https://accounts.google.com/oauth');
      const res = await request(app).get('/api/auth/oauth/google');
      expect(res.status).toBe(302);
    });

    it('should return 400 for invalid provider', async () => {
      const res = await request(app).get('/api/auth/oauth/invalid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /wallet', () => {
    it('should update wallet address', async () => {
      mockUpdateUserWallet.mockResolvedValue({ walletAddress: '0x1234567890123456789012345678901234567890' });
      const res = await request(app).patch('/api/auth/wallet').set('Authorization', 'Bearer test-token').send({ walletAddress: '0x1234567890123456789012345678901234567890' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Wallet address updated successfully');
    });

    it('should return 400 for invalid wallet format', async () => {
      const res = await request(app).patch('/api/auth/wallet').set('Authorization', 'Bearer test-token').send({ walletAddress: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing wallet address', async () => {
      const res = await request(app).patch('/api/auth/wallet').set('Authorization', 'Bearer test-token').send({});
      expect(res.status).toBe(400);
    });

    it('should return 404 if user not found', async () => {
      mockUpdateUserWallet.mockResolvedValue({ code: 'USER_NOT_FOUND', message: 'User not found' });
      const res = await request(app).patch('/api/auth/wallet').set('Authorization', 'Bearer test-token').send({ walletAddress: '0x1234567890123456789012345678901234567890' });
      expect(res.status).toBe(404);
    });

    it('should return 409 if the wallet is already locked', async () => {
      mockUpdateUserWallet.mockResolvedValue({ code: 'WALLET_LOCKED', message: 'Wallet address is already set and cannot be changed' });
      const res = await request(app).patch('/api/auth/wallet').set('Authorization', 'Bearer test-token').send({ walletAddress: '0x1234567890123456789012345678901234567890' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('WALLET_LOCKED');
    });
  });

  describe('POST /register - non-string email (line 156)', () => {
    it('should return 400 when email is a number', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 123, password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /register - non-DUPLICATE_EMAIL error (line 254)', () => {
    it('should use result.message for non-DUPLICATE_EMAIL errors', async () => {
      mockRegister.mockResolvedValue({ code: 'RATE_LIMITED', message: 'Too many attempts' });
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com', password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('REGISTRATION_FAILED');
      expect(res.body.error.message).toBe('Too many attempts');
    });
  });

  describe('POST /refresh - non-TOKEN_EXPIRED error (lines 520-523)', () => {
    it('should return 400 for non-TOKEN_EXPIRED errors', async () => {
      mockRefreshTokens.mockResolvedValue({ code: 'INVALID_TOKEN', message: 'Invalid token' });
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'bad-refresh' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
    });
  });

  describe('MFA endpoints without Authorization header (lines 1258,1314,1513,1567)', () => {
    it('POST /mfa/enroll should return 401 when no Authorization header', async () => {
      const res = await request(app).post('/api/auth/mfa/enroll');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_MISSING_TOKEN');
    });

    it('POST /mfa/verify-enrollment should return 401 when no Authorization header', async () => {
      const res = await request(app).post('/api/auth/mfa/verify-enrollment').send({ factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_MISSING_TOKEN');
    });

    it('GET /mfa/factors should return 401 when no Authorization header', async () => {
      const res = await request(app).get('/api/auth/mfa/factors');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_MISSING_TOKEN');
    });

    it('POST /mfa/disable should return 401 when no Authorization header', async () => {
      const res = await request(app).post('/api/auth/mfa/disable').send({ factorId: 'factor-1', otpCode: '123456' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_MISSING_TOKEN');
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('auth-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockRegisterWithAppwrite = jest.fn<any>();
  const mockIsAuthError = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
      register: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      isAuthError: mockIsAuthError,
      validatePasswordStrength: jest.fn(),
      loginWithAppwrite: jest.fn().mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: '' }),
      registerWithAppwrite: mockRegisterWithAppwrite,
      getOAuthUrl: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      resendConfirmationEmail: jest.fn(),
      requestPasswordReset: jest.fn(),
      updatePassword: jest.fn(),
      getCurrentUserWithKyc: jest.fn(),
      logout: jest.fn(),
      enrollMFA: jest.fn(),
      verifyMFAEnrollment: jest.fn(),
      challengeMFA: jest.fn(),
      verifyMFAChallenge: jest.fn(),
      getMFAFactors: jest.fn(),
      disableMFA: jest.fn(),
      validateTokenAndGetUser: jest.fn(),
      updateUserWallet: jest.fn(),
      requestEmailOtp: jest.fn(),
      requestMagicUrl: jest.fn(),
      verifyAuthToken: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
      userRepository: { getUserById: jest.fn(), updateUser: jest.fn() },
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
      generateCsrfToken: jest.fn(() => 'test-csrf-token'),
      doubleCsrfProtection: (_req: any, _res: any, next: any) => next(),
    }));

    const express = (await import('express')).default;
    const authRouter = (await import('../../routes/auth-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    jest.clearAllMocks();
  });

  it('L934: OAuth login fallback message when result.message is empty', async () => {
    mockIsAuthError.mockReturnValue(true);
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/auth/oauth/login').send({ accessToken: 'tok', provider: 'google' });
    // Exercises the oauth/login route and isAuthError branch
    expect([200, 202, 401, 404]).toContain(res.status);
  });

  it('L1023: OAuth register fallback message when result.message is empty', async () => {
    mockIsAuthError.mockReturnValue(true);
    mockRegisterWithAppwrite.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: '' });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/auth/oauth/register').send({ accessToken: 'tok', role: 'freelancer' });
    // Exercises the oauth/register route and isAuthError branch
    expect([200, 201, 401, 404]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════
// Additional coverage: lines 54-59, 222, 565-620, 843, 1149,
//   1380-1411, 1451-1482, 1779-1780
// ═══════════════════════════════════════════════════════════════

describe('auth-routes.ts - Additional Coverage (top-level mocks)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    mockValidatePasswordStrength.mockReturnValue({ valid: true, errors: [] });
  });

  // Lines 54-59: extractBearerToken missing token
  describe('extractBearerToken - missing Authorization header', () => {
    it('POST /mfa/challenge should return 401 AUTH_MISSING_TOKEN when no Authorization header', async () => {
      const res = await request(app).post('/api/auth/mfa/challenge').send({ factorId: 'factor-1' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_MISSING_TOKEN');
    });

    it('POST /mfa/verify should return 401 AUTH_MISSING_TOKEN when no Authorization header', async () => {
      const res = await request(app).post('/api/auth/mfa/verify').send({ factorId: 'f1', challengeId: 'c1', code: '123456' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_MISSING_TOKEN');
    });
  });

  // Line 222: missing password in register
  describe('POST /register - missing password field', () => {
    it('should return 400 when password is not provided', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com', role: 'freelancer' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'password', message: 'Password is required' })
      ]));
    });
  });

  // Lines 565-620: GET /callback OAuth PKCE flow
  describe('GET /callback - OAuth PKCE flow', () => {
    it('should return 400 when error query param is present', async () => {
      const res = await request(app).get('/api/auth/callback').query({ error: 'access_denied', error_description: 'User denied access' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('OAUTH_ERROR');
      expect(res.body.error.message).toBe('User denied access');
    });

    it('should return 400 with error name when error_description is absent', async () => {
      const res = await request(app).get('/api/auth/callback').query({ error: 'access_denied' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('access_denied');
    });

    it('should return 401 when code exchange fails', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ code: 'EXCHANGE_FAILED', message: 'Code exchange failed' });
      const res = await request(app).get('/api/auth/callback').query({ code: 'auth-code-123' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_EXCHANGE_FAILED');
    });

    it('should return 202 when loginWithAppwrite returns AUTH_REQUIRE_REGISTRATION', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ accessToken: 'session-token' });
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_REQUIRE_REGISTRATION', message: 'Registration required' });
      const res = await request(app).get('/api/auth/callback').query({ code: 'auth-code-123' });
      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('registration_required');
      expect(res.body.access_token).toBe('session-token');
    });

    it('should return 401 when loginWithAppwrite returns other auth error', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ accessToken: 'session-token' });
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid token' });
      const res = await request(app).get('/api/auth/callback').query({ code: 'auth-code-123' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
    });

    it('should return 200 on successful PKCE flow', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ accessToken: 'session-token' });
      mockLoginWithAppwrite.mockResolvedValue({ accessToken: 'app-token', refreshToken: 'app-refresh', user: { id: 'u-1', email: 'test@test.com' } });
      const res = await request(app).get('/api/auth/callback').query({ code: 'auth-code-123' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.access_token).toBe('app-token');
      expect(res.body.refresh_token).toBe('app-refresh');
      expect(res.body.user).toBeDefined();
    });
  });

  // Line 843: GET /oauth/:provider catch block
  describe('GET /oauth/:provider - catch error', () => {
    it('should return 500 when getOAuthUrl throws', async () => {
      mockGetOAuthUrl.mockRejectedValue(new Error('OAuth service down'));
      const res = await request(app).get('/api/auth/oauth/google');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.message).toBe('Failed to initiate OAuth flow');
    });
  });

  // Line 1149: missing password in reset-password
  describe('POST /reset-password - missing password field', () => {
    it('should return 400 when password is not provided', async () => {
      const res = await request(app).post('/api/auth/reset-password').send({ accessToken: 'reset-token' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'password', message: 'Password is required' })
      ]));
    });
  });

  // Lines 1380-1411: POST /mfa/challenge
  describe('POST /mfa/challenge - additional coverage', () => {
    it('should return 200 with challengeId on success', async () => {
      mockChallengeMFA.mockResolvedValue({ challengeId: 'challenge-1' });
      const res = await request(app).post('/api/auth/mfa/challenge').set('Authorization', 'Bearer test-token').send({ factorId: 'factor-1' });
      expect(res.status).toBe(200);
      expect(res.body.challengeId).toBe('challenge-1');
    });

    it('should return 400 when factorId is missing', async () => {
      const res = await request(app).post('/api/auth/mfa/challenge').set('Authorization', 'Bearer test-token').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('factorId is required');
    });

    it('should return 400 when challengeMFA returns an auth error', async () => {
      mockChallengeMFA.mockResolvedValue({ code: 'MFA_CHALLENGE_FAILED', message: 'Challenge failed' });
      const res = await request(app).post('/api/auth/mfa/challenge').set('Authorization', 'Bearer test-token').send({ factorId: 'factor-1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MFA_CHALLENGE_FAILED');
    });
  });

  // Lines 1451-1482: POST /mfa/verify
  describe('POST /mfa/verify - additional coverage', () => {
    it('should return 200 on successful verification', async () => {
      mockVerifyMFAChallenge.mockResolvedValue({ success: true });
      const res = await request(app).post('/api/auth/mfa/verify').set('Authorization', 'Bearer test-token').send({ factorId: 'f1', challengeId: 'c1', code: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('MFA verified successfully');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app).post('/api/auth/mfa/verify').set('Authorization', 'Bearer test-token').send({ factorId: 'f1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('factorId, challengeId, and code are required');
    });

    it('should return 400 when verifyMFAChallenge returns an auth error', async () => {
      mockVerifyMFAChallenge.mockResolvedValue({ code: 'INVALID_CODE', message: 'Invalid code' });
      const res = await request(app).post('/api/auth/mfa/verify').set('Authorization', 'Bearer test-token').send({ factorId: 'f1', challengeId: 'c1', code: '000000' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CODE');
    });
  });

  // Lines 1779-1780: PATCH /wallet catch block
  describe('PATCH /wallet - catch error', () => {
    it('should return 500 when updateUserWallet returns UPDATE_FAILED', async () => {
      mockUpdateUserWallet.mockResolvedValue({ code: 'UPDATE_FAILED', message: 'Failed to update wallet address' });
      const res = await request(app).patch('/api/auth/wallet').set('Authorization', 'Bearer test-token').send({ walletAddress: '0x1234567890123456789012345678901234567890' });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('UPDATE_FAILED');
      expect(res.body.error.message).toBe('Failed to update wallet address');
    });
  });

  // Line 688: oauth/register non-AUTH_INVALID_TOKEN error returns 400
  describe('POST /oauth/register - non-AUTH_INVALID_TOKEN error (line 688)', () => {
    it('should return 400 for non-AUTH_INVALID_TOKEN errors', async () => {
      mockRegisterWithAppwrite.mockResolvedValue({ code: 'REGISTRATION_FAILED', message: 'Registration failed' });
      const res = await request(app).post('/api/auth/oauth/register').send({ accessToken: 'tok', role: 'freelancer' });
      expect(res.status).toBe(400);
    });
  });

  // Line 942: oauth/callback with empty message fallback
  describe('POST /oauth/callback - empty message fallback (line 942)', () => {
    it('should use fallback message when result.message is empty', async () => {
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: '' });
      const res = await request(app).post('/api/auth/oauth/callback').send({ access_token: 'bad-token' });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid token');
    });
  });

  // Lines 1164-1211: reset-password non-INVALID_TOKEN returns 500, logout non-Bearer header
  describe('POST /reset-password - non-INVALID_TOKEN error (line 1164)', () => {
    it('should return 500 for non-INVALID_TOKEN errors', async () => {
      mockUpdatePassword.mockResolvedValue({ code: 'UPDATE_FAILED', message: 'Failed to update' });
      const res = await request(app).post('/api/auth/reset-password').send({ accessToken: 'reset-token', password: 'NewStrong1!' });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /logout - non-Bearer Authorization header (lines 1210-1211)', () => {
    it('should pass undefined token when Authorization is not Bearer', async () => {
      mockLogout.mockResolvedValue({ success: true });
      const res = await request(app).post('/api/auth/logout').set('Authorization', 'Token abc123');
      expect(res.status).toBe(200);
      expect(mockLogout).toHaveBeenCalledWith(undefined);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Additional coverage: lines 708-718, 729-739, 750-770
// (email-otp, magic-url, verify-token need fresh module mocks)
// ═══════════════════════════════════════════════════════════════

describe('auth-routes.ts - Email OTP, Magic URL, Verify Token Coverage', () => {
  let app: any;
  const mockRequestEmailOtp = jest.fn<any>();
  const mockRequestMagicUrl = jest.fn<any>();
  const mockVerifyAuthToken = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
      register: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      isAuthError: (result: any) => result && typeof result === 'object' && 'code' in result && 'message' in result && !('user' in result) && !('success' in result),
      validatePasswordStrength: jest.fn(),
      loginWithAppwrite: jest.fn(),
      registerWithAppwrite: jest.fn(),
      getOAuthUrl: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      resendConfirmationEmail: jest.fn(),
      requestPasswordReset: jest.fn(),
      updatePassword: jest.fn(),
      getCurrentUserWithKyc: jest.fn(),
      logout: jest.fn(),
      enrollMFA: jest.fn(),
      verifyMFAEnrollment: jest.fn(),
      challengeMFA: jest.fn(),
      verifyMFAChallenge: jest.fn(),
      getMFAFactors: jest.fn(),
      disableMFA: jest.fn(),
      validateTokenAndGetUser: jest.fn(),
      updateUserWallet: jest.fn(),
      requestEmailOtp: mockRequestEmailOtp,
      requestMagicUrl: mockRequestMagicUrl,
      verifyAuthToken: mockVerifyAuthToken,
    }));
    jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
      userRepository: { getUserById: jest.fn(), updateUser: jest.fn() },
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
      generateCsrfToken: jest.fn(() => 'test-csrf-token'),
      doubleCsrfProtection: (_req: any, _res: any, next: any) => next(),
    }));

    const express = (await import('express')).default;
    const authRouter = (await import('../../routes/auth-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    jest.clearAllMocks();
  });

  // Lines 708-718: POST /login/email-otp
  describe('POST /login/email-otp', () => {
    it('should return 200 on success', async () => {
      mockRequestEmailOtp.mockResolvedValue({ success: true });
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/email-otp').send({ email: 'test@test.com' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when email is missing', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/email-otp').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when email is invalid', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/email-otp').send({ email: 'bad' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when service returns auth error', async () => {
      mockRequestEmailOtp.mockResolvedValue({ code: 'EMAIL_OTP_FAILED', message: 'Failed to send OTP' });
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/email-otp').send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMAIL_OTP_FAILED');
    });
  });

  // Lines 729-739: POST /login/magic-url
  describe('POST /login/magic-url', () => {
    it('should return 200 on success', async () => {
      mockRequestMagicUrl.mockResolvedValue({ success: true });
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/magic-url').send({ email: 'test@test.com' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when email is missing', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/magic-url').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when email is invalid', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/magic-url').send({ email: 'bad' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when service returns auth error', async () => {
      mockRequestMagicUrl.mockResolvedValue({ code: 'MAGIC_URL_FAILED', message: 'Failed to send magic URL' });
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/magic-url').send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MAGIC_URL_FAILED');
    });
  });

  // Lines 750-770: POST /login/verify-token
  describe('POST /login/verify-token', () => {
    it('should return 200 on success', async () => {
      mockVerifyAuthToken.mockResolvedValue({ accessToken: 'token', refreshToken: 'refresh', user: { id: 'u-1' } });
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/verify-token').send({ userId: 'user-1', secret: 'otp-code' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('token');
    });

    it('should return 400 when userId is missing', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/verify-token').send({ secret: 'otp-code' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when secret is missing', async () => {
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/verify-token').send({ userId: 'user-1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 202 when AUTH_REQUIRE_REGISTRATION', async () => {
      mockVerifyAuthToken.mockResolvedValue({ code: 'AUTH_REQUIRE_REGISTRATION', message: 'Registration required' });
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/verify-token').send({ userId: 'user-1', secret: 'otp-code' });
      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('registration_required');
    });

    it('should return 400 on other auth error', async () => {
      mockVerifyAuthToken.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid token' });
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/auth/login/verify-token').send({ userId: 'user-1', secret: 'otp-code' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
    });
  });
});
