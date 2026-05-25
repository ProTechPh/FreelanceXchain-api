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

const router = (await import('../../routes/freelancer-routes.js')).default;

describe('Freelancer Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/freelancers', router);
  });

  describe('POST /profile', () => {
    it('should create freelancer profile on success', async () => {
      mockCreateProfile.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', userId: 'user-1', bio: 'Experienced dev', hourlyRate: 50 },
      });
      const res = await request(app)
        .post('/api/freelancers/profile')
        .send({ bio: 'Experienced developer with 5 years', hourlyRate: 50 });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('fp-1');
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile')
        .send({ bio: 'Short', hourlyRate: 0 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 when profile already exists', async () => {
      mockCreateProfile.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_EXISTS', message: 'Profile already exists' },
      });
      const res = await request(app)
        .post('/api/freelancers/profile')
        .send({ bio: 'Experienced developer with 5 years', hourlyRate: 50 });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /profile', () => {
    it('should return freelancer profile on success', async () => {
      mockGetProfileByUserId.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', userId: 'user-1', bio: 'Dev', hourlyRate: 50 },
      });
      const res = await request(app).get('/api/freelancers/profile');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('fp-1');
    });

    it('should return 404 when profile not found', async () => {
      mockGetProfileByUserId.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).get('/api/freelancers/profile');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /profile', () => {
    it('should update freelancer profile on success', async () => {
      mockUpdateProfile.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', bio: 'Updated bio text here', hourlyRate: 75 },
      });
      const res = await request(app)
        .patch('/api/freelancers/profile')
        .send({ bio: 'Updated bio text here', hourlyRate: 75 });
      expect(res.status).toBe(200);
      expect(res.body.hourlyRate).toBe(75);
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile')
        .send({ bio: 'Short' });
      expect(res.status).toBe(400);
    });

    it('should return 404 when profile not found', async () => {
      mockUpdateProfile.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app)
        .patch('/api/freelancers/profile')
        .send({ hourlyRate: 100 });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /profile/skills', () => {
    it('should add skills on success', async () => {
      mockAddSkillsToProfile.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', skills: [{ name: 'React', yearsOfExperience: 3 }] },
      });
      const res = await request(app)
        .post('/api/freelancers/profile/skills')
        .send({ skills: [{ name: 'React', yearsOfExperience: 3 }] });
      expect(res.status).toBe(200);
    });

    it('should return 400 when skills array is empty', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/skills')
        .send({ skills: [] });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /profile/skills/:name', () => {
    it('should remove skill on success', async () => {
      mockRemoveSkillFromProfile.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', skills: [] },
      });
      const res = await request(app).delete('/api/freelancers/profile/skills/React');
      expect(res.status).toBe(200);
    });

    it('should return 404 when profile not found', async () => {
      mockRemoveSkillFromProfile.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).delete('/api/freelancers/profile/skills/React');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /profile/experience', () => {
    it('should add experience on success', async () => {
      mockAddExperience.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', experience: [{ title: 'Dev', company: 'Corp' }] },
      });
      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'Developer', company: 'Corp Inc', description: 'Built web applications for clients', startDate: '2020-01-01' });
      expect(res.status).toBe(200);
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'A', company: 'B', description: 'Short', startDate: '2020-01-01' });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /profile/experience/:id', () => {
    it('should update experience on success', async () => {
      mockUpdateExperience.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', experience: [{ id: 'exp-1', title: 'Senior Dev' }] },
      });
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ title: 'Senior Dev' });
      expect(res.status).toBe(200);
    });

    it('should return 400 when no fields provided', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /profile/experience/:id', () => {
    it('should delete experience on success', async () => {
      mockRemoveExperience.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', experience: [] },
      });
      const res = await request(app).delete('/api/freelancers/profile/experience/exp-1');
      expect(res.status).toBe(200);
    });

    it('should return 404 when profile not found', async () => {
      mockRemoveExperience.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).delete('/api/freelancers/profile/experience/exp-1');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:id', () => {
    it('should return freelancer profile by user ID', async () => {
      mockGetProfileByUserId.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', userId: 'user-2', bio: 'Dev', createdAt: '2025-01-01', experience: [] },
      });
      const res = await request(app).get('/api/freelancers/some-uuid');
      expect(res.status).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockGetProfileByUserId.mockResolvedValue({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).get('/api/freelancers/some-uuid');
      expect(res.status).toBe(404);
    });
  });
});
