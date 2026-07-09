// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSubmitReview = jest.fn() as any;
const mockGetReviewById = jest.fn() as any;
const mockGetUserReviews = jest.fn() as any;
const mockGetProjectReviews = jest.fn() as any;
const mockCanUserReview = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  submitRating: mockSubmitReview,
  getReviewById: mockGetReviewById,
  getUserReviews: mockGetUserReviews,
  getProjectReviews: mockGetProjectReviews,
  canUserRate: mockCanUserReview,
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

const reviewRouter = (await import('../../routes/review-routes.js')).default;

function makeApp(basePath: string, r: any) { const a = express(); a.use(express.json()); a.use(basePath, r); return a; }
const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });
const mockReputationService = { submitRating: mockSubmitReview, getReviewById: mockGetReviewById, getUserReviews: mockGetUserReviews, getProjectReviews: mockGetProjectReviews, canUserRate: mockCanUserReview };

describe('Review Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/reviews', reviewRouter);
  });

  describe('POST / - Submit Review', () => {
    const validReview = {
      contractId: '550e8400-e29b-41d4-a716-446655440000',
      rating: 5,
      comment: 'Excellent work!',
      workQuality: 5,
      communication: 5,
      professionalism: 5,
      wouldWorkAgain: true,
    };

    it('should submit a review successfully', async () => {
      const reviewData = { id: 'review-1', ...validReview, raterId: 'user-1' };
      mockSubmitReview.mockResolvedValue({ success: true, data: reviewData });

      const res = await request(app)
        .post('/api/reviews')
        .send(validReview);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('review-1');
      expect(mockSubmitReview).toHaveBeenCalledWith({
        contractId: validReview.contractId,
        raterId: 'user-1',
        rating: 5,
        comment: 'Excellent work!',
        workQuality: 5,
        communication: 5,
        professionalism: 5,
        wouldWorkAgain: true,
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/reviews')
        .send(validReview);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when contractId is missing', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .send({ rating: 5, comment: 'Great!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'contractId' })])
      );
    });

    it('should return 400 when rating is invalid (too low)', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .send({ contractId: validReview.contractId, rating: 0, comment: 'Bad' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'rating' })])
      );
    });

    it('should return 400 when rating is invalid (too high)', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .send({ contractId: validReview.contractId, rating: 6, comment: 'Great!' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'rating' })])
      );
    });

    it('should return 400 when comment is missing', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .send({ contractId: validReview.contractId, rating: 5 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'comment' })])
      );
    });

    it('should return 404 when contract not found', async () => {
      mockSubmitReview.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contract not found' },
      });

      const res = await request(app)
        .post('/api/reviews')
        .send(validReview);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when user is unauthorized to review', async () => {
      mockSubmitReview.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized to review this contract' },
      });

      const res = await request(app)
        .post('/api/reviews')
        .send(validReview);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 409 when duplicate review', async () => {
      mockSubmitReview.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE_RATING', message: 'Already reviewed' },
      });

      const res = await request(app)
        .post('/api/reviews')
        .send(validReview);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_RATING');
    });

    it('should return 400 for other service errors', async () => {
      mockSubmitReview.mockResolvedValue({
        success: false,
        error: { code: 'INVALID_STATE', message: 'Contract not completed' },
      });

      const res = await request(app)
        .post('/api/reviews')
        .send(validReview);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });
  });

  describe('GET /:id - Get Review by ID', () => {
    const reviewId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return a review by ID', async () => {
      const review = { id: reviewId, rating: 5, comment: 'Great!' };
      mockGetReviewById.mockResolvedValue({ success: true, data: review });

      const res = await request(app).get(`/api/reviews/${reviewId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(reviewId);
      expect(mockGetReviewById).toHaveBeenCalledWith(reviewId);
    });

    it('should return 404 when review not found', async () => {
      mockGetReviewById.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Review not found' },
      });

      const res = await request(app).get(`/api/reviews/${reviewId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for other service errors', async () => {
      mockGetReviewById.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get(`/api/reviews/${reviewId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('GET /user/:userId - Get User Reviews', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return user reviews', async () => {
      const reviews = [
        { id: 'review-1', rating: 5, comment: 'Great!' },
        { id: 'review-2', rating: 4, comment: 'Good' },
      ];
      mockGetUserReviews.mockResolvedValue({ success: true, data: reviews });

      const res = await request(app).get(`/api/reviews/user/${userId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockGetUserReviews).toHaveBeenCalledWith(userId);
    });

    it('should return 400 when service returns failure', async () => {
      mockGetUserReviews.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get(`/api/reviews/user/${userId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('GET /project/:projectId - Get Project Reviews', () => {
    const projectId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return project reviews', async () => {
      const reviews = [{ id: 'review-1', rating: 5, comment: 'Great project!' }];
      mockGetProjectReviews.mockResolvedValue({ success: true, data: reviews });

      const res = await request(app).get(`/api/reviews/project/${projectId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockGetProjectReviews).toHaveBeenCalledWith(projectId);
    });

    it('should return 400 when service returns failure', async () => {
      mockGetProjectReviews.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get(`/api/reviews/project/${projectId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('GET /can-review/:contractId - Check if User Can Review', () => {
    const contractId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return true when user can review', async () => {
      mockCanUserReview.mockResolvedValue({ success: true, data: { canRate: true } });

      const res = await request(app).get(`/api/reviews/can-review/${contractId}?rateeId=some-user-id`);

      expect(res.status).toBe(200);
      expect(res.body.canRate).toBe(true);
      expect(mockCanUserReview).toHaveBeenCalledWith('user-1', 'some-user-id', contractId);
    });

    it('should return false when user cannot review', async () => {
      mockCanUserReview.mockResolvedValue({ success: true, data: { canRate: false, reason: 'Already reviewed' } });

      const res = await request(app).get(`/api/reviews/can-review/${contractId}?rateeId=some-user-id`);

      expect(res.status).toBe(200);
      expect(res.body.canRate).toBe(false);
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get(`/api/reviews/can-review/${contractId}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockCanUserReview.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get(`/api/reviews/can-review/${contractId}?rateeId=some-user-id`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('review-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/reviews', reviewRouter);
  });

  it('POST / missing fields', async () => {
    const res = await request(app).post('/api/reviews').send({});
    expect(res.status).toBe(400);
  });

  it('POST / success', async () => {
    mockReputationService.submitRating.mockResolvedValue(ok({ id: 'r1' }));
    const res = await request(app).post('/api/reviews').send({ contractId: 'c1', rating: 5, comment: 'Great!' });
    expect(res.status).toBe(201);
  });

  it('POST / NOT_FOUND returns 404', async () => {
    mockReputationService.submitRating.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).post('/api/reviews').send({ contractId: 'c1', rating: 5, comment: 'Great!' });
    expect(res.status).toBe(404);
  });

  it('POST / UNAUTHORIZED returns 403', async () => {
    mockReputationService.submitRating.mockResolvedValue(fail('UNAUTHORIZED', 'No'));
    const res = await request(app).post('/api/reviews').send({ contractId: 'c1', rating: 5, comment: 'Great!' });
    expect(res.status).toBe(403);
  });

  it('POST / DUPLICATE_RATING returns 409', async () => {
    mockReputationService.submitRating.mockResolvedValue(fail('DUPLICATE_RATING', 'No'));
    const res = await request(app).post('/api/reviews').send({ contractId: 'c1', rating: 5, comment: 'Great!' });
    expect(res.status).toBe(409);
  });

  it('POST / other error returns 400', async () => {
    mockReputationService.submitRating.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).post('/api/reviews').send({ contractId: 'c1', rating: 5, comment: 'Great!' });
    expect(res.status).toBe(400);
  });

  it('GET /:id NOT_FOUND returns 404', async () => {
    mockReputationService.getReviewById.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).get('/api/reviews/r1');
    expect(res.status).toBe(404);
  });

  it('GET /:id other error returns 400', async () => {
    mockReputationService.getReviewById.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/reviews/r1');
    expect(res.status).toBe(400);
  });

  it('GET /user/:userId error', async () => {
    mockReputationService.getUserReviews.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/reviews/user/u1');
    expect(res.status).toBe(400);
  });

  it('GET /project/:projectId error', async () => {
    mockReputationService.getProjectReviews.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/reviews/project/p1');
    expect(res.status).toBe(400);
  });

  it('GET /can-review/:contractId missing rateeId', async () => {
    const res = await request(app).get('/api/reviews/can-review/c1');
    expect(res.status).toBe(400);
  });

  it('GET /can-review/:contractId success', async () => {
    mockReputationService.canUserRate.mockResolvedValue(ok({ canRate: true }));
    const res = await request(app).get('/api/reviews/can-review/c1?rateeId=u2');
    expect(res.status).toBe(200);
  });

  it('GET /can-review/:contractId error', async () => {
    mockReputationService.canUserRate.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/reviews/can-review/c1?rateeId=u2');
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// Param extraction tests
// ═══════════════════════════════════════════════════════════════

describe('review-routes - param extraction', () => {
  let app: any;
  const mockGetReviewById = jest.fn<any>();
  const mockGetUserReviews = jest.fn<any>();
  const mockGetProjectReviews = jest.fn<any>();
  const mockCanUserRate = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
      submitRating: jest.fn(),
      getReviewById: mockGetReviewById,
      getUserReviews: mockGetUserReviews,
      getProjectReviews: mockGetProjectReviews,
      canUserRate: mockCanUserRate,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/review-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/reviews', router);
    jest.clearAllMocks();
  });

  it('L69: GET /:id extracts reviewId from params', async () => {
    mockGetReviewById.mockResolvedValueOnce({ success: true, data: { id: 'review-1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/review-1');
    expect(res.status).toBe(200);
    expect(mockGetReviewById).toHaveBeenCalledWith('review-1');
  });

  it('L88: GET /user/:userId extracts userId from params', async () => {
    mockGetUserReviews.mockResolvedValueOnce({ success: true, data: [] });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/user/user-1');
    expect(res.status).toBe(200);
    expect(mockGetUserReviews).toHaveBeenCalledWith('user-1');
  });

  it('L106: GET /project/:projectId extracts projectId from params', async () => {
    mockGetProjectReviews.mockResolvedValueOnce({ success: true, data: [] });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/project/proj-1');
    expect(res.status).toBe(200);
    expect(mockGetProjectReviews).toHaveBeenCalledWith('proj-1');
  });

  it('L125: GET /can-review/:contractId extracts contractId from params', async () => {
    mockCanUserRate.mockResolvedValueOnce({ success: true, data: { canRate: true } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/can-review/contract-1?rateeId=user-2');
    expect(res.status).toBe(200);
    expect(mockCanUserRate).toHaveBeenCalledWith('user-1', 'user-2', 'contract-1');
  });
});

describe('review-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockGetReviewById = jest.fn<any>();
  const mockGetUserReviews = jest.fn<any>();
  const mockGetProjectReviews = jest.fn<any>();
  const mockCanUserRate = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
      submitRating: jest.fn(),
      getReviewById: mockGetReviewById,
      getUserReviews: mockGetUserReviews,
      getProjectReviews: mockGetProjectReviews,
      canUserRate: mockCanUserRate,
      getReputation: jest.fn(),
      getWorkHistory: jest.fn(),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/review-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/reviews', router);
    jest.clearAllMocks();
  });

  it('L69: GET /:id', async () => {
    mockGetReviewById.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/r1');
    expect(res.status).toBe(200);
  });

  it('L88: GET /user/:userId', async () => {
    mockGetUserReviews.mockResolvedValueOnce({ success: true, data: [] });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/user/user-1');
    expect(res.status).toBe(200);
  });

  it('L106: GET /project/:projectId', async () => {
    mockGetProjectReviews.mockResolvedValueOnce({ success: true, data: [] });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/project/p1');
    expect(res.status).toBe(200);
  });

  it('L125: GET /can-review/:contractId', async () => {
    mockCanUserRate.mockResolvedValueOnce({ success: true, data: { canReview: true } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/can-review/c1?rateeId=u2');
    expect(res.status).toBe(200);
  });

  // Error branch tests
  it('L69: GET /:id NOT_FOUND returns 404', async () => {
    mockGetReviewById.mockResolvedValueOnce({ success: false, error: { code: 'NOT_FOUND', message: 'Review not found' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/r1');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('L69: GET /:id generic error returns 400', async () => {
    mockGetReviewById.mockResolvedValueOnce({ success: false, error: { code: 'DB_ERROR', message: 'Database error' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/r1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DB_ERROR');
  });

  it('L88: GET /user/:userId returns 400 on failure', async () => {
    mockGetUserReviews.mockResolvedValueOnce({ success: false, error: { code: 'ERROR', message: 'Failed' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/user/user-1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ERROR');
  });

  it('L106: GET /project/:projectId returns 400 on failure', async () => {
    mockGetProjectReviews.mockResolvedValueOnce({ success: false, error: { code: 'ERROR', message: 'Failed' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/project/p1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ERROR');
  });

  it('L125: GET /can-review/:contractId returns 400 on failure', async () => {
    mockCanUserRate.mockResolvedValueOnce({ success: false, error: { code: 'ERROR', message: 'Failed' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/reviews/can-review/c1?rateeId=u2');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ERROR');
  });
});
