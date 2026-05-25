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

describe('Freelancer Routes - Coverage Gaps', () => {
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

  describe('POST /profile - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/freelancers/profile')
        .send({ bio: 'A valid bio that is long enough', hourlyRate: 50 });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('POST /profile - validation errors', () => {
    it('should return 400 when bio is too short', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile')
        .send({ bio: 'short', hourlyRate: 50 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when hourlyRate is missing', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile')
        .send({ bio: 'A valid bio that is long enough' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when availability is invalid', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile')
        .send({ bio: 'A valid bio that is long enough', hourlyRate: 50, availability: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /profile - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/freelancers/profile');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('PATCH /profile - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .patch('/api/freelancers/profile')
        .send({ bio: 'Updated bio that is long enough' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('PATCH /profile - validation errors', () => {
    it('should return 400 when bio is too short', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile')
        .send({ bio: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when hourlyRate is invalid', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile')
        .send({ hourlyRate: -5 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when availability is invalid', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile')
        .send({ availability: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /profile/skills - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/freelancers/profile/skills')
        .send({ skills: [{ name: 'React', yearsOfExperience: 3 }] });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('POST /profile/skills - validation errors', () => {
    it('should return 400 when skills is not an array', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/skills')
        .send({ skills: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when skills array is empty', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/skills')
        .send({ skills: [] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when skill name is missing', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/skills')
        .send({ skills: [{ name: '', yearsOfExperience: 3 }] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when yearsOfExperience is negative', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/skills')
        .send({ skills: [{ name: 'React', yearsOfExperience: -1 }] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /profile/skills/:name - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).delete('/api/freelancers/profile/skills/React');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when skill name is empty', async () => {
      const res = await request(app).delete('/api/freelancers/profile/skills/%20');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /profile/experience - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'Dev', company: 'Co', description: 'Did stuff for a while', startDate: '2020-01-01' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('POST /profile/experience - validation errors', () => {
    it('should return 400 when title is too short', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'D', company: 'Company', description: 'A long enough description here', startDate: '2020-01-01' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when company is missing', async () => {
      const res = await request(app)
        .post('/api/freelancers/profile/experience')
        .send({ title: 'Developer', description: 'A long enough description here', startDate: '2020-01-01' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /profile/experience/:id - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when no fields provided', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when title is too short', async () => {
      const res = await request(app)
        .patch('/api/freelancers/profile/experience/exp-1')
        .send({ title: 'D' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /profile/experience/:id - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).delete('/api/freelancers/profile/experience/exp-1');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });
});
