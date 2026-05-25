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

describe('Skill Routes - Coverage2', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer', email: 'user@test.com' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/skills', router);
  });

  // Lines 200-207: GET /categories/:categoryId/skills - !categoryId validation
  describe('GET /categories/:categoryId/skills - validation', () => {
    it('should return skills for valid categoryId', async () => {
      mockGetActiveSkillsByCategory.mockResolvedValue([{ id: 's1', name: 'JS' }]);

      const res = await request(app).get('/api/skills/categories/cat-1/skills');
      expect(res.status).toBe(200);
    });
  });

  // Lines 428-438: POST /custom - additional validation checks
  describe('POST /custom - validation', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'React', description: 'A JS library for building UIs', yearsOfExperience: 3 });
      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid name (too short)', async () => {
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'R', description: 'A JS library for building UIs', yearsOfExperience: 3 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid description (too short)', async () => {
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'React', description: 'short', yearsOfExperience: 3 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid yearsOfExperience (negative)', async () => {
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'React', description: 'A JS library for building UIs', yearsOfExperience: -1 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid categoryName (too long)', async () => {
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'React', description: 'A JS library for building UIs', yearsOfExperience: 3, categoryName: 'x'.repeat(101) });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // Lines 604-605: GET /custom/search - keyword validation
  describe('GET /custom/search - keyword validation', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app).get('/api/skills/custom/search?keyword=react');
      expect(res.status).toBe(401);
    });

    it('should return 400 when keyword is missing', async () => {
      const res = await request(app).get('/api/skills/custom/search');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // Lines 757-763: PUT /custom/:id - validation
  describe('PUT /custom/:id - validation', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app)
        .put('/api/skills/custom/skill-1')
        .send({ name: 'Updated Skill' });
      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid name in update', async () => {
      const res = await request(app)
        .put('/api/skills/custom/skill-1')
        .send({ name: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid description in update', async () => {
      const res = await request(app)
        .put('/api/skills/custom/skill-1')
        .send({ description: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // Lines 847-848, 860-866: DELETE /custom/:id - validation
  describe('DELETE /custom/:id - validation', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app).delete('/api/skills/custom/skill-1');
      expect(res.status).toBe(401);
    });

    it('should return 404 when deleteUserCustomSkill fails', async () => {
      mockDeleteUserCustomSkill.mockResolvedValue({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: 'Skill not found' },
      });

      const res = await request(app).delete('/api/skills/custom/skill-1');
      expect(res.status).toBe(404);
    });
  });

  // Lines 928-934: PUT /suggestions/:id/status - validation
  describe('PUT /suggestions/:id/status - validation', () => {
    it('should return 400 for invalid status', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'admin-1', role: 'admin' };
        next();
      });

      const res = await request(app)
        .put('/api/skills/suggestions/sug-1/status')
        .send({ status: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when status is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'admin-1', role: 'admin' };
        next();
      });

      const res = await request(app)
        .put('/api/skills/suggestions/sug-1/status')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // Lines 1018-1024: GET /custom - !userId branch
  describe('GET /custom - !userId branch', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app).get('/api/skills/custom');
      expect(res.status).toBe(401);
    });
  });
});
