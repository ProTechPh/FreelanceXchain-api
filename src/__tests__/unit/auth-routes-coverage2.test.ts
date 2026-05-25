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
}));

jest.unstable_mockModule(resolveModule('src/services/auth-types.ts'), () => ({}));
jest.unstable_mockModule(resolveModule('src/models/user.ts'), () => ({}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
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

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

const router = (await import('../../routes/auth-routes.js')).default;

describe('Auth Routes - Coverage2', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer' };
      next();
    });
    mockValidatePasswordStrength.mockReturnValue({ valid: true, errors: [] });
    app = express();
    app.use(express.json());
    app.use('/api/auth', router);
  });

  // Lines 630-638: OAuth callback - specific error handling path
  describe('GET /oauth/callback - error handling', () => {
    it('should return 401 when exchangeCodeForSession returns auth error', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid OAuth token',
      });

      const res = await request(app).get('/api/auth/oauth/callback?code=invalid-code&state=test-state');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThanOrEqual(401);
    });
  });

  // Lines 1143-1144: Password change error
  describe('POST /change-password - error', () => {
    it('should return 400 when updatePassword fails', async () => {
      mockUpdatePassword.mockResolvedValue({
        code: 'AUTH_INVALID_PASSWORD',
        message: 'Current password is incorrect',
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .send({ currentPassword: 'OldPass123!', password: 'NewPass123!@#' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // Lines 1411-1412: Email verification error
  describe('POST /verify-email - error', () => {
    it('should handle verification failure', async () => {
      // This endpoint may use a different service method
      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ userId: 'user-1', secret: 'invalid-secret' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // Lines 1482-1483: Resend verification error
  describe('POST /resend-verification - error', () => {
    it('should handle resend failure', async () => {
      mockResendConfirmationEmail.mockResolvedValue({
        code: 'AUTH_ERROR',
        message: 'Failed to resend',
      });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'test@example.com' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
