// @ts-nocheck
/**
 * Targets remaining uncovered lines/branches in auth-routes.ts:
 * - L156: validateEmail with non-string input
 * - L986-1043: Second POST /oauth/register handler (duplicate route, unreachable via normal HTTP)
 * - L934: MFA_REQUIRED branch in POST /oauth/callback
 * - L1296: Non-Bearer auth header in POST /logout
 * - L1399, L1468, L1539, L1598, L1652: Missing bearer token in MFA routes
 */
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
const mockValidateTokenAndGetUser = jest.fn<any>();
const mockValidatePasswordStrength = jest.fn<any>();
const mockRequestEmailOtp = jest.fn<any>();
const mockRequestMagicUrl = jest.fn<any>();
const mockVerifyAuthToken = jest.fn<any>();

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
  validateTokenAndGetUser: mockValidateTokenAndGetUser,
  requestEmailOtp: mockRequestEmailOtp,
  requestMagicUrl: mockRequestMagicUrl,
  verifyAuthToken: mockVerifyAuthToken,
}));

jest.unstable_mockModule(resolveModule('src/services/auth-types.ts'), () => ({}));
jest.unstable_mockModule(resolveModule('src/models/user.ts'), () => ({}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

const mockAuthMiddleware = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
}));

jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
  generateCsrfToken: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: { updateUser: jest.fn<any>().mockResolvedValue({ wallet_address: '0x1234' }) },
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
  asyncHandler: (fn: any) => fn,
  extractBearerToken: (req: any, res: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'AUTH_MISSING_TOKEN', message: 'Authorization token is required' }, timestamp: new Date().toISOString(), requestId: 'test-request-id' });
      return null;
    }
    const token = authHeader.slice(7);
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

const authRouter = (await import('../../routes/auth-routes.js')).default;

describe('Auth Routes - Coverage5 (remaining gaps)', () => {
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

  // L156: validateEmail with non-string input
  describe('validateEmail non-string branch (L156)', () => {
    it('should return 400 when email is a number', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 12345, password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when email is undefined', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when email is null', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: null, password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when email is an object', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: {}, password: 'StrongPass1!', role: 'freelancer' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for login with non-string email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 123, password: 'pass' });
      expect(res.status).toBe(400);
    });
  });

  // L934: MFA_REQUIRED branch in POST /oauth/callback
  describe('POST /oauth/callback - MFA_REQUIRED (L934)', () => {
    it('should return 200 with mfaRequired when MFA is required', async () => {
      mockLoginWithAppwrite.mockResolvedValue({
        code: 'MFA_REQUIRED',
        message: 'MFA required',
        mfaSessionToken: 'mfa-session-token',
      });

      const res = await request(app)
        .post('/api/auth/oauth/callback')
        .send({ access_token: 'user-token' });

      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(true);
      expect(res.body.mfaSessionToken).toBe('mfa-session-token');
    });
  });

  // L1296: Non-Bearer auth header in POST /logout
  describe('POST /logout - non-Bearer token (L1296)', () => {
    it('should handle non-Bearer authorization header', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1' };
        req.headers = { authorization: 'Token some-token' };
        next();
      });
      mockLogout.mockResolvedValue({ success: true });

      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(401);
      // Non-Bearer token should be rejected by extractBearerToken
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });

  // L1399: Missing bearer token in /mfa/verify-enrollment
  describe('POST /mfa/verify-enrollment - no token (L1399)', () => {
    it('should return 401 when no bearer token', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1' };
        req.headers = {};
        next();
      });

      const res = await request(app)
        .post('/api/auth/mfa/verify-enrollment')
        .send({ factorId: 'f1', code: '123456' });

      expect(res.status).toBe(401);
    });
  });

  // L1468: Missing bearer token in /mfa/challenge
  describe('POST /mfa/challenge - no token (L1468)', () => {
    it('should return 401 when no bearer token', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1' };
        req.headers = {};
        next();
      });

      const res = await request(app)
        .post('/api/auth/mfa/challenge')
        .send({ factorId: 'f1' });

      expect(res.status).toBe(401);
    });
  });

  // L1539: Missing bearer token in /mfa/verify
  describe('POST /mfa/verify - no token (L1539)', () => {
    it('should return 401 when no bearer token', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1' };
        req.headers = {};
        next();
      });

      const res = await request(app)
        .post('/api/auth/mfa/verify')
        .send({ factorId: 'f1', challengeId: 'c1', code: '123456' });

      expect(res.status).toBe(401);
    });
  });

  // L1598: Missing bearer token in /mfa/factors
  describe('GET /mfa/factors - no token (L1598)', () => {
    it('should return 401 when no bearer token', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1' };
        req.headers = {};
        next();
      });

      const res = await request(app)
        .get('/api/auth/mfa/factors');

      expect(res.status).toBe(401);
    });
  });

  // L1652: Missing bearer token in /mfa/disable
  describe('POST /mfa/disable - no token (L1652)', () => {
    it('should return 401 when no bearer token', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1' };
        req.headers = {};
        next();
      });

      const res = await request(app)
        .post('/api/auth/mfa/disable')
        .send({ factorId: 'f1', otpCode: '123456' });

      expect(res.status).toBe(401);
    });
  });

  // L680 branch: first /oauth/register with non-AUTH_INVALID_TOKEN error
  describe('POST /oauth/register - first handler non-AUTH_INVALID_TOKEN error (L680)', () => {
    it('should return 400 when error is not AUTH_INVALID_TOKEN', async () => {
      mockRegisterWithAppwrite.mockResolvedValue({
        code: 'REGISTRATION_FAILED',
        message: 'Registration failed',
      });

      const res = await request(app)
        .post('/api/auth/oauth/register')
        .send({ accessToken: 'token', role: 'freelancer' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('REGISTRATION_FAILED');
    });
  });
});

// Test the second /oauth/register handler (L986-1043) by accessing it from the router stack
describe('Auth Routes - Second POST /oauth/register handler (L986-1043)', () => {
  let secondHandler: any;
  let testApp: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidatePasswordStrength.mockReturnValue({ valid: true, errors: [] });

    // Find the second POST /oauth/register handler from the router stack
    const layers = (authRouter as any).stack;
    const oauthRegisterLayers = layers.filter(
      (l: any) => l.route && l.route.path === '/oauth/register' && l.route.methods && l.route.methods.post
    );
    // The second layer is the duplicate handler at L986
    secondHandler = oauthRegisterLayers[1]?.handle;

    testApp = express();
    testApp.use(express.json());
    // Mount only the second handler
    testApp.post('/api/auth/oauth/register', (req: any, res: any, next: any) => {
      // Simulate auth middleware
      req.user = { userId: 'user-1' };
      next();
    }, secondHandler);
  });

  it('should return 400 when accessToken is missing', async () => {
    const res = await request(testApp)
      .post('/api/auth/oauth/register')
      .send({ role: 'freelancer' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'accessToken' }),
      ])
    );
  });

  it('should return 400 when accessToken is not a string', async () => {
    const res = await request(testApp)
      .post('/api/auth/oauth/register')
      .send({ accessToken: 123, role: 'freelancer' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'accessToken' }),
      ])
    );
  });

  it('should return 400 when role is missing', async () => {
    const res = await request(testApp)
      .post('/api/auth/oauth/register')
      .send({ accessToken: 'token' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'role' }),
      ])
    );
  });

  it('should return 400 when role is invalid', async () => {
    const res = await request(testApp)
      .post('/api/auth/oauth/register')
      .send({ accessToken: 'token', role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'role' }),
      ])
    );
  });

  it('should return 400 with multiple validation errors', async () => {
    const res = await request(testApp)
      .post('/api/auth/oauth/register')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBe(2);
  });

  it('should return 401 when registerWithAppwrite returns auth error', async () => {
    mockRegisterWithAppwrite.mockResolvedValue({
      code: 'AUTH_INVALID_TOKEN',
      message: 'Invalid token',
    });

    const res = await request(testApp)
      .post('/api/auth/oauth/register')
      .send({ accessToken: 'bad-token', role: 'freelancer' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  it('should return 401 when registerWithAppwrite returns non-token error', async () => {
    mockRegisterWithAppwrite.mockResolvedValue({
      code: 'REGISTRATION_FAILED',
      message: 'Failed to register',
    });

    const res = await request(testApp)
      .post('/api/auth/oauth/register')
      .send({ accessToken: 'token', role: 'employer' });

    expect(res.status).toBe(401);
  });

  it('should return 201 on successful registration', async () => {
    mockRegisterWithAppwrite.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'freelancer' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const res = await request(testApp)
      .post('/api/auth/oauth/register')
      .send({ accessToken: 'valid-token', role: 'freelancer' });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
  });

  it('should return 500 on unexpected error (catch block)', async () => {
    mockRegisterWithAppwrite.mockRejectedValue(new Error('Unexpected failure'));

    const res = await request(testApp)
      .post('/api/auth/oauth/register')
      .send({ accessToken: 'token', role: 'freelancer' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
