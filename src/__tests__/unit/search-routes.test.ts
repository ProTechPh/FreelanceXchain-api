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
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
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

// ═══════════════════════════════════════════════════════════════
// maxBudget validation and continuationToken parsing
// ═══════════════════════════════════════════════════════════════

describe('search-routes - maxBudget validation and continuationToken', () => {
  let app: any;
  const mockSearchProjects = jest.fn<any>();
  const mockSearchFreelancers = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/search-service.ts'), () => ({
      searchProjects: mockSearchProjects,
      searchFreelancers: mockSearchFreelancers,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/search-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/search', router);
    jest.clearAllMocks();
  });

  it('L127-132: GET /projects returns 400 for invalid maxBudget', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/projects?maxBudget=abc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('maxBudget must be a valid number');
  });

  it('L156-158: GET /projects parses continuationToken as offset', async () => {
    mockSearchProjects.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/projects?continuationToken=20');
    expect(res.status).toBe(200);
    expect(mockSearchProjects).toHaveBeenCalledWith({}, { offset: 20 });
  });

  it('L250-252: GET /freelancers parses continuationToken as offset', async () => {
    mockSearchFreelancers.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/freelancers?continuationToken=10');
    expect(res.status).toBe(200);
    expect(mockSearchFreelancers).toHaveBeenCalledWith({}, { offset: 10 });
  });

  it('GET /projects with valid maxBudget', async () => {
    mockSearchProjects.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/projects?maxBudget=1000');
    expect(res.status).toBe(200);
    expect(mockSearchProjects).toHaveBeenCalledWith({ maxBudget: 1000 }, {});
  });

  it('L150: GET /projects with valid minBudget sets filters.minBudget', async () => {
    mockSearchProjects.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/projects?minBudget=100');
    expect(res.status).toBe(200);
    expect(mockSearchProjects).toHaveBeenCalledWith({ minBudget: 100 }, {});
  });

  it('L155: GET /projects with valid pageSize sets pagination.pageSize', async () => {
    mockSearchProjects.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/projects?pageSize=5');
    expect(res.status).toBe(200);
    expect(mockSearchProjects).toHaveBeenCalledWith({}, { pageSize: 5 });
  });

  it('L249: GET /freelancers with valid pageSize sets pagination.pageSize', async () => {
    mockSearchFreelancers.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/freelancers?pageSize=10');
    expect(res.status).toBe(200);
    expect(mockSearchFreelancers).toHaveBeenCalledWith({}, { pageSize: 10 });
  });

  it('L157: GET /projects continuationToken=0 uses || 0 fallback', async () => {
    mockSearchProjects.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/projects?continuationToken=0');
    expect(res.status).toBe(200);
    expect(mockSearchProjects).toHaveBeenCalledWith({}, { offset: 0 });
  });

  it('L157: GET /projects continuationToken=abc uses || 0 fallback for NaN', async () => {
    mockSearchProjects.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/projects?continuationToken=abc');
    expect(res.status).toBe(200);
    expect(mockSearchProjects).toHaveBeenCalledWith({}, { offset: 0 });
  });

  it('L251: GET /freelancers continuationToken=0 uses || 0 fallback', async () => {
    mockSearchFreelancers.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/freelancers?continuationToken=0');
    expect(res.status).toBe(200);
    expect(mockSearchFreelancers).toHaveBeenCalledWith({}, { offset: 0 });
  });

  it('L251: GET /freelancers continuationToken=abc uses || 0 fallback for NaN', async () => {
    mockSearchFreelancers.mockResolvedValueOnce({ success: true, data: { items: [], metadata: {} } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/search/freelancers?continuationToken=abc');
    expect(res.status).toBe(200);
    expect(mockSearchFreelancers).toHaveBeenCalledWith({}, { offset: 0 });
  });
});
