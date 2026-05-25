// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateProfile = jest.fn<any>();
const mockGetProfileByUserId = jest.fn<any>();
const mockUpdateProfile = jest.fn<any>();
const mockAddSkillsToProfile = jest.fn<any>();
const mockRemoveSkillFromProfile = jest.fn<any>();
const mockAddExperience = jest.fn<any>();
const mockUpdateExperience = jest.fn<any>();
const mockRemoveExperience = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/freelancer-profile-service.ts'), () => ({
  createProfile: mockCreateProfile,
  getProfileByUserId: mockGetProfileByUserId,
  updateProfile: mockUpdateProfile,
  addSkillsToProfile: mockAddSkillsToProfile,
  removeSkillFromProfile: mockRemoveSkillFromProfile,
  addExperience: mockAddExperience,
  updateExperience: mockUpdateExperience,
  removeExperience: mockRemoveExperience,
}));

const mockAuthMiddleware = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  isValidUUID: jest.fn(() => true),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/freelancer-routes.js')).default;

describe('Freelancer Routes - Coverage2', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/freelancers', router);
  });

  // Lines 411-418: POST /profile/skills - service error handling
  describe('POST /profile/skills - service error', () => {
    it('should return 404 when addSkillsToProfile returns PROFILE_NOT_FOUND', async () => {
      mockAddSkillsToProfile.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
      });

      const res = await request(app)
        .post('/api/freelancers/profile/skills')
        .send({ skills: [{ name: 'JavaScript', yearsOfExperience: 3 }] });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('should return 400 when addSkillsToProfile returns other error', async () => {
      mockAddSkillsToProfile.mockResolvedValue({
        success: false,
        error: { code: 'UPDATE_FAILED', message: 'Failed to add skills' },
      });

      const res = await request(app)
        .post('/api/freelancers/profile/skills')
        .send({ skills: [{ name: 'JavaScript', yearsOfExperience: 3 }] });
      expect(res.status).toBe(400);
    });
  });

  // Lines 567-568: POST /profile/experience - validation errors
  describe('POST /profile/experience - validation', () => {
    it('should return 400 when title is too short', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'x', company: 'Company', description: 'A long enough description here', startDate: '2020-01-01' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when company is too short', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'Developer', company: 'x', description: 'A long enough description here', startDate: '2020-01-01' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when description is too short', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'Developer', company: 'Company', description: 'short', startDate: '2020-01-01' });
      expect(res.status).toBe(400);
    });

    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'Developer', company: 'Company', description: 'A long enough description here', startDate: '2020-01-01' });
      expect(res.status).toBe(401);
    });
  });

  // Lines 582-589: POST /profile/experience - service error
  describe('POST /profile/experience - service error', () => {
    it('should return 404 when addExperience returns PROFILE_NOT_FOUND', async () => {
      mockAddExperience.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
      });

      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'Developer', company: 'Company', description: 'A long enough description here', startDate: '2020-01-01' });
      expect(res.status).toBe(404);
    });

    it('should return 400 when addExperience returns other error', async () => {
      mockAddExperience.mockResolvedValue({
        success: false,
        error: { code: 'INVALID_DATE_RANGE', message: 'Invalid date range' },
      });

      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'Developer', company: 'Company', description: 'A long enough description here', startDate: '2020-01-01' });
      expect(res.status).toBe(400);
    });
  });

  // Lines 678-682: PATCH /profile/experience/:id - !userId and validation
  describe('PATCH /profile/experience/:id - validation', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ title: 'Updated Title' });
      expect(res.status).toBe(401);
    });

    it('should return 400 when no fields provided', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid title in update', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ title: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // Lines 696-704: PATCH /profile/experience/:id - service error
  describe('PATCH /profile/experience/:id - service error', () => {
    it('should return 404 when updateExperience returns EXPERIENCE_NOT_FOUND', async () => {
      mockUpdateExperience.mockResolvedValue({
        success: false,
        error: { code: 'EXPERIENCE_NOT_FOUND', message: 'Experience not found' },
      });

      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ title: 'Updated Title' });
      expect(res.status).toBe(404);
    });

    it('should return 400 when updateExperience returns other error', async () => {
      mockUpdateExperience.mockResolvedValue({
        success: false,
        error: { code: 'INVALID_DATE_RANGE', message: 'Invalid date range' },
      });

      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ title: 'Updated Title' });
      expect(res.status).toBe(400);
    });
  });

  // Lines 821-823: GET /:id - profile not found
  describe('GET /:id - profile not found', () => {
    it('should return 404 when getProfileByUserId fails', async () => {
      mockGetProfileByUserId.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
      });

      const res = await request(app).get('/api/freelancers/user-1');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PROFILE_NOT_FOUND');
    });
  });
});
