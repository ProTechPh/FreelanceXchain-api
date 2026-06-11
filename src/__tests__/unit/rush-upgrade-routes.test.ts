// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockRequestRushUpgrade = jest.fn<any>();
const mockRespondToRushUpgrade = jest.fn<any>();
const mockAcceptCounterOffer = jest.fn<any>();
const mockDeclineCounterOffer = jest.fn<any>();
const mockGetRushUpgradeRequestsByContract = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/rush-upgrade-service.ts'), () => ({
  requestRushUpgrade: mockRequestRushUpgrade,
  respondToRushUpgrade: mockRespondToRushUpgrade,
  acceptCounterOffer: mockAcceptCounterOffer,
  declineCounterOffer: mockDeclineCounterOffer,
  getRushUpgradeRequestsByContract: mockGetRushUpgradeRequestsByContract,
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
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const router = (await import('../../routes/rush-upgrade-routes.js')).default;

describe('Rush Upgrade Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api', router);
  });

  describe('POST /contracts/:id/rush-upgrade', () => {
    it('should create rush upgrade request on success', async () => {
      mockRequestRushUpgrade.mockResolvedValue({
        success: true,
        data: { id: 'rush-1', contractId: 'c-1', proposedPercentage: 15, status: 'pending' },
      });
      const res = await request(app)
        .post('/api/contracts/c-1/rush-upgrade')
        .send({ proposedPercentage: 15 });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('rush-1');
    });

    it('should return 400 on invalid percentage', async () => {
      const res = await request(app)
        .post('/api/contracts/c-1/rush-upgrade')
        .send({ proposedPercentage: 0 });
      expect(res.status).toBe(400);
    });

    it('should return 400 on missing percentage', async () => {
      const res = await request(app)
        .post('/api/contracts/c-1/rush-upgrade')
        .send({});
      expect(res.status).toBe(400);
    });

    it('should return 404 when contract not found', async () => {
      mockRequestRushUpgrade.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contract not found' },
      });
      const res = await request(app)
        .post('/api/contracts/c-1/rush-upgrade')
        .send({ proposedPercentage: 15 });
      expect(res.status).toBe(404);
    });

    it('should return 409 when pending request exists', async () => {
      mockRequestRushUpgrade.mockResolvedValue({
        success: false,
        error: { code: 'PENDING_REQUEST_EXISTS', message: 'Already pending' },
      });
      const res = await request(app)
        .post('/api/contracts/c-1/rush-upgrade')
        .send({ proposedPercentage: 15 });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /rush-upgrade-requests/:id/respond', () => {
    it('should respond to rush upgrade on success (accept)', async () => {
      mockRespondToRushUpgrade.mockResolvedValue({
        success: true,
        data: { id: 'rush-1', status: 'accepted' },
      });
      const res = await request(app)
        .post('/api/rush-upgrade-requests/rush-1/respond')
        .send({ action: 'accept' });
      expect(res.status).toBe(200);
    });

    it('should respond with counter offer', async () => {
      mockRespondToRushUpgrade.mockResolvedValue({
        success: true,
        data: { id: 'rush-1', status: 'counter_offered' },
      });
      const res = await request(app)
        .post('/api/rush-upgrade-requests/rush-1/respond')
        .send({ action: 'counter_offer', counterPercentage: 20 });
      expect(res.status).toBe(200);
    });

    it('should return 400 on invalid action', async () => {
      const res = await request(app)
        .post('/api/rush-upgrade-requests/rush-1/respond')
        .send({ action: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when counter_offer missing percentage', async () => {
      const res = await request(app)
        .post('/api/rush-upgrade-requests/rush-1/respond')
        .send({ action: 'counter_offer' });
      expect(res.status).toBe(400);
    });

    it('should return 404 when request not found', async () => {
      mockRespondToRushUpgrade.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app)
        .post('/api/rush-upgrade-requests/rush-1/respond')
        .send({ action: 'accept' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /rush-upgrade-requests/:id/accept-counter', () => {
    it('should accept counter offer on success', async () => {
      mockAcceptCounterOffer.mockResolvedValue({
        success: true,
        data: { id: 'rush-1', status: 'accepted' },
      });
      const res = await request(app).post('/api/rush-upgrade-requests/rush-1/accept-counter');
      expect(res.status).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockAcceptCounterOffer.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).post('/api/rush-upgrade-requests/rush-1/accept-counter');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /rush-upgrade-requests/:id/decline-counter', () => {
    it('should decline counter offer on success', async () => {
      mockDeclineCounterOffer.mockResolvedValue({
        success: true,
        data: { id: 'rush-1', status: 'declined' },
      });
      const res = await request(app).post('/api/rush-upgrade-requests/rush-1/decline-counter');
      expect(res.status).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockDeclineCounterOffer.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).post('/api/rush-upgrade-requests/rush-1/decline-counter');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /contracts/:id/rush-upgrade-requests', () => {
    it('should return rush upgrade requests on success', async () => {
      mockGetRushUpgradeRequestsByContract.mockResolvedValue({
        success: true,
        data: [{ id: 'rush-1', status: 'pending' }],
      });
      const res = await request(app).get('/api/contracts/c-1/rush-upgrade-requests');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 400 on service failure', async () => {
      mockGetRushUpgradeRequestsByContract.mockResolvedValue({
        success: false,
        error: { code: 'ERROR', message: 'Failed' },
      });
      const res = await request(app).get('/api/contracts/c-1/rush-upgrade-requests');
      expect(res.status).toBe(400);
    });
  });
});
