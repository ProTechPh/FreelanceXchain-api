import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import type { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

describe('Portfolio Routes Integration Tests', () => {
  let app: Express;
  let currentRole = 'freelancer';

  beforeAll(async () => {
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: jest.fn((req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({
            error: { code: 'AUTH_MISSING_TOKEN', message: 'Authorization header is required' },
            timestamp: new Date().toISOString(),
            requestId: 'unknown',
          });
          return;
        }
        (req as any).user = { id: 'test-user-id', userId: 'test-user-id', email: 'test@example.com', role: currentRole };
        next();
      }),
      requireMFA: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
      requireRole: jest.fn((...roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
        if (!roles.includes((req as any).user?.role)) {
          res.status(403).json({
            error: { code: 'AUTH_FORBIDDEN', message: 'Insufficient permissions' },
            timestamp: new Date().toISOString(),
            requestId: 'unknown',
          });
          return;
        }
        next();
      }),
      requireVerifiedKyc: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
    }));

    jest.unstable_mockModule(resolveModule('src/services/portfolio-service.ts'), () => ({
      createPortfolioItem: jest.fn(async () => ({
        success: true,
        data: { id: 'portfolio-1', user_id: 'test-user-id', title: 'Test Project', description: 'A test project' },
      })),
      getFreelancerPortfolio: jest.fn(async () => ({
        success: true,
        data: [
          { id: 'portfolio-1', user_id: 'test-user-id', title: 'Test Project', description: 'A test project' },
        ],
      })),
      getPortfolioItem: jest.fn(async () => ({
        success: true,
        data: { id: 'portfolio-1', user_id: 'test-user-id', title: 'Test Project', description: 'A test project' },
      })),
      updatePortfolioItem: jest.fn(async () => ({
        success: true,
        data: { id: 'portfolio-1', user_id: 'test-user-id', title: 'Updated Project', description: 'Updated' },
      })),
      deletePortfolioItem: jest.fn(async () => ({
        success: true,
        data: { message: 'Portfolio item deleted' },
      })),
    }));

    jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
      MAX_FILE_SIZE: 10 * 1024 * 1024,
      MAX_TOTAL_SIZE: 25 * 1024 * 1024,
      MIN_FILE_COUNT: 1,
      MAX_FILE_COUNT: 10,
      ALLOWED_MIME_TYPES: {
        'application/pdf': true,
        'image/png': true,
        'image/jpeg': true,
      },
      createFileUploadMiddleware: jest.fn(() => []),
      uploadProposalAttachments: [],
      uploadProjectAttachments: [],
      uploadDisputeEvidence: [],
      uploadPortfolioImages: [],
      scanFileForViruses: jest.fn(async () => ({ clean: true })),
      sanitizeFilename: jest.fn((name: string) => name),
    }));

    const { createApp } = await import('../../app.js');
    app = await createApp();
  });

  describe('POST /api/portfolio', () => {
    it('should create a portfolio item with JSON', async () => {
      const response = await request(app)
        .post('/api/portfolio')
        .set('Authorization', 'Bearer mock-token')
        .send({
          title: 'Test Project',
          description: 'A test project description',
          projectUrl: 'https://example.com',
          images: ['https://example.com/image.png'],
          skills: ['TypeScript'],
          completedAt: new Date().toISOString(),
        });

      expect(response.status).toBe(201);
      expect(response.body).toBeDefined();
    });

    it('should require freelancer role', async () => {
      currentRole = 'employer';
      const response = await request(app)
        .post('/api/portfolio')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Test', description: 'Desc' });

      expect(response.status).toBe(403);
      currentRole = 'freelancer';
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/portfolio')
        .send({ title: 'Test', description: 'Desc' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/portfolio/freelancer/:freelancerId', () => {
    it('should get freelancer portfolio', async () => {
      const response = await request(app)
        .get('/api/portfolio/freelancer/123e4567-e89b-12d3-a456-426614174000');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app).get('/api/portfolio/freelancer/invalid-uuid');
      expect(response.status).toBe(400);
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/api/portfolio/freelancer/123e4567-e89b-12d3-a456-426614174000');
      expect(response.status).not.toBe(401);
    });
  });

  describe('GET /api/portfolio/:id', () => {
    it('should get a portfolio item', async () => {
      const response = await request(app)
        .get('/api/portfolio/123e4567-e89b-12d3-a456-426614174000');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app).get('/api/portfolio/invalid-uuid');
      expect(response.status).toBe(400);
    });

    it('should not require authentication', async () => {
      const response = await request(app).get('/api/portfolio/123e4567-e89b-12d3-a456-426614174000');
      expect(response.status).not.toBe(401);
    });
  });

  describe('PATCH /api/portfolio/:id', () => {
    it('should update a portfolio item', async () => {
      const response = await request(app)
        .patch('/api/portfolio/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Updated Project' });

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .patch('/api/portfolio/invalid-uuid')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Updated' });

      expect(response.status).toBe(400);
    });

    it('should require freelancer role', async () => {
      currentRole = 'employer';
      const response = await request(app)
        .patch('/api/portfolio/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Updated' });

      expect(response.status).toBe(403);
      currentRole = 'freelancer';
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/portfolio/123e4567-e89b-12d3-a456-426614174000')
        .send({ title: 'Updated' });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/portfolio/:id', () => {
    it('should delete a portfolio item', async () => {
      const response = await request(app)
        .delete('/api/portfolio/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .delete('/api/portfolio/invalid-uuid')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(400);
    });

    it('should require freelancer role', async () => {
      currentRole = 'employer';
      const response = await request(app)
        .delete('/api/portfolio/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(403);
      currentRole = 'freelancer';
    });

    it('should require authentication', async () => {
      const response = await request(app).delete('/api/portfolio/123e4567-e89b-12d3-a456-426614174000');
      expect(response.status).toBe(401);
    });
  });
});
