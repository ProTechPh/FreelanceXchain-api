// @ts-nocheck
/**
 * Coverage for admin-routes.ts service failure branches.
 * Targets uncovered lines: 37,63,94,129,147,162-178,186-206,213-233,240,269,295,320
 *
 * These are the error response handlers for each admin endpoint
 * when their respective service calls return !success.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
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

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

// Mock admin-service with all functions
const mockGetPlatformStats = jest.fn<any>();
const mockGetUserManagement = jest.fn<any>();
const mockUpdateUser = jest.fn<any>();
const mockSuspendUser = jest.fn<any>();
const mockUnsuspendUser = jest.fn<any>();
const mockVerifyUser = jest.fn<any>();
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

jest.unstable_mockModule(resolveModule('src/services/analytics-service.ts'), () => ({
  getAdminAnalytics: jest.fn<any>(),
}));

const router = (await import('../../routes/admin-routes.js')).default;

describe('Admin Routes - service failure branches', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/admin', router);
  });

  it('GET /stats - returns 400 on service failure (line 37)', async () => {
    mockGetPlatformStats.mockResolvedValue({ success: false, error: { code: 'STATS_ERROR', message: 'Failed' } });
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('STATS_ERROR');
  });

  it('GET /users - returns 400 on service failure (line 94)', async () => {
    mockGetUserManagement.mockResolvedValue({ success: false, error: { code: 'USERS_ERROR', message: 'Failed' } });
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('USERS_ERROR');
  });

  it('PATCH /users/:userId - returns 400 on service failure (line 147)', async () => {
    mockUpdateUser.mockResolvedValue({ success: false, error: { code: 'UPDATE_ERROR', message: 'Failed' } });
    const res = await request(app).patch('/api/admin/users/uuid-1').send({ name: 'New' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UPDATE_ERROR');
  });

  it('POST /users/:userId/suspend - returns 400 on service failure', async () => {
    mockSuspendUser.mockResolvedValue({ success: false, error: { code: 'SUSPEND_ERROR', message: 'Failed' } });
    const res = await request(app).post('/api/admin/users/uuid-1/suspend').send({ reason: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SUSPEND_ERROR');
  });

  it('POST /users/:userId/unsuspend - returns 400 on service failure', async () => {
    mockUnsuspendUser.mockResolvedValue({ success: false, error: { code: 'UNSUSPEND_ERROR', message: 'Failed' } });
    const res = await request(app).post('/api/admin/users/uuid-1/unsuspend');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUSPEND_ERROR');
  });

  it('POST /users/:userId/verify - returns 400 on service failure', async () => {
    mockVerifyUser.mockResolvedValue({ success: false, error: { code: 'VERIFY_ERROR', message: 'Failed' } });
    const res = await request(app).post('/api/admin/users/uuid-1/verify');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VERIFY_ERROR');
  });

  it('GET /disputes - returns 400 on service failure', async () => {
    mockGetDisputeManagement.mockResolvedValue({ success: false, error: { code: 'DISPUTE_ERROR', message: 'Failed' } });
    const res = await request(app).get('/api/admin/disputes');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DISPUTE_ERROR');
  });

  it('GET /system/health - returns 400 on service failure', async () => {
    mockGetSystemHealth.mockResolvedValue({ success: false, error: { code: 'HEALTH_ERROR', message: 'Failed' } });
    const res = await request(app).get('/api/admin/system/health');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('HEALTH_ERROR');
  });

  it('GET /platform-stats - returns 400 on service failure', async () => {
    mockGetPlatformStats.mockResolvedValue({ success: false, error: { code: 'STATS_ERROR', message: 'Failed' } });
    const res = await request(app).get('/api/admin/platform-stats');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('STATS_ERROR');
  });
});
