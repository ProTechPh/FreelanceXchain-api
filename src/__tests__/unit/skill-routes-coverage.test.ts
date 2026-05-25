// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateCategory = jest.fn<any>();
const mockCreateSkill = jest.fn<any>();
const mockDeprecateSkill = jest.fn<any>();
const mockGetFullTaxonomy = jest.fn<any>();
const mockSearchSkills = jest.fn<any>();
const mockGetActiveSkillsByCategory = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  createCategory: mockCreateCategory,
  createSkill: mockCreateSkill,
  deprecateSkill: mockDeprecateSkill,
  getFullTaxonomy: mockGetFullTaxonomy,
  searchSkills: mockSearchSkills,
  getActiveSkillsByCategory: mockGetActiveSkillsByCategory,
}));

const mockCreateUserCustomSkill = jest.fn<any>();
const mockGetUserCustomSkills = jest.fn<any>();
const mockGetUserCustomSkillById = jest.fn<any>();
const mockUpdateUserCustomSkill = jest.fn<any>();
const mockDeleteUserCustomSkill = jest.fn<any>();
const mockSearchUserCustomSkills = jest.fn<any>();
const mockGetPendingSkillSuggestions = jest.fn<any>();
const mockUpdateSkillSuggestionStatus = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/user-custom-skill-service.ts'), () => ({
  createUserCustomSkill: mockCreateUserCustomSkill,
  getUserCustomSkills: mockGetUserCustomSkills,
  getUserCustomSkillById: mockGetUserCustomSkillById,
  updateUserCustomSkill: mockUpdateUserCustomSkill,
  deleteUserCustomSkill: mockDeleteUserCustomSkill,
  searchUserCustomSkills: mockSearchUserCustomSkills,
  getPendingSkillSuggestions: mockGetPendingSkillSuggestions,
  updateSkillSuggestionStatus: mockUpdateSkillSuggestionStatus,
}));

jest.unstable_mockModule(resolveModule('src/models/skill.ts'), () => ({}));
jest.unstable_mockModule(resolveModule('src/models/user-custom-skill.ts'), () => ({}));

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

const router = (await import('../../routes/skill-routes.js')).default;

describe('Skill Routes - Coverage Gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'admin', email: 'admin@test.com' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/skills', router);
  });

  describe('POST /categories - validation errors', () => {
    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/skills/categories')
        .send({ description: 'A valid description' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when description is missing', async () => {
      const res = await request(app)
        .post('/api/skills/categories')
        .send({ name: 'Web Development' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST / (create skill) - validation errors', () => {
    it('should return 400 when categoryId is missing', async () => {
      const res = await request(app)
        .post('/api/skills')
        .send({ name: 'TypeScript', description: 'A typed language' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when categoryId is not a valid UUID', async () => {
      const { isValidUUID } = await import('../../middleware/validation-middleware.js');
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: 'invalid', name: 'TypeScript', description: 'A typed language' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: '123e4567-e89b-12d3-a456-426614174000', description: 'A typed language' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /custom - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'Custom Skill', description: 'A custom skill description', yearsOfExperience: 3 });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('POST /custom - validation errors', () => {
    it('should return 400 when name is too short', async () => {
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'A', description: 'A custom skill description that is long enough', yearsOfExperience: 3 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when description is too short', async () => {
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'Custom Skill', description: 'Short', yearsOfExperience: 3 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when yearsOfExperience is negative', async () => {
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'Custom Skill', description: 'A custom skill description that is long enough', yearsOfExperience: -1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when yearsOfExperience exceeds 50', async () => {
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'Custom Skill', description: 'A custom skill description that is long enough', yearsOfExperience: 51 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /custom - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/skills/custom');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('GET /custom/search - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/skills/custom/search?keyword=react');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when keyword is missing', async () => {
      const res = await request(app).get('/api/skills/custom/search');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /custom/:id - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/skills/custom/skill-1');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('PUT /custom/:id - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .put('/api/skills/custom/skill-1')
        .send({ name: 'Updated Skill' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('PUT /custom/:id - validation errors', () => {
    it('should return 400 when name is too short', async () => {
      const res = await request(app)
        .put('/api/skills/custom/skill-1')
        .send({ name: 'A' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when description is too short', async () => {
      const res = await request(app)
        .put('/api/skills/custom/skill-1')
        .send({ description: 'Short' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when yearsOfExperience exceeds 50', async () => {
      const res = await request(app)
        .put('/api/skills/custom/skill-1')
        .send({ yearsOfExperience: 51 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /custom/:id - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).delete('/api/skills/custom/skill-1');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('PUT /suggestions/:id/status - validation errors', () => {
    it('should return 400 when status is invalid', async () => {
      const res = await request(app)
        .put('/api/skills/suggestions/sug-1/status')
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /search - validation', () => {
    it('should return 400 when keyword is missing', async () => {
      const res = await request(app).get('/api/skills/search');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
