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
const mockIsValidUUID = jest.fn<any>();

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
  isValidUUID: mockIsValidUUID,
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/skill-routes.js')).default;

describe('Skill Routes - Coverage3', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsValidUUID.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer', email: 'user@test.com' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/skills', router);
  });

  // POST /categories - validation and service errors
  describe('POST /categories', () => {
    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/skills/categories')
        .send({ description: 'A category description' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when description is missing', async () => {
      const res = await request(app)
        .post('/api/skills/categories')
        .send({ name: 'Web Dev' });
      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate category', async () => {
      mockCreateCategory.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE_CATEGORY', message: 'Category already exists' },
      });

      const res = await request(app)
        .post('/api/skills/categories')
        .send({ name: 'Web Dev', description: 'Web development skills' });
      expect(res.status).toBe(409);
    });

    it('should return 201 on success', async () => {
      mockCreateCategory.mockResolvedValue({
        success: true,
        data: { id: 'cat-1', name: 'Web Dev', description: 'Web development skills' },
      });

      const res = await request(app)
        .post('/api/skills/categories')
        .send({ name: 'Web Dev', description: 'Web development skills' });
      expect(res.status).toBe(201);
    });
  });

  // POST / - create skill validation
  describe('POST / - create skill', () => {
    it('should return 400 when categoryId is missing', async () => {
      const res = await request(app)
        .post('/api/skills')
        .send({ name: 'TypeScript', description: 'Typed JS' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when categoryId is not a valid UUID', async () => {
      mockIsValidUUID.mockReturnValue(false);
      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: 'not-uuid', name: 'TypeScript', description: 'Typed JS' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: 'cat-1', description: 'Typed JS' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when description is missing', async () => {
      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: 'cat-1', name: 'TypeScript' });
      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate skill', async () => {
      mockCreateSkill.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE_SKILL', message: 'Skill already exists' },
      });

      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: 'cat-1', name: 'TypeScript', description: 'Typed JS' });
      expect(res.status).toBe(409);
    });

    it('should return 201 on success', async () => {
      mockCreateSkill.mockResolvedValue({
        success: true,
        data: { id: 's-1', name: 'TypeScript' },
      });

      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: 'cat-1', name: 'TypeScript', description: 'Typed JS' });
      expect(res.status).toBe(201);
    });
  });

  // PATCH /:id/deprecate
  describe('PATCH /:id/deprecate', () => {
    it('should return 404 when skill not found', async () => {
      mockDeprecateSkill.mockResolvedValue({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: 'Skill not found' },
      });

      const res = await request(app).patch('/api/skills/skill-1/deprecate');
      expect(res.status).toBe(404);
    });

    it('should return 400 for generic error', async () => {
      mockDeprecateSkill.mockResolvedValue({
        success: false,
        error: { code: 'GENERIC_ERROR', message: 'Something went wrong' },
      });

      const res = await request(app).patch('/api/skills/skill-1/deprecate');
      expect(res.status).toBe(400);
    });

    it('should return 200 on success', async () => {
      mockDeprecateSkill.mockResolvedValue({
        success: true,
        data: { id: 'skill-1', name: 'Old Skill', isActive: false },
      });

      const res = await request(app).patch('/api/skills/skill-1/deprecate');
      expect(res.status).toBe(200);
    });
  });

  // POST /custom - service errors
  describe('POST /custom - service errors', () => {
    it('should return 409 for SKILL_EXISTS_GLOBALLY', async () => {
      mockCreateUserCustomSkill.mockResolvedValue({
        success: false,
        error: { code: 'SKILL_EXISTS_GLOBALLY', message: 'Skill exists globally' },
      });

      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'React', description: 'A JS library for building UIs', yearsOfExperience: 3 });
      expect(res.status).toBe(409);
    });

    it('should return 409 for DUPLICATE_USER_SKILL', async () => {
      mockCreateUserCustomSkill.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE_USER_SKILL', message: 'User already has this skill' },
      });

      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'React', description: 'A JS library for building UIs', yearsOfExperience: 3 });
      expect(res.status).toBe(409);
    });

    it('should return 201 on success', async () => {
      mockCreateUserCustomSkill.mockResolvedValue({
        success: true,
        data: { id: 'cs-1', name: 'React' },
      });

      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'React', description: 'A JS library for building UIs', yearsOfExperience: 3 });
      expect(res.status).toBe(201);
    });
  });

  // GET /custom/:id
  describe('GET /custom/:id', () => {
    it('should return 404 when custom skill not found', async () => {
      mockGetUserCustomSkillById.mockResolvedValue({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: 'Skill not found' },
      });

      const res = await request(app).get('/api/skills/custom/cs-1');
      expect(res.status).toBe(404);
    });

    it('should return 200 on success', async () => {
      mockGetUserCustomSkillById.mockResolvedValue({
        success: true,
        data: { id: 'cs-1', name: 'React' },
      });

      const res = await request(app).get('/api/skills/custom/cs-1');
      expect(res.status).toBe(200);
    });
  });

  // PUT /custom/:id - service errors
  describe('PUT /custom/:id - service errors', () => {
    it('should return 404 for SKILL_NOT_FOUND', async () => {
      mockUpdateUserCustomSkill.mockResolvedValue({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: 'Skill not found' },
      });

      const res = await request(app)
        .put('/api/skills/custom/cs-1')
        .send({ name: 'Updated React' });
      expect(res.status).toBe(404);
    });

    it('should return 409 for DUPLICATE_USER_SKILL', async () => {
      mockUpdateUserCustomSkill.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE_USER_SKILL', message: 'Duplicate skill' },
      });

      const res = await request(app)
        .put('/api/skills/custom/cs-1')
        .send({ name: 'Updated React' });
      expect(res.status).toBe(409);
    });

    it('should return 200 on success', async () => {
      mockUpdateUserCustomSkill.mockResolvedValue({
        success: true,
        data: { id: 'cs-1', name: 'Updated React' },
      });

      const res = await request(app)
        .put('/api/skills/custom/cs-1')
        .send({ name: 'Updated React' });
      expect(res.status).toBe(200);
    });

    it('should return 400 for invalid yearsOfExperience in update', async () => {
      const res = await request(app)
        .put('/api/skills/custom/cs-1')
        .send({ yearsOfExperience: 51 });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid categoryName in update', async () => {
      const res = await request(app)
        .put('/api/skills/custom/cs-1')
        .send({ categoryName: 'x'.repeat(101) });
      expect(res.status).toBe(400);
    });
  });

  // GET /custom/search - success path
  describe('GET /custom/search - success', () => {
    it('should return search results', async () => {
      mockSearchUserCustomSkills.mockResolvedValue([{ id: 'cs-1', name: 'React' }]);

      const res = await request(app).get('/api/skills/custom/search?keyword=react');
      expect(res.status).toBe(200);
    });
  });

  // GET /suggestions
  describe('GET /suggestions', () => {
    it('should return pending suggestions', async () => {
      mockGetPendingSkillSuggestions.mockResolvedValue([{ id: 'sug-1' }]);

      const res = await request(app).get('/api/skills/suggestions');
      expect(res.status).toBe(200);
    });
  });

  // PUT /suggestions/:id/status - service errors
  describe('PUT /suggestions/:id/status - service errors', () => {
    it('should return 404 for SUGGESTION_NOT_FOUND', async () => {
      mockUpdateSkillSuggestionStatus.mockResolvedValue({
        success: false,
        error: { code: 'SUGGESTION_NOT_FOUND', message: 'Suggestion not found' },
      });

      const res = await request(app)
        .put('/api/skills/suggestions/sug-1/status')
        .send({ status: 'approved' });
      expect(res.status).toBe(404);
    });

    it('should return 200 on success', async () => {
      mockUpdateSkillSuggestionStatus.mockResolvedValue({
        success: true,
        data: { id: 'sug-1', status: 'approved' },
      });

      const res = await request(app)
        .put('/api/skills/suggestions/sug-1/status')
        .send({ status: 'approved' });
      expect(res.status).toBe(200);
    });
  });

  // GET / - taxonomy
  describe('GET / - taxonomy', () => {
    it('should return full taxonomy', async () => {
      mockGetFullTaxonomy.mockResolvedValue({ categories: [] });

      const res = await request(app).get('/api/skills');
      expect(res.status).toBe(200);
    });
  });

  // GET /search
  describe('GET /search', () => {
    it('should return 400 when keyword is missing', async () => {
      const res = await request(app).get('/api/skills/search');
      expect(res.status).toBe(400);
    });

    it('should return search results', async () => {
      mockSearchSkills.mockResolvedValue([{ id: 's-1', name: 'React' }]);

      const res = await request(app).get('/api/skills/search?keyword=react');
      expect(res.status).toBe(200);
    });
  });

  // DELETE /custom/:id - success
  describe('DELETE /custom/:id - success', () => {
    it('should return 204 on successful delete', async () => {
      mockDeleteUserCustomSkill.mockResolvedValue({ success: true });

      const res = await request(app).delete('/api/skills/custom/cs-1');
      expect(res.status).toBe(204);
    });
  });

  // GET /custom - success
  describe('GET /custom - success', () => {
    it('should return user custom skills', async () => {
      mockGetUserCustomSkills.mockResolvedValue([{ id: 'cs-1', name: 'React' }]);

      const res = await request(app).get('/api/skills/custom');
      expect(res.status).toBe(200);
    });
  });
});
