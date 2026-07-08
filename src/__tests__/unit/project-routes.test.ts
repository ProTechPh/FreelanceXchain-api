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

const mockGetProposalCountByProject = jest.fn<any>();
const mockGetProposalCountsByProjects = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/repositories/proposal-repository.ts'), () => ({
  proposalRepository: {
    getProposalCountByProject: mockGetProposalCountByProject,
    getProposalCountsByProjects: mockGetProposalCountsByProjects,
  },
}));

const mockGetProfileByUserId = jest.fn<any>();
const mockGetProfilesByUserIds = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/repositories/employer-profile-repository.ts'), () => ({
  employerProfileRepository: {
    getProfileByUserId: mockGetProfileByUserId,
    getProfilesByUserIds: mockGetProfilesByUserIds,
  },
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'employer' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  isValidUUID: jest.fn(() => true),
}));

jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  uploadProjectAttachments: [(_req: any, _res: any, next: any) => next()],
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v: any) => v ?? 20,
  clampOffset: (v: any) => v ?? 0,
  safeJsonParse: (v: any) => typeof v === 'string' ? JSON.parse(v) : v,
}));

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadMultipleFiles: jest.fn(),
  cleanupUploadedFiles: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
    DATABASE_ID: 'freelancexchain',
  BUCKETS: { PROJECT_ATTACHMENTS: 'project-attachments' },
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProjectFromEntity: (entity: any) => entity,
  mapEmployerProfileFromEntity: (entity: any) => entity,
}));

const router = (await import('../../routes/project-routes.js')).default;

describe('Project Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProposalCountByProject.mockResolvedValue(0);
    mockGetProposalCountsByProjects.mockResolvedValue(new Map());
    mockGetProfileByUserId.mockResolvedValue(null);
    mockGetProfilesByUserIds.mockResolvedValue(new Map());
    app = express();
    app.use(express.json());
    app.use('/api/projects', router);
  });

  describe('GET /', () => {
    it('should return open projects on success', async () => {
      mockListOpenProjects.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p-1', title: 'Project 1' }], hasMore: false },
      });
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('should enrich items with employer profile and proposalCount', async () => {
      mockListOpenProjects.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p-1', title: 'Project 1', employer_id: 'emp-1' }], hasMore: false },
      });
      mockGetProposalCountsByProjects.mockResolvedValue(new Map([['p-1', 3]]));
      mockGetProfilesByUserIds.mockResolvedValue(new Map([['emp-1', { user_id: 'emp-1', company_name: 'Acme' }]]));

      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(200);
      expect(mockGetProposalCountsByProjects).toHaveBeenCalledWith(['p-1']);
      expect(mockGetProfilesByUserIds).toHaveBeenCalledWith(['emp-1']);
      expect(res.body.items[0].proposalCount).toBe(3);
      expect(res.body.items[0].employer).toEqual({ user_id: 'emp-1', company_name: 'Acme' });
    });

    it('should search projects by keyword', async () => {
      mockSearchProjects.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p-1', title: 'React Project' }], hasMore: false },
      });
      const res = await request(app).get('/api/projects?keyword=React');
      expect(res.status).toBe(200);
      expect(mockSearchProjects).toHaveBeenCalled();
    });

    it('should return 400 on service failure', async () => {
      mockListOpenProjects.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed' },
      });
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:id', () => {
    it('should return project by ID on success', async () => {
      mockGetProjectById.mockResolvedValue({
        success: true,
        data: { id: 'p-1', title: 'Project 1', status: 'open' },
      });
      const res = await request(app).get('/api/projects/p-1');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Project 1');
    });

    it('should return 404 when project not found', async () => {
      mockGetProjectById.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).get('/api/projects/p-1');
      expect(res.status).toBe(404);
    });

    it('should enrich the project with employer profile and proposalCount', async () => {
      mockGetProjectById.mockResolvedValue({
        success: true,
        data: { id: 'p-1', title: 'Project 1', status: 'open', employer_id: 'emp-1' },
      });
      mockGetProposalCountByProject.mockResolvedValue(5);
      mockGetProfileByUserId.mockResolvedValue({ user_id: 'emp-1', company_name: 'Acme' });

      const res = await request(app).get('/api/projects/p-1');

      expect(res.status).toBe(200);
      expect(mockGetProposalCountByProject).toHaveBeenCalledWith('p-1');
      expect(mockGetProfileByUserId).toHaveBeenCalledWith('emp-1');
      expect(res.body.proposalCount).toBe(5);
      expect(res.body.employer).toEqual({ user_id: 'emp-1', company_name: 'Acme' });
    });
  });

  describe('POST /', () => {
    const validProject = {
      title: 'Build a Web App',
      description: 'We need a full-stack web application built with React and Node.js',
      requiredSkills: [{ skillId: '550e8400-e29b-41d4-a716-446655440000' }],
      budget: 5000,
      deadline: '2025-12-31T00:00:00Z',
    };

    it('should create project on success', async () => {
      mockCreateProject.mockResolvedValue({
        success: true,
        data: { id: 'p-1', ...validProject, status: 'open' },
      });
      const res = await request(app).post('/api/projects').send(validProject);
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('p-1');
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app).post('/api/projects').send({
        title: 'Hi',
        description: 'Short',
        requiredSkills: [],
        budget: -1,
        deadline: '2025-12-31',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 on service failure', async () => {
      mockCreateProject.mockResolvedValue({
        success: false,
        error: { code: 'INVALID_SKILLS', message: 'Invalid skill IDs' },
      });
      const res = await request(app).post('/api/projects').send(validProject);
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /:id', () => {
    it('should update project on success', async () => {
      mockUpdateProject.mockResolvedValue({
        success: true,
        data: { id: 'p-1', title: 'Updated Title Here', status: 'open' },
      });
      const res = await request(app)
        .patch('/api/projects/p-1')
        .send({ title: 'Updated Title Here' });
      expect(res.status).toBe(200);
    });

    it('should return 404 when project not found', async () => {
      mockUpdateProject.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app)
        .patch('/api/projects/p-1')
        .send({ title: 'Updated Title Here' });
      expect(res.status).toBe(404);
    });

    it('should return 409 when project is locked', async () => {
      mockUpdateProject.mockResolvedValue({
        success: false,
        error: { code: 'PROJECT_LOCKED', message: 'Project has accepted proposals' },
      });
      const res = await request(app)
        .patch('/api/projects/p-1')
        .send({ title: 'Updated Title Here' });
      expect(res.status).toBe(409);
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .patch('/api/projects/p-1')
        .send({ title: 'Hi' }); // too short
      expect(res.status).toBe(400);
    });
  });

  describe('POST /:id/milestones', () => {
    it('should set milestones on success', async () => {
      mockSetMilestones.mockResolvedValue({
        success: true,
        data: { id: 'p-1', milestones: [{ id: 'ms-1', title: 'Phase 1' }] },
      });
      const res = await request(app)
        .post('/api/projects/p-1/milestones')
        .send({
          milestones: [{ title: 'Phase 1', description: 'First phase', amount: 2500, dueDate: '2025-06-01' }],
        });
      expect(res.status).toBe(200);
    });

    it('should return 400 when milestones array is empty', async () => {
      const res = await request(app)
        .post('/api/projects/p-1/milestones')
        .send({ milestones: [] });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /my-projects', () => {
    it('should return employer projects on success', async () => {
      mockListProjectsByEmployer.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p-1', title: 'My Project' }], hasMore: false },
      });
      const res = await request(app).get('/api/projects/my-projects');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });

    it('should return 400 on service failure', async () => {
      mockListProjectsByEmployer.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed' },
      });
      const res = await request(app).get('/api/projects/my-projects');
      expect(res.status).toBe(400);
    });

    it('should carry through proposalCount and attach the employer profile', async () => {
      mockListProjectsByEmployer.mockResolvedValue({
        success: true,
        data: { items: [{ id: 'p-1', title: 'My Project', proposalCount: 2 }], hasMore: false },
      });
      mockGetProfileByUserId.mockResolvedValue({ user_id: 'user-1', company_name: 'My Company' });

      const res = await request(app).get('/api/projects/my-projects');

      expect(res.status).toBe(200);
      expect(mockGetProfileByUserId).toHaveBeenCalledWith('user-1');
      expect(res.body.items[0].proposalCount).toBe(2);
      expect(res.body.items[0].employer).toEqual({ user_id: 'user-1', company_name: 'My Company' });
    });
  });
});
