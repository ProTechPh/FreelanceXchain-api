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

describe('Payment Routes - Coverage2', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { userId: 'user-1', role: 'employer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/payments', router);
  });

  // Lines 365-366: reason validation in dispute endpoint
  describe('POST /milestones/:milestoneId/dispute - reason validation', () => {
    it('should return 400 when reason is missing', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute?contractId=c-1')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('reason');
    });

    it('should return 400 when reason is not a string', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute?contractId=c-1')
        .send({ reason: 123 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // Lines 424-460: GET /contracts/:contractId/status - admin bypass path
  describe('GET /contracts/:contractId/status - admin bypass', () => {
    it('should return 401 when userId is missing', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = {};
        next();
      });

      const res = await request(app).get('/api/payments/contracts/c-1/status');
      expect(res.status).toBe(401);
    });

    it('should use admin bypass when UNAUTHORIZED and user is admin', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'admin-1', role: 'admin' };
        next();
      });

      mockGetContractPaymentStatus.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized' },
      });

      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', projectId: 'p-1', totalAmount: 1000, escrowAddress: '0x123', status: 'active' },
      });

      mockGetProjectById.mockResolvedValue({
        success: true,
        data: {
          milestones: [
            { id: 'm1', title: 'MS1', amount: 500, status: 'approved' },
            { id: 'm2', title: 'MS2', amount: 500, status: 'pending' },
          ],
        },
      });

      const res = await request(app).get('/api/payments/contracts/c-1/status');
      expect(res.status).toBe(200);
      expect(res.body.contractId).toBe('c-1');
      expect(res.body.releasedAmount).toBe(500);
    });

    it('should fall through to error when admin bypass fails (contract not found)', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'admin-1', role: 'admin' };
        next();
      });

      mockGetContractPaymentStatus.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized' },
      });

      mockGetContractById.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND' } });

      const res = await request(app).get('/api/payments/contracts/c-1/status');
      expect(res.status).toBe(403);
    });

    it('should fall through to error when admin bypass fails (project not found)', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { userId: 'admin-1', role: 'admin' };
        next();
      });

      mockGetContractPaymentStatus.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized' },
      });

      mockGetContractById.mockResolvedValue({
        success: true,
        data: { id: 'c-1', projectId: 'p-1', totalAmount: 1000, escrowAddress: '0x123', status: 'active' },
      });

      mockGetProjectById.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND' } });

      const res = await request(app).get('/api/payments/contracts/c-1/status');
      expect(res.status).toBe(403);
    });

    // Lines 470-471: error handling (next(error))
    it('should pass errors to next middleware', async () => {
      mockGetContractPaymentStatus.mockRejectedValue(new Error('DB error'));

      const res = await request(app).get('/api/payments/contracts/c-1/status');
      expect(res.status).toBe(500);
    });

    it('should return 404 when NOT_FOUND error', async () => {
      mockGetContractPaymentStatus.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contract not found' },
      });

      const res = await request(app).get('/api/payments/contracts/c-1/status');
      expect(res.status).toBe(404);
    });
  });
});
