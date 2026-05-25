// @ts-nocheck
/**
 * Tests for defensive guards that are normally unreachable via Express routing.
 * These guards check for empty params/userId that Express always provides.
 * We test them by overriding req.params in middleware before the handler runs.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  passwordResetRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-req-id',
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test' } },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'gen-id',
}));

// Mock auth middleware to set user but allow param override
const mockAuthMiddleware = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

let clearParamName: string | null = null;

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn((...args: any[]) => (req: any, _res: any, next: any) => {
    if (clearParamName && req.params[clearParamName] !== undefined) {
      req.params[clearParamName] = '';
    }
    next();
  }),
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule(resolveModule('src/middleware/csrf-middleware.ts'), () => ({
  csrfProtection: (_req: any, _res: any, next: any) => next(),
  generateCsrfToken: jest.fn().mockReturnValue('token'),
}));

// ===== Skill service mocks =====
jest.unstable_mockModule(resolveModule('src/services/skill-service.ts'), () => ({
  createCategory: jest.fn<any>(),
  createSkill: jest.fn<any>(),
  deprecateSkill: jest.fn<any>(),
  getFullTaxonomy: jest.fn<any>(),
  searchSkills: jest.fn<any>(),
  getActiveSkillsByCategory: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/user-custom-skill-service.ts'), () => ({
  createUserCustomSkill: jest.fn<any>(),
  getUserCustomSkills: jest.fn<any>(),
  getUserCustomSkillById: jest.fn<any>(),
  updateUserCustomSkill: jest.fn<any>(),
  deleteUserCustomSkill: jest.fn<any>(),
  searchUserCustomSkills: jest.fn<any>(),
  getPendingSkillSuggestions: jest.fn<any>(),
  updateSkillSuggestionStatus: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/models/skill.ts'), () => ({}));
jest.unstable_mockModule(resolveModule('src/models/user-custom-skill.ts'), () => ({}));

// ===== Reputation service mocks =====
jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  submitRating: jest.fn<any>(),
  getReputation: jest.fn<any>(),
  getWorkHistory: jest.fn<any>(),
  canUserRate: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/services/reputation-aggregation-service.ts'), () => ({
  getAggregatedScore: jest.fn<any>(),
  getReputationBreakdown: jest.fn<any>(),
  getReputationHistory: jest.fn<any>().mockResolvedValue({ success: true, data: [] }),
  getReputationLeaderboard: jest.fn<any>().mockResolvedValue({ success: true, data: [] }),
}));

// ===== Matching service mocks =====
jest.unstable_mockModule(resolveModule('src/services/matching-service.ts'), () => ({
  getFreelancerRecommendations: jest.fn<any>(),
  getProjectRecommendations: jest.fn<any>(),
  extractSkillsFromText: jest.fn<any>(),
  analyzeSkillGaps: jest.fn<any>(),
  isMatchingError: jest.fn<any>(),
}));

// ===== File service mocks =====
jest.unstable_mockModule(resolveModule('src/services/file-service.ts'), () => ({
  getUserFiles: jest.fn<any>(),
  deleteFile: jest.fn<any>(),
  getFileQuota: jest.fn<any>(),
}));

const skillRouter = (await import('../../routes/skill-routes.js')).default;
const reputationRouter = (await import('../../routes/reputation-routes.js')).default;
const matchingRouter = (await import('../../routes/matching-routes.js')).default;
const fileRouter = (await import('../../routes/file-routes.js')).default;

describe('Defensive Guards - Skill Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    // Mount with a param-clearing middleware to hit !id guards
    app.use('/api/skills', (req, _res, next) => {
      // This runs before the router, allowing us to clear params after routing
      next();
    }, skillRouter);
  });

  // For !userId guards: set req.user = undefined
  // For !id guards: we need to clear req.params.id AFTER Express routing
  // The trick: use a middleware that clears params between auth and handler

  describe('PATCH /:id/deprecate - !id guard (lines 430-440)', () => {
    it('returns 400 when id is empty string', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'admin-1', role: 'admin' };
        // Clear the id param to hit the defensive guard
        req.params.id = '';
        next();
      });
      const res = await request(app).patch('/api/skills/some-id/deprecate');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /custom/:id - !userId guard (lines 763-769)', () => {
    it('returns 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });
      const res = await request(app).get('/api/skills/custom/skill-123');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('GET /custom/:id - !id guard (lines 763-769)', () => {
    it('returns 400 when id is empty', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', role: 'freelancer' };
        req.params.id = '';
        next();
      });
      const res = await request(app).get('/api/skills/custom/some-id');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('PUT /custom/:id - !userId guard (lines 867-873)', () => {
    it('returns 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });
      const res = await request(app).put('/api/skills/custom/skill-123').send({ name: 'test' });
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /custom/:id - !id guard', () => {
    it('returns 400 when id is empty', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', role: 'freelancer' };
        req.params.id = '';
        next();
      });
      const res = await request(app).put('/api/skills/custom/some-id').send({ name: 'test' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('DELETE /custom/:id - !userId guard (lines 936-942)', () => {
    it('returns 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });
      const res = await request(app).delete('/api/skills/custom/skill-123');
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /custom/:id - !id guard', () => {
    it('returns 400 when id is empty', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', role: 'freelancer' };
        req.params.id = '';
        next();
      });
      const res = await request(app).delete('/api/skills/custom/some-id');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('PUT /suggestions/:id/status - !id guard (lines 1026-1032)', () => {
    it('returns 400 when id is empty', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'admin-1', role: 'admin' };
        req.params.id = '';
        next();
      });
      const res = await request(app)
        .put('/api/skills/suggestions/some-id/status')
        .send({ status: 'approved' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /categories/:categoryId/skills - !categoryId guard (lines 201-208)', () => {
    it('returns 400 when categoryId is empty', async () => {
      clearParamName = 'categoryId';
      const res = await request(app).get('/api/skills/categories/cat-123/skills');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      clearParamName = null;
    });
  });
});

describe('Defensive Guards - Reputation Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    clearParamName = null;
    app = express();
    app.use(express.json());
    app.use('/api/reputation', reputationRouter);
  });

  describe('GET /:userId - !userId guard (lines 355-361)', () => {
    it('returns 400 when userId is empty', async () => {
      clearParamName = 'userId';
      const res = await request(app).get('/api/reputation/user-123');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      clearParamName = null;
    });
  });

  describe('GET /:userId/history - !userId guard (lines 413-419)', () => {
    it('returns 400 when userId is empty', async () => {
      clearParamName = 'userId';
      const res = await request(app).get('/api/reputation/user-123/history');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      clearParamName = null;
    });
  });
});

describe('Defensive Guards - Matching Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    clearParamName = null;
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'employer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/matching', matchingRouter);
  });

  describe('GET /freelancers/:projectId - !projectId guard (lines 234-240)', () => {
    it('returns 400 when projectId is empty', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', role: 'employer' };
        req.params.projectId = '';
        next();
      });
      const res = await request(app).get('/api/matching/freelancers/proj-123');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

describe('Defensive Guards - File Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/files', fileRouter);
  });

  describe('DELETE /:bucket/:path - !bucket||!path guard (lines 58-64)', () => {
    it('returns 400 when bucket is empty', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', role: 'freelancer' };
        req.params.bucket = '';
        req.params.path = 'test.pdf';
        next();
      });
      const res = await request(app).delete('/api/files/docs/test.pdf');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when path is empty', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', role: 'freelancer' };
        req.params.bucket = 'docs';
        req.params.path = '';
        next();
      });
      const res = await request(app).delete('/api/files/docs/test.pdf');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
