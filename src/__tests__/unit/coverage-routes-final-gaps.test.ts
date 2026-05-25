// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p) => path.resolve(process.cwd(), p);

// ===== COMMON MOCKS =====
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req, _res, next) => next(),
  authRateLimiter: (_req, _res, next) => next(),
  registerRateLimiter: (_req, _res, next) => next(),
  passwordResetRateLimiter: (_req, _res, next) => next(),
  fileUploadRateLimiter: (_req, _res, next) => next(),
}));

const mockAuthMiddleware = jest.fn();
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req, _res, next) => mockAuthMiddleware(req, _res, next),
  requireRole: () => (_req, _res, next) => next(),
  requireVerifiedKyc: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req, _res, next) => next()),
  validate: jest.fn(() => (_req, _res, next) => next()),
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
  csrfProtection: (_req, _res, next) => next(),
  generateCsrfToken: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test' } },
}));

// ===== RUSH UPGRADE SERVICE =====
const mockRequestRushUpgrade = jest.fn();
const mockRespondToRushUpgrade = jest.fn();
const mockAcceptCounterOffer = jest.fn();
const mockDeclineCounterOffer = jest.fn();
const mockGetRushUpgradeRequestsByContract = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/rush-upgrade-service.ts'), () => ({
  requestRushUpgrade: mockRequestRushUpgrade,
  respondToRushUpgrade: mockRespondToRushUpgrade,
  acceptCounterOffer: mockAcceptCounterOffer,
  declineCounterOffer: mockDeclineCounterOffer,
  getRushUpgradeRequestsByContract: mockGetRushUpgradeRequestsByContract,
}));

// ===== SKILL SERVICE =====
const mockCreateCategory = jest.fn();
const mockUpdateCategory = jest.fn();
const mockDeleteCategory = jest.fn();
const mockGetCategoryById = jest.fn();
const mockGetAllCategories = jest.fn();
const mockCreateSkill = jest.fn();
const mockUpdateSkill = jest.fn();
const mockDeleteSkill = jest.fn();
const mockGetSkillById = jest.fn();
const mockGetAllSkills = jest.fn();
const mockCreateUserCustomSkill = jest.fn();
const mockUpdateUserCustomSkill = jest.fn();
const mockDeleteUserCustomSkill = jest.fn();
const mockGetUserCustomSkills = jest.fn();
const mockUpdateSkillSuggestionStatus = jest.fn();
const mockDeprecateSkill = jest.fn();
const mockGetFullTaxonomy = jest.fn();
const mockSearchSkills = jest.fn();
const mockGetActiveSkillsByCategory = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  createCategory: mockCreateCategory,
  updateCategory: mockUpdateCategory,
  deleteCategory: mockDeleteCategory,
  getCategoryById: mockGetCategoryById,
  getAllCategories: mockGetAllCategories,
  createSkill: mockCreateSkill,
  updateSkill: mockUpdateSkill,
  deleteSkill: mockDeleteSkill,
  getSkillById: mockGetSkillById,
  getAllSkills: mockGetAllSkills,
  deprecateSkill: mockDeprecateSkill,
  getFullTaxonomy: mockGetFullTaxonomy,
  searchSkills: mockSearchSkills,
  getActiveSkillsByCategory: mockGetActiveSkillsByCategory,
}));

jest.unstable_mockModule(resolveModule('src/services/user-custom-skill-service.ts'), () => ({
  createUserCustomSkill: mockCreateUserCustomSkill,
  updateUserCustomSkill: mockUpdateUserCustomSkill,
  deleteUserCustomSkill: mockDeleteUserCustomSkill,
  getUserCustomSkills: mockGetUserCustomSkills,
  getUserCustomSkillById: jest.fn(),
  searchUserCustomSkills: jest.fn(),
  getPendingSkillSuggestions: jest.fn(),
  updateSkillSuggestionStatus: mockUpdateSkillSuggestionStatus,
}));

// ===== IMPORTS =====
const rushRouter = (await import('../../routes/rush-upgrade-routes.js')).default;
const skillRouter = (await import('../../routes/skill-routes.js')).default;

// ============================================================
// RUSH UPGRADE ROUTES - remaining gaps
// ============================================================
describe('Rush Upgrade Routes - final gaps', () => {
  let app;

  function setup() {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req, _res, next) => {
      req.user = { userId: 'user-1', role: 'employer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api', rushRouter);
  }

  describe('POST /contracts/:id/rush-upgrade', () => {
    beforeEach(setup);

    it('should return 404 on NOT_FOUND error (line 92)', async () => {
      mockRequestRushUpgrade.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).post('/api/contracts/c-1/rush-upgrade').send({ proposedPercentage: 15 });
      expect(res.status).toBe(404);
    });

    it('should return 403 on UNAUTHORIZED error (line 93)', async () => {
      mockRequestRushUpgrade.mockResolvedValue({ success: false, error: { code: 'UNAUTHORIZED', message: 'No' } });
      const res = await request(app).post('/api/contracts/c-1/rush-upgrade').send({ proposedPercentage: 15 });
      expect(res.status).toBe(403);
    });

    it('should return 201 on success (line 103)', async () => {
      mockRequestRushUpgrade.mockResolvedValue({ success: true, data: { id: 'req-1' } });
      const res = await request(app).post('/api/contracts/c-1/rush-upgrade').send({ proposedPercentage: 15 });
      expect(res.status).toBe(201);
    });
  });

  describe('POST /rush-upgrade-requests/:id/respond', () => {
    beforeEach(setup);

    it('should return 404 on NOT_FOUND error (line 199)', async () => {
      mockRespondToRushUpgrade.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).post('/api/rush-upgrade-requests/req-1/respond').send({ action: 'accept' });
      expect(res.status).toBe(404);
    });

    it('should return 403 on UNAUTHORIZED error (line 200)', async () => {
      mockRespondToRushUpgrade.mockResolvedValue({ success: false, error: { code: 'UNAUTHORIZED', message: 'No' } });
      const res = await request(app).post('/api/rush-upgrade-requests/req-1/respond').send({ action: 'accept' });
      expect(res.status).toBe(403);
    });

    it('should return 200 on decline action without contract (line 218)', async () => {
      mockRespondToRushUpgrade.mockResolvedValue({ success: true, data: { id: 'req-1', status: 'declined' } });
      const res = await request(app).post('/api/rush-upgrade-requests/req-1/respond').send({ action: 'decline' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('req-1');
    });
  });

  describe('POST /rush-upgrade-requests/:id/accept-counter', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockAuthMiddleware.mockImplementation((req, _res, next) => {
        req.user = { userId: 'user-1', role: 'employer' };
        next();
      });
      app = express();
      app.use(express.json());
      app.use('/api', rushRouter);
    });

    it('should return 403 on UNAUTHORIZED error (line 277)', async () => {
      mockAcceptCounterOffer.mockResolvedValue({ success: false, error: { code: 'UNAUTHORIZED', message: 'No' } });
      const res = await request(app).post('/api/rush-upgrade-requests/req-1/accept-counter');
      expect(res.status).toBe(403);
    });

    it('should return 200 on success (line 286)', async () => {
      mockAcceptCounterOffer.mockResolvedValue({ success: true, data: { id: 'req-1', accepted: true } });
      const res = await request(app).post('/api/rush-upgrade-requests/req-1/accept-counter');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /rush-upgrade-requests/:id/decline-counter', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockAuthMiddleware.mockImplementation((req, _res, next) => {
        req.user = { userId: 'user-1', role: 'employer' };
        next();
      });
      app = express();
      app.use(express.json());
      app.use('/api', rushRouter);
    });

    it('should return 404 on NOT_FOUND error (line 344)', async () => {
      mockDeclineCounterOffer.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      const res = await request(app).post('/api/rush-upgrade-requests/req-1/decline-counter');
      expect(res.status).toBe(404);
    });

    it('should return 200 on success (line 354)', async () => {
      mockDeclineCounterOffer.mockResolvedValue({ success: true, data: { id: 'req-1', declined: true } });
      const res = await request(app).post('/api/rush-upgrade-requests/req-1/decline-counter');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /contracts/:id/rush-upgrade-requests', () => {
    beforeEach(setup);

    it('should return 200 on success', async () => {
      mockGetRushUpgradeRequestsByContract.mockResolvedValue({ success: true, data: [] });
      const res = await request(app).get('/api/contracts/c-1/rush-upgrade-requests');
      expect(res.status).toBe(200);
    });
  });
});

// ============================================================
// SKILL ROUTES - remaining gaps
// ============================================================
describe('Skill Routes - final gaps', () => {
  let app;

  function setup() {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req, _res, next) => {
      req.user = { userId: 'user-1', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/skills', skillRouter);
  }

  function setupAdmin() {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req, _res, next) => {
      req.user = { userId: 'admin-1', role: 'admin' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/skills', skillRouter);
  }

  describe('POST /api/skills/categories (line 283)', () => {
    beforeEach(setup);

    it('should return 409 on DUPLICATE_CATEGORY', async () => {
      mockCreateCategory.mockResolvedValue({ success: false, error: { code: 'DUPLICATE_CATEGORY', message: 'Exists' } });
      const res = await request(app).post('/api/skills/categories').send({ name: 'Test', description: 'Test desc' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/skills (line 375)', () => {
    beforeEach(setup);

    it('should return 409 on DUPLICATE_SKILL', async () => {
      mockCreateSkill.mockResolvedValue({ success: false, error: { code: 'DUPLICATE_SKILL', message: 'Exists' } });
      const res = await request(app).post('/api/skills/').send({ categoryId: 'cat-1', name: 'Test', description: 'Test desc' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/skills/custom (line 631)', () => {
    beforeEach(setup);

    it('should return 409 on SKILL_EXISTS_GLOBALLY', async () => {
      mockCreateUserCustomSkill.mockResolvedValue({ success: false, error: { code: 'SKILL_EXISTS_GLOBALLY', message: 'Exists' } });
      const res = await request(app).post('/api/skills/custom').send({ name: 'Custom Skill', description: 'A custom skill description', yearsOfExperience: 5 });
      expect(res.status).toBe(409);
    });

    it('should return 409 on DUPLICATE_USER_SKILL', async () => {
      mockCreateUserCustomSkill.mockResolvedValue({ success: false, error: { code: 'DUPLICATE_USER_SKILL', message: 'Exists' } });
      const res = await request(app).post('/api/skills/custom').send({ name: 'Custom Skill', description: 'A custom skill description', yearsOfExperience: 5 });
      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/skills/custom/:id (lines 856, 888-890)', () => {
    beforeEach(setup);

    it('should return 400 for invalid description (line 856)', async () => {
      const res = await request(app).put('/api/skills/custom/skill-1').send({ description: 'short' });
      expect(res.status).toBe(400);
    });

    it('should update with all optional fields (lines 888-890)', async () => {
      mockUpdateUserCustomSkill.mockResolvedValue({ success: true, data: { id: 'skill-1' } });
      const res = await request(app).put('/api/skills/custom/skill-1').send({ name: 'Updated', description: 'Updated description with enough chars', yearsOfExperience: 5, categoryName: 'Tech' });
      expect(res.status).toBe(200);
    });

    it('should return 404 on SKILL_NOT_FOUND (line 895)', async () => {
      mockUpdateUserCustomSkill.mockResolvedValue({ success: false, error: { code: 'SKILL_NOT_FOUND', message: 'Not found' } });
      const res = await request(app).put('/api/skills/custom/skill-1').send({ name: 'Updated', description: 'Updated description with enough chars' });
      expect(res.status).toBe(404);
    });

    it('should return 409 on DUPLICATE_USER_SKILL (line 895)', async () => {
      mockUpdateUserCustomSkill.mockResolvedValue({ success: false, error: { code: 'DUPLICATE_USER_SKILL', message: 'Duplicate' } });
      const res = await request(app).put('/api/skills/custom/skill-1').send({ name: 'Updated', description: 'Updated description with enough chars' });
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/skills/custom/:id (line 961)', () => {
    beforeEach(setup);

    it('should return 404 on SKILL_NOT_FOUND', async () => {
      mockDeleteUserCustomSkill.mockResolvedValue({ success: false, error: { code: 'SKILL_NOT_FOUND', message: 'Not found' } });
      const res = await request(app).delete('/api/skills/custom/skill-1');
      expect(res.status).toBe(404);
    });
  });
});
