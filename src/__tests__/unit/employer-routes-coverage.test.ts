// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetEmployerProfileByUserId = jest.fn<any>();
const mockUpdateEmployerProfile = jest.fn<any>();
const mockListProjectsByEmployer = jest.fn<any>();
const mockAuthMiddleware = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
  getEmployerProfileByUserId: mockGetEmployerProfileByUserId,
  updateEmployerProfile: mockUpdateEmployerProfile,
}));

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  listProjectsByEmployer: mockListProjectsByEmployer,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
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

const router = (await import('../../routes/employer-routes.js')).default;

describe('Employer Routes - Auth Guard & Validation Coverage', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/employers', router);
    // Default: no user set (triggers !userId branches)
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = undefined;
      next();
    });
  });

  describe('GET /projects - !userId branch', () => {
    it('should return 401 when user is not authenticated', async () => {
      const res = await request(app).get('/api/employers/projects');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
      expect(res.body.error.message).toBe('User not authenticated');
      expect(res.body.requestId).toBe('test-request-id');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /profile - !userId branch', () => {
    it('should return 401 when user is not authenticated', async () => {
      const res = await request(app).get('/api/employers/profile');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
      expect(res.body.error.message).toBe('User not authenticated');
    });
  });

  describe('PATCH /profile - !userId branch', () => {
    it('should return 401 when user is not authenticated', async () => {
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ companyName: 'Valid Name' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
      expect(res.body.error.message).toBe('User not authenticated');
    });
  });

  describe('PATCH /profile - validation errors', () => {
    beforeEach(() => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', role: 'employer' };
        next();
      });
    });

    it('should return 400 when description is too short', async () => {
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ description: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'description', message: 'Description must be at least 10 characters' }),
        ])
      );
    });

    it('should return 400 when industry is too short', async () => {
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ industry: 'A' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'industry', message: 'Industry must be at least 2 characters' }),
        ])
      );
    });

    it('should return 400 with multiple validation errors', async () => {
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ companyName: 'A', description: 'short', industry: 'B' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toHaveLength(3);
    });
  });
});
