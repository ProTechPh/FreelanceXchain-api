// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateProject = jest.fn<any>();
const mockGetProjectById = jest.fn<any>();
const mockUpdateProject = jest.fn<any>();
const mockSetMilestones = jest.fn<any>();
const mockListOpenProjects = jest.fn<any>();
const mockSearchProjects = jest.fn<any>();
const mockListProjectsBySkills = jest.fn<any>();
const mockListProjectsByBudgetRange = jest.fn<any>();
const mockListProjectsByEmployer = jest.fn<any>();
const mockListProjectsByCategory = jest.fn<any>();
const mockListProjectsByMultipleCategories = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  createProject: mockCreateProject,
  getProjectById: mockGetProjectById,
  updateProject: mockUpdateProject,
  setMilestones: mockSetMilestones,
  listOpenProjects: mockListOpenProjects,
  searchProjects: mockSearchProjects,
  listProjectsBySkills: mockListProjectsBySkills,
  listProjectsByBudgetRange: mockListProjectsByBudgetRange,
  listProjectsByEmployer: mockListProjectsByEmployer,
  listProjectsByCategory: mockListProjectsByCategory,
  listProjectsByMultipleCategories: mockListProjectsByMultipleCategories,
}));

const mockGetProposalsByProject = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/proposal-service.ts'), () => ({
  getProposalsByProject: mockGetProposalsByProject,
}));

const mockMapProjectFromEntity = jest.fn<any>((entity: any) => ({
  ...entity,
  milestones: entity.milestones || [],
}));
jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProjectFromEntity: mockMapProjectFromEntity,
}));

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadMultipleFiles: jest.fn<any>(),
  cleanupUploadedFiles: jest.fn<any>(),
}));

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  BUCKETS: { PROJECT_ATTACHMENTS: 'project-attachments' },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

const mockAuthMiddleware = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
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

jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  uploadProjectAttachments: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v || 20,
  clampOffset: (v: any) => v || 0,
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/project-routes.js')).default;

describe('Project Routes - Coverage Gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'employer-1', role: 'employer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/projects', router);
  });

  describe('GET / - budget validation', () => {
    it('should handle NaN minBudget by passing to budget range service', async () => {
      mockListProjectsByBudgetRange.mockResolvedValue({
        success: true,
        data: { items: [], hasMore: false },
      });

      const res = await request(app).get('/api/projects?minBudget=abc&maxBudget=100');
      // NaN values are passed through to the service - it handles them
      expect(res.status).toBe(200);
    });

    it('should handle NaN maxBudget by passing to budget range service', async () => {
      mockListProjectsByBudgetRange.mockResolvedValue({
        success: true,
        data: { items: [], hasMore: false },
      });

      const res = await request(app).get('/api/projects?minBudget=10&maxBudget=abc');
      expect(res.status).toBe(200);
    });
  });

  describe('POST / - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/projects')
        .send({
          title: 'Valid Project Title',
          description: 'A valid description that is at least 20 characters long',
          requiredSkills: [{ skillId: '123e4567-e89b-12d3-a456-426614174000' }],
          budget: 1000,
          deadline: '2025-12-31',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('POST / - validation errors', () => {
    it('should return 400 when title is too short', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({
          title: 'Hi',
          description: 'A valid description that is at least 20 characters long',
          requiredSkills: [{ skillId: '123e4567-e89b-12d3-a456-426614174000' }],
          budget: 1000,
          deadline: '2025-12-31',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when budget is zero', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({
          title: 'Valid Title Here',
          description: 'A valid description that is at least 20 characters long',
          requiredSkills: [{ skillId: '123e4567-e89b-12d3-a456-426614174000' }],
          budget: 0,
          deadline: '2025-12-31',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when tags is not an array', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({
          title: 'Valid Title Here',
          description: 'A valid description that is at least 20 characters long',
          requiredSkills: [{ skillId: '123e4567-e89b-12d3-a456-426614174000' }],
          budget: 1000,
          deadline: '2025-12-31',
          tags: 'not-an-array',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /:id - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .patch('/api/projects/project-1')
        .send({ title: 'Updated Title Here' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('POST /with-attachments - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/projects/with-attachments')
        .send({
          title: 'Valid Project Title',
          description: 'A valid description that is at least 20 characters long',
          requiredSkills: JSON.stringify([{ skillId: '123e4567-e89b-12d3-a456-426614174000' }]),
          budget: '1000',
          deadline: '2025-12-31',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('PATCH /:id - validation errors', () => {
    it('should return 400 when title is too short', async () => {
      const res = await request(app)
        .patch('/api/projects/project-1')
        .send({ title: 'Hi' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when budget is negative', async () => {
      const res = await request(app)
        .patch('/api/projects/project-1')
        .send({ budget: -100 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /my-projects - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/projects/my-projects');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('POST /:id/milestones - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/projects/project-1/milestones')
        .send({ milestones: [{ title: 'M1', description: 'Desc', amount: 500, dueDate: '2025-06-01' }] });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('POST /:id/milestones - validation errors', () => {
    it('should return 400 when milestones array is empty', async () => {
      const res = await request(app)
        .post('/api/projects/project-1/milestones')
        .send({ milestones: [] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when milestone title is missing', async () => {
      const res = await request(app)
        .post('/api/projects/project-1/milestones')
        .send({ milestones: [{ description: 'Desc', amount: 500, dueDate: '2025-06-01' }] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when milestone amount is zero', async () => {
      const res = await request(app)
        .post('/api/projects/project-1/milestones')
        .send({ milestones: [{ title: 'M1', description: 'Desc', amount: 0, dueDate: '2025-06-01' }] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /:id/proposals - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/projects/project-1/proposals');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('GET /stats/categories - catch block', () => {
    it('should return 500 when listOpenProjects fails', async () => {
      mockListOpenProjects.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/projects/stats/categories');

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
