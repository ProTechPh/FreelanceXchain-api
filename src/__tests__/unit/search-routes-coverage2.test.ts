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

describe('Search Routes - Coverage2', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/search', router);
  });

  // Lines 157-158: maxBudget NaN validation (already partially covered, ensure it's hit)
  describe('GET /projects - maxBudget NaN', () => {
    it('should return 400 when maxBudget is not a number', async () => {
      const res = await request(app).get('/api/search/projects?maxBudget=notanumber');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('maxBudget');
    });
  });

  // Lines 251-252: freelancer search service failure
  describe('GET /freelancers - service failure', () => {
    it('should return 400 when searchFreelancers fails', async () => {
      mockSearchFreelancers.mockResolvedValue({
        success: false,
        error: { code: 'SEARCH_ERROR', message: 'Freelancer search failed' },
      });

      const res = await request(app).get('/api/search/freelancers?keyword=react');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SEARCH_ERROR');
    });

    it('should return 400 when pageSize is invalid for freelancer search', async () => {
      const res = await request(app).get('/api/search/freelancers?pageSize=abc');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
