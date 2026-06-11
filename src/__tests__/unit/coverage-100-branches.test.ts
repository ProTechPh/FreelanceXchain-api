// @ts-nocheck
/**
 * Coverage completion tests - targets remaining uncovered branches and lines
 * across multiple modules to achieve 100% coverage.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ============================================================
// Search Routes - cover continuationToken parsing branches
// ============================================================

const mockSearchProjects = jest.fn<any>();
const mockSearchFreelancers = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/search-service.ts'), () => ({
  searchProjects: mockSearchProjects,
  searchFreelancers: mockSearchFreelancers,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'freelancer' }; next(); },
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

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const searchRouter = (await import('../../routes/search-routes.js')).default;

describe('Search Routes - Branch Coverage', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/search', searchRouter);
  });

  describe('GET /projects - continuationToken and pagination', () => {
    it('should pass continuationToken as offset to pagination', async () => {
      mockSearchProjects.mockResolvedValue({
        success: true,
        data: { items: [], metadata: { hasMore: false } },
      });
      const res = await request(app).get('/api/search/projects?continuationToken=20&pageSize=10');
      expect(res.status).toBe(200);
      expect(mockSearchProjects).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ offset: 20, pageSize: 10 })
      );
    });

    it('should handle non-numeric continuationToken gracefully', async () => {
      mockSearchProjects.mockResolvedValue({
        success: true,
        data: { items: [], metadata: { hasMore: false } },
      });
      const res = await request(app).get('/api/search/projects?continuationToken=abc');
      expect(res.status).toBe(200);
      expect(mockSearchProjects).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ offset: 0 })
      );
    });

    it('should handle budget filters', async () => {
      mockSearchProjects.mockResolvedValue({
        success: true,
        data: { items: [], metadata: { hasMore: false } },
      });
      const res = await request(app).get('/api/search/projects?minBudget=100&maxBudget=5000');
      expect(res.status).toBe(200);
      expect(mockSearchProjects).toHaveBeenCalledWith(
        expect.objectContaining({ minBudget: 100, maxBudget: 5000 }),
        expect.anything()
      );
    });

    it('should return 400 on invalid maxBudget', async () => {
      const res = await request(app).get('/api/search/projects?maxBudget=xyz');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /freelancers - continuationToken and pagination', () => {
    it('should pass continuationToken as offset to pagination', async () => {
      mockSearchFreelancers.mockResolvedValue({
        success: true,
        data: { items: [], metadata: { hasMore: false } },
      });
      const res = await request(app).get('/api/search/freelancers?continuationToken=10&pageSize=5');
      expect(res.status).toBe(200);
      expect(mockSearchFreelancers).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ offset: 10, pageSize: 5 })
      );
    });

    it('should handle non-numeric continuationToken gracefully', async () => {
      mockSearchFreelancers.mockResolvedValue({
        success: true,
        data: { items: [], metadata: { hasMore: false } },
      });
      const res = await request(app).get('/api/search/freelancers?continuationToken=invalid');
      expect(res.status).toBe(200);
      expect(mockSearchFreelancers).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ offset: 0 })
      );
    });
  });
});
