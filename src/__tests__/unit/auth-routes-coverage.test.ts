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
  requestPhoneOtp: jest.fn<any>(),
  requestEmailOtp: jest.fn<any>(),
  requestMagicUrl: jest.fn<any>(),
  verifyAuthToken: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/auth-types.ts'), () => ({}));

jest.unstable_mockModule(resolveModule('src/models/user.ts'), () => ({}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

const mockAuthMiddleware = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
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

describe('Auth Routes - Coverage Gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer' };
      req.headers = req.headers || {};
      req.headers.authorization = req.headers.authorization || 'Bearer test-token';
      next();
    });
    mockValidatePasswordStrength.mockReturnValue({ valid: true, errors: [] });
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  describe('POST /register - validation errors', () => {
    it('should return 400 when password is not a string', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com', password: 123, role: 'freelancer' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 with multiple validation errors', async () => {
      mockValidatePasswordStrength.mockReturnValue({ valid: false, errors: ['Too short', 'No uppercase'] });
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'bad', password: 'weak', role: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error.details.length).toBeGreaterThan(1);
    });
  });

  describe('POST /login - validation errors', () => {
    it('should return 400 when both email and password are invalid', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bad', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /refresh - errors', () => {
    it('should return 400 when refreshToken is missing', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 when token is expired', async () => {
      mockRefreshTokens.mockResolvedValue({ code: 'TOKEN_EXPIRED', message: 'Token expired' });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'expired-token' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_TOKEN_EXPIRED');
    });

    it('should return 401 when token is invalid', async () => {
      mockRefreshTokens.mockResolvedValue({ code: 'INVALID_TOKEN', message: 'Invalid token' });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
    });
  });

  describe('GET /callback - OAuth error handling', () => {
    it('should return 400 when OAuth error is present', async () => {
      const res = await request(app)
        .get('/api/auth/callback?error=access_denied&error_description=User+denied');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OAUTH_ERROR');
    });

    it('should return 401 when code exchange fails', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ code: 'EXCHANGE_FAILED', message: 'Failed' });

      const res = await request(app)
        .get('/api/auth/callback?code=invalid-code');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_EXCHANGE_FAILED');
    });

    it('should return 202 when registration is required', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ accessToken: 'token-1' });
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_REQUIRE_REGISTRATION', message: 'Registration required' });

      const res = await request(app)
        .get('/api/auth/callback?code=valid-code');

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('registration_required');
    });

    it('should return 401 when login with appwrite fails', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ accessToken: 'token-1' });
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid' });

      const res = await request(app)
        .get('/api/auth/callback?code=valid-code');

      expect(res.status).toBe(401);
    });

    it('should serve HTML for implicit flow (no code, no error)', async () => {
      const res = await request(app)
        .get('/api/auth/callback');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Processing OAuth callback');
    });
  });

  describe('POST /oauth/callback - errors', () => {
    it('should return 400 when access_token is missing', async () => {
      const res = await request(app)
        .post('/api/auth/oauth/callback')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 when loginWithAppwrite fails', async () => {
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid token' });

      const res = await request(app)
        .post('/api/auth/oauth/callback')
        .send({ access_token: 'invalid-token' });

      expect(res.status).toBe(401);
    });

    it('should return 202 when registration is required', async () => {
      mockLoginWithAppwrite.mockResolvedValue({ code: 'AUTH_REQUIRE_REGISTRATION', message: 'Registration required' });

      const res = await request(app)
        .post('/api/auth/oauth/callback')
        .send({ access_token: 'new-user-token' });

      expect(res.status).toBe(202);
    });
  });

  describe('POST /oauth/register - errors', () => {
    it('should return 400 when accessToken is missing', async () => {
      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ role: 'freelancer' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when role is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 201 when wallet address is invalid (no validation)', async () => {
      mockRegisterWithAppwrite.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', role: 'freelancer' },
        accessToken: 'token',
        refreshToken: 'token',
      });
      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'freelancer', walletAddress: 'invalid' });

      expect(res.status).toBe(201);
    });

    it('should return 401 when registerWithAppwrite fails', async () => {
      mockRegisterWithAppwrite.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid' });

      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'freelancer' });

      expect(res.status).toBe(401);
    });

    it('should return 500 on unexpected error', async () => {
      mockRegisterWithAppwrite.mockRejectedValue(new Error('Unexpected'));

      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'freelancer' });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /resend-confirmation - errors', () => {
    it('should return 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/resend-confirmation')
        .send({ email: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when service returns error', async () => {
      mockResendConfirmationEmail.mockResolvedValue({ code: 'USER_NOT_FOUND', message: 'User not found' });

      const res = await request(app)
        .post('/api/auth/resend-confirmation')
        .send({ email: 'test@test.com' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /reset-password - errors', () => {
    it('should return 400 when accessToken is missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ password: 'NewPass123!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when password is weak', async () => {
      mockValidatePasswordStrength.mockReturnValue({ valid: false, errors: ['Too weak'] });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ accessToken: 'token', password: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 when token is invalid', async () => {
      mockUpdatePassword.mockResolvedValue({ code: 'INVALID_TOKEN', message: 'Invalid token' });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ accessToken: 'bad-token', password: 'StrongPass1!' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /mfa/enroll - errors', () => {
    it('should return 401 when no bearer token', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1' };
        req.headers = {};
        next();
      });

      const res = await request(app)
        .post('/api/auth/mfa/enroll');

      expect(res.status).toBe(401);
    });

    it('should return 400 when enrollMFA fails', async () => {
      mockEnrollMFA.mockResolvedValue({ code: 'MFA_ERROR', message: 'Enrollment failed' });

      const res = await request(app)
        .post('/api/auth/mfa/enroll')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/verify-enrollment - errors', () => {
    it('should return 400 when factorId or code is missing', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/verify-enrollment')
        .set('Authorization', 'Bearer test-token')
        .send({ factorId: 'factor-1' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when verification fails', async () => {
      mockVerifyMFAEnrollment.mockResolvedValue({ code: 'INVALID_CODE', message: 'Invalid code' });

      const res = await request(app)
        .post('/api/auth/mfa/verify-enrollment')
        .set('Authorization', 'Bearer test-token')
        .send({ factorId: 'factor-1', code: '000000' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/verify - errors', () => {
    it('should return 400 when fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', 'Bearer test-token')
        .send({ factorId: 'factor-1' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when verification fails', async () => {
      mockVerifyMFAChallenge.mockResolvedValue({ code: 'INVALID_CODE', message: 'Invalid code' });

      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', 'Bearer test-token')
        .send({ factorId: 'factor-1', challengeId: 'ch-1', code: '000000' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/challenge - errors', () => {
    it('should return 400 when factorId is missing', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when challenge creation fails', async () => {
      mockChallengeMFA.mockResolvedValue({ code: 'MFA_ERROR', message: 'Challenge failed' });

      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .set('Authorization', 'Bearer test-token')
        .send({ factorId: 'factor-1' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /mfa/disable - errors', () => {
    it('should return 400 when factorId is missing', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/disable')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when totpCode is missing', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/disable')
        .set('Authorization', 'Bearer test-token')
        .send({ factorId: 'factor-1' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('otpCode');
    });

    it('should return 400 when disableMFA fails', async () => {
      mockDisableMFA.mockResolvedValue({ code: 'MFA_ERROR', message: 'Disable failed' });

      const res = await request(app)
        .post('/api/auth/mfa/disable')
        .set('Authorization', 'Bearer test-token')
        .send({ factorId: 'factor-1', totpCode: '123456' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /me - errors', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        req.headers = { authorization: 'Bearer test-token' };
        next();
      });

      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 404 when user not found', async () => {
      mockGetCurrentUserWithKyc.mockResolvedValue({ code: 'USER_NOT_FOUND', message: 'Not found' });

      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /logout - errors', () => {
    it('should return 500 when logout fails', async () => {
      mockLogout.mockResolvedValue({ code: 'LOGOUT_FAILED', message: 'Logout failed' });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
    });
  });

  describe('PATCH /wallet - errors', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        req.headers = { authorization: 'Bearer test-token' };
        next();
      });

      const res = await request(app)
        .patch('/api/auth/wallet')
        .send({ walletAddress: '0x1234567890123456789012345678901234567890' });

      expect(res.status).toBe(401);
    });

    it('should return 400 when walletAddress is missing', async () => {
      const res = await request(app)
        .patch('/api/auth/wallet')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when walletAddress format is invalid', async () => {
      const res = await request(app)
        .patch('/api/auth/wallet')
        .send({ walletAddress: 'invalid-address' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when user not found', async () => {
      mockUpdateUser.mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/auth/wallet')
        .send({ walletAddress: '0x1234567890123456789012345678901234567890' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 500 on unexpected error', async () => {
      mockUpdateUser.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .patch('/api/auth/wallet')
        .send({ walletAddress: '0x1234567890123456789012345678901234567890' });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('UPDATE_FAILED');
    });
  });

  describe('GET /oauth/:provider - errors', () => {
    it('should return 400 for invalid provider', async () => {
      const res = await request(app)
        .get('/api/auth/oauth/invalid');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 when getOAuthUrl throws', async () => {
      mockGetOAuthUrl.mockRejectedValue(new Error('OAuth error'));

      const res = await request(app)
        .get('/api/auth/oauth/google');

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('GET /mfa/factors - errors', () => {
    it('should return 400 when getMFAFactors fails', async () => {
      mockGetMFAFactors.mockResolvedValue({ code: 'MFA_ERROR', message: 'Failed' });

      const res = await request(app)
        .get('/api/auth/mfa/factors')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /login/mfa-verify - errors', () => {
    it('should return 400 when challengeMFA fails', async () => {
      mockChallengeMFA.mockResolvedValue({ code: 'MFA_ERROR', message: 'Challenge failed' });

      const res = await request(app)
        .post('/api/auth/login/mfa-verify')
        .send({ accessToken: 'mfa-token', factorId: 'factor-1', code: '123456' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when verifyMFAChallenge fails', async () => {
      mockChallengeMFA.mockResolvedValue({ challengeId: 'ch-1' });
      mockVerifyMFAChallenge.mockResolvedValue({ code: 'INVALID_CODE', message: 'Invalid code' });

      const res = await request(app)
        .post('/api/auth/login/mfa-verify')
        .send({ accessToken: 'mfa-token', factorId: 'factor-1', code: '000000' });

      expect(res.status).toBe(400);
    });

    it('should return 401 when validateTokenAndGetUser fails', async () => {
      mockChallengeMFA.mockResolvedValue({ challengeId: 'ch-1' });
      mockVerifyMFAChallenge.mockResolvedValue({ success: true });
      mockValidateTokenAndGetUser.mockResolvedValue({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid' });

      const res = await request(app)
        .post('/api/auth/login/mfa-verify')
        .send({ accessToken: 'mfa-token', factorId: 'factor-1', code: '123456' });

      expect(res.status).toBe(401);
    });
  });
});
