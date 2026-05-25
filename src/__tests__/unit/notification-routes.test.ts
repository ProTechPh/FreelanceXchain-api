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

jest.unstable_mockModule(resolveModule('src/services/notification-delivery-service.ts'), () => ({
  initializeSSEConnection: jest.fn(() => ({ success: true })),
  getSSEStats: jest.fn(() => ({ success: true, data: { activeConnections: 0 } })),
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', id: 'user-1', role: 'freelancer' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
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
