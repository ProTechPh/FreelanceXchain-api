// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockPoolQuery = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockPoolQuery },
}));

const mockGetPlatformStats = jest.fn<any>();
const mockGetUserManagement = jest.fn<any>();
const mockSuspendUser = jest.fn<any>();
const mockUnsuspendUser = jest.fn<any>();
const mockVerifyUser = jest.fn<any>();
const mockUpdateUser = jest.fn<any>();
const mockGetDisputeManagement = jest.fn<any>();
const mockGetSystemHealth = jest.fn<any>();

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

const mockGetAdminAnalytics = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/analytics-service.ts'), () => ({
  getAdminAnalytics: mockGetAdminAnalytics,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'admin-1', role: 'admin' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const adminRouter = (await import('../../routes/admin-routes.js')).default;

describe('Admin Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
  });

  describe('GET /stats', () => {
    it('should return platform stats', async () => {
      mockGetPlatformStats.mockResolvedValue({ success: true, data: { totalUsers: 100, totalProjects: 50 } });
      const res = await request(app).get('/api/admin/stats');
      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe(100);
    });

    it('should return 400 on failure', async () => {
      mockGetPlatformStats.mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/admin/stats');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /analytics', () => {
    it('should return admin analytics', async () => {
      mockGetAdminAnalytics.mockResolvedValue({ success: true, data: { revenue: 5000 } });
      const res = await request(app).get('/api/admin/analytics');
      expect(res.status).toBe(200);
    });

    it('should return 400 on failure', async () => {
      mockGetAdminAnalytics.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/admin/analytics');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /users', () => {
    it('should return user management data', async () => {
      mockGetUserManagement.mockResolvedValue({ success: true, data: { users: [{ id: 'u-1', email: 'test@test.com', role: 'freelancer', created_at: '2025-01-01', is_suspended: false }], total: 1 } });
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].isActive).toBe(true);
    });

    it('should pass filters', async () => {
      mockGetUserManagement.mockResolvedValue({ success: true, data: { users: [], total: 0 } });
      await request(app).get('/api/admin/users?status=active&role=freelancer');
      expect(mockGetUserManagement).toHaveBeenCalledWith({ status: 'active', role: 'freelancer' });
    });

    it('should return 400 on failure', async () => {
      mockGetUserManagement.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /users/:userId', () => {
    it('should update user', async () => {
      mockUpdateUser.mockResolvedValue({ success: true, data: { id: 'u-1', email: 'test@test.com', role: 'admin', name: 'New Name', created_at: '2025-01-01', is_suspended: false } });
      const res = await request(app).patch('/api/admin/users/u-1').send({ name: 'New Name', role: 'admin' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
    });

    it('should reject invalid role', async () => {
      const res = await request(app).patch('/api/admin/users/u-1').send({ role: 'superadmin' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ROLE');
    });

    it('should return 400 on failure', async () => {
      mockUpdateUser.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      const res = await request(app).patch('/api/admin/users/u-1').send({ name: 'New' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /users/:userId/suspend', () => {
    it('should suspend user', async () => {
      mockSuspendUser.mockResolvedValue({ success: true, data: { id: 'u-1', is_suspended: true } });
      const res = await request(app).post('/api/admin/users/u-1/suspend').send({ reason: 'Violation' });
      expect(res.status).toBe(200);
    });

    it('should return 400 on failure', async () => {
      mockSuspendUser.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).post('/api/admin/users/u-1/suspend').send({ reason: 'Test' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /users/:userId/unsuspend', () => {
    it('should unsuspend user', async () => {
      mockUnsuspendUser.mockResolvedValue({ success: true, data: { id: 'u-1', is_suspended: false } });
      const res = await request(app).post('/api/admin/users/u-1/unsuspend');
      expect(res.status).toBe(200);
    });

    it('should return 400 on failure', async () => {
      mockUnsuspendUser.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).post('/api/admin/users/u-1/unsuspend');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /users/:userId/verify', () => {
    it('should verify user', async () => {
      mockVerifyUser.mockResolvedValue({ success: true, data: { id: 'u-1', is_verified: true } });
      const res = await request(app).post('/api/admin/users/u-1/verify');
      expect(res.status).toBe(200);
    });

    it('should return 400 on failure', async () => {
      mockVerifyUser.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).post('/api/admin/users/u-1/verify');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /disputes', () => {
    it('should return dispute management data', async () => {
      mockGetDisputeManagement.mockResolvedValue({ success: true, data: { disputes: [], total: 0, pendingCount: 0, resolvedCount: 0 } });
      const res = await request(app).get('/api/admin/disputes');
      expect(res.status).toBe(200);
    });

    it('should pass status filter', async () => {
      mockGetDisputeManagement.mockResolvedValue({ success: true, data: { disputes: [], total: 0 } });
      await request(app).get('/api/admin/disputes?status=pending');
      expect(mockGetDisputeManagement).toHaveBeenCalledWith({ status: 'pending' });
    });

    it('should return 400 on failure', async () => {
      mockGetDisputeManagement.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/admin/disputes');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /system/health', () => {
    it('should return system health', async () => {
      mockGetSystemHealth.mockResolvedValue({ success: true, data: { database: 'healthy', storage: 'healthy', uptime: 1000 } });
      const res = await request(app).get('/api/admin/system/health');
      expect(res.status).toBe(200);
    });

    it('should return 400 on failure', async () => {
      mockGetSystemHealth.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/admin/system/health');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /platform-stats', () => {
    it('should return public platform stats', async () => {
      mockGetPlatformStats.mockResolvedValue({ success: true, data: { totalUsers: 100, totalTransactionVolume: 50000.5 } });
      mockPoolQuery.mockResolvedValue({ rows: [{ positive: 5, total: 5 }] });
      const res = await request(app).get('/api/admin/platform-stats');
      expect(res.status).toBe(200);
      expect(res.body.totalPaidOut).toBe('50000.50');
      expect(res.body.satisfactionRate).toBe(100);
    });

    it('should return 400 on failure', async () => {
      mockGetPlatformStats.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/admin/platform-stats');
      expect(res.status).toBe(400);
    });
  });
});
