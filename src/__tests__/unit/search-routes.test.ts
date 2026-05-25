// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

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
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/search-routes.js')).default;

describe('Search Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/search', router);
  });

  describe('GET /projects', () => {
    it('should return search results on success', async () => {
      mockSearchProjects.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p-1', title: 'React Project' }], metadata: { hasMore: false } },
      });
      const res = await request(app).get('/api/search/projects?keyword=React');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('should search with skill filters', async () => {
      mockSearchProjects.mockResolvedValue({
        success: true,
        data: { items: [], metadata: { hasMore: false } },
      });
      const res = await request(app).get('/api/search/projects?skills=skill-1,skill-2');
      expect(res.status).toBe(200);
      expect(mockSearchProjects).toHaveBeenCalled();
    });

    it('should return 400 on invalid minBudget', async () => {
      const res = await request(app).get('/api/search/projects?minBudget=abc');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 on invalid pageSize', async () => {
      const res = await request(app).get('/api/search/projects?pageSize=0');
      expect(res.status).toBe(400);
    });

    it('should return 400 on service failure', async () => {
      mockSearchProjects.mockResolvedValue({
        success: false,
        error: { code: 'SEARCH_ERROR', message: 'Search failed' },
      });
      const res = await request(app).get('/api/search/projects');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /freelancers', () => {
    it('should return freelancer search results on success', async () => {
      mockSearchFreelancers.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'f-1', bio: 'React developer' }], metadata: { hasMore: false } },
      });
      const res = await request(app).get('/api/search/freelancers?keyword=React');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('should search with skill filters', async () => {
      mockSearchFreelancers.mockResolvedValue({
        success: true,
        data: { items: [], metadata: { hasMore: false } },
      });
      const res = await request(app).get('/api/search/freelancers?skills=skill-1');
      expect(res.status).toBe(200);
      expect(mockSearchFreelancers).toHaveBeenCalled();
    });

    it('should return 400 on invalid pageSize', async () => {
      const res = await request(app).get('/api/search/freelancers?pageSize=-1');
      expect(res.status).toBe(400);
    });

    it('should return 400 on service failure', async () => {
      mockSearchFreelancers.mockResolvedValue({
        success: false,
        error: { code: 'SEARCH_ERROR', message: 'Search failed' },
      });
      const res = await request(app).get('/api/search/freelancers');
      expect(res.status).toBe(400);
    });
  });
});
