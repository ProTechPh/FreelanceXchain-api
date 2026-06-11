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

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/search-routes.js')).default;

describe('Search Routes - Coverage Gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/search', router);
  });

  describe('GET /projects - budget validation', () => {
    it('should return 400 when minBudget is NaN', async () => {
      const res = await request(app)
        .get('/api/search/projects?minBudget=abc');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('minBudget');
    });

    it('should return 400 when maxBudget is NaN', async () => {
      const res = await request(app)
        .get('/api/search/projects?maxBudget=xyz');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('maxBudget');
    });

    it('should return 400 when pageSize is invalid', async () => {
      const res = await request(app)
        .get('/api/search/projects?pageSize=abc');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('pageSize');
    });

    it('should return 400 when pageSize is zero', async () => {
      const res = await request(app)
        .get('/api/search/projects?pageSize=0');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /projects - service failure', () => {
    it('should return 400 when searchProjects fails', async () => {
      mockSearchProjects.mockResolvedValue({
        success: false,
        error: { code: 'SEARCH_ERROR', message: 'Search failed' },
      });

      const res = await request(app)
        .get('/api/search/projects?keyword=test');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SEARCH_ERROR');
    });
  });

  describe('GET /projects - success', () => {
    it('should return 200 with search results', async () => {
      mockSearchProjects.mockResolvedValue({
        success: true,
        data: { items: [], metadata: { pageSize: 20, hasMore: false } },
      });

      const res = await request(app)
        .get('/api/search/projects?keyword=test&skills=s1,s2&minBudget=100&maxBudget=5000');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /freelancers - validation', () => {
    it('should return 400 when pageSize is invalid', async () => {
      const res = await request(app)
        .get('/api/search/freelancers?pageSize=abc');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /freelancers - service failure', () => {
    it('should return 400 when searchFreelancers fails', async () => {
      mockSearchFreelancers.mockResolvedValue({
        success: false,
        error: { code: 'SEARCH_ERROR', message: 'Search failed' },
      });

      const res = await request(app)
        .get('/api/search/freelancers?keyword=test');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SEARCH_ERROR');
    });
  });

  describe('GET /freelancers - success', () => {
    it('should return 200 with search results', async () => {
      mockSearchFreelancers.mockResolvedValue({
        success: true,
        data: { items: [], metadata: { pageSize: 20, hasMore: false } },
      });

      const res = await request(app)
        .get('/api/search/freelancers?keyword=react&skills=s1');

      expect(res.status).toBe(200);
    });
  });
});
