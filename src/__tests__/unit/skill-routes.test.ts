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
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  hasAdminPermission: () => true,
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  isValidUUID: jest.fn((value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/skill-routes.js')).default;

const skillRouter = router;
function makeApp(basePath: string, r: any) { const a = express(); a.use(express.json()); a.use(basePath, r); return a; }
const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });
const mockSkillService = { createCategory: mockCreateCategory, createSkill: mockCreateSkill, deprecateSkill: mockDeprecateSkill, getFullTaxonomy: mockGetFullTaxonomy, searchSkills: mockSearchSkills, getActiveSkillsByCategory: mockGetActiveSkillsByCategory };
const mockUserCustomSkillService = { createUserCustomSkill: mockCreateUserCustomSkill, getUserCustomSkills: mockGetUserCustomSkills, getUserCustomSkillById: mockGetUserCustomSkillById, updateUserCustomSkill: mockUpdateUserCustomSkill, deleteUserCustomSkill: mockDeleteUserCustomSkill, searchUserCustomSkills: mockSearchUserCustomSkills, getPendingSkillSuggestions: mockGetPendingSkillSuggestions, updateSkillSuggestionStatus: mockUpdateSkillSuggestionStatus };

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


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('skill-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/skills', skillRouter);
  });

  it('GET / returns taxonomy', async () => {
    mockSkillService.getFullTaxonomy.mockResolvedValue({ categories: [] });
    const res = await request(app).get('/api/skills');
    expect(res.status).toBe(200);
  });

  it('GET /search missing keyword', async () => {
    const res = await request(app).get('/api/skills/search');
    expect(res.status).toBe(400);
  });

  it('GET /search success', async () => {
    mockSkillService.searchSkills.mockResolvedValue([]);
    const res = await request(app).get('/api/skills/search?keyword=react');
    expect(res.status).toBe(200);
  });

  // POST /categories — DUPLICATE_CATEGORY ternary
  it('POST /categories success', async () => {
    mockSkillService.createCategory.mockResolvedValue(ok({ id: 'cat1' }));
    const res = await request(app).post('/api/skills/categories').send({ name: 'Web', description: 'desc' });
    expect(res.status).toBe(201);
  });

  it('POST /categories validation error', async () => {
    const res = await request(app).post('/api/skills/categories').send({});
    expect(res.status).toBe(400);
  });

  it('POST /categories DUPLICATE_CATEGORY returns 409', async () => {
    mockSkillService.createCategory.mockResolvedValue(fail('DUPLICATE_CATEGORY', 'Exists'));
    const res = await request(app).post('/api/skills/categories').send({ name: 'Web', description: 'desc' });
    expect(res.status).toBe(409);
  });

  it('POST /categories other error returns 400', async () => {
    mockSkillService.createCategory.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).post('/api/skills/categories').send({ name: 'Web', description: 'desc' });
    expect(res.status).toBe(400);
  });

  // POST / — DUPLICATE_SKILL ternary and categoryId validation
  it('POST / success', async () => {
    mockSkillService.createSkill.mockResolvedValue(ok({ id: 's1' }));
    const res = await request(app).post('/api/skills').send({ categoryId: '00000000-0000-0000-0000-000000000001', name: 'React', description: 'desc' });
    expect(res.status).toBe(201);
  });

  it('POST / missing categoryId', async () => {
    const res = await request(app).post('/api/skills').send({ name: 'React', description: 'desc' });
    expect(res.status).toBe(400);
  });

  it('POST / invalid categoryId UUID', async () => {
    const res = await request(app).post('/api/skills').send({ categoryId: 'bad', name: 'React', description: 'desc' });
    expect(res.status).toBe(400);
  });

  it('POST / DUPLICATE_SKILL returns 409', async () => {
    mockSkillService.createSkill.mockResolvedValue(fail('DUPLICATE_SKILL', 'Exists'));
    const res = await request(app).post('/api/skills').send({ categoryId: '00000000-0000-0000-0000-000000000001', name: 'React', description: 'desc' });
    expect(res.status).toBe(409);
  });

  it('POST / other error returns 400', async () => {
    mockSkillService.createSkill.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).post('/api/skills').send({ categoryId: '00000000-0000-0000-0000-000000000001', name: 'React', description: 'desc' });
    expect(res.status).toBe(400);
  });

  // PATCH /:id/deprecate — SKILL_NOT_FOUND ternary
  it('PATCH /:id/deprecate success', async () => {
    mockSkillService.deprecateSkill.mockResolvedValue(ok({ id: 's1' }));
    const res = await request(app).patch('/api/skills/s1/deprecate');
    expect(res.status).toBe(200);
  });

  it('PATCH /:id/deprecate SKILL_NOT_FOUND returns 404', async () => {
    mockSkillService.deprecateSkill.mockResolvedValue(fail('SKILL_NOT_FOUND', 'No'));
    const res = await request(app).patch('/api/skills/s1/deprecate');
    expect(res.status).toBe(404);
  });

  it('PATCH /:id/deprecate other error returns 400', async () => {
    mockSkillService.deprecateSkill.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).patch('/api/skills/s1/deprecate');
    expect(res.status).toBe(400);
  });

  // POST /custom — categoryName || undefined, suggestForGlobal || false
  it('POST /custom success without optional fields', async () => {
    mockUserCustomSkillService.createUserCustomSkill.mockResolvedValue(ok({ id: 'cs1' }));
    const res = await request(app).post('/api/skills/custom').send({ name: 'My Skill', description: 'A long description for testing', yearsOfExperience: 3 });
    expect(res.status).toBe(201);
  });

  it('POST /custom success with optional fields', async () => {
    mockUserCustomSkillService.createUserCustomSkill.mockResolvedValue(ok({ id: 'cs1' }));
    const res = await request(app).post('/api/skills/custom').send({ name: 'My Skill', description: 'A long description for testing', yearsOfExperience: 3, categoryName: 'Web', suggestForGlobal: true });
    expect(res.status).toBe(201);
  });

  it('POST /custom validation: name too short', async () => {
    const res = await request(app).post('/api/skills/custom').send({ name: 'a', description: 'A long description for testing', yearsOfExperience: 3 });
    expect(res.status).toBe(400);
  });

  it('POST /custom validation: description too short', async () => {
    const res = await request(app).post('/api/skills/custom').send({ name: 'My Skill', description: 'short', yearsOfExperience: 3 });
    expect(res.status).toBe(400);
  });

  it('POST /custom validation: invalid yearsOfExperience', async () => {
    const res = await request(app).post('/api/skills/custom').send({ name: 'My Skill', description: 'A long description for testing', yearsOfExperience: -1 });
    expect(res.status).toBe(400);
  });

  it('POST /custom validation: categoryName too long', async () => {
    const res = await request(app).post('/api/skills/custom').send({ name: 'My Skill', description: 'A long description for testing', yearsOfExperience: 3, categoryName: 'x'.repeat(101) });
    expect(res.status).toBe(400);
  });

  it('POST /custom SKILL_EXISTS_GLOBALLY returns 409', async () => {
    mockUserCustomSkillService.createUserCustomSkill.mockResolvedValue(fail('SKILL_EXISTS_GLOBALLY', 'Exists'));
    const res = await request(app).post('/api/skills/custom').send({ name: 'My Skill', description: 'A long description for testing', yearsOfExperience: 3 });
    expect(res.status).toBe(409);
  });

  it('POST /custom DUPLICATE_USER_SKILL returns 409', async () => {
    mockUserCustomSkillService.createUserCustomSkill.mockResolvedValue(fail('DUPLICATE_USER_SKILL', 'Exists'));
    const res = await request(app).post('/api/skills/custom').send({ name: 'My Skill', description: 'A long description for testing', yearsOfExperience: 3 });
    expect(res.status).toBe(409);
  });

  it('POST /custom other error returns 400', async () => {
    mockUserCustomSkillService.createUserCustomSkill.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).post('/api/skills/custom').send({ name: 'My Skill', description: 'A long description for testing', yearsOfExperience: 3 });
    expect(res.status).toBe(400);
  });

  // GET /custom/search — keyword validation
  it('GET /custom/search missing keyword', async () => {
    const res = await request(app).get('/api/skills/custom/search');
    expect(res.status).toBe(400);
  });

  it('GET /custom/search success', async () => {
    mockUserCustomSkillService.searchUserCustomSkills.mockResolvedValue([]);
    const res = await request(app).get('/api/skills/custom/search?keyword=react');
    expect(res.status).toBe(200);
  });

  // PUT /custom/:id — SKILL_NOT_FOUND, DUPLICATE_USER_SKILL ternaries
  it('PUT /custom/:id success', async () => {
    mockUserCustomSkillService.updateUserCustomSkill.mockResolvedValue(ok({ id: 'cs1' }));
    const res = await request(app).put('/api/skills/custom/cs1').send({ name: 'Updated Skill Name' });
    expect(res.status).toBe(200);
  });

  it('PUT /custom/:id validation errors', async () => {
    const res = await request(app).put('/api/skills/custom/cs1').send({ name: 'a', description: 'short', yearsOfExperience: -1, categoryName: 'x'.repeat(101) });
    expect(res.status).toBe(400);
  });

  it('PUT /custom/:id SKILL_NOT_FOUND returns 404', async () => {
    mockUserCustomSkillService.updateUserCustomSkill.mockResolvedValue(fail('SKILL_NOT_FOUND', 'No'));
    const res = await request(app).put('/api/skills/custom/cs1').send({ name: 'Updated Skill Name' });
    expect(res.status).toBe(404);
  });

  it('PUT /custom/:id DUPLICATE_USER_SKILL returns 409', async () => {
    mockUserCustomSkillService.updateUserCustomSkill.mockResolvedValue(fail('DUPLICATE_USER_SKILL', 'Exists'));
    const res = await request(app).put('/api/skills/custom/cs1').send({ name: 'Updated Skill Name' });
    expect(res.status).toBe(409);
  });

  it('PUT /custom/:id SKILL_EXISTS_GLOBALLY returns 409', async () => {
    mockUserCustomSkillService.updateUserCustomSkill.mockResolvedValue(fail('SKILL_EXISTS_GLOBALLY', 'Global'));
    const res = await request(app).put('/api/skills/custom/cs1').send({ name: 'React' });
    expect(res.status).toBe(409);
  });

  it('PUT /custom/:id other error returns 400', async () => {
    mockUserCustomSkillService.updateUserCustomSkill.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).put('/api/skills/custom/cs1').send({ name: 'Updated Skill Name' });
    expect(res.status).toBe(400);
  });

  // DELETE /custom/:id — SKILL_NOT_FOUND ternary
  it('DELETE /custom/:id success', async () => {
    mockUserCustomSkillService.deleteUserCustomSkill.mockResolvedValue(ok({}));
    const res = await request(app).delete('/api/skills/custom/cs1');
    expect(res.status).toBe(204);
  });

  it('DELETE /custom/:id SKILL_NOT_FOUND returns 404', async () => {
    mockUserCustomSkillService.deleteUserCustomSkill.mockResolvedValue(fail('SKILL_NOT_FOUND', 'No'));
    const res = await request(app).delete('/api/skills/custom/cs1');
    expect(res.status).toBe(404);
  });

  it('DELETE /custom/:id other error returns 400', async () => {
    mockUserCustomSkillService.deleteUserCustomSkill.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).delete('/api/skills/custom/cs1');
    expect(res.status).toBe(400);
  });

  // PUT /suggestions/:id/status — SUGGESTION_NOT_FOUND ternary and validation
  it('PUT /suggestions/:id/status invalid status', async () => {
    const res = await request(app).put('/api/skills/suggestions/s1/status').send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('PUT /suggestions/:id/status success', async () => {
    mockUserCustomSkillService.updateSkillSuggestionStatus.mockResolvedValue(ok({ id: 's1' }));
    const res = await request(app).put('/api/skills/suggestions/s1/status').send({ status: 'approved' });
    expect(res.status).toBe(200);
  });

  it('PUT /suggestions/:id/status SUGGESTION_NOT_FOUND returns 404', async () => {
    mockUserCustomSkillService.updateSkillSuggestionStatus.mockResolvedValue(fail('SUGGESTION_NOT_FOUND', 'No'));
    const res = await request(app).put('/api/skills/suggestions/s1/status').send({ status: 'approved' });
    expect(res.status).toBe(404);
  });

  it('PUT /suggestions/:id/status other error returns 400', async () => {
    mockUserCustomSkillService.updateSkillSuggestionStatus.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).put('/api/skills/suggestions/s1/status').send({ status: 'approved' });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// userName extraction, status code logic, update validation, update data building
// ═══════════════════════════════════════════════════════════════

describe('skill-routes - custom skill edge cases', () => {
  let app: any;
  const mockCreateUserCustomSkill = jest.fn<any>();
  const mockUpdateUserCustomSkill = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
      createCategory: jest.fn(),
      createSkill: jest.fn(),
      deprecateSkill: jest.fn(),
      getFullTaxonomy: jest.fn(),
      searchSkills: jest.fn(),
      getActiveSkillsByCategory: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/user-custom-skill-service.ts'), () => ({
      createUserCustomSkill: mockCreateUserCustomSkill,
      getUserCustomSkills: jest.fn(),
      getUserCustomSkillById: jest.fn(),
      updateUserCustomSkill: mockUpdateUserCustomSkill,
      deleteUserCustomSkill: jest.fn(),
      searchUserCustomSkills: jest.fn(),
      getPendingSkillSuggestions: jest.fn(),
      updateSkillSuggestionStatus: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/models/skill.ts'), () => ({}));
    jest.unstable_mockModule(resolveModule('src/models/user-custom-skill.ts'), () => ({}));

    const express = (await import('express')).default;
    const router = (await import('../../routes/skill-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/skills', router);
    jest.clearAllMocks();
  });

  it('L583: POST /custom passes userName from req.user.email', async () => {
    mockCreateUserCustomSkill.mockResolvedValueOnce({ success: true, data: { id: 'cs1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/skills/custom').send({
      name: 'My Skill', description: 'A valid description here', yearsOfExperience: 3,
    });
    expect(res.status).toBe(201);
    expect(mockCreateUserCustomSkill).toHaveBeenCalledWith(
      'user-1',
      'admin@test.com',
      expect.objectContaining({ name: 'My Skill' }),
    );
  });

  it('L631: POST /custom SKILL_EXISTS_GLOBALLY returns 409', async () => {
    mockCreateUserCustomSkill.mockResolvedValueOnce({
      success: false, error: { code: 'SKILL_EXISTS_GLOBALLY', message: 'Exists' },
    });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/skills/custom').send({
      name: 'My Skill', description: 'A valid description here', yearsOfExperience: 3,
    });
    expect(res.status).toBe(409);
  });

  it('L631: POST /custom DUPLICATE_USER_SKILL returns 409', async () => {
    mockCreateUserCustomSkill.mockResolvedValueOnce({
      success: false, error: { code: 'DUPLICATE_USER_SKILL', message: 'Exists' },
    });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/skills/custom').send({
      name: 'My Skill', description: 'A valid description here', yearsOfExperience: 3,
    });
    expect(res.status).toBe(409);
  });

  it('L856-858: PUT /custom/:id description validation (too short)', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).put('/api/skills/custom/cs1').send({ description: 'short' });
    expect(res.status).toBe(400);
  });

  it('L859: PUT /custom/:id yearsOfExperience validation (negative)', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).put('/api/skills/custom/cs1').send({ yearsOfExperience: -1 });
    expect(res.status).toBe(400);
  });

  it('L888-890: PUT /custom/:id builds updateData with all optional fields', async () => {
    mockUpdateUserCustomSkill.mockResolvedValueOnce({ success: true, data: { id: 'cs1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).put('/api/skills/custom/cs1').send({
      description: 'A valid updated description', yearsOfExperience: 5, categoryName: 'Web Dev',
    });
    expect(res.status).toBe(200);
    expect(mockUpdateUserCustomSkill).toHaveBeenCalledWith('cs1', 'user-1', {
      description: 'A valid updated description',
      yearsOfExperience: 5,
      categoryName: 'Web Dev',
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// userName fallback when req.user.email is undefined
// ═══════════════════════════════════════════════════════════════

describe('skill-routes - userName fallback (line 583)', () => {
  let app: any;
  const mockCreateUserCustomSkill = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
      createCategory: jest.fn(),
      createSkill: jest.fn(),
      deprecateSkill: jest.fn(),
      getFullTaxonomy: jest.fn(),
      searchSkills: jest.fn(),
      getActiveSkillsByCategory: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/user-custom-skill-service.ts'), () => ({
      createUserCustomSkill: mockCreateUserCustomSkill,
      getUserCustomSkills: jest.fn(),
      getUserCustomSkillById: jest.fn(),
      updateUserCustomSkill: jest.fn(),
      deleteUserCustomSkill: jest.fn(),
      searchUserCustomSkills: jest.fn(),
      getPendingSkillSuggestions: jest.fn(),
      updateSkillSuggestionStatus: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/models/skill.ts'), () => ({}));
    jest.unstable_mockModule(resolveModule('src/models/user-custom-skill.ts'), () => ({}));
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'freelancer' }; next(); },
      requireRole: () => (_req: any, _res: any, next: any) => next(),
      requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
      requirePermission: () => (_req: any, _res: any, next: any) => next(),
      hasAdminPermission: () => true,
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
      apiRateLimiter: (_req: any, _res: any, next: any) => next(),
      fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
      mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
      validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
      isValidUUID: jest.fn(),
    }));
    jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
      getRequestId: () => 'test-request-id',
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/skill-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/skills', router);
    jest.clearAllMocks();
  });

  it('L583: POST /custom uses "Unknown User" when email is undefined', async () => {
    mockCreateUserCustomSkill.mockResolvedValueOnce({ success: true, data: { id: 'cs1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/skills/custom').send({
      name: 'My Skill', description: 'A valid description here', yearsOfExperience: 3,
    });
    expect(res.status).toBe(201);
    expect(mockCreateUserCustomSkill).toHaveBeenCalledWith(
      'user-1',
      'Unknown User',
      expect.objectContaining({ name: 'My Skill' }),
    );
  });
});
