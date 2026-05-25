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

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'admin', email: 'admin@test.com' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  isValidUUID: jest.fn(() => true),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/skill-routes.js')).default;

describe('Skill Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/skills', router);
  });

  describe('GET / (taxonomy)', () => {
    it('should return full taxonomy', async () => {
      mockGetFullTaxonomy.mockResolvedValue({
        categories: [{ id: 'cat-1', name: 'Web Dev', skills: [] }],
      });
      const res = await request(app).get('/api/skills');
      expect(res.status).toBe(200);
      expect(res.body.categories).toHaveLength(1);
    });
  });

  describe('GET /search', () => {
    it('should return search results on success', async () => {
      mockSearchSkills.mockResolvedValue([
        { id: 'skill-1', name: 'TypeScript', categoryName: 'Web Dev' },
      ]);
      const res = await request(app).get('/api/skills/search?keyword=Type');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 400 when keyword is missing', async () => {
      const res = await request(app).get('/api/skills/search');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /categories/:categoryId/skills', () => {
    it('should return skills by category', async () => {
      mockGetActiveSkillsByCategory.mockResolvedValue([
        { id: 'skill-1', name: 'React' },
      ]);
      const res = await request(app).get('/api/skills/categories/cat-1/skills');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /categories', () => {
    it('should create category on success', async () => {
      mockCreateCategory.mockResolvedValue({
        success: true,
        data: { id: 'cat-1', name: 'Web Development', description: 'Web dev skills' },
      });
      const res = await request(app)
        .post('/api/skills/categories')
        .send({ name: 'Web Development', description: 'Web dev skills' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Web Development');
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .post('/api/skills/categories')
        .send({ name: '', description: '' });
      expect(res.status).toBe(400);
    });

    it('should return 409 on duplicate category', async () => {
      mockCreateCategory.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE_CATEGORY', message: 'Already exists' },
      });
      const res = await request(app)
        .post('/api/skills/categories')
        .send({ name: 'Web Development', description: 'Web dev skills' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST / (create skill)', () => {
    it('should create skill on success', async () => {
      mockCreateSkill.mockResolvedValue({
        success: true,
        data: { id: 'skill-1', name: 'TypeScript', categoryId: 'cat-1' },
      });
      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: '550e8400-e29b-41d4-a716-446655440000', name: 'TypeScript', description: 'Typed JS' });
      expect(res.status).toBe(201);
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: '', name: '', description: '' });
      expect(res.status).toBe(400);
    });

    it('should return 409 on duplicate skill', async () => {
      mockCreateSkill.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE_SKILL', message: 'Already exists' },
      });
      const res = await request(app)
        .post('/api/skills')
        .send({ categoryId: '550e8400-e29b-41d4-a716-446655440000', name: 'TypeScript', description: 'Typed JS' });
      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /:id/deprecate', () => {
    it('should deprecate skill on success', async () => {
      mockDeprecateSkill.mockResolvedValue({
        success: true,
        data: { id: 'skill-1', name: 'OldSkill', isActive: false },
      });
      const res = await request(app).patch('/api/skills/skill-1/deprecate');
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });

    it('should return 404 when skill not found', async () => {
      mockDeprecateSkill.mockResolvedValue({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).patch('/api/skills/skill-1/deprecate');
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('POST /custom', () => {
    it('should create custom skill on success', async () => {
      mockCreateUserCustomSkill.mockResolvedValue({
        success: true,
        data: { id: 'cs-1', name: 'Custom Skill', userId: 'user-1' },
      });
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'Custom Skill', description: 'A custom skill description here', yearsOfExperience: 3 });
      expect(res.status).toBe(201);
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'A', description: 'Short', yearsOfExperience: -1 });
      expect(res.status).toBe(400);
    });

    it('should return 409 on duplicate', async () => {
      mockCreateUserCustomSkill.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE_USER_SKILL', message: 'Already exists' },
      });
      const res = await request(app)
        .post('/api/skills/custom')
        .send({ name: 'Custom Skill', description: 'A custom skill description here', yearsOfExperience: 3 });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /custom', () => {
    it('should return user custom skills', async () => {
      mockGetUserCustomSkills.mockResolvedValue([
        { id: 'cs-1', name: 'Custom Skill' },
      ]);
      const res = await request(app).get('/api/skills/custom');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /custom/search', () => {
    it('should return search results', async () => {
      mockSearchUserCustomSkills.mockResolvedValue([
        { id: 'cs-1', name: 'Custom React' },
      ]);
      const res = await request(app).get('/api/skills/custom/search?keyword=React');
      expect(res.status).toBe(200);
    });

    it('should return 400 when keyword is missing', async () => {
      const res = await request(app).get('/api/skills/custom/search');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /custom/:id', () => {
    it('should return custom skill by ID', async () => {
      mockGetUserCustomSkillById.mockResolvedValue({
        success: true,
        data: { id: 'cs-1', name: 'Custom Skill' },
      });
      const res = await request(app).get('/api/skills/custom/cs-1');
      expect(res.status).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockGetUserCustomSkillById.mockResolvedValue({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).get('/api/skills/custom/cs-1');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /custom/:id', () => {
    it('should update custom skill on success', async () => {
      mockUpdateUserCustomSkill.mockResolvedValue({
        success: true,
        data: { id: 'cs-1', name: 'Updated Skill' },
      });
      const res = await request(app)
        .put('/api/skills/custom/cs-1')
        .send({ name: 'Updated Skill' });
      expect(res.status).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockUpdateUserCustomSkill.mockResolvedValue({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app)
        .put('/api/skills/custom/cs-1')
        .send({ name: 'Updated Skill' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /custom/:id', () => {
    it('should delete custom skill on success', async () => {
      mockDeleteUserCustomSkill.mockResolvedValue({
        success: true,
        data: null,
      });
      const res = await request(app).delete('/api/skills/custom/cs-1');
      expect(res.status).toBe(204);
    });

    it('should return 404 when not found', async () => {
      mockDeleteUserCustomSkill.mockResolvedValue({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).delete('/api/skills/custom/cs-1');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /suggestions', () => {
    it('should return pending suggestions', async () => {
      mockGetPendingSkillSuggestions.mockResolvedValue([
        { id: 'sug-1', skillName: 'New Skill', status: 'pending' },
      ]);
      const res = await request(app).get('/api/skills/suggestions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('PUT /suggestions/:id/status', () => {
    it('should update suggestion status on success', async () => {
      mockUpdateSkillSuggestionStatus.mockResolvedValue({
        success: true,
        data: { id: 'sug-1', status: 'approved' },
      });
      const res = await request(app)
        .put('/api/skills/suggestions/sug-1/status')
        .send({ status: 'approved' });
      expect(res.status).toBe(200);
    });

    it('should return 400 on invalid status', async () => {
      const res = await request(app)
        .put('/api/skills/suggestions/sug-1/status')
        .send({ status: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('should return 404 when suggestion not found', async () => {
      mockUpdateSkillSuggestionStatus.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app)
        .put('/api/skills/suggestions/sug-1/status')
        .send({ status: 'approved' });
      expect([400, 404]).toContain(res.status);

    });
  });
});
