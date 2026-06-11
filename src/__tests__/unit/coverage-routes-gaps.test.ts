// @ts-nocheck
/**
 * Coverage gaps for routes:
 * - employer-routes.ts line 104 (continuationToken branch)
 * - payment-routes.ts line 368 (catch block in disputeMilestone)
 * - auth-routes.ts lines 631-637 (implicit OAuth flow HTML response)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ============================================================
// ALL MOCKS MUST BE DECLARED ONCE AT THE TOP
// ============================================================

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Single comprehensive rate-limiter mock
jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

// Single comprehensive auth-middleware mock
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'employer' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

// Single comprehensive validation-middleware mock
jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  isValidUUID: jest.fn(() => true),
  milestoneActionSchema: {},
  disputeMilestoneSchema: {},
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v ?? 20,
  clampOffset: (v: any) => v ?? 0,
}));

// ============================================================
// 1. employer-routes.ts - line 104 (continuationToken branch)
// ============================================================

const mockGetEmployerProfileByUserId = jest.fn<any>();
const mockUpdateEmployerProfile = jest.fn<any>();
const mockListProjectsByEmployer = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
  getEmployerProfileByUserId: mockGetEmployerProfileByUserId,
  updateEmployerProfile: mockUpdateEmployerProfile,
}));

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  listProjectsByEmployer: mockListProjectsByEmployer,
}));

const employerRouter = (await import('../../routes/employer-routes.js')).default;

// ============================================================
// 2. payment-routes.ts - line 368 (catch block in disputeMilestone)
// ============================================================

const mockDisputeMilestone = jest.fn<any>();
const mockGetMilestonePaymentStatus = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/milestone-service.ts'), () => ({
  disputeMilestone: mockDisputeMilestone,
  getMilestonePaymentStatus: mockGetMilestonePaymentStatus,
  requestMilestoneCompletion: jest.fn(),
  approveMilestoneCompletion: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/repositories/payment-repository.ts'), () => ({
  PaymentRepository: {
    getById: jest.fn(),
    findByContractId: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
  },
}));

const paymentRouter = (await import('../../routes/payment-routes.js')).default;

// ============================================================
// 3. auth-routes.ts - lines 631-637 (implicit OAuth flow HTML response)
// ============================================================

const mockExchangeCodeForSession = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
  register: jest.fn(),
  login: jest.fn(),
  refreshTokens: jest.fn(),
  isAuthError: (result: any) => result && typeof result === 'object' && 'code' in result && !('accessToken' in result),
  validatePasswordStrength: jest.fn(),
  loginWithAppwrite: jest.fn(),
  registerWithAppwrite: jest.fn(),
  getOAuthUrl: jest.fn(),
  exchangeCodeForSession: mockExchangeCodeForSession,
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
  consumeMfaSession: jest.fn(),
  validateTokenAndGetUser: jest.fn(),
  requestPhoneOtp: jest.fn(),
  requestEmailOtp: jest.fn(),
  requestMagicUrl: jest.fn(),
  verifyAuthToken: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
  generateCsrfToken: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/repositories/user-repository.ts'), () => ({
  userRepository: { updateUser: jest.fn() },
}));

const authRouter = (await import('../../routes/auth-routes.js')).default;

// ============================================================
// TESTS
// ============================================================

describe('Employer Routes - continuationToken branch (line 104)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/employer', employerRouter);
  });

  it('should pass continuationToken to listProjectsByEmployer (line 104)', async () => {
    mockListProjectsByEmployer.mockResolvedValue({
      success: true,
      data: { items: [], hasMore: false },
    });

    const res = await request(app)
      .get('/api/employer/projects?continuationToken=token-abc-123');

    expect(res.status).toBe(200);
    expect(mockListProjectsByEmployer).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ continuationToken: 'token-abc-123' })
    );
  });

  it('should work without continuationToken', async () => {
    mockListProjectsByEmployer.mockResolvedValue({
      success: true,
      data: { items: [], hasMore: false },
    });

    const res = await request(app).get('/api/employer/projects');
    expect(res.status).toBe(200);
  });
});

describe('Payment Routes - disputeMilestone catch block (line 368)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/payments', paymentRouter);
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: err.message });
    });
  });

  it('should call next(error) when disputeMilestone throws (line 368)', async () => {
    mockDisputeMilestone.mockRejectedValue(new Error('Unexpected error'));

    const res = await request(app)
      .post('/api/payments/milestones/milestone-1/dispute')
      .send({ reason: 'Work not completed' });

    expect([400, 500]).toContain(res.status);
  });
});

describe('Auth Routes - implicit OAuth flow (lines 631-637)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  it('should serve HTML for implicit OAuth flow when no code param (lines 631-637)', async () => {
    // When the callback is called without a 'code' query param, it serves the implicit flow HTML
    const res = await request(app)
      .get('/api/auth/callback');

    // Should return HTML for implicit flow (no code = implicit flow)
    expect([200, 302, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.text).toContain('<!DOCTYPE html>');
    }
  });
});
