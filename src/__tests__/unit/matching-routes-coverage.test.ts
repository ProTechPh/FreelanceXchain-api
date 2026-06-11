// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetProjectRecommendations = jest.fn<any>();
const mockGetFreelancerRecommendations = jest.fn<any>();
const mockExtractSkillsFromText = jest.fn<any>();
const mockAnalyzeSkillGaps = jest.fn<any>();
const mockIsMatchingError = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/matching-service.ts'), () => ({
  getProjectRecommendations: mockGetProjectRecommendations,
  getFreelancerRecommendations: mockGetFreelancerRecommendations,
  extractSkillsFromText: mockExtractSkillsFromText,
  analyzeSkillGaps: mockAnalyzeSkillGaps,
  isMatchingError: mockIsMatchingError,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', role: 'freelancer' };
    next();
  },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const matchingRouter = (await import('../../routes/matching-routes.js')).default;

describe('Matching Routes - Coverage Gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMatchingError.mockImplementation((result: any) => !!result.error);
    app = express();
    app.use(express.json());
    app.use('/api/matching', matchingRouter);
  });

  describe('GET /projects - project recommendations', () => {
    it('should return project recommendations successfully', async () => {
      mockGetProjectRecommendations.mockResolvedValue({
        data: [{ projectId: 'p-1', matchScore: 85 }],
      });
      const res = await request(app).get('/api/matching/projects');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should validate limit parameter', async () => {
      const res = await request(app).get('/api/matching/projects?limit=abc');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when profile not found', async () => {
      mockGetProjectRecommendations.mockResolvedValue({
        error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
      });
      const res = await request(app).get('/api/matching/projects');
      expect(res.status).toBe(404);
    });

    it('should return 400 on other matching errors', async () => {
      mockGetProjectRecommendations.mockResolvedValue({
        error: { code: 'MATCHING_FAILED', message: 'Failed' },
      });
      const res = await request(app).get('/api/matching/projects');
      expect(res.status).toBe(400);
    });

    it('should cap limit at 50', async () => {
      mockGetProjectRecommendations.mockResolvedValue({
        data: [],
      });
      await request(app).get('/api/matching/projects?limit=100');
      expect(mockGetProjectRecommendations).toHaveBeenCalledWith('user-1', 50);
    });
  });

  describe('GET /freelancers/:projectId - freelancer recommendations', () => {
    it('should return freelancer recommendations successfully', async () => {
      mockGetFreelancerRecommendations.mockResolvedValue({
        data: [{ freelancerId: 'f-1', matchScore: 90 }],
      });
      const res = await request(app).get('/api/matching/freelancers/project-123');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should validate limit parameter for freelancers', async () => {
      const res = await request(app).get('/api/matching/freelancers/project-123?limit=-1');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when project not found', async () => {
      mockGetFreelancerRecommendations.mockResolvedValue({
        error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
      });
      const res = await request(app).get('/api/matching/freelancers/project-123');
      expect(res.status).toBe(404);
    });

    it('should return 400 on other matching errors', async () => {
      mockGetFreelancerRecommendations.mockResolvedValue({
        error: { code: 'MATCHING_FAILED', message: 'Failed' },
      });
      const res = await request(app).get('/api/matching/freelancers/project-123');
      expect(res.status).toBe(400);
    });

    it('should cap limit at 50', async () => {
      mockGetFreelancerRecommendations.mockResolvedValue({ data: [] });
      await request(app).get('/api/matching/freelancers/project-123?limit=200');
      expect(mockGetFreelancerRecommendations).toHaveBeenCalledWith('project-123', 50);
    });
  });

  describe('POST /extract-skills', () => {
    it('should extract skills from text successfully', async () => {
      mockExtractSkillsFromText.mockResolvedValue({
        data: [{ skillName: 'JavaScript', confidence: 0.9 }],
      });
      const res = await request(app)
        .post('/api/matching/extract-skills')
        .send({ text: 'I know JavaScript and TypeScript' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 400 when text is missing', async () => {
      const res = await request(app)
        .post('/api/matching/extract-skills')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when text is not a string', async () => {
      const res = await request(app)
        .post('/api/matching/extract-skills')
        .send({ text: 123 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 on extraction error', async () => {
      mockExtractSkillsFromText.mockResolvedValue({
        error: { code: 'EXTRACTION_FAILED', message: 'Failed' },
      });
      const res = await request(app)
        .post('/api/matching/extract-skills')
        .send({ text: 'some text' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /skill-gaps', () => {
    it('should return skill gap analysis successfully', async () => {
      mockAnalyzeSkillGaps.mockResolvedValue({
        data: { gaps: ['Python'], suggestions: ['Learn Python'] },
      });
      const res = await request(app).get('/api/matching/skill-gaps');
      expect(res.status).toBe(200);
      expect(res.body.gaps).toBeDefined();
    });

    it('should return 404 when profile not found', async () => {
      mockAnalyzeSkillGaps.mockResolvedValue({
        error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
      });
      const res = await request(app).get('/api/matching/skill-gaps');
      expect(res.status).toBe(404);
    });

    it('should return 400 on other errors', async () => {
      mockAnalyzeSkillGaps.mockResolvedValue({
        error: { code: 'ANALYSIS_FAILED', message: 'Failed' },
      });
      const res = await request(app).get('/api/matching/skill-gaps');
      expect(res.status).toBe(400);
    });
  });
});
