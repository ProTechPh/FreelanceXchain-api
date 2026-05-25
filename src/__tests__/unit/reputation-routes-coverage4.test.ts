// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSubmitRating = jest.fn<any>();
const mockGetReputation = jest.fn<any>();
const mockGetWorkHistory = jest.fn<any>();
const mockCanUserRate = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  submitRating: mockSubmitRating,
  getReputation: mockGetReputation,
  getWorkHistory: mockGetWorkHistory,
  canUserRate: mockCanUserRate,
}));

const mockGetAggregatedScore = jest.fn<any>();
const mockGetReputationBreakdown = jest.fn<any>();
const mockGetReputationHistory = jest.fn<any>();
const mockGetReputationLeaderboard = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/reputation-aggregation-service.ts'), () => ({
  getAggregatedScore: mockGetAggregatedScore,
  getReputationBreakdown: mockGetReputationBreakdown,
  getReputationHistory: mockGetReputationHistory,
  getReputationLeaderboard: mockGetReputationLeaderboard,
}));

const mockAuthMiddleware = jest.fn<any>();
const mockIsValidUUID = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn((fields?: string[]) => (req: any, res: any, next: any) => {
    // Simulate real validateUUID: skip route for non-UUID params so /leaderboard falls through
    if (fields) {
      for (const field of fields) {
        const value = req.params[field];
        if (value && !/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value)) {
          return next('route');
        }
      }
    }
    next();
  }),
  isValidUUID: mockIsValidUUID,
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn(), security: jest.fn() },
}));

const router = (await import('../../routes/reputation-routes.js')).default;

describe('Reputation Routes - Coverage4', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsValidUUID.mockReturnValue(true);
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer', email: 'user@test.com' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/reputation', router);
  });

  describe('GET /:userId - lines 352-358', () => {
    it('should return 400 when getReputation fails', async () => {
      mockGetReputation.mockResolvedValue({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });

      const res = await request(app).get('/api/reputation/11111111-1111-1111-1111-111111111111');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 200 when getReputation succeeds', async () => {
      mockGetReputation.mockResolvedValue({
        success: true,
        data: { userId: '11111111-1111-1111-1111-111111111111', score: 4.5, totalRatings: 10 },
      });

      const res = await request(app).get('/api/reputation/11111111-1111-1111-1111-111111111111');
      expect(res.status).toBe(200);
      expect(res.body.score).toBe(4.5);
    });
  });

  describe('GET /:userId/history - lines 409-415', () => {
    it('should return 400 when getWorkHistory fails', async () => {
      mockGetWorkHistory.mockResolvedValue({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });

      const res = await request(app).get('/api/reputation/11111111-1111-1111-1111-111111111111/history');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 200 when getWorkHistory succeeds', async () => {
      mockGetWorkHistory.mockResolvedValue({
        success: true,
        data: [{ projectId: 'p-1', rating: 5 }],
      });

      const res = await request(app).get('/api/reputation/11111111-1111-1111-1111-111111111111/history');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /leaderboard - lines 449-462', () => {
    it('should return 400 when getReputationLeaderboard fails', async () => {
      mockGetReputationLeaderboard.mockResolvedValue({
        success: false,
        error: { message: 'Failed to get leaderboard' },
      });

      const res = await request(app).get('/api/reputation/leaderboard');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Failed to get leaderboard');
    });

    it('should return 200 with leaderboard data', async () => {
      mockGetReputationLeaderboard.mockResolvedValue({
        success: true,
        data: [{ userId: 'user-1', score: 5.0 }],
      });

      const res = await request(app).get('/api/reputation/leaderboard');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ userId: 'user-1', score: 5.0 }]);
    });

    it('should use custom limit from query param', async () => {
      mockGetReputationLeaderboard.mockResolvedValue({
        success: true,
        data: [],
      });

      const res = await request(app).get('/api/reputation/leaderboard?limit=5');
      expect(res.status).toBe(200);
      expect(mockGetReputationLeaderboard).toHaveBeenCalledWith(5);
    });

    it('should return 500 when leaderboard throws an error', async () => {
      mockGetReputationLeaderboard.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/reputation/leaderboard');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to get leaderboard');
    });
  });
});
