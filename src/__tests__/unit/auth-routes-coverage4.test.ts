// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockRegister = jest.fn<any>();
const mockLogin = jest.fn<any>();
const mockRefreshTokens = jest.fn<any>();
const mockIsAuthError = jest.fn<any>();
const mockValidatePasswordStrength = jest.fn<any>();
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

jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
  register: mockRegister,
  login: mockLogin,
  refreshTokens: mockRefreshTokens,
  isAuthError: mockIsAuthError,
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
}));

jest.unstable_mockModule(resolveModule('src/services/auth-types.ts'), () => ({
  RegisterInput: {},
  LoginInput: {},
  MfaRequiredResult: {},
}));

jest.unstable_mockModule(resolveModule('src/models/user.ts'), () => ({
  UserRole: {},
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const mockAuthMiddleware = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
  generateCsrfToken: () => 'csrf-token-123',
}));

const mockUserRepository = { getUserById: jest.fn<any>() };
jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: mockUserRepository,
}));

const router = (await import('../../routes/auth-routes.js')).default;

describe('Auth Routes - Coverage4', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer', email: 'user@test.com' };
      req.headers = req.headers || {};
      req.headers.authorization = 'Bearer test-token-123';
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/auth', router);
  });

  describe('GET /callback - implicit flow (lines 630-638)', () => {
    it('should serve HTML page for implicit flow when no code is provided', async () => {
      // When there's no code and no error, the route falls through to the implicit flow
      // which serves an HTML page with JavaScript to extract tokens from URL fragment
      const res = await request(app).get('/api/auth/callback');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<!DOCTYPE html>');
      expect(res.text).toContain('Processing OAuth callback');
      expect(res.text).toContain('access_token');
    });
  });

  describe('POST /reset-password - password not string (lines 1143-1144)', () => {
    it('should return validation error when password is not a string', async () => {
      mockIsAuthError.mockReturnValue(false);
      mockValidatePasswordStrength.mockReturnValue({ valid: true, errors: [] });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ accessToken: 'valid-token', password: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password', message: 'Password is required' }),
        ])
      );
    });

    it('should return validation error when password fails strength check', async () => {
      mockValidatePasswordStrength.mockReturnValue({
        valid: false,
        errors: ['Password must be at least 8 characters', 'Password must contain a number'],
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ accessToken: 'valid-token', password: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('POST /mfa/challenge - error response (lines 1411-1412)', () => {
    it('should return 400 when challengeMFA returns an auth error', async () => {
      mockIsAuthError.mockReturnValue(true);
      mockChallengeMFA.mockResolvedValue({
        code: 'MFA_CHALLENGE_FAILED',
        message: 'Failed to create MFA challenge',
      });

      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .set('Authorization', 'Bearer test-token-123')
        .send({ factorId: 'factor-123' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MFA_CHALLENGE_FAILED');
    });

    it('should return 200 when challengeMFA succeeds', async () => {
      mockIsAuthError.mockReturnValue(false);
      mockChallengeMFA.mockResolvedValue({
        challengeId: 'challenge-123',
        expire: '2025-01-01T00:00:00Z',
      });

      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .set('Authorization', 'Bearer test-token-123')
        .send({ factorId: 'factor-123' });

      expect(res.status).toBe(200);
      expect(res.body.challengeId).toBe('challenge-123');
    });
  });

  describe('POST /mfa/verify - error response (lines 1482-1483)', () => {
    it('should return 400 when verifyMFAChallenge returns an auth error', async () => {
      mockIsAuthError.mockReturnValue(true);
      mockVerifyMFAChallenge.mockResolvedValue({
        code: 'MFA_INVALID_CODE',
        message: 'Invalid TOTP code',
      });

      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', 'Bearer test-token-123')
        .send({ factorId: 'factor-1', challengeId: 'challenge-1', code: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MFA_INVALID_CODE');
    });

    it('should return 200 when verifyMFAChallenge succeeds', async () => {
      mockIsAuthError.mockReturnValue(false);
      mockVerifyMFAChallenge.mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .set('Authorization', 'Bearer test-token-123')
        .send({ factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('MFA verified successfully');
    });
  });
});
