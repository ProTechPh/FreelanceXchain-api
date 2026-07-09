// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetNotificationsByUser = jest.fn<any>();
const mockMarkNotificationAsRead = jest.fn<any>();
const mockMarkAllNotificationsAsRead = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  getNotificationsByUser: mockGetNotificationsByUser,
  markNotificationAsRead: mockMarkNotificationAsRead,
  markAllNotificationsAsRead: mockMarkAllNotificationsAsRead,
  getUnreadCount: mockGetUnreadCount,
}));

const mockGetSSEStats = jest.fn<any>(() => ({ success: true, data: { activeConnections: 0 } }));
jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  initializeSSEConnection: jest.fn(() => ({ success: true })),
  getSSEStats: mockGetSSEStats,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', id: 'user-1', role: 'freelancer' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v ?? 20,
  clampOffset: (v: any) => v ?? 0,
  safeJsonParse: (v: any) => typeof v === 'string' ? JSON.parse(v) : v,
}));

const router = (await import('../../routes/notification-routes.js')).default;

const notificationRouter = router;
function makeApp(basePath: string, r: any) { const a = express(); a.use(express.json()); a.use(basePath, r); return a; }
const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });
const mockNotificationService = { getNotificationsByUser: mockGetNotificationsByUser, markNotificationAsRead: mockMarkNotificationAsRead, markAllNotificationsAsRead: mockMarkAllNotificationsAsRead, getUnreadCount: mockGetUnreadCount };
const mockNotificationDeliveryService = { initializeSSEConnection: jest.fn(() => ({ success: true })), getSSEStats: jest.fn(() => ({ success: true, data: { activeConnections: 0 } })) };

describe('Notification Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/notifications', router);
  });

  describe('GET /', () => {
    it('should return user notifications on success', async () => {
      mockGetNotificationsByUser.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'n-1', title: 'New proposal' }], hasMore: false },
      });
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('should return 400 on service failure', async () => {
      mockGetNotificationsByUser.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed' },
      });
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /unread-count', () => {
    it('should return unread count on success', async () => {
      mockGetUnreadCount.mockResolvedValue({
        success: true,
        data: 5,
      });
      const res = await request(app).get('/api/notifications/unread-count');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
    });

    it('should return 400 on service failure', async () => {
      mockGetUnreadCount.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed' },
      });
      const res = await request(app).get('/api/notifications/unread-count');
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /:id/read', () => {
    it('should mark notification as read on success', async () => {
      mockMarkNotificationAsRead.mockResolvedValue({
        success: true,
        data: { id: 'n-1', isRead: true },
      });
      const res = await request(app).patch('/api/notifications/n-1/read');
      expect(res.status).toBe(200);
      expect(res.body.isRead).toBe(true);
    });

    it('should return 404 when notification not found', async () => {
      mockMarkNotificationAsRead.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).patch('/api/notifications/n-1/read');
      expect(res.status).toBe(404);
    });

    it('should return 403 when unauthorized', async () => {
      mockMarkNotificationAsRead.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not your notification' },
      });
      const res = await request(app).patch('/api/notifications/n-1/read');
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /read-all', () => {
    it('should mark all notifications as read on success', async () => {
      mockMarkAllNotificationsAsRead.mockResolvedValue({
        success: true,
        data: { count: 3 },
      });
      const res = await request(app).patch('/api/notifications/read-all');
      expect(res.status).toBe(200);
    });

    it('should return 400 on service failure', async () => {
      mockMarkAllNotificationsAsRead.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed' },
      });
      const res = await request(app).patch('/api/notifications/read-all');
      expect(res.status).toBe(400);
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('notification-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/notifications', notificationRouter);
  });

  it('GET / with maxItemCount and continuationToken', async () => {
    mockNotificationService.getNotificationsByUser.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/notifications?maxItemCount=5&continuationToken=tok1');
    expect(res.status).toBe(200);
  });

  it('GET / without params (fallbacks)', async () => {
    mockNotificationService.getNotificationsByUser.mockResolvedValue(ok({ items: [] }));
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(200);
  });

  it('GET /unread-count success', async () => {
    mockNotificationService.getUnreadCount.mockResolvedValue(ok(5));
    const res = await request(app).get('/api/notifications/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(5);
  });

  it('PATCH /:id/read NOT_FOUND returns 404', async () => {
    mockNotificationService.markNotificationAsRead.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).patch('/api/notifications/n1/read');
    expect(res.status).toBe(404);
  });

  it('PATCH /:id/read UNAUTHORIZED returns 403', async () => {
    mockNotificationService.markNotificationAsRead.mockResolvedValue(fail('UNAUTHORIZED', 'No'));
    const res = await request(app).patch('/api/notifications/n1/read');
    expect(res.status).toBe(403);
  });

  it('PATCH /:id/read other error returns 400', async () => {
    mockNotificationService.markNotificationAsRead.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).patch('/api/notifications/n1/read');
    expect(res.status).toBe(400);
  });

  it('PATCH /:id/read success returns notification data', async () => {
    mockNotificationService.markNotificationAsRead.mockResolvedValue(ok({ id: 'n1', isRead: true, title: 'Test' }));
    const res = await request(app).patch('/api/notifications/n1/read');
    expect(res.status).toBe(200);
    expect(res.body.isRead).toBe(true);
  });

  it('PATCH /read-all success', async () => {
    mockNotificationService.markAllNotificationsAsRead.mockResolvedValue(ok({ count: 3 }));
    const res = await request(app).patch('/api/notifications/read-all');
    expect(res.status).toBe(200);
  });

  // SSE stream tests are skipped because initializeSSEConnection keeps the response open
  // (SSE never resolves), making supertest hang. The route logic is:
  // - authMiddleware sets req.user.id → calls initializeSSEConnection
  // - if !userId → 401
  // - if result.success → response stays open (SSE)
  // - if !result.success → 500
  // These branches are covered by the mock setup (success and failure return values).

  it('GET /sse-stats success', async () => {
    mockGetSSEStats.mockReturnValue(ok({ connections: 5 }));
    const res = await request(app).get('/api/notifications/sse-stats');
    expect(res.status).toBe(200);
  });

  it('GET /sse-stats failure', async () => {
    mockGetSSEStats.mockReturnValue(fail('ERROR', 'Failed'));
    const res = await request(app).get('/api/notifications/sse-stats');
    expect(res.status).toBe(500);
  });
});

describe('notification-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockMarkNotificationAsRead = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
      getNotificationsByUser: jest.fn(),
      markNotificationAsRead: mockMarkNotificationAsRead,
      markAllNotificationsAsRead: jest.fn(),
      getUnreadCount: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
      initializeSSEConnection: jest.fn(),
      getSSEStats: jest.fn(),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/notification-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/notifications', router);
    jest.clearAllMocks();
  });

  it('L209: PATCH mark read', async () => {
    mockMarkNotificationAsRead.mockResolvedValueOnce({ success: true });
    const request = (await import('supertest')).default;
    const res = await request(app).patch('/api/notifications/n1/read');
    expect(res.status).toBe(200);
  });
});


// ═══════════════════════════════════════════════════════════════
// Coverage for !userId guards and /stream endpoint
// Uncovered: lines 92-97, 153-158, 214-219, 270-275, 313-323
// ═══════════════════════════════════════════════════════════════

describe('notification-routes - !userId guards and /stream endpoint', () => {
  let app: any;
  const mockAuthNoUser = jest.fn();
  const mockSSEConnection = jest.fn();

  beforeEach(async () => {
    jest.resetModules();

    jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
      getNotificationsByUser: jest.fn(),
      markNotificationAsRead: jest.fn(),
      markAllNotificationsAsRead: jest.fn(),
      getUnreadCount: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
      initializeSSEConnection: mockSSEConnection,
      getSSEStats: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: mockAuthNoUser,
      requireRole: () => (_req: any, _res: any, next: any) => next(),
      requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
      apiRateLimiter: (_req: any, _res: any, next: any) => next(),
      fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
      mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
      validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    }));
    jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
      getRequestId: () => 'test-request-id',
    }));
    jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
      clampLimit: (v: any) => v ?? 20,
      clampOffset: (v: any) => v ?? 0,
      safeJsonParse: (v: any) => typeof v === 'string' ? JSON.parse(v) : v,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/notification-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/notifications', router);
    jest.clearAllMocks();
  });

  it('GET / returns 401 when userId is not set (lines 92-97)', async () => {
    mockAuthNoUser.mockImplementation((req: any, _res: any, next: any) => { req.user = {}; next(); });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('GET /unread-count returns 401 when userId is not set (lines 153-158)', async () => {
    mockAuthNoUser.mockImplementation((req: any, _res: any, next: any) => { req.user = {}; next(); });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/notifications/unread-count');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('PATCH /:id/read returns 401 when userId is not set (lines 214-219)', async () => {
    mockAuthNoUser.mockImplementation((req: any, _res: any, next: any) => { req.user = {}; next(); });
    const request = (await import('supertest')).default;
    const res = await request(app).patch('/api/notifications/n1/read');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('PATCH /read-all returns 401 when userId is not set (lines 270-275)', async () => {
    mockAuthNoUser.mockImplementation((req: any, _res: any, next: any) => { req.user = {}; next(); });
    const request = (await import('supertest')).default;
    const res = await request(app).patch('/api/notifications/read-all');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('GET /stream returns 401 when user id is not set (lines 313-317)', async () => {
    mockAuthNoUser.mockImplementation((req: any, _res: any, next: any) => { req.user = {}; next(); });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/notifications/stream');
    expect(res.status).toBe(401);
  });

  it('GET /stream initializes SSE connection on success (lines 313, 320)', async () => {
    mockAuthNoUser.mockImplementation((req: any, _res: any, next: any) => { req.user = { id: 'user-1' }; next(); });
    mockSSEConnection.mockImplementation((_userId: any, res: any) => { res.status(200).end(); return { success: true }; });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/notifications/stream');
    expect(res.status).toBe(200);
    expect(mockSSEConnection).toHaveBeenCalledWith('user-1', expect.anything());
  });

  it('GET /stream returns 500 when SSE connection fails (lines 322-323)', async () => {
    mockAuthNoUser.mockImplementation((req: any, _res: any, next: any) => { req.user = { id: 'user-1' }; next(); });
    mockSSEConnection.mockReturnValue({ success: false, error: { message: 'SSE connection failed' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/notifications/stream');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('SSE connection failed');
  });
});

describe('notification-routes - additional branch coverage', () => {
  let app: any;
  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/notifications', router);
  });

  it('GET / with only maxItemCount (no continuationToken)', async () => {
    mockGetNotificationsByUser.mockResolvedValue({ success: true, data: { items: [], hasMore: false } });
    const res = await request(app).get('/api/notifications?maxItemCount=10');
    expect(res.status).toBe(200);
    expect(mockGetNotificationsByUser).toHaveBeenCalledWith('user-1', { maxItemCount: 10 });
  });

  it('GET / with only continuationToken (no maxItemCount)', async () => {
    mockGetNotificationsByUser.mockResolvedValue({ success: true, data: { items: [], hasMore: false } });
    const res = await request(app).get('/api/notifications?continuationToken=abc123');
    expect(res.status).toBe(200);
    // clampLimit(undefined) returns 20 from the mock, so maxItemCount is always present
    expect(mockGetNotificationsByUser).toHaveBeenCalledWith('user-1', { maxItemCount: 20, continuationToken: 'abc123' });
  });

  it('PATCH /:id/read with generic error code returns 400', async () => {
    mockMarkNotificationAsRead.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'Database error' },
    });
    const res = await request(app).patch('/api/notifications/n-1/read');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DB_ERROR');
  });
});

describe('notification-routes - ?? "" param fallback coverage', () => {
  let app: any;
  const mockMarkNotificationAsRead = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
      getNotificationsByUser: jest.fn(),
      markNotificationAsRead: mockMarkNotificationAsRead,
      markAllNotificationsAsRead: jest.fn(),
      getUnreadCount: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
      initializeSSEConnection: jest.fn(),
      getSSEStats: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', id: 'user-1', role: 'freelancer' };
        delete req.params.id;
        next();
      },
      requireRole: () => (_req: any, _res: any, next: any) => next(),
      requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
      apiRateLimiter: (_req: any, _res: any, next: any) => next(),
      fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
      mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
      validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    }));
    jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
      getRequestId: () => 'test-request-id',
    }));
    jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
      clampLimit: (v: any) => v ?? 20,
      clampOffset: (v: any) => v ?? 0,
      safeJsonParse: (v: any) => typeof v === 'string' ? JSON.parse(v) : v,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/notification-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/notifications', router);
    jest.clearAllMocks();
  });

  it('L209: PATCH /:id/read uses ?? "" fallback when id param is nullish', async () => {
    mockMarkNotificationAsRead.mockResolvedValueOnce({ success: true, data: { id: '', isRead: true } });
    const request = (await import('supertest')).default;
    const res = await request(app).patch('/api/notifications/any-id/read');
    expect(res.status).toBe(200);
    expect(mockMarkNotificationAsRead).toHaveBeenCalledWith('', 'user-1');
  });
});
