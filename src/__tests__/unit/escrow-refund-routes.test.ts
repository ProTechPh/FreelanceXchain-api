// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateRefundRequest = jest.fn<any>();
const mockApproveRefund = jest.fn<any>();
const mockRejectRefund = jest.fn<any>();
const mockGetContractRefunds = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/escrow-refund-service.ts'), () => ({
  createRefundRequest: mockCreateRefundRequest,
  approveRefund: mockApproveRefund,
  rejectRefund: mockRejectRefund,
  getContractRefunds: mockGetContractRefunds,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', id: 'user-1', role: 'employer' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const router = (await import('../../routes/escrow-refund-routes.js')).default;

describe('Escrow Refund Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/escrow', router);
  });

  describe('POST /:contractId/refund-request', () => {
    it('should create a refund request on success', async () => {
      mockCreateRefundRequest.mockResolvedValue({
        success: true,
        data: { id: 'refund-1', contractId: 'contract-1', status: 'pending' },
      });
      const res = await request(app)
        .post('/api/escrow/contract-1/refund-request')
        .send({ reason: 'Work not delivered', amount: 500 });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('refund-1');
    });

    it('should return 400 when reason is missing', async () => {
      const res = await request(app)
        .post('/api/escrow/contract-1/refund-request')
        .send({ amount: 500 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Refund reason is required');
    });

    it('should return 400 on service failure', async () => {
      mockCreateRefundRequest.mockResolvedValue({
        success: false,
        error: { message: 'Contract not found' },
      });
      const res = await request(app)
        .post('/api/escrow/contract-1/refund-request')
        .send({ reason: 'Not delivered' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:contractId/refunds', () => {
    it('should return contract refunds on success', async () => {
      mockGetContractRefunds.mockResolvedValue({
        success: true,
        data: [{ id: 'refund-1', status: 'pending' }],
      });
      const res = await request(app).get('/api/escrow/contract-1/refunds');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 400 on service failure', async () => {
      mockGetContractRefunds.mockResolvedValue({
        success: false,
        error: { message: 'Failed to get refunds' },
      });
      const res = await request(app).get('/api/escrow/contract-1/refunds');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /refunds/:refundId/approve', () => {
    it('should approve refund on success', async () => {
      mockApproveRefund.mockResolvedValue({
        success: true,
        data: { id: 'refund-1', status: 'approved' },
      });
      const res = await request(app).post('/api/escrow/refunds/refund-1/approve');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
    });

    it('should return 400 on service failure', async () => {
      mockApproveRefund.mockResolvedValue({
        success: false,
        error: { message: 'Cannot approve' },
      });
      const res = await request(app).post('/api/escrow/refunds/refund-1/approve');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /refunds/:refundId/reject', () => {
    it('should reject refund on success', async () => {
      mockRejectRefund.mockResolvedValue({
        success: true,
        data: { id: 'refund-1', status: 'rejected' },
      });
      const res = await request(app)
        .post('/api/escrow/refunds/refund-1/reject')
        .send({ reason: 'Work was delivered' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('rejected');
    });

    it('should return 400 when reason is missing', async () => {
      const res = await request(app)
        .post('/api/escrow/refunds/refund-1/reject')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Rejection reason is required');
    });

    it('should return 400 on service failure', async () => {
      mockRejectRefund.mockResolvedValue({
        success: false,
        error: { message: 'Cannot reject' },
      });
      const res = await request(app)
        .post('/api/escrow/refunds/refund-1/reject')
        .send({ reason: 'Valid reason' });
      expect(res.status).toBe(400);
    });
  });
});
