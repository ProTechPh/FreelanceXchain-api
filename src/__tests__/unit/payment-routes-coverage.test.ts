// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockRequestMilestoneCompletion = jest.fn<any>();
const mockApproveMilestone = jest.fn<any>();
const mockGetContractPaymentStatus = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
  requestMilestoneCompletion: mockRequestMilestoneCompletion,
  approveMilestone: mockApproveMilestone,
  getContractPaymentStatus: mockGetContractPaymentStatus,
}));

const mockCreateDispute = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/dispute-service.ts'), () => ({
  createDispute: mockCreateDispute,
}));

const mockGetContractById = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/contract-service.ts'), () => ({
  getContractById: mockGetContractById,
}));

const mockGetProjectById = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  getProjectById: mockGetProjectById,
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapProjectFromEntity: (entity: any) => ({ ...entity, milestones: entity.milestones || [] }),
}));

const mockAuthMiddleware = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => mockAuthMiddleware(req, _res, next),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
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

const router = (await import('../../routes/payment-routes.js')).default;

describe('Payment Routes - Coverage Gaps', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/payments', router);
  });

  describe('POST /milestones/:milestoneId/complete - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/payments/milestones/ms-1/complete?contractId=c-1');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when contractId is missing', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/complete');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle service error', async () => {
      mockRequestMilestoneCompletion.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contract not found' },
      });

      const res = await request(app)
        .post('/api/payments/milestones/ms-1/complete?contractId=c-1');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /milestones/:milestoneId/approve - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/payments/milestones/ms-1/approve?contractId=c-1');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when contractId is missing', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/approve');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle service error', async () => {
      mockApproveMilestone.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized' },
      });

      const res = await request(app)
        .post('/api/payments/milestones/ms-1/approve?contractId=c-1');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /milestones/:milestoneId/dispute - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute?contractId=c-1')
        .send({ reason: 'Work not delivered' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when contractId is missing', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute')
        .send({ reason: 'Work not delivered' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when reason is missing', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute?contractId=c-1')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when reason is not a string', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute?contractId=c-1')
        .send({ reason: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle service error', async () => {
      mockCreateDispute.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contract not found' },
      });

      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute?contractId=c-1')
        .send({ reason: 'Work not delivered' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /contracts/:contractId/status - !userId branch', () => {
    it('should return 401 when userId is undefined', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .get('/api/payments/contracts/c-1/status');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should handle NOT_FOUND error', async () => {
      mockGetContractPaymentStatus.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contract not found' },
      });

      const res = await request(app)
        .get('/api/payments/contracts/c-1/status');

      expect(res.status).toBe(404);
    });

    it('should handle UNAUTHORIZED error for non-admin', async () => {
      mockGetContractPaymentStatus.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized' },
      });

      const res = await request(app)
        .get('/api/payments/contracts/c-1/status');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /milestones/:milestoneId/complete - catch block', () => {
    it('should pass error to next on exception', async () => {
      mockRequestMilestoneCompletion.mockRejectedValue(new Error('Unexpected error'));

      const res = await request(app)
        .post('/api/payments/milestones/ms-1/complete?contractId=c-1');

      expect(res.status).toBe(500);
    });
  });

  describe('POST /milestones/:milestoneId/approve - catch block', () => {
    it('should pass error to next on exception', async () => {
      mockApproveMilestone.mockRejectedValue(new Error('Unexpected error'));

      const res = await request(app)
        .post('/api/payments/milestones/ms-1/approve?contractId=c-1');

      expect(res.status).toBe(500);
    });
  });
});
