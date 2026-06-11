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
const mockInitializeSSEConnection = jest.fn<any>();
const mockGetSSEStats = jest.fn<any>();
const mockAuthMiddleware = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/notification-service.ts'), () => ({
  getNotificationsByUser: mockGetNotificationsByUser,
  markNotificationAsRead: mockMarkNotificationAsRead,
  markAllNotificationsAsRead: mockMarkAllNotificationsAsRead,
  getUnreadCount: mockGetUnreadCount,
}));

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  initializeSSEConnection: mockInitializeSSEConnection,
  getSSEStats: mockGetSSEStats,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
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
}));

const router = (await import('../../routes/notification-routes.js')).default;

describe('Notification Routes - Auth Guard Coverage', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/notifications', router);
    // Default: no user set (triggers !userId branches)
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = undefined;
      next();
    });
  });

  describe('GET / - !userId branch', () => {
    it('should return 401 when user is not authenticated', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
      expect(res.body.error.message).toBe('User not authenticated');
      expect(res.body.requestId).toBe('test-request-id');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /unread-count - !userId branch', () => {
    it('should return 401 when user is not authenticated', async () => {
      const res = await request(app).get('/api/notifications/unread-count');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
      expect(res.body.error.message).toBe('User not authenticated');
    });
  });

  describe('PATCH /:id/read - !userId branch', () => {
    it('should return 401 when user is not authenticated', async () => {
      const res = await request(app).patch('/api/notifications/some-id/read');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
      expect(res.body.error.message).toBe('User not authenticated');
    });
  });

  describe('PATCH /read-all - !userId branch', () => {
    it('should return 401 when user is not authenticated', async () => {
      const res = await request(app).patch('/api/notifications/read-all');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
      expect(res.body.error.message).toBe('User not authenticated');
    });
  });

  describe('GET /stream - !userId branch', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });
      const res = await request(app).get('/api/notifications/stream');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 when user.id is empty string', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { id: '', userId: '' };
        next();
      });
      const res = await request(app).get('/api/notifications/stream');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('GET /stream - SSE connection failure', () => {
    it('should return 500 when initializeSSEConnection fails', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { id: 'user-1', userId: 'user-1' };
        next();
      });
      mockInitializeSSEConnection.mockReturnValue({
        success: false,
        error: { message: 'Connection pool exhausted' },
      });
      const res = await request(app).get('/api/notifications/stream');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Connection pool exhausted');
    });
  });

  describe('GET /sse-stats - service failure', () => {
    it('should return 500 when getSSEStats fails', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { id: 'user-1', userId: 'user-1' };
        next();
      });
      mockGetSSEStats.mockReturnValue({
        success: false,
        error: { message: 'Stats unavailable' },
      });
      const res = await request(app).get('/api/notifications/sse-stats');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Stats unavailable');
    });

    it('should return stats on success', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { id: 'user-1', userId: 'user-1' };
        next();
      });
      mockGetSSEStats.mockReturnValue({
        success: true,
        data: { activeConnections: 5 },
      });
      const res = await request(app).get('/api/notifications/sse-stats');
      expect(res.status).toBe(200);
      expect(res.body.activeConnections).toBe(5);
    });
  });
});
