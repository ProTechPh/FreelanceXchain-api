// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetDashboardSummary = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/dashboard-service.ts'), () => ({
  getDashboardSummary: mockGetDashboardSummary,
}));

// Mutable auth behavior: tests can flip `mockSetUser` to simulate an
// unauthenticated request.
let mockSetUser = true;
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    if (mockSetUser) {
      req.user = { userId: 'test-user-id', email: 'test@test.com', role: 'freelancer' };
    }
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

const dashboardRouter = (await import('../../routes/dashboard-routes.js')).default;

describe('Dashboard Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetUser = true;
    app = express();
    app.use(express.json());
    app.use('/api/dashboard', dashboardRouter);
  });

  it('should return dashboard summary for authenticated user', async () => {
    mockGetDashboardSummary.mockResolvedValueOnce({
      success: true,
      data: {
        unreadNotifications: 2,
        activeContracts: 1,
        pendingProposals: 3,
        openProjects: 0,
        averageRating: 4.5,
        reviewCount: 4,
      },
    });

    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.unreadNotifications).toBe(2);
    expect(res.body.activeContracts).toBe(1);
    expect(res.body.pendingProposals).toBe(3);
    expect(res.body.averageRating).toBe(4.5);
    expect(mockGetDashboardSummary).toHaveBeenCalledWith('test-user-id');
  });

  it('should return 400 when the dashboard service fails', async () => {
    mockGetDashboardSummary.mockResolvedValueOnce({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });

    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('should return 401 when the user is not authenticated', async () => {
    mockSetUser = false;

    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    expect(mockGetDashboardSummary).not.toHaveBeenCalled();
  });
});
