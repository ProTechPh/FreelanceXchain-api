// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetFreelancerAnalytics = jest.fn<any>();
const mockGetEmployerAnalytics = jest.fn<any>();
const mockGetPlatformMetrics = jest.fn<any>();
const mockGetAdminAnalytics = jest.fn<any>();
const mockGetSkillTrends = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/analytics-service.ts'), () => ({
  getFreelancerAnalytics: mockGetFreelancerAnalytics,
  getEmployerAnalytics: mockGetEmployerAnalytics,
  getPlatformMetrics: mockGetPlatformMetrics,
  getAdminAnalytics: mockGetAdminAnalytics,
  getSkillTrends: mockGetSkillTrends,
}));

const mockAuthMiddleware = jest.fn((req: any, _res: any, next: any) => {
  req.user = { userId: 'user-1', role: 'freelancer' };
  next();
});

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

const analyticsRouter = (await import('../../routes/analytics-routes.js')).default;

describe('Analytics Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/analytics', analyticsRouter);
  });

  describe('GET /freelancer', () => {
    it('should return freelancer analytics', async () => {
      mockGetFreelancerAnalytics.mockResolvedValue({ success: true, data: { totalEarnings: 5000, completedProjects: 10 } });
      const res = await request(app).get('/api/analytics/freelancer');
      expect(res.status).toBe(200);
      expect(res.body.totalEarnings).toBe(5000);
    });

    it('should pass date range parameters', async () => {
      mockGetFreelancerAnalytics.mockResolvedValue({ success: true, data: {} });
      await request(app).get('/api/analytics/freelancer?startDate=2025-01-01&endDate=2025-01-31');
      expect(mockGetFreelancerAnalytics).toHaveBeenCalledWith('user-1', { startDate: '2025-01-01', endDate: '2025-01-31' });
    });

    it('should return 401 when not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });
      const res = await request(app).get('/api/analytics/freelancer');
      expect(res.status).toBe(401);
    });

    it('should return 400 on service failure', async () => {
      mockGetFreelancerAnalytics.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/analytics/freelancer');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /employer', () => {
    it('should return employer analytics', async () => {
      mockGetEmployerAnalytics.mockResolvedValue({ success: true, data: { totalSpent: 10000, activeProjects: 3 } });
      const res = await request(app).get('/api/analytics/employer');
      expect(res.status).toBe(200);
      expect(res.body.totalSpent).toBe(10000);
    });

    it('should pass date range parameters', async () => {
      mockGetEmployerAnalytics.mockResolvedValue({ success: true, data: {} });
      await request(app).get('/api/analytics/employer?startDate=2025-01-01&endDate=2025-01-31');
      expect(mockGetEmployerAnalytics).toHaveBeenCalledWith('user-1', { startDate: '2025-01-01', endDate: '2025-01-31' });
    });

    it('should return 401 when not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });
      const res = await request(app).get('/api/analytics/employer');
      expect(res.status).toBe(401);
    });

    it('should return 400 on service failure', async () => {
      mockGetEmployerAnalytics.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/analytics/employer');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /skill-trends', () => {
    it('should return skill trends', async () => {
      mockGetSkillTrends.mockResolvedValue({ success: true, data: [{ skill: 'React', demand: 95 }] });
      const res = await request(app).get('/api/analytics/skill-trends');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 400 on service failure', async () => {
      mockGetSkillTrends.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/analytics/skill-trends');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /platform', () => {
    it('should return platform metrics', async () => {
      mockGetPlatformMetrics.mockResolvedValue({ success: true, data: { totalUsers: 1000, totalProjects: 500 } });
      const res = await request(app).get('/api/analytics/platform');
      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe(1000);
    });

    it('should return 400 on service failure', async () => {
      mockGetPlatformMetrics.mockResolvedValue({ success: false, error: { code: 'ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/analytics/platform');
      expect(res.status).toBe(400);
    });
  });
});
