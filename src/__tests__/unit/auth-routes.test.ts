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

jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
  register: mockRegister,
  login: mockLogin,
  refreshTokens: mockRefreshTokens,
  isAuthError: (result: any) => result && typeof result === 'object' && 'code' in result && !('accessToken' in result),
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

const mockUpdateUser = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: { updateUser: mockUpdateUser },
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

    it('should return 409 for duplicate email', async () => {
      mockRegister.mockResolvedValue({ code: 'DUPLICATE_EMAIL', message: 'Email already registered' });
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com', password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(409);
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
      mockLogin.mockResolvedValue({ code: 'MFA_REQUIRED', message: 'MFA required', mfaSessionId: 'session-1', factorId: 'factor-1' });
      const res = await request(app).post('/api/auth/login').send({ email: 'test@test.com', password: 'StrongPass1!' });
      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.mfaSessionId).toBe('session-1');
      expect(res.body.factorId).toBe('factor-1');
    });
  });

  describe('POST /login/mfa-verify', () => {
    it('should verify MFA and return auth result', async () => {
      mockConsumeMfaSession.mockResolvedValue({ accessToken: 'real-token', refreshToken: 'real-refresh' });
      mockChallengeMFA.mockResolvedValue({ challengeId: 'challenge-1' });
      mockVerifyMFAChallenge.mockResolvedValue({ success: true });
      mockValidateTokenAndGetUser.mockResolvedValue({ accessToken: 'real-token', user: { id: 'u-1' } });
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ mfaSessionId: 'session-1', factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ mfaSessionId: 'session-1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 for expired MFA session', async () => {
      mockConsumeMfaSession.mockResolvedValue(null);
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ mfaSessionId: 'expired', factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('MFA_SESSION_EXPIRED');
    });

    it('should return 400 if challenge fails', async () => {
      mockConsumeMfaSession.mockResolvedValue({ accessToken: 'real-token', refreshToken: 'real-refresh' });
      mockChallengeMFA.mockResolvedValue({ code: 'MFA_CHALLENGE_FAILED', message: 'Challenge failed' });
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ mfaSessionId: 'session-1', factorId: 'factor-1', code: '123456' });
      expect(res.status).toBe(400);
    });

    it('should return 400 if verify fails', async () => {
      mockConsumeMfaSession.mockResolvedValue({ accessToken: 'real-token', refreshToken: 'real-refresh' });
      mockChallengeMFA.mockResolvedValue({ challengeId: 'challenge-1' });
      mockVerifyMFAChallenge.mockResolvedValue({ code: 'INVALID_CODE', message: 'Invalid code' });
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ mfaSessionId: 'session-1', factorId: 'factor-1', code: '000000' });
      expect(res.status).toBe(400);
    });

    it('should return 401 if validateTokenAndGetUser fails', async () => {
      mockConsumeMfaSession.mockResolvedValue({ accessToken: 'real-token', refreshToken: 'real-refresh' });
      mockChallengeMFA.mockResolvedValue({ challengeId: 'challenge-1' });
      mockVerifyMFAChallenge.mockResolvedValue({ success: true });
      mockValidateTokenAndGetUser.mockResolvedValue({ code: 'INVALID_TOKEN', message: 'Token invalid' });
      const res = await request(app).post('/api/auth/login/mfa-verify').send({ mfaSessionId: 'session-1', factorId: 'factor-1', code: '123456' });
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
      mockUpdateUser.mockResolvedValue({ wallet_address: '0x1234567890123456789012345678901234567890' });
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
      mockUpdateUser.mockResolvedValue(null);
      const res = await request(app).patch('/api/auth/wallet').set('Authorization', 'Bearer test-token').send({ walletAddress: '0x1234567890123456789012345678901234567890' });
      expect(res.status).toBe(404);
    });
  });
});
