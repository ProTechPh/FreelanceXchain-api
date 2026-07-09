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
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/freelancer-routes.js')).default;

const freelancerRouter = router;
function makeApp(basePath: string, r: any) { const a = express(); a.use(express.json()); a.use(basePath, r); return a; }
const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });
const mockFreelancerProfileService = { createProfile: mockCreateProfile, getProfileByUserId: mockGetProfileByUserId, updateProfile: mockUpdateProfile, addSkillsToProfile: mockAddSkillsToProfile, removeSkillFromProfile: mockRemoveSkillFromProfile, addExperience: mockAddExperience, updateExperience: mockUpdateExperience, removeExperience: mockRemoveExperience };

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


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('freelancer-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/freelancers', freelancerRouter);
  });

  // POST /profile — availability validation branch
  it('POST /profile with invalid availability', async () => {
    const res = await request(app).post('/api/freelancers/profile').send({ bio: 'A valid bio that is long enough', hourlyRate: 50, availability: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('POST /profile with valid availability', async () => {
    mockFreelancerProfileService.createProfile.mockResolvedValue(ok({ id: 'fp1' }));
    const res = await request(app).post('/api/freelancers/profile').send({ bio: 'A valid bio that is long enough', hourlyRate: 50, availability: 'available' });
    expect(res.status).toBe(201);
  });

  it('POST /profile PROFILE_EXISTS returns 409', async () => {
    mockFreelancerProfileService.createProfile.mockResolvedValue(fail('PROFILE_EXISTS', 'Exists'));
    const res = await request(app).post('/api/freelancers/profile').send({ bio: 'A valid bio that is long enough', hourlyRate: 50 });
    expect(res.status).toBe(409);
  });

  it('POST /profile other error returns 400', async () => {
    mockFreelancerProfileService.createProfile.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).post('/api/freelancers/profile').send({ bio: 'A valid bio that is long enough', hourlyRate: 50 });
    expect(res.status).toBe(400);
  });

  // PATCH /profile — availability validation branch
  it('PATCH /profile with invalid availability', async () => {
    const res = await request(app).patch('/api/freelancers/profile').send({ availability: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('PATCH /profile PROFILE_NOT_FOUND returns 404', async () => {
    mockFreelancerProfileService.updateProfile.mockResolvedValue(fail('PROFILE_NOT_FOUND', 'No'));
    const res = await request(app).patch('/api/freelancers/profile').send({ bio: 'Updated bio that is long enough' });
    expect(res.status).toBe(404);
  });

  it('PATCH /profile other error returns 400', async () => {
    mockFreelancerProfileService.updateProfile.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).patch('/api/freelancers/profile').send({ bio: 'Updated bio that is long enough' });
    expect(res.status).toBe(400);
  });

  // POST /profile/skills
  it('POST /profile/skills validation error', async () => {
    const res = await request(app).post('/api/freelancers/profile/skills').send({ skills: [{ name: '', yearsOfExperience: -1 }] });
    expect(res.status).toBe(400);
  });

  it('POST /profile/skills not array', async () => {
    const res = await request(app).post('/api/freelancers/profile/skills').send({ skills: 'not-array' });
    expect(res.status).toBe(400);
  });

  it('POST /profile/skills empty array', async () => {
    const res = await request(app).post('/api/freelancers/profile/skills').send({ skills: [] });
    expect(res.status).toBe(400);
  });

  it('POST /profile/skills PROFILE_NOT_FOUND returns 404', async () => {
    mockFreelancerProfileService.addSkillsToProfile.mockResolvedValue(fail('PROFILE_NOT_FOUND', 'No'));
    const res = await request(app).post('/api/freelancers/profile/skills').send({ skills: [{ name: 'React', yearsOfExperience: 3 }] });
    expect(res.status).toBe(404);
  });

  it('POST /profile/skills other error returns 400', async () => {
    mockFreelancerProfileService.addSkillsToProfile.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).post('/api/freelancers/profile/skills').send({ skills: [{ name: 'React', yearsOfExperience: 3 }] });
    expect(res.status).toBe(400);
  });

  // DELETE /profile/skills/:name
  it('DELETE /profile/skills/:name empty name', async () => {
    const res = await request(app).delete('/api/freelancers/profile/skills/%20');
    expect(res.status).toBe(400);
  });

  it('DELETE /profile/skills/:name PROFILE_NOT_FOUND returns 404', async () => {
    mockFreelancerProfileService.removeSkillFromProfile.mockResolvedValue(fail('PROFILE_NOT_FOUND', 'No'));
    const res = await request(app).delete('/api/freelancers/profile/skills/React');
    expect(res.status).toBe(404);
  });

  it('DELETE /profile/skills/:name other error returns 400', async () => {
    mockFreelancerProfileService.removeSkillFromProfile.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).delete('/api/freelancers/profile/skills/React');
    expect(res.status).toBe(400);
  });

  it('DELETE /profile/skills/:name with encoded URI skill name', async () => {
    mockFreelancerProfileService.removeSkillFromProfile.mockResolvedValue(ok({ skills: [] }));
    const res = await request(app).delete('/api/freelancers/profile/skills/C%2B%2B');
    expect(res.status).toBe(200);
    expect(mockFreelancerProfileService.removeSkillFromProfile).toHaveBeenCalledWith('user-1', 'C++');
  });

  // POST /profile/experience
  it('POST /profile/experience success', async () => {
    mockFreelancerProfileService.addExperience.mockResolvedValue(ok({ id: 'exp1' }));
    const res = await request(app).post('/api/freelancers/profile/experience').send({ title: 'Dev', company: 'Co', description: 'A valid desc that is long', startDate: '2025-01-01' });
    expect(res.status).toBe(200);
  });

  it('POST /profile/experience validation error', async () => {
    const res = await request(app).post('/api/freelancers/profile/experience').send({ title: 'a', company: 'b', description: 'short', startDate: '' });
    expect(res.status).toBe(400);
  });

  it('POST /profile/experience PROFILE_NOT_FOUND returns 404', async () => {
    mockFreelancerProfileService.addExperience.mockResolvedValue(fail('PROFILE_NOT_FOUND', 'No'));
    const res = await request(app).post('/api/freelancers/profile/experience').send({ title: 'Dev', company: 'Co', description: 'A valid desc that is long', startDate: '2025-01-01' });
    expect(res.status).toBe(404);
  });

  it('POST /profile/experience other error returns 400', async () => {
    mockFreelancerProfileService.addExperience.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).post('/api/freelancers/profile/experience').send({ title: 'Dev', company: 'Co', description: 'A valid desc that is long', startDate: '2025-01-01' });
    expect(res.status).toBe(400);
  });

  // PATCH /profile/experience/:id
  it('PATCH /profile/experience/:id no fields', async () => {
    const res = await request(app).patch('/api/freelancers/profile/experience/exp1').send({});
    expect(res.status).toBe(400);
  });

  it('PATCH /profile/experience/:id validation error', async () => {
    const res = await request(app).patch('/api/freelancers/profile/experience/exp1').send({ title: 'a', company: 'b', description: 'short' });
    expect(res.status).toBe(400);
  });

  it('PATCH /profile/experience/:id title-only validation error', async () => {
    const res = await request(app).patch('/api/freelancers/profile/experience/exp1').send({ title: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'title' })])
    );
  });

  it('PATCH /profile/experience/:id company-only validation error', async () => {
    const res = await request(app).patch('/api/freelancers/profile/experience/exp1').send({ company: 'b' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'company' })])
    );
  });

  it('PATCH /profile/experience/:id description-only validation error', async () => {
    const res = await request(app).patch('/api/freelancers/profile/experience/exp1').send({ description: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'description' })])
    );
  });

  it('PATCH /profile/experience/:id PROFILE_NOT_FOUND returns 404', async () => {
    mockFreelancerProfileService.updateExperience.mockResolvedValue(fail('PROFILE_NOT_FOUND', 'No'));
    const res = await request(app).patch('/api/freelancers/profile/experience/exp1').send({ title: 'Dev' });
    expect(res.status).toBe(404);
  });

  it('PATCH /profile/experience/:id EXPERIENCE_NOT_FOUND returns 404', async () => {
    mockFreelancerProfileService.updateExperience.mockResolvedValue(fail('EXPERIENCE_NOT_FOUND', 'No'));
    const res = await request(app).patch('/api/freelancers/profile/experience/exp1').send({ title: 'Dev' });
    expect(res.status).toBe(404);
  });

  it('PATCH /profile/experience/:id other error returns 400', async () => {
    mockFreelancerProfileService.updateExperience.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).patch('/api/freelancers/profile/experience/exp1').send({ title: 'Dev' });
    expect(res.status).toBe(400);
  });

  // DELETE /profile/experience/:id
  it('DELETE /profile/experience/:id success', async () => {
    mockFreelancerProfileService.removeExperience.mockResolvedValue(ok({}));
    const res = await request(app).delete('/api/freelancers/profile/experience/exp1');
    expect(res.status).toBe(200);
  });

  it('DELETE /profile/experience/:id PROFILE_NOT_FOUND returns 404', async () => {
    mockFreelancerProfileService.removeExperience.mockResolvedValue(fail('PROFILE_NOT_FOUND', 'No'));
    const res = await request(app).delete('/api/freelancers/profile/experience/exp1');
    expect(res.status).toBe(404);
  });

  it('DELETE /profile/experience/:id other error returns 400', async () => {
    mockFreelancerProfileService.removeExperience.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).delete('/api/freelancers/profile/experience/exp1');
    expect(res.status).toBe(400);
  });

  // GET /:id — safe date mapping
  it('GET /:id returns profile with safe dates', async () => {
    mockFreelancerProfileService.getProfileByUserId.mockResolvedValue(ok({ id: 'fp1', createdAt: '2025-01-01', experience: [{ startDate: '2025-01-01', endDate: null }] }));
    const res = await request(app).get('/api/freelancers/u1');
    expect(res.status).toBe(200);
  });

  it('GET /:id returns profile with undefined dates', async () => {
    mockFreelancerProfileService.getProfileByUserId.mockResolvedValue(ok({ id: 'fp1', createdAt: undefined, experience: [{ startDate: undefined, endDate: undefined }] }));
    const res = await request(app).get('/api/freelancers/u1');
    expect(res.status).toBe(200);
    expect(res.body.experience[0].endDate).toBeNull();
  });

  it('GET /:id not found', async () => {
    mockFreelancerProfileService.getProfileByUserId.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).get('/api/freelancers/u1');
    expect(res.status).toBe(404);
  });

  it('GET /:id profile with null experience', async () => {
    mockFreelancerProfileService.getProfileByUserId.mockResolvedValue(ok({ id: 'fp1', createdAt: '2025-01-01', experience: null }));
    const res = await request(app).get('/api/freelancers/u1');
    expect(res.status).toBe(200);
  });

  it('GET /:id profile with missing createdAt defaults to now', async () => {
    mockFreelancerProfileService.getProfileByUserId.mockResolvedValue(ok({ id: 'fp1', experience: [{ startDate: '2025-01-01', endDate: '2025-06-01' }] }));
    const res = await request(app).get('/api/freelancers/u1');
    expect(res.status).toBe(200);
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.experience[0].endDate).toBe('2025-06-01');
  });

  it('GET /:id profile with undefined profile data', async () => {
    mockFreelancerProfileService.getProfileByUserId.mockResolvedValue(ok(undefined));
    const res = await request(app).get('/api/freelancers/u1');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// PATCH /profile hourlyRate validation branch
// ═══════════════════════════════════════════════════════════════

describe('freelancer-routes - PATCH /profile hourlyRate validation', () => {
  let app: any;
  const mockUpdateProfile = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/freelancer-profile-service.ts'), () => ({
      getFreelancerProfile: jest.fn(),
      createProfile: jest.fn(),
      updateProfile: mockUpdateProfile,
      addSkillsToProfile: jest.fn(),
      removeSkillFromProfile: jest.fn(),
      addExperience: jest.fn(),
      updateExperience: jest.fn(),
      removeExperience: jest.fn(),
      getProfileByUserId: jest.fn(),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/freelancer-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/freelancers', router);
    jest.clearAllMocks();
  });

  it('L282: PATCH /profile rejects hourlyRate < 1', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .patch('/api/freelancers/profile')
      .send({ hourlyRate: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'hourlyRate' })])
    );
  });

  it('L282: PATCH /profile rejects non-number hourlyRate', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .patch('/api/freelancers/profile')
      .send({ hourlyRate: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'hourlyRate' })])
    );
  });

  it('L282: PATCH /profile accepts valid hourlyRate', async () => {
    mockUpdateProfile.mockResolvedValueOnce({ success: true, data: { id: 'fp1' } });
    const request = (await import('supertest')).default;
    const res = await request(app)
      .patch('/api/freelancers/profile')
      .send({ hourlyRate: 50 });
    expect(res.status).toBe(200);
  });
});

describe('freelancer-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockRemoveSkill = jest.fn<any>();
  const mockUpdateExperience = jest.fn<any>();
  const mockRemoveExperience = jest.fn<any>();
  const mockGetProfileByUserId = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/freelancer-profile-service.ts'), () => ({
      getFreelancerProfile: jest.fn(),
      createProfile: jest.fn(),
      updateProfile: jest.fn(),
      addSkillsToProfile: jest.fn(),
      removeSkillFromProfile: mockRemoveSkill,
      addExperience: jest.fn(),
      updateExperience: mockUpdateExperience,
      removeExperience: mockRemoveExperience,
      getProfileByUserId: mockGetProfileByUserId,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/freelancer-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/freelancers', router);
    jest.clearAllMocks();
  });

  it('L458: DELETE skill', async () => {
    mockRemoveSkill.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).delete('/api/freelancers/profile/skills/TypeScript');
    expect(res.status).toBe(200);
  });

  it('L653: PATCH experience', async () => {
    mockUpdateExperience.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).patch('/api/freelancers/profile/experience/exp1').send({ title: 'Dev' });
    expect(res.status).toBe(200);
  });

  it('L747: DELETE experience', async () => {
    mockRemoveExperience.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).delete('/api/freelancers/profile/experience/exp1');
    expect(res.status).toBe(200);
  });

  it('L806: GET profile by id', async () => {
    mockGetProfileByUserId.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/freelancers/user-1');
    expect(res.status).toBe(200);
  });
});
