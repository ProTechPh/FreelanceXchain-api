// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req, _res, next) => next(),
  authRateLimiter: (_req, _res, next) => next(),
  registerRateLimiter: (_req, _res, next) => next(),
  passwordResetRateLimiter: (_req, _res, next) => next(),
  fileUploadRateLimiter: (_req, _res, next) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req, _res, next) => { req.user = { userId: 'user-1', role: 'employer' }; next(); },
  requireRole: () => (_req, _res, next) => next(),
  requireVerifiedKyc: (_req, _res, next) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req, _res, next) => next()),
  validate: jest.fn(() => (_req, _res, next) => next()),
  isValidUUID: jest.fn().mockReturnValue(true),
  milestoneActionSchema: {},
  disputeMilestoneSchema: {},
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v) => v ?? 20,
  clampOffset: (v) => v ?? 0,
}));

jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
  csrfProtection: (_req, _res, next) => next(),
  generateCsrfToken: jest.fn().mockReturnValue('mock-csrf-token'),
}));

// ===== REPUTATION SERVICE (used by review routes) =====
const mockGetReviewById = jest.fn();
const mockGetUserReviews = jest.fn();
const mockGetProjectReviews = jest.fn();
const mockCanUserRate = jest.fn();
const mockSubmitRating = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReviewById: mockGetReviewById,
  getUserReviews: mockGetUserReviews,
  getProjectReviews: mockGetProjectReviews,
  canUserRate: mockCanUserRate,
  submitRating: mockSubmitRating,
}));

// ===== FAVORITE ROUTES =====
const mockRemoveFavorite = jest.fn();
const mockIsFavorited = jest.fn();
const mockAddFavorite = jest.fn();
const mockGetUserFavorites = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/favorite-service.ts'), () => ({
  removeFavorite: mockRemoveFavorite,
  isFavorited: mockIsFavorited,
  addFavorite: mockAddFavorite,
  getUserFavorites: mockGetUserFavorites,
}));

// ===== TRANSACTION ROUTES =====
const mockGetTransactionById = jest.fn();
const mockGetContractTransactions = jest.fn();
const mockGetUserTransactions = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/transaction-service.ts'), () => ({
  getTransactionById: mockGetTransactionById,
  getContractTransactions: mockGetContractTransactions,
  getUserTransactions: mockGetUserTransactions,
}));

// ===== SAVED SEARCH ROUTES =====
const mockUpdateSavedSearch = jest.fn();
const mockDeleteSavedSearch = jest.fn();
const mockExecuteSavedSearch = jest.fn();
const mockCreateSavedSearch = jest.fn();
const mockGetUserSavedSearches = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/saved-search-service.ts'), () => ({
  updateSavedSearch: mockUpdateSavedSearch,
  deleteSavedSearch: mockDeleteSavedSearch,
  executeSavedSearch: mockExecuteSavedSearch,
  createSavedSearch: mockCreateSavedSearch,
  getUserSavedSearches: mockGetUserSavedSearches,
}));

// ===== MESSAGE ROUTES =====
const mockGetConversations = jest.fn();
const mockSendMessage = jest.fn();
const mockGetConvoMessages = jest.fn();
const mockMarkConversationAsRead = jest.fn();
const mockGetUnreadMessageCount = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/message-service.ts'), () => ({
  getConversations: mockGetConversations,
  sendMessage: mockSendMessage,
  getConversationMessages: mockGetConvoMessages,
  markConversationAsRead: mockMarkConversationAsRead,
  getUnreadMessageCount: mockGetUnreadMessageCount,
}));

// ===== EMPLOYER ROUTES =====
const mockGetEmployerProfileByUserId2 = jest.fn();
const mockUpdateEmployerProfile = jest.fn();
const mockListProjectsByEmployer = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
  getEmployerProfileByUserId: mockGetEmployerProfileByUserId2,
  updateEmployerProfile: mockUpdateEmployerProfile,
}));

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  listProjectsByEmployer: mockListProjectsByEmployer,
}));

// ===== ADMIN ROUTES =====
const mockGetPlatformStats = jest.fn();
const mockGetAdminAnalytics = jest.fn();
const mockGetUserManagement = jest.fn();
const mockSuspendUser = jest.fn();
const mockUnsuspendUser = jest.fn();
const mockVerifyUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetDisputeManagement = jest.fn();
const mockGetSystemHealth = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/admin-service.ts'), () => ({
  getPlatformStats: mockGetPlatformStats,
  getUserManagement: mockGetUserManagement,
  suspendUser: mockSuspendUser,
  unsuspendUser: mockUnsuspendUser,
  verifyUser: mockVerifyUser,
  updateUser: mockUpdateUser,
  getDisputeManagement: mockGetDisputeManagement,
  getSystemHealth: mockGetSystemHealth,
}));

jest.unstable_mockModule(resolveModule('src/services/analytics-service.ts'), () => ({
  getAdminAnalytics: mockGetAdminAnalytics,
}));

// ===== AUTH ROUTES =====
const mockExchangeCodeForSession = jest.fn();
const mockLoginWithAppwrite = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/auth-service.ts'), () => ({
  register: jest.fn(),
  login: jest.fn(),
  refreshTokens: jest.fn(),
  isAuthError: (r) => r && 'code' in r && 'message' in r,
  validatePasswordStrength: jest.fn().mockReturnValue({ valid: true }),
  loginWithAppwrite: mockLoginWithAppwrite,
  registerWithAppwrite: jest.fn(),
  getOAuthUrl: jest.fn().mockReturnValue('http://oauth.test'),
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

jest.unstable_mockModule(resolveModule('src/services/auth-types.ts'), () => ({}));
jest.unstable_mockModule(resolveModule('src/models/user.ts'), () => ({}));
jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test' } },
}));

// ===== NOTIFICATION ROUTES =====
const mockGetNotificationsByUser = jest.fn();
const mockMarkNotificationRead = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockInitSSE = jest.fn();
const mockGetSSEStats = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  getNotificationsByUser: mockGetNotificationsByUser,
  markNotificationAsRead: mockMarkNotificationRead,
  markAllNotificationsAsRead: mockMarkAllNotificationsRead,
  getUnreadCount: mockGetUnreadCount,
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  initializeSSEConnection: mockInitSSE,
  getSSEStats: mockGetSSEStats,
}));

// ===== IMPORTS =====
const reviewRouter = await import('../../routes/review-routes.js');
const favoriteRouter = await import('../../routes/favorite-routes.js');
const transactionRouter = await import('../../routes/transaction-routes.js');
const savedSearchRouter = await import('../../routes/saved-search-routes.js');
const messageRouter = await import('../../routes/message-routes.js');
const employerRouter = await import('../../routes/employer-routes.js');
const authRouter = await import('../../routes/auth-routes.js');
const notificationRouter = await import('../../routes/notification-routes.js');
const adminRouter = await import('../../routes/admin-routes.js');

function setupApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/test', router);
  return app;
}

function errorRes(code, message) {
  return { success: false, error: { code, message } };
}

// ============================================================
// REVIEW ROUTES (via reputation-service)
// ============================================================
describe('Review Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(reviewRouter.default);
  });

  it('GET /test/:id returns 404 when NOT_FOUND', async () => {
    mockGetReviewById.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(404);
  });

  it('GET /test/:id returns 400 on other error', async () => {
    mockGetReviewById.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(400);
  });

  it('GET /test/user/:userId returns 400 on failure', async () => {
    mockGetUserReviews.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/user/uuid-1');
    expect(res.status).toBe(400);
  });

  it('GET /test/project/:projectId returns 400 on failure', async () => {
    mockGetProjectReviews.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/project/uuid-1');
    expect(res.status).toBe(400);
  });

  it('GET /test/can-review/:contractId returns 400 on failure', async () => {
    mockCanUserRate.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/can-review/uuid-1');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// FAVORITE ROUTES
// ============================================================
describe('Favorite Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(favoriteRouter.default);
  });

  it('DELETE /test/:targetType/:targetId returns 400 on failure', async () => {
    mockRemoveFavorite.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).delete('/test/project/uuid-1');
    expect(res.status).toBe(400);
  });

  it('GET /test/check/:targetType/:targetId returns 400 on failure', async () => {
    mockIsFavorited.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/check/freelancer/uuid-1');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// TRANSACTION ROUTES
// ============================================================
describe('Transaction Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(transactionRouter.default);
  });

  it('GET /test/:id returns 404 on NOT_FOUND', async () => {
    mockGetTransactionById.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(404);
  });

  it('GET /test/:id returns 403 on UNAUTHORIZED', async () => {
    mockGetTransactionById.mockResolvedValue(errorRes('UNAUTHORIZED', 'Unauthorized'));
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(403);
  });

  it('GET /test/:id returns 400 on other error', async () => {
    mockGetTransactionById.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(400);
  });

  it('GET /test/contract/:contractId returns 404 on CONTRACT_NOT_FOUND', async () => {
    mockGetContractTransactions.mockResolvedValue(errorRes('CONTRACT_NOT_FOUND', 'Not found'));
    const res = await request(app).get('/test/contract/uuid-1');
    expect(res.status).toBe(404);
  });

  it('GET /test/contract/:contractId returns 403 on UNAUTHORIZED', async () => {
    mockGetContractTransactions.mockResolvedValue(errorRes('UNAUTHORIZED', 'Unauthorized'));
    const res = await request(app).get('/test/contract/uuid-1');
    expect(res.status).toBe(403);
  });

  it('GET /test/contract/:contractId returns 400 on other error', async () => {
    mockGetContractTransactions.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).get('/test/contract/uuid-1');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// SAVED SEARCH ROUTES
// ============================================================
describe('Saved Search Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(savedSearchRouter.default);
  });

  it('PATCH /test/:id returns 404 on NOT_FOUND', async () => {
    mockUpdateSavedSearch.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).patch('/test/uuid-1').send({ name: 'new' });
    expect(res.status).toBe(404);
  });

  it('PATCH /test/:id returns 403 on UNAUTHORIZED', async () => {
    mockUpdateSavedSearch.mockResolvedValue(errorRes('UNAUTHORIZED', 'Unauthorized'));
    const res = await request(app).patch('/test/uuid-1').send({ name: 'new' });
    expect(res.status).toBe(403);
  });

  it('PATCH /test/:id returns 400 on other error', async () => {
    mockUpdateSavedSearch.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).patch('/test/uuid-1').send({ name: 'new' });
    expect(res.status).toBe(400);
  });

  it('DELETE /test/:id returns 404 on NOT_FOUND', async () => {
    mockDeleteSavedSearch.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).delete('/test/uuid-1');
    expect(res.status).toBe(404);
  });

  it('DELETE /test/:id returns 403 on UNAUTHORIZED', async () => {
    mockDeleteSavedSearch.mockResolvedValue(errorRes('UNAUTHORIZED', 'Unauthorized'));
    const res = await request(app).delete('/test/uuid-1');
    expect(res.status).toBe(403);
  });

  it('DELETE /test/:id returns 400 on other error', async () => {
    mockDeleteSavedSearch.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).delete('/test/uuid-1');
    expect(res.status).toBe(400);
  });

  it('POST /test/:id/execute returns 404 on NOT_FOUND', async () => {
    mockExecuteSavedSearch.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).post('/test/uuid-1/execute');
    expect(res.status).toBe(404);
  });

  it('POST /test/:id/execute returns 403 on UNAUTHORIZED', async () => {
    mockExecuteSavedSearch.mockResolvedValue(errorRes('UNAUTHORIZED', 'Unauthorized'));
    const res = await request(app).post('/test/uuid-1/execute');
    expect(res.status).toBe(403);
  });

  it('POST /test/:id/execute returns 400 on other error', async () => {
    mockExecuteSavedSearch.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).post('/test/uuid-1/execute');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// MESSAGE ROUTES
// ============================================================
describe('Message Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(messageRouter.default);
  });

  it('GET /test/conversations returns 400 on failure', async () => {
    mockGetConversations.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/conversations');
    expect(res.status).toBe(400);
  });

  it('POST /test/send returns 400 when receiverId missing', async () => {
    const res = await request(app).post('/test/send').send({ content: 'hello' });
    expect(res.status).toBe(400);
  });

  it('POST /test/send returns 400 when content missing', async () => {
    const res = await request(app).post('/test/send').send({ receiverId: 'u2' });
    expect(res.status).toBe(400);
  });

  it('POST /test/send returns 400 on service failure', async () => {
    mockSendMessage.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/send').send({ receiverId: 'u2', content: 'hello' });
    expect(res.status).toBe(400);
  });

  it('GET /test/conversations/:conversationId returns 404 on NOT_FOUND', async () => {
    mockGetConvoMessages.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).get('/test/conversations/uuid-1');
    expect(res.status).toBe(404);
  });

  it('GET /test/conversations/:conversationId returns 403 on UNAUTHORIZED', async () => {
    mockGetConvoMessages.mockResolvedValue(errorRes('UNAUTHORIZED', 'Unauthorized'));
    const res = await request(app).get('/test/conversations/uuid-1');
    expect(res.status).toBe(403);
  });

  it('GET /test/conversations/:conversationId returns 400 on other error', async () => {
    mockGetConvoMessages.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).get('/test/conversations/uuid-1');
    expect(res.status).toBe(400);
  });

  it('PATCH /test/conversations/:conversationId/read returns 400 on failure', async () => {
    mockMarkConversationAsRead.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).patch('/test/conversations/uuid-1/read');
    expect(res.status).toBe(400);
  });

  it('GET /test/unread-count returns 400 on failure', async () => {
    mockGetUnreadMessageCount.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/unread-count');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// EMPLOYER ROUTES
// ============================================================
describe('Employer Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(employerRouter.default);
  });

  it('PATCH /test/profile returns 404 on PROFILE_NOT_FOUND', async () => {
    mockUpdateEmployerProfile.mockResolvedValue(errorRes('PROFILE_NOT_FOUND', 'Not found'));
    const res = await request(app).patch('/test/profile').send({ companyName: 'Test' });
    expect(res.status).toBe(404);
  });

  it('PATCH /test/profile returns 400 on other error', async () => {
    mockUpdateEmployerProfile.mockResolvedValue(errorRes('OTHER', 'Error'));
    const res = await request(app).patch('/test/profile').send({ companyName: 'Test' });
    expect(res.status).toBe(400);
  });

  it('GET /test/:id returns 404 on failure', async () => {
    mockGetEmployerProfileByUserId2.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// AUTH ROUTES - implicit OAuth flow (lines 631-637)
// ============================================================
describe('Auth Routes - OAuth flow gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(authRouter.default);
  });

  it('GET /test/callback without code returns HTML for implicit flow', async () => {
    const res = await request(app).get('/test/callback');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
  });

  it('GET /test/callback?code=xxx returns success (lines 631-637)', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ accessToken: 'sess-token' });
    mockLoginWithAppwrite.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'u1', email: 'test@test.com' },
    });
    const res = await request(app).get('/test/callback?code=valid-code');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.access_token).toBe('access-token');
  });
});

// ============================================================
// NOTIFICATION ROUTES
// ============================================================
describe('Notification Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(notificationRouter.default);
  });

  it('GET /test returns 400 on failure', async () => {
    mockGetNotificationsByUser.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
  });

  it('PATCH /test/:id/read returns 400 on failure', async () => {
    mockMarkNotificationRead.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).patch('/test/uuid-1/read');
    expect(res.status).toBe(400);
  });

  it('PATCH /test/read-all returns 400 on failure', async () => {
    mockMarkAllNotificationsRead.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).patch('/test/read-all');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// ADMIN ROUTES
// ============================================================
describe('Admin Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(adminRouter.default);
  });

  it('GET /test/stats returns 400 on failure', async () => {
    mockGetPlatformStats.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/stats');
    expect(res.status).toBe(400);
  });

  it('GET /test/analytics returns 400 on failure', async () => {
    mockGetAdminAnalytics.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/analytics');
    expect(res.status).toBe(400);
  });

  it('GET /test/users returns 400 on failure', async () => {
    mockGetUserManagement.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/users');
    expect(res.status).toBe(400);
  });

  it('PATCH /test/users/uuid-1 returns 400 for invalid role', async () => {
    const res = await request(app).patch('/test/users/uuid-1').send({ role: 'superadmin' });
    expect(res.status).toBe(400);
  });

  it('PATCH /test/users/uuid-1 returns 400 on update failure', async () => {
    mockUpdateUser.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).patch('/test/users/uuid-1').send({ name: 'New' });
    expect(res.status).toBe(400);
  });

  it('POST /test/users/uuid-1/suspend returns 400 on failure', async () => {
    mockSuspendUser.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/users/uuid-1/suspend').send({ reason: 'bad' });
    expect(res.status).toBe(400);
  });

  it('POST /test/users/uuid-1/unsuspend returns 400 on failure', async () => {
    mockUnsuspendUser.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/users/uuid-1/unsuspend');
    expect(res.status).toBe(400);
  });

  it('POST /test/users/uuid-1/verify returns 400 on failure', async () => {
    mockVerifyUser.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/users/uuid-1/verify');
    expect(res.status).toBe(400);
  });

  it('GET /test/disputes returns 400 on failure', async () => {
    mockGetDisputeManagement.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/disputes');
    expect(res.status).toBe(400);
  });

  it('GET /test/system/health returns 400 on failure', async () => {
    mockGetSystemHealth.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/system/health');
    expect(res.status).toBe(400);
  });

  it('GET /test/platform-stats returns 400 on failure (public endpoint)', async () => {
    mockGetPlatformStats.mockResolvedValue({ success: false, error: { code: 'FAIL', message: 'Failed' } });
    const res = await request(app).get('/test/platform-stats');
    expect(res.status).toBe(400);
  });
});
