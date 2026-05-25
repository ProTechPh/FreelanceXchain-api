import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import type { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

describe('Review Routes Integration Tests', () => {
  let app: Express;

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
        (req as any).user = { id: 'test-user-id', userId: 'test-user-id', email: 'test@example.com', role: 'freelancer' };
        next();
      }),
      requireMFA: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
      requireRole: jest.fn(() => jest.fn((_req: Request, _res: Response, next: NextFunction) => next())),
      requireVerifiedKyc: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
    }));

    jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
      submitRating: jest.fn(async () => ({
        success: true,
        data: { id: 'review-1', contractId: 'contract-1', raterId: 'test-user-id', rating: 5, comment: 'Great work!' },
      })),
      getReviewById: jest.fn(async () => ({
        success: true,
        data: { id: 'review-1', contractId: 'contract-1', raterId: 'test-user-id', rating: 5, comment: 'Great work!' },
      })),
      getUserReviews: jest.fn(async () => ({
        success: true,
        data: [
          { id: 'review-1', contractId: 'contract-1', raterId: 'test-user-id', rating: 5, comment: 'Great work!' },
        ],
      })),
      getProjectReviews: jest.fn(async () => ({
        success: true,
        data: [
          { id: 'review-1', contractId: 'contract-1', raterId: 'test-user-id', rating: 5, comment: 'Great work!' },
        ],
      })),
      canUserRate: jest.fn(async () => ({
        success: true,
        data: { canReview: true },
      })),
      getReputation: jest.fn(async () => ({
        success: true,
        data: { score: 95, totalReviews: 10 },
      })),
      getWorkHistory: jest.fn(async () => ({
        success: true,
        data: [],
      })),
      getContractRatings: jest.fn(async () => ({
        success: true,
        data: [],
      })),
      serializeReputationRecord: jest.fn(() => 'serialized'),
      deserializeReputationRecord: jest.fn(() => ({
        reviewerId: 'test-user-id',
        revieweeId: 'test-user-id',
        rating: 5,
        timestamp: Date.now(),
        contractId: 'contract-1',
        blockchainTxHash: '0xabc',
      })),
    }));

    const { createApp } = await import('../../app.js');
    app = await createApp();
  });

  describe('POST /api/reviews', () => {
    it('should submit a review', async () => {
      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', 'Bearer mock-token')
        .send({
          contractId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 5,
          comment: 'Excellent work!',
          workQuality: 5,
          communication: 5,
          professionalism: 5,
          wouldWorkAgain: true,
        });

      expect(response.status).toBe(201);
      expect(response.body).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/reviews')
        .set('Authorization', 'Bearer mock-token')
        .send({
          contractId: '123e4567-e89b-12d3-a456-426614174000',
          rating: 6,
          comment: '',
        });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/reviews')
        .send({ contractId: '123e4567-e89b-12d3-a456-426614174000', rating: 5, comment: 'Test' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/reviews/:id', () => {
    it('should get a review by id', async () => {
      const response = await request(app)
        .get('/api/reviews/123e4567-e89b-12d3-a456-426614174000');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app).get('/api/reviews/invalid-uuid');
      expect(response.status).toBe(400);
    });

    it('should not require authentication', async () => {
      const response = await request(app).get('/api/reviews/123e4567-e89b-12d3-a456-426614174000');
      expect(response.status).not.toBe(401);
    });
  });

  describe('GET /api/reviews/user/:userId', () => {
    it('should get reviews by user', async () => {
      const response = await request(app)
        .get('/api/reviews/user/123e4567-e89b-12d3-a456-426614174000');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app).get('/api/reviews/user/invalid-uuid');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/reviews/project/:projectId', () => {
    it('should get reviews by project', async () => {
      const response = await request(app)
        .get('/api/reviews/project/123e4567-e89b-12d3-a456-426614174000');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app).get('/api/reviews/project/invalid-uuid');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/reviews/can-review/:contractId', () => {
    it('should check if user can review', async () => {
      const response = await request(app)
        .get('/api/reviews/can-review/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .get('/api/reviews/can-review/invalid-uuid')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/reviews/can-review/123e4567-e89b-12d3-a456-426614174000');
      expect(response.status).toBe(401);
    });
  });
});
