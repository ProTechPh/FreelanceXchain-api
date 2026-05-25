// @ts-nocheck
/**
 * Coverage completion tests - targets remaining uncovered lines across multiple modules
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

// ============================================================
// Freelancer Routes - uncovered lines 573, 685, 688, 828
// ============================================================

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

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const freelancerRouter = (await import('../../routes/freelancer-routes.js')).default;

describe('Freelancer Routes - Coverage Completion', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/freelancers', freelancerRouter);
  });

  describe('POST /profile/experience - missing startDate (line 573)', () => {
    it('should return 400 when startDate is missing', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({
          title: 'Developer',
          company: 'Corp Inc',
          description: 'Built web applications for clients over many years',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'startDate' }),
        ])
      );
    });

    it('should return 400 when startDate is not a string', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({
          title: 'Developer',
          company: 'Corp Inc',
          description: 'Built web applications for clients over many years',
          startDate: 12345,
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'startDate' }),
        ])
      );
    });
  });

  describe('PATCH /profile/experience/:id - company/description validation (lines 685, 688)', () => {
    it('should return 400 when company is too short', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ company: 'A' });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'company' }),
        ])
      );
    });

    it('should return 400 when description is too short', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ description: 'Short' });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'description' }),
        ])
      );
    });

    it('should return 400 when company is not a string', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ company: 123 });
      expect(res.status).toBe(400);
    });

    it('should return 400 when description is not a string', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ description: 123 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:id - safe date mapping (line 828)', () => {
    it('should handle profile with missing createdAt', async () => {
      mockGetProfileByUserId.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', userId: 'user-2', bio: 'Dev', createdAt: null, experience: [] },
      });
      const res = await request(app).get('/api/freelancers/some-uuid');
      expect(res.status).toBe(200);
      expect(res.body.createdAt).toBeDefined();
    });

    it('should handle experience with missing startDate', async () => {
      mockGetProfileByUserId.mockResolvedValue({
        success: true,
        data: {
          id: 'fp-1',
          userId: 'user-2',
          bio: 'Dev',
          createdAt: '2025-01-01T00:00:00Z',
          experience: [
            { id: 'exp-1', title: 'Dev', company: 'Corp', startDate: null, endDate: null },
          ],
        },
      });
      const res = await request(app).get('/api/freelancers/some-uuid');
      expect(res.status).toBe(200);
      expect(res.body.experience[0].startDate).toBeDefined();
      expect(res.body.experience[0].endDate).toBeNull();
    });

    it('should handle profile with undefined experience array', async () => {
      mockGetProfileByUserId.mockResolvedValue({
        success: true,
        data: { id: 'fp-1', userId: 'user-2', bio: 'Dev', createdAt: '2025-01-01T00:00:00Z', experience: undefined },
      });
      const res = await request(app).get('/api/freelancers/some-uuid');
      expect(res.status).toBe(200);
      expect(res.body.experience).toEqual([]);
    });
  });
});
