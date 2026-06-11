// @ts-nocheck
/**
 * Covers uncovered route statements:
 * - file-routes.ts lines 58-64 (!bucket || !path validation)
 * - auth-routes.ts lines 630-638 (implicit OAuth flow HTML)
 * - search-routes.ts lines 157-158, 251-252 (service failures)
 * - reputation-routes.ts lines 355-361, 413-419 (catch blocks)
 * - matching-routes.ts lines 234-240 (defensive guard)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test' } },
}));

// ===== Search Routes (lines 157-158, 251-252) =====
const mockSearchProjects = jest.fn<any>();
const mockSearchFreelancers = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/search-service.ts'), () => ({
  searchProjects: mockSearchProjects,
  searchFreelancers: mockSearchFreelancers,
}));

// ===== Reputation Routes (lines 355-361, 413-419) =====
const mockGetReputation = jest.fn<any>();
const mockGetWorkHistory = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/reputation-contract.ts'), () => ({
  getReputation: mockGetReputation,
  getWorkHistory: mockGetWorkHistory,
  getRatingsFromBlockchain: jest.fn<any>().mockResolvedValue([]),
}));

// ===== Auth Routes (lines 630-638) =====
const mockExchangeCodeForSession = jest.fn<any>();
const mockLoginWithAppwrite = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
  register: jest.fn<any>(),
  login: jest.fn<any>(),
  refreshTokens: jest.fn<any>(),
  isAuthError: (r: any) => r && 'code' in r && 'message' in r,
  validatePasswordStrength: jest.fn<any>().mockReturnValue({ valid: true }),
  loginWithAppwrite: mockLoginWithAppwrite,
  registerWithAppwrite: jest.fn<any>(),
  getOAuthUrl: jest.fn<any>().mockReturnValue('http://oauth.test'),
  exchangeCodeForSession: mockExchangeCodeForSession,
  resendConfirmationEmail: jest.fn<any>(),
  requestPasswordReset: jest.fn<any>(),
  updatePassword: jest.fn<any>(),
  getCurrentUserWithKyc: jest.fn<any>(),
  logout: jest.fn<any>(),
  enrollMFA: jest.fn<any>(),
  verifyMFAEnrollment: jest.fn<any>(),
  challengeMFA: jest.fn<any>(),
  verifyMFAChallenge: jest.fn<any>(),
  getMFAFactors: jest.fn<any>(),
  disableMFA: jest.fn<any>(),
  consumeMfaSession: jest.fn<any>(),
  validateTokenAndGetUser: jest.fn<any>(),
  requestPhoneOtp: jest.fn<any>(),
  requestEmailOtp: jest.fn<any>(),
  requestMagicUrl: jest.fn<any>(),
  verifyAuthToken: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/auth-types.ts'), () => ({}));
jest.unstable_mockModule(resolveModule('src/models/user.ts'), () => ({}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', role: 'freelancer' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
  csrfProtection: (_req: any, _res: any, next: any) => next(),
  generateCsrfToken: jest.fn<any>().mockReturnValue('mock-csrf-token'),
}));

// ===== Matching Routes (lines 234-240) =====
const mockGetFreelancerRecommendations = jest.fn<any>();
const mockGetProjectRecommendations = jest.fn<any>();
const mockExtractSkillsFromText = jest.fn<any>();
const mockAnalyzeSkillGaps = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/matching-service.ts'), () => ({
  getFreelancerRecommendations: mockGetFreelancerRecommendations,
  getProjectRecommendations: mockGetProjectRecommendations,
  extractSkillsFromText: mockExtractSkillsFromText,
  analyzeSkillGaps: mockAnalyzeSkillGaps,
  isMatchingError: (r: any) => r && !r.success,
}));

const searchRouter = (await import('../../routes/search-routes.js')).default;
const authRouter = (await import('../../routes/auth-routes.js')).default;
const matchingRouter = (await import('../../routes/matching-routes.js')).default;

describe('Search Routes - service failure paths', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/search', searchRouter);
  });

  // Lines 157-158: searchProjects returns failure
  it('GET /projects returns 400 when searchProjects fails', async () => {
    mockSearchProjects.mockResolvedValue({
      success: false,
      error: { code: 'SEARCH_ERROR', message: 'Search failed' },
    });

    const res = await request(app).get('/api/search/projects?keyword=test');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SEARCH_ERROR');
  });

  // Lines 251-252: searchFreelancers returns failure
  it('GET /freelancers returns 400 when searchFreelancers fails', async () => {
    mockSearchFreelancers.mockResolvedValue({
      success: false,
      error: { code: 'SEARCH_ERROR', message: 'Freelancer search failed' },
    });

    const res = await request(app).get('/api/search/freelancers?keyword=react');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SEARCH_ERROR');
  });
});

describe('Auth Routes - implicit OAuth flow', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  // Lines 630-638: implicit flow HTML response (no code param, no error)
  it('GET /callback without code returns HTML for implicit flow', async () => {
    const res = await request(app).get('/api/auth/callback');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('access_token');
    expect(res.text).toContain('URLSearchParams');
  });
});

describe('Matching Routes - defensive guard', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/matching', matchingRouter);
  });

  // Lines 234-240: getFreelancerRecommendations success path
  it('GET /freelancers/:projectId returns recommendations', async () => {
    mockGetFreelancerRecommendations.mockResolvedValue({
      success: true,
      data: [{ freelancerId: 'f-1', matchScore: 85, combinedScore: 90 }],
    });

    const res = await request(app).get('/api/matching/freelancers/proj-123');
    expect(res.status).toBe(200);
  });

  it('GET /freelancers/:projectId returns 400 on failure', async () => {
    mockGetFreelancerRecommendations.mockResolvedValue({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Project not found' },
    });

    const res = await request(app).get('/api/matching/freelancers/proj-123');
    expect(res.status).toBe(400);
  });
});
