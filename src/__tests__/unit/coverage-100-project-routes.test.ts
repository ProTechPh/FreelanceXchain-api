// @ts-nocheck
/**
 * Coverage completion tests - Project Routes uncovered lines 562, 568, 589, 591, 593-596, 633
 */
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

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'employer' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

const mockIsValidUUID = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  isValidUUID: mockIsValidUUID,
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

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProjectFromEntity: (entity: any) => entity,
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const router = (await import('../../routes/project-routes.js')).default;

describe('Project Routes - Coverage Completion', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsValidUUID.mockReturnValue(true);
    app = express();
    app.use(express.json());
    app.use('/api/projects', router);
  });

  describe('POST / - requiredSkills validation (regular route)', () => {
    it('should return 400 when requiredSkills has invalid skillId UUID', async () => {
      mockIsValidUUID.mockReturnValue(false);
      const res = await request(app)
        .post('/api/projects')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: [{ skillId: 'not-a-uuid', level: 'intermediate' }],
          budget: 1000,
          deadline: '2025-12-31',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'requiredSkills[0].skillId' }),
        ])
      );
    });
  });

  describe('POST / - tags validation (regular route)', () => {
    it('should return 400 when tags is not an array', async () => {
      mockIsValidUUID.mockReturnValue(true);
      const res = await request(app)
        .post('/api/projects')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: [{ skillId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', level: 'intermediate' }],
          budget: 1000,
          deadline: '2025-12-31',
          tags: 'not-an-array',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'tags', message: 'Tags must be an array' }),
        ])
      );
    });

    it('should return 400 when tags contain non-string values', async () => {
      mockIsValidUUID.mockReturnValue(true);
      const res = await request(app)
        .post('/api/projects')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: [{ skillId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', level: 'intermediate' }],
          budget: 1000,
          deadline: '2025-12-31',
          tags: [123, 'valid'],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'tags', message: 'All tags must be strings' }),
        ])
      );
    });

    it('should return 400 when tags exceed maximum of 10', async () => {
      mockIsValidUUID.mockReturnValue(true);
      const res = await request(app)
        .post('/api/projects')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: [{ skillId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', level: 'intermediate' }],
          budget: 1000,
          deadline: '2025-12-31',
          tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'tags', message: 'Maximum 10 tags allowed' }),
        ])
      );
    });
  });

  describe('POST /with-attachments - requiredSkills JSON parsing (lines 562, 568)', () => {
    it('should return 400 when requiredSkills is not a valid JSON array', async () => {
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: 'not-json{',
          budget: '1000',
          deadline: '2025-12-31',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'requiredSkills', message: 'requiredSkills must be a valid JSON array' }),
        ])
      );
    });

    it('should return 400 when requiredSkills parses to non-array', async () => {
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: JSON.stringify({ not: 'an array' }),
          budget: '1000',
          deadline: '2025-12-31',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'requiredSkills' }),
        ])
      );
    });

    it('should return 400 when requiredSkills has invalid skillId UUID', async () => {
      mockIsValidUUID.mockReturnValue(false);
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: JSON.stringify([{ skillId: 'not-a-uuid', level: 'intermediate' }]),
          budget: '1000',
          deadline: '2025-12-31',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'requiredSkills[0].skillId' }),
        ])
      );
    });
  });

  describe('POST /with-attachments - tags JSON parsing (lines 589, 591, 593-596)', () => {
    it('should return 400 when tags is invalid JSON', async () => {
      mockIsValidUUID.mockReturnValue(true);
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: JSON.stringify([{ skillId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }]),
          budget: '1000',
          deadline: '2025-12-31',
          tags: 'not-json{',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'tags', message: 'Tags must be a valid JSON array' }),
        ])
      );
    });

    it('should return 400 when tags parses to non-array', async () => {
      mockIsValidUUID.mockReturnValue(true);
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: JSON.stringify([{ skillId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }]),
          budget: '1000',
          deadline: '2025-12-31',
          tags: JSON.stringify('not-an-array'),
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'tags', message: 'Tags must be an array' }),
        ])
      );
    });

    it('should return 400 when tags contain non-string values', async () => {
      mockIsValidUUID.mockReturnValue(true);
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: JSON.stringify([{ skillId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }]),
          budget: '1000',
          deadline: '2025-12-31',
          tags: JSON.stringify([123, 'valid']),
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'tags', message: 'All tags must be strings' }),
        ])
      );
    });

    it('should return 400 when tags exceed maximum of 10', async () => {
      mockIsValidUUID.mockReturnValue(true);
      const res = await request(app)
        .post('/api/projects/with-attachments')
        .send({
          title: 'Valid Project Title',
          description: 'This is a valid description that is long enough for validation',
          requiredSkills: JSON.stringify([{ skillId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }]),
          budget: '1000',
          deadline: '2025-12-31',
          tags: JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']),
        });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'tags', message: 'Maximum 10 tags allowed' }),
        ])
      );
    });
  });
});
