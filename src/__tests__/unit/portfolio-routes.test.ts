// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreatePortfolioItem = jest.fn() as any;
const mockUpdatePortfolioItem = jest.fn() as any;
const mockDeletePortfolioItem = jest.fn() as any;
const mockGetFreelancerPortfolio = jest.fn() as any;
const mockGetPortfolioItem = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/portfolio-service.ts'), () => ({
  createPortfolioItem: mockCreatePortfolioItem,
  updatePortfolioItem: mockUpdatePortfolioItem,
  deletePortfolioItem: mockDeletePortfolioItem,
  getFreelancerPortfolio: mockGetFreelancerPortfolio,
  getPortfolioItem: mockGetPortfolioItem,
}));

const mockAuthMiddleware = jest.fn((req: any, _res: any, next: any) => {
  req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
  next();
});

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
  requireRole: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  requireVerifiedKyc: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  uploadPortfolioImages: [],
}));

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadMultipleFiles: jest.fn().mockResolvedValue([]),
  cleanupUploadedFiles: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
    DATABASE_ID: 'freelancexchain',
  BUCKETS: { PORTFOLIO_IMAGES: 'portfolio-images' },
}));

const portfolioRouter = (await import('../../routes/portfolio-routes.js')).default;

describe('Portfolio Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/portfolio', portfolioRouter);
  });

  describe('POST / - Create Portfolio Item (JSON)', () => {
    it('should create a portfolio item with JSON body', async () => {
      const portfolioItem = {
        id: 'port-1',
        title: 'My Project',
        description: 'A great project',
        projectUrl: 'https://example.com',
        skills: ['React', 'Node.js'],
      };
      mockCreatePortfolioItem.mockResolvedValue({ success: true, data: portfolioItem });

      const res = await request(app)
        .post('/api/portfolio')
        .send({
          title: 'My Project',
          description: 'A great project',
          projectUrl: 'https://example.com',
          skills: ['React', 'Node.js'],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('port-1');
      expect(mockCreatePortfolioItem).toHaveBeenCalledWith('user-1', {
        title: 'My Project',
        description: 'A great project',
        projectUrl: 'https://example.com',
        images: undefined,
        skills: ['React', 'Node.js'],
        completedAt: undefined,
      });
    });

    it('should return 401 when user is not authenticated (JSON)', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/portfolio')
        .send({ title: 'My Project', description: 'A great project' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure (JSON)', async () => {
      mockCreatePortfolioItem.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Title is required' },
      });

      const res = await request(app)
        .post('/api/portfolio')
        .send({ title: '', description: 'A great project' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /freelancer/:freelancerId - Get Freelancer Portfolio', () => {
    const freelancerId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return freelancer portfolio', async () => {
      const portfolio = [
        { id: 'port-1', title: 'Project 1' },
        { id: 'port-2', title: 'Project 2' },
      ];
      mockGetFreelancerPortfolio.mockResolvedValue({ success: true, data: portfolio });

      const res = await request(app).get(`/api/portfolio/freelancer/${freelancerId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockGetFreelancerPortfolio).toHaveBeenCalledWith(freelancerId);
    });

    it('should return 400 when service returns failure', async () => {
      mockGetFreelancerPortfolio.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get(`/api/portfolio/freelancer/${freelancerId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('GET /:id - Get Portfolio Item', () => {
    const portfolioId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return a portfolio item', async () => {
      const item = { id: portfolioId, title: 'My Project', description: 'A great project' };
      mockGetPortfolioItem.mockResolvedValue({ success: true, data: item });

      const res = await request(app).get(`/api/portfolio/${portfolioId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(portfolioId);
      expect(mockGetPortfolioItem).toHaveBeenCalledWith(portfolioId);
    });

    it('should return 404 when portfolio item not found', async () => {
      mockGetPortfolioItem.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Portfolio item not found' },
      });

      const res = await request(app).get(`/api/portfolio/${portfolioId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for other service errors', async () => {
      mockGetPortfolioItem.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get(`/api/portfolio/${portfolioId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('PATCH /:id - Update Portfolio Item', () => {
    const portfolioId = '550e8400-e29b-41d4-a716-446655440000';

    it('should update a portfolio item', async () => {
      const updatedItem = { id: portfolioId, title: 'Updated Title', description: 'Updated desc' };
      mockUpdatePortfolioItem.mockResolvedValue({ success: true, data: updatedItem });

      const res = await request(app)
        .patch(`/api/portfolio/${portfolioId}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
      expect(mockUpdatePortfolioItem).toHaveBeenCalledWith(portfolioId, 'user-1', { title: 'Updated Title' });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .patch(`/api/portfolio/${portfolioId}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 404 when portfolio item not found', async () => {
      mockUpdatePortfolioItem.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Portfolio item not found' },
      });

      const res = await request(app)
        .patch(`/api/portfolio/${portfolioId}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when user is not the owner', async () => {
      mockUpdatePortfolioItem.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not the owner' },
      });

      const res = await request(app)
        .patch(`/api/portfolio/${portfolioId}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for other service errors', async () => {
      mockUpdatePortfolioItem.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid data' },
      });

      const res = await request(app)
        .patch(`/api/portfolio/${portfolioId}`)
        .send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /:id - Delete Portfolio Item', () => {
    const portfolioId = '550e8400-e29b-41d4-a716-446655440000';

    it('should delete a portfolio item', async () => {
      mockDeletePortfolioItem.mockResolvedValue({ success: true });

      const res = await request(app).delete(`/api/portfolio/${portfolioId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Portfolio item deleted');
      expect(mockDeletePortfolioItem).toHaveBeenCalledWith(portfolioId, 'user-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).delete(`/api/portfolio/${portfolioId}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 404 when portfolio item not found', async () => {
      mockDeletePortfolioItem.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Portfolio item not found' },
      });

      const res = await request(app).delete(`/api/portfolio/${portfolioId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when user is not the owner', async () => {
      mockDeletePortfolioItem.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not the owner' },
      });

      const res = await request(app).delete(`/api/portfolio/${portfolioId}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for other service errors', async () => {
      mockDeletePortfolioItem.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).delete(`/api/portfolio/${portfolioId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });
});
