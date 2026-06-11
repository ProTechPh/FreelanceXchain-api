// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetEmployerProfileByUserId = jest.fn<any>();
const mockUpdateEmployerProfile = jest.fn<any>();
const mockListProjectsByEmployer = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/employer-profile-service.ts'), () => ({
  getEmployerProfileByUserId: mockGetEmployerProfileByUserId,
  updateEmployerProfile: mockUpdateEmployerProfile,
}));

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  listProjectsByEmployer: mockListProjectsByEmployer,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'employer' }; next(); },
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

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v ?? 20,
  clampOffset: (v: any) => v ?? 0,
}));

const router = (await import('../../routes/employer-routes.js')).default;

describe('Employer Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/employers', router);
  });

  describe('GET /projects', () => {
    it('should return employer projects on success', async () => {
      mockListProjectsByEmployer.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p-1', title: 'Project 1' }], hasMore: false },
      });
      const res = await request(app).get('/api/employers/projects');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('should return 400 on service failure', async () => {
      mockListProjectsByEmployer.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed' },
      });
      const res = await request(app).get('/api/employers/projects');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /profile', () => {
    it('should return employer profile on success', async () => {
      mockGetEmployerProfileByUserId.mockResolvedValue({
        success: true,
        data: { id: 'ep-1', userId: 'user-1', companyName: 'Acme' },
      });
      const res = await request(app).get('/api/employers/profile');
      expect(res.status).toBe(200);
      expect(res.body.companyName).toBe('Acme');
    });

    it('should return 404 when profile not found', async () => {
      mockGetEmployerProfileByUserId.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).get('/api/employers/profile');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /profile', () => {
    it('should update employer profile on success', async () => {
      mockUpdateEmployerProfile.mockResolvedValue({
        success: true,
        data: { id: 'ep-1', companyName: 'New Name', description: 'Updated description here', industry: 'Tech' },
      });
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ companyName: 'New Name', description: 'Updated description here', industry: 'Tech' });
      expect(res.status).toBe(200);
      expect(res.body.companyName).toBe('New Name');
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ companyName: 'A' }); // too short
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when profile not found', async () => {
      mockUpdateEmployerProfile.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app)
        .patch('/api/employers/profile')
        .send({ companyName: 'Valid Name' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:id', () => {
    it('should return employer profile by user ID', async () => {
      mockGetEmployerProfileByUserId.mockResolvedValue({
        success: true,
        data: { id: 'ep-1', userId: 'user-2', companyName: 'Corp' },
      });
      const res = await request(app).get('/api/employers/some-uuid');
      expect(res.status).toBe(200);
      expect(res.body.companyName).toBe('Corp');
    });

    it('should return 404 when not found', async () => {
      mockGetEmployerProfileByUserId.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).get('/api/employers/some-uuid');
      expect(res.status).toBe(404);
    });
  });
});
