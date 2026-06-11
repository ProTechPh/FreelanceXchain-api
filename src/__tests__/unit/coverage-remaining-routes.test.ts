// @ts-nocheck
/**
 * Coverage for remaining route files' service failure branches.
 * Targets:
 * - employer-routes.ts: 89, 289
 * - review-routes.ts: 69, 88, 106, 125
 * - saved-search-routes.ts: 83, 113, 142
 * - transaction-routes.ts: 53, 82
 * - favorite-routes.ts: 122, 159
 * - notification-routes.ts: 100, 107, 209
 */
import { jest, describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

// Shared mocks for all routes
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test' } },
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'user' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v ?? 20,
  clampOffset: (v: any) => v ?? 0,
}));

// ===== ROUTE 1: Employer Routes =====
const mockGetEmployerProfileByUserId = jest.fn<any>();
const mockUpdateEmployerProfile = jest.fn<any>();
const mockListProjectsByEmployer = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
  getEmployerProfileByUserId: mockGetEmployerProfileByUserId,
  updateEmployerProfile: mockUpdateEmployerProfile,
  createProfile: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  listProjectsByEmployer: mockListProjectsByEmployer,
}));

// ===== ROUTE 2: Review Routes =====
const mockSubmitRating = jest.fn<any>();
const mockGetReviewById = jest.fn<any>();
const mockGetUserReviews = jest.fn<any>();
const mockGetProjectReviews = jest.fn<any>();
const mockCanUserReview = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  submitRating: mockSubmitRating,
  getReviewById: mockGetReviewById,
  getUserReviews: mockGetUserReviews,
  getProjectReviews: mockGetProjectReviews,
  canUserRate: mockCanUserReview,
}));

// ===== ROUTE 3: Saved Search Routes =====
const mockCreateSavedSearch = jest.fn<any>();
const mockGetUserSavedSearches = jest.fn<any>();
const mockDeleteSavedSearch = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/saved-search-service.ts'), () => ({
  createSavedSearch: mockCreateSavedSearch,
  getUserSavedSearches: mockGetUserSavedSearches,
  updateSavedSearch: jest.fn<any>(),
  deleteSavedSearch: mockDeleteSavedSearch,
  executeSavedSearch: jest.fn<any>(),
}));

// ===== ROUTE 4: Transaction Routes =====
const mockGetUserTransactions = jest.fn<any>();
const mockGetTransactionById = jest.fn<any>();
const mockGetContractTransactions = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/transaction-service.ts'), () => ({
  getUserTransactions: mockGetUserTransactions,
  getTransactionById: mockGetTransactionById,
  getContractTransactions: mockGetContractTransactions,
}));

// ===== ROUTE 5: Favorite Routes =====
const mockAddFavorite = jest.fn<any>();
const mockRemoveFavorite = jest.fn<any>();
const mockGetUserFavorites = jest.fn<any>();
const mockIsFavorited = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/favorite-service.ts'), () => ({
  addFavorite: mockAddFavorite,
  removeFavorite: mockRemoveFavorite,
  getUserFavorites: mockGetUserFavorites,
  isFavorited: mockIsFavorited,
}));

// ===== ROUTE 6: Notification Routes =====
const mockGetNotificationsByUser = jest.fn<any>();
const mockMarkNotificationAsRead = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  getNotificationsByUser: mockGetNotificationsByUser,
  markNotificationAsRead: mockMarkNotificationAsRead,
  markAllNotificationsAsRead: jest.fn<any>(),
  getUnreadCount: mockGetUnreadCount,
  createNotification: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  initializeSSEConnection: jest.fn<any>(),
  getSSEStats: jest.fn<any>(),
}));

// ============================================================
// Tests
// ============================================================

describe('employer-routes.ts - service failures', () => {
  let app: express.Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    const router = (await import('../../routes/employer-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/employers', router);
  });

  it('PATCH /profile returns 400 on failure (line 89)', async () => {
    mockUpdateEmployerProfile.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).patch('/api/employers/profile').send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('GET /:userId returns 404 on failure (line 289)', async () => {
    mockGetEmployerProfileByUserId.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: '' } });
    const res = await request(app).get('/api/employers/uuid-1');
    expect(res.status).toBe(404);
  });
});

describe('review-routes.ts - service failures', () => {
  let app: express.Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    const router = (await import('../../routes/review-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/reviews', router);
  });

  it('POST / returns 400 on failure (line 69)', async () => {
    mockSubmitRating.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).post('/api/reviews').send({ contractId: 'uuid-1', rating: 5, comment: 'ok' });
    expect(res.status).toBe(400);
  });

  it('GET /user/:userId returns 400 on failure (line 88)', async () => {
    mockGetUserReviews.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).get('/api/reviews/user/uuid-1');
    expect(res.status).toBe(400);
  });

  it('GET /:reviewId returns 404 on failure (line 69)', async () => {
    mockGetReviewById.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: '' } });
    const res = await request(app).get('/api/reviews/uuid-1');
    expect(res.status).toBe(404);
  });

  it('GET /project/:projectId returns 400 on failure (line 106)', async () => {
    mockGetProjectReviews.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).get('/api/reviews/project/uuid-1');
    expect(res.status).toBe(400);
  });

  it('GET /can-review/:contractId returns 400 on failure (line 125)', async () => {
    mockCanUserReview.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).get('/api/reviews/can-review/uuid-1');
    expect(res.status).toBe(400);
  });
});

describe('saved-search-routes.ts - service failures', () => {
  let app: express.Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    const router = (await import('../../routes/saved-search-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/saved-searches', router);
  });

  it('POST / returns 400 on failure (line 83)', async () => {
    mockCreateSavedSearch.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).post('/api/saved-searches').send({ name: 'Test', searchType: 'project', criteria: {} });
    expect(res.status).toBe(400);
  });

  it('GET / returns 400 on failure (line 113)', async () => {
    mockGetUserSavedSearches.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).get('/api/saved-searches');
    expect(res.status).toBe(400);
  });

  it('DELETE /:id returns 400 on failure (line 142)', async () => {
    mockDeleteSavedSearch.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).delete('/api/saved-searches/uuid-1');
    expect(res.status).toBe(400);
  });
});

describe('transaction-routes.ts - service failures', () => {
  let app: express.Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    const router = (await import('../../routes/transaction-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/transactions', router);
  });

  it('GET / returns 400 on failure (line 53)', async () => {
    mockGetUserTransactions.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).get('/api/transactions');
    expect(res.status).toBe(400);
  });

  it('GET /:id returns 404 on failure (line 82)', async () => {
    mockGetTransactionById.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: '' } });
    const res = await request(app).get('/api/transactions/uuid-1');
    expect(res.status).toBe(404);
  });
});

describe('favorite-routes.ts - service failures', () => {
  let app: express.Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    const router = (await import('../../routes/favorite-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/favorites', router);
  });

  it('POST / returns 400 on failure (line 122)', async () => {
    mockAddFavorite.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).post('/api/favorites').send({ targetId: 'uuid-1', targetType: 'project' });
    expect(res.status).toBe(400);
  });

  it('DELETE /:targetType/:targetId returns 400 on failure (line 159)', async () => {
    mockRemoveFavorite.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).delete('/api/favorites/project/uuid-1');
    expect(res.status).toBe(400);
  });
});

describe('notification-routes.ts - service failures', () => {
  let app: express.Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    const router = (await import('../../routes/notification-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/notifications', router);
  });

  it('GET / returns 400 on failure (line 100)', async () => {
    mockGetNotificationsByUser.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(400);
  });

  it('PATCH /:id/read returns 400 on failure (line 107)', async () => {
    mockMarkNotificationAsRead.mockResolvedValue({ success: false, error: { code: 'FAIL', message: '' } });
    const res = await request(app).patch('/api/notifications/uuid-1/read');
    expect(res.status).toBe(400);
  });
});
