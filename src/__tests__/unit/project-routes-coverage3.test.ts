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

const mockUploadMultipleFiles = jest.fn<any>();
const mockCleanupUploadedFiles = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadMultipleFiles: mockUploadMultipleFiles,
  cleanupUploadedFiles: mockCleanupUploadedFiles,
}));

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  BUCKETS: { PROJECT_ATTACHMENTS: 'project-attachments' },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

const mockAuthMiddleware = jest.fn<any>();
const mockIsValidUUID = jest.fn<any>();

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
  isValidUUID: mockIsValidUUID,
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

describe('Project Routes - Coverage3', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsValidUUID.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'employer-1', role: 'employer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/projects', router);
  });

  // GET / - listProjectsByCategory path
  describe('GET / - category filter', () => {
    it('should use listProjectsByCategory when category param is provided', async () => {
      mockListProjectsByCategory.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p1', title: 'Test', required_skills: [], budget: 100 }], hasMore: false },
      });

      const res = await request(app).get('/api/projects?category=cat-1');
      expect(res.status).toBe(200);
      expect(mockListProjectsByCategory).toHaveBeenCalledWith('cat-1', { limit: 20, offset: 0 });
    });

    it('should use listProjectsByMultipleCategories when categories param is provided', async () => {
      mockListProjectsByMultipleCategories.mockResolvedValue({
        success: true,
        data: { items: [], hasMore: false },
      });

      const res = await request(app).get('/api/projects?categories=cat-1,cat-2');
      expect(res.status).toBe(200);
      expect(mockListProjectsByMultipleCategories).toHaveBeenCalledWith(['cat-1', 'cat-2'], { limit: 20, offset: 0 });
    });

    it('should use searchProjects when keyword param is provided', async () => {
      mockSearchProjects.mockResolvedValue({
        success: true,
        data: { items: [], hasMore: false },
      });

      const res = await request(app).get('/api/projects?keyword=react');
      expect(res.status).toBe(200);
      expect(mockSearchProjects).toHaveBeenCalledWith('react', { limit: 20, offset: 0 });
    });

    it('should use listProjectsBySkills when skills param is provided', async () => {
      mockListProjectsBySkills.mockResolvedValue({
        success: true,
        data: { items: [], hasMore: false },
      });

      const res = await request(app).get('/api/projects?skills=s1,s2');
      expect(res.status).toBe(200);
      expect(mockListProjectsBySkills).toHaveBeenCalledWith(['s1', 's2'], { limit: 20, offset: 0 });
    });

    it('should use listOpenProjects when no filters provided', async () => {
      mockListOpenProjects.mockResolvedValue({
        success: true,
        data: { items: [], hasMore: false },
      });

      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(mockListOpenProjects).toHaveBeenCalled();
    });

    it('should return 400 when listOpenProjects fails', async () => {
      mockListOpenProjects.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  // GET /my-projects
  describe('GET /my-projects', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app).get('/api/projects/my-projects');
      expect(res.status).toBe(401);
    });

    it('should return 400 when listProjectsByEmployer fails', async () => {
      mockListProjectsByEmployer.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/projects/my-projects');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });

    it('should return mapped projects on success', async () => {
      mockListProjectsByEmployer.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p1', title: 'My Project', required_skills: [], budget: 500 }], hasMore: false },
      });

      const res = await request(app).get('/api/projects/my-projects');
      expect(res.status).toBe(200);
      expect(mockMapProjectFromEntity).toHaveBeenCalled();
    });
  });

  // GET /:id
  describe('GET /:id', () => {
    it('should return 404 when project not found', async () => {
      mockGetProjectById.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });

      const res = await request(app).get('/api/projects/proj-1');
      expect(res.status).toBe(404);
    });

    it('should return mapped project on success', async () => {
      mockGetProjectById.mockResolvedValue({
        success: true,
        data: { id: 'proj-1', title: 'Test', required_skills: [], budget: 100 },
      });

      const res = await request(app).get('/api/projects/proj-1');
      expect(res.status).toBe(200);
    });
  });

  // POST / - create project validation
  describe('POST / - create project', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Test', description: 'desc', requiredSkills: [], budget: 100, deadline: '2025-12-31' });
      expect(res.status).toBe(401);
    });

    it('should return 400 for missing title', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ description: 'A long enough description for validation', requiredSkills: [{ skillId: '123' }], budget: 100, deadline: '2025-12-31' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing description', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', requiredSkills: [{ skillId: '123' }], budget: 100, deadline: '2025-12-31' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for empty requiredSkills', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', description: 'A long enough description for validation', requiredSkills: [], budget: 100, deadline: '2025-12-31' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid skillId UUID in requiredSkills', async () => {
      mockIsValidUUID.mockReturnValue(false);

      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', description: 'A long enough description for validation', requiredSkills: [{ skillId: 'not-uuid' }], budget: 100, deadline: '2025-12-31' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid budget (zero)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', description: 'A long enough description for validation', requiredSkills: [{ skillId: '123' }], budget: 0, deadline: '2025-12-31' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing deadline', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', description: 'A long enough description for validation', requiredSkills: [{ skillId: '123' }], budget: 100 });
      expect(res.status).toBe(400);
    });

    it('should return 400 for tags not being an array', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', description: 'A long enough description for validation', requiredSkills: [{ skillId: '123' }], budget: 100, deadline: '2025-12-31', tags: 'not-array' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for tags with non-string elements', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', description: 'A long enough description for validation', requiredSkills: [{ skillId: '123' }], budget: 100, deadline: '2025-12-31', tags: [123, 456] });
      expect(res.status).toBe(400);
    });

    it('should return 400 for too many tags', async () => {
      const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', description: 'A long enough description for validation', requiredSkills: [{ skillId: '123' }], budget: 100, deadline: '2025-12-31', tags });
      expect(res.status).toBe(400);
    });

    it('should create project with valid tags and rush options', async () => {
      mockCreateProject.mockResolvedValue({
        success: true,
        data: { id: 'p1', title: 'Valid Title' },
      });

      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', description: 'A long enough description for validation', requiredSkills: [{ skillId: '123' }], budget: 100, deadline: '2025-12-31', tags: ['react', 'node'], isRush: true, rushFeePercentage: 15 });
      expect(res.status).toBe(201);
    });

    it('should return 400 when createProject fails', async () => {
      mockCreateProject.mockResolvedValue({
        success: false,
        error: { code: 'CREATE_FAILED', message: 'Failed to create' },
      });

      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Valid Title', description: 'A long enough description for validation', requiredSkills: [{ skillId: '123' }], budget: 100, deadline: '2025-12-31' });
      expect(res.status).toBe(400);
    });
  });

  // POST /with-attachments - additional paths
  describe('POST /with-attachments - additional paths', () => {
    it('should return 400 for empty requiredSkills array', async () => {
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .field('title', 'Valid Title Here!!')
        .field('description', 'A description that is long enough for validation purposes')
        .field('requiredSkills', JSON.stringify([]))
        .field('budget', '1000')
        .field('deadline', '2025-12-31');
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid skillId UUID in requiredSkills', async () => {
      mockIsValidUUID.mockReturnValue(false);

      const res = await request(app)
        .post('/api/projects/with-attachments')
        .field('title', 'Valid Title Here!!')
        .field('description', 'A description that is long enough for validation purposes')
        .field('requiredSkills', JSON.stringify([{ skillId: 'not-uuid' }]))
        .field('budget', '1000')
        .field('deadline', '2025-12-31');
      expect(res.status).toBe(400);
    });

    it('should return 400 for tags not being an array', async () => {
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .field('title', 'Valid Title Here!!')
        .field('description', 'A description that is long enough for validation purposes')
        .field('requiredSkills', JSON.stringify([{ skillId: '123' }]))
        .field('budget', '1000')
        .field('deadline', '2025-12-31')
        .field('tags', JSON.stringify('not-array'));
      expect(res.status).toBe(400);
    });

    it('should return 400 for tags with non-string elements', async () => {
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .field('title', 'Valid Title Here!!')
        .field('description', 'A description that is long enough for validation purposes')
        .field('requiredSkills', JSON.stringify([{ skillId: '123' }]))
        .field('budget', '1000')
        .field('deadline', '2025-12-31')
        .field('tags', JSON.stringify([123, 456]));
      expect(res.status).toBe(400);
    });

    it('should return 400 for too many tags', async () => {
      const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .field('title', 'Valid Title Here!!')
        .field('description', 'A description that is long enough for validation purposes')
        .field('requiredSkills', JSON.stringify([{ skillId: '123' }]))
        .field('budget', '1000')
        .field('deadline', '2025-12-31')
        .field('tags', JSON.stringify(tags));
      expect(res.status).toBe(400);
    });

    it('should create project without files successfully', async () => {
      mockCreateProject.mockResolvedValue({
        success: true,
        data: { id: 'p1', title: 'Valid Title Here Long Enough' },
      });

      // Use a custom app that injects parsed body fields as the route expects from multipart
      const appWithBody = express();
      appWithBody.use(express.json());
      appWithBody.use((req: any, _res: any, next: any) => {
        req.user = { userId: 'employer-1', role: 'employer' };
        req.files = [];
        next();
      });
      appWithBody.use('/api/projects', router);

      const res = await request(appWithBody)
        .post('/api/projects/with-attachments')
        .send({
          title: 'Valid Title Here Long Enough',
          description: 'A description that is long enough for validation purposes',
          requiredSkills: JSON.stringify([{ skillId: '123' }]),
          budget: '1000',
          deadline: '2025-12-31',
          tags: JSON.stringify(['react', 'node']),
        });
      expect(res.status).toBe(201);
    });

    it('should return 400 for missing description', async () => {
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .field('title', 'Valid Title Here!!')
        .field('description', 'short')
        .field('requiredSkills', JSON.stringify([{ skillId: '123' }]))
        .field('budget', '1000')
        .field('deadline', '2025-12-31');
      expect(res.status).toBe(400);
    });

    it('should return 400 for missing deadline', async () => {
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .field('title', 'Valid Title Here!!')
        .field('description', 'A description that is long enough for validation purposes')
        .field('requiredSkills', JSON.stringify([{ skillId: '123' }]))
        .field('budget', '1000');
      expect(res.status).toBe(400);
    });
  });

  // PATCH /:id - additional paths
  describe('PATCH /:id - additional paths', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app)
        .patch('/api/projects/proj-1')
        .send({ title: 'Updated Title' });
      expect(res.status).toBe(401);
    });

    it('should pass isRush and rushFeePercentage to updateProject', async () => {
      mockUpdateProject.mockResolvedValue({
        success: true,
        data: { id: 'proj-1', title: 'Updated' },
      });

      const res = await request(app)
        .patch('/api/projects/proj-1')
        .send({ title: 'Updated Title Here', isRush: true, rushFeePercentage: 10 });
      expect(res.status).toBe(200);
      expect(mockUpdateProject).toHaveBeenCalledWith('proj-1', 'employer-1', expect.objectContaining({ isRush: true, rushFeePercentage: 10 }));
    });

    it('should return 400 for generic updateProject error', async () => {
      mockUpdateProject.mockResolvedValue({
        success: false,
        error: { code: 'GENERIC_ERROR', message: 'Something went wrong' },
      });

      const res = await request(app)
        .patch('/api/projects/proj-1')
        .send({ title: 'Updated Title Here' });
      expect(res.status).toBe(400);
    });
  });

  // GET /:id/proposals
  describe('GET /:id/proposals', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app).get('/api/projects/proj-1/proposals');
      expect(res.status).toBe(401);
    });

    it('should return 403 when employer does not own the project', async () => {
      mockGetProjectById.mockResolvedValue({
        success: true,
        data: { employer_id: 'other-employer', id: 'proj-1' },
      });

      const res = await request(app).get('/api/projects/proj-1/proposals');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 404 when project not found', async () => {
      mockGetProjectById.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });

      const res = await request(app).get('/api/projects/proj-1/proposals');
      expect(res.status).toBe(404);
    });

    it('should return proposals on success', async () => {
      mockGetProjectById.mockResolvedValue({
        success: true,
        data: { employer_id: 'employer-1', id: 'proj-1' },
      });
      mockGetProposalsByProject.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'prop-1' }], hasMore: false },
      });

      const res = await request(app).get('/api/projects/proj-1/proposals');
      expect(res.status).toBe(200);
    });
  });

  // POST /:id/milestones - additional paths
  describe('POST /:id/milestones - additional paths', () => {
    it('should return 400 when milestone description is missing', async () => {
      const res = await request(app)
        .post('/api/projects/proj-1/milestones')
        .send({
          milestones: [{ title: 'MS1', amount: 100, dueDate: '2025-01-01' }],
        });
      expect(res.status).toBe(400);
    });

    it('should return 400 when milestone dueDate is missing', async () => {
      const res = await request(app)
        .post('/api/projects/proj-1/milestones')
        .send({
          milestones: [{ title: 'MS1', description: 'desc', amount: 100 }],
        });
      expect(res.status).toBe(400);
    });

    it('should return 200 on successful milestone creation', async () => {
      mockSetMilestones.mockResolvedValue({
        success: true,
        data: { id: 'proj-1', milestones: [{ title: 'MS1' }] },
      });

      const res = await request(app)
        .post('/api/projects/proj-1/milestones')
        .send({
          milestones: [{ title: 'MS1', description: 'A description', amount: 100, dueDate: '2025-01-01' }],
        });
      expect(res.status).toBe(200);
    });

    it('should return 400 for generic setMilestones error', async () => {
      mockSetMilestones.mockResolvedValue({
        success: false,
        error: { code: 'BUDGET_MISMATCH', message: 'Milestone amounts do not sum to budget' },
      });

      const res = await request(app)
        .post('/api/projects/proj-1/milestones')
        .send({
          milestones: [{ title: 'MS1', description: 'A description', amount: 100, dueDate: '2025-01-01' }],
        });
      expect(res.status).toBe(400);
    });
  });

  // GET /stats/categories
  describe('GET /stats/categories', () => {
    it('should return category statistics', async () => {
      mockListOpenProjects.mockResolvedValue({
        success: true,
        data: {
          items: [
            { id: 'p1', budget: 1000, required_skills: [{ category_id: 'cat-1' }] },
            { id: 'p2', budget: 2000, required_skills: [{ category_id: 'cat-1' }, { category_id: 'cat-2' }] },
          ],
          hasMore: false,
        },
      });

      const res = await request(app).get('/api/projects/stats/categories');
      expect(res.status).toBe(200);
      expect(res.body.categories).toBeDefined();
      expect(res.body.categories.length).toBe(2);
    });

    it('should return 500 when listOpenProjects fails', async () => {
      mockListOpenProjects.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/projects/stats/categories');
      expect(res.status).toBe(500);
    });

    it('should return 500 when an exception is thrown', async () => {
      mockListOpenProjects.mockRejectedValue(new Error('Unexpected error'));

      const res = await request(app).get('/api/projects/stats/categories');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
