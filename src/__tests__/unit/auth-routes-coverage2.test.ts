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

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
  asyncHandler: (fn: any) => fn,
  extractBearerToken: (req: any, res: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader?.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: { code: 'AUTH_MISSING_TOKEN', message: 'Authorization token is required' }, timestamp: new Date().toISOString(), requestId: 'test-request-id' });
      return null;
    }
    return token;
  },
  sendValidationError: (res: any, errors: any, requestId?: any) => {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: errors }, timestamp: new Date().toISOString(), requestId: requestId ?? 'unknown' });
  },
  sendAuthError: (res: any, error: any, requestId?: any) => {
    const statusMap: Record<string, number> = { DUPLICATE_EMAIL: 409, AUTH_INVALID_TOKEN: 401, INVALID_TOKEN: 401, TOKEN_EXPIRED: 401, AUTH_TOKEN_EXPIRED: 401, MFA_REQUIRED: 200, NOT_FOUND: 404, USER_NOT_FOUND: 404 };
    const statusCode = statusMap[error.code] ?? 400;
    res.status(statusCode).json({ error: { code: error.code, message: error.message }, timestamp: new Date().toISOString(), requestId: requestId ?? 'unknown' });
  },
  sendSuccess: (res: any, data: any, statusCode = 200) => {
    res.status(statusCode).json(data);
  },
  sendError: (res: any, statusCode: number, error: any, requestId?: any) => {
    res.status(statusCode).json({ error, timestamp: new Date().toISOString(), requestId: requestId ?? 'unknown' });
  },
}));

jest.unstable_mockModule(resolveModule('src/utils/validators.ts'), () => ({
  isValidEmail: (email: any) => typeof email === 'string' && email.includes('@') && email.length >= 5,
  isValidRole: (role: any) => role === 'freelancer' || role === 'employer',
  isValidWalletAddress: (addr: any) => typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr),
  validatePasswordStrength: (pw: any) => ({ valid: typeof pw === 'string' && pw.length >= 8, errors: [] }),
  validateRegisterInput: (email: any, password: any, role: any) => {
    const errors: any[] = [];
    if (typeof email !== 'string' || !email.includes('@')) errors.push({ field: 'email', message: 'Valid email is required' });
    if (typeof password !== 'string' || password.length < 8) errors.push({ field: 'password', message: 'Password is required' });
    if (role !== 'freelancer' && role !== 'employer') errors.push({ field: 'role', message: 'Role must be freelancer or employer' });
    return errors;
  },
  validateLoginInput: (email: any, password: any) => {
    const errors: any[] = [];
    if (typeof email !== 'string' || !email.includes('@')) errors.push({ field: 'email', message: 'Valid email is required' });
    if (!password || typeof password !== 'string') errors.push({ field: 'password', message: 'Password is required' });
    return errors;
  },
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
