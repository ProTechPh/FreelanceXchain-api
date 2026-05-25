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
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const reviewRouter = (await import('../../routes/review-routes.js')).default;

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

      const res = await request(app).get(`/api/reviews/can-review/${contractId}`);

      expect(res.status).toBe(200);
      expect(res.body.canRate).toBe(true);
      expect(mockCanUserReview).toHaveBeenCalledWith('user-1', 'user-1', contractId);
    });

    it('should return false when user cannot review', async () => {
      mockCanUserReview.mockResolvedValue({ success: true, data: { canRate: false, reason: 'Already reviewed' } });

      const res = await request(app).get(`/api/reviews/can-review/${contractId}`);

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

      const res = await request(app).get(`/api/reviews/can-review/${contractId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });
});
