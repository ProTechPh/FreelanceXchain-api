// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSubmitAppRating = jest.fn() as any;
const mockGetRatingEligibility = jest.fn() as any;
const mockListAppRatings = jest.fn() as any;
const mockGetAppRatingSummary = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/app-rating-service.ts'), () => ({
  submitAppRating: mockSubmitAppRating,
  getRatingEligibility: mockGetRatingEligibility,
  listAppRatings: mockListAppRatings,
  getAppRatingSummary: mockGetAppRatingSummary,
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

const appRatingRouter = (await import('../../routes/app-rating-routes.js')).default;

const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });

describe('App Rating Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/app-ratings', appRatingRouter);
  });

  describe('POST /', () => {
    it('accepts a rating with no comment', async () => {
      mockSubmitAppRating.mockResolvedValue(ok({ id: 'rating-1', rating: 4 }));

      const res = await request(app).post('/api/app-ratings').send({ rating: 4, source: 'manual' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'rating-1', rating: 4 });
      expect(mockSubmitAppRating).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', userRole: 'freelancer', rating: 4, source: 'manual' })
      );
    });

    it('passes the comment and context through', async () => {
      mockSubmitAppRating.mockResolvedValue(ok({ id: 'rating-2' }));

      await request(app).post('/api/app-ratings').send({
        rating: 5, comment: 'Smooth escrow release.', source: 'contract_completed', contextId: 'contract-1',
      });

      expect(mockSubmitAppRating).toHaveBeenCalledWith(
        expect.objectContaining({ comment: 'Smooth escrow release.', contextId: 'contract-1' })
      );
    });

    it('rejects a body the schema does not allow', async () => {
      const res = await request(app).post('/api/app-ratings').send({ rating: 9, source: 'manual' });

      expect(res.status).toBe(400);
      expect(mockSubmitAppRating).not.toHaveBeenCalled();
    });

    it('rejects an unknown source before reaching the service', async () => {
      const res = await request(app).post('/api/app-ratings').send({ rating: 3, source: 'made_up' });

      expect(res.status).toBe(400);
      expect(mockSubmitAppRating).not.toHaveBeenCalled();
    });

    it('401s when the request carries no user', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => { req.user = undefined; next(); });

      const res = await request(app).post('/api/app-ratings').send({ rating: 4, source: 'manual' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it.each([
      ['INVALID_RATING', 400],
      ['INVALID_SOURCE', 400],
      ['COMMENT_TOO_LONG', 400],
      ['RATE_LIMITED', 429],
      ['DUPLICATE_RATING', 409],
      ['SUBMIT_FAILED', 500],
    ])('maps %s to %i', async (code, status) => {
      mockSubmitAppRating.mockResolvedValue(fail(code, 'nope'));

      const res = await request(app).post('/api/app-ratings').send({ rating: 4, source: 'manual' });

      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe(code);
    });
  });

  describe('GET /eligibility', () => {
    it('returns the eligibility payload', async () => {
      mockGetRatingEligibility.mockResolvedValue(ok({ shouldPrompt: true }));

      const res = await request(app).get('/api/app-ratings/eligibility');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ shouldPrompt: true });
    });

    it('401s without a user', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => { req.user = undefined; next(); });

      const res = await request(app).get('/api/app-ratings/eligibility');

      expect(res.status).toBe(401);
    });

    it('surfaces a service failure', async () => {
      mockGetRatingEligibility.mockResolvedValue(fail('SUMMARY_FAILED', 'boom'));

      const res = await request(app).get('/api/app-ratings/eligibility');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /admin', () => {
    it('returns the attributed list', async () => {
      mockListAppRatings.mockResolvedValue(ok({ ratings: [], total: 0 }));

      const res = await request(app).get('/api/app-ratings/admin');

      expect(res.status).toBe(200);
      expect(mockListAppRatings).toHaveBeenCalledWith({ source: undefined });
    });

    it('forwards the source and rating filters', async () => {
      mockListAppRatings.mockResolvedValue(ok({ ratings: [], total: 0 }));

      await request(app).get('/api/app-ratings/admin?source=manual&rating=5');

      expect(mockListAppRatings).toHaveBeenCalledWith({ source: 'manual', rating: 5 });
    });

    it('ignores a rating filter that is not a number', async () => {
      mockListAppRatings.mockResolvedValue(ok({ ratings: [], total: 0 }));

      await request(app).get('/api/app-ratings/admin?rating=abc');

      expect(mockListAppRatings).toHaveBeenCalledWith({ source: undefined });
    });

    it('surfaces a listing failure', async () => {
      mockListAppRatings.mockResolvedValue(fail('LIST_FAILED', 'boom'));

      const res = await request(app).get('/api/app-ratings/admin');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /admin/summary', () => {
    it('returns the summary', async () => {
      mockGetAppRatingSummary.mockResolvedValue(ok({ total: 3, average: 4.3 }));

      const res = await request(app).get('/api/app-ratings/admin/summary');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ total: 3, average: 4.3 });
    });

    it('surfaces a summary failure', async () => {
      mockGetAppRatingSummary.mockResolvedValue(fail('SUMMARY_FAILED', 'boom'));

      const res = await request(app).get('/api/app-ratings/admin/summary');

      expect(res.status).toBe(500);
    });
  });
});
