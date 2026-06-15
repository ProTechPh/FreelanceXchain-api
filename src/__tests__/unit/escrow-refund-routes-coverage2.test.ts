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

// Auth middleware that does NOT set userId (triggers ?? '' fallback)
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = {}; next(); },
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

const router = (await import('../../routes/escrow-refund-routes.js')).default;

describe('Escrow Refund Routes - userId ?? fallback coverage', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/escrow', router);
  });

  describe('POST /:contractId/refund-request - userId fallback when missing', () => {
    it('should use empty string fallback when userId is undefined', async () => {
      mockCreateRefundRequest.mockResolvedValue({
        success: true,
        data: { id: 'refund-1' },
      });

      const res = await request(app)
        .post('/api/escrow/contract-1/refund-request')
        .send({ reason: 'Work not delivered' });

      // The userId fallback should be '' (empty string)
      expect(mockCreateRefundRequest).toHaveBeenCalledWith(
        expect.objectContaining({ requestedBy: '' })
      );
    });
  });

  describe('GET /:contractId/refunds - userId fallback when missing', () => {
    it('should use empty string fallback when userId is undefined', async () => {
      mockGetContractRefunds.mockResolvedValue({
        success: true,
        data: [],
      });

      await request(app).get('/api/escrow/contract-1/refunds');

      expect(mockGetContractRefunds).toHaveBeenCalledWith('contract-1', '');
    });
  });

  describe('POST /refunds/:refundId/approve - userId fallback when missing', () => {
    it('should use empty string fallback when userId is undefined', async () => {
      mockApproveRefund.mockResolvedValue({
        success: true,
        data: { id: 'refund-1' },
      });

      await request(app).post('/api/escrow/refunds/refund-1/approve');

      expect(mockApproveRefund).toHaveBeenCalledWith(
        expect.objectContaining({ approvedBy: '' })
      );
    });
  });

  describe('POST /refunds/:refundId/reject - userId fallback when missing', () => {
    it('should use empty string fallback when userId is undefined', async () => {
      mockRejectRefund.mockResolvedValue({
        success: true,
        data: { id: 'refund-1' },
      });

      await request(app)
        .post('/api/escrow/refunds/refund-1/reject')
        .send({ reason: 'Valid reason' });

      expect(mockRejectRefund).toHaveBeenCalledWith(
        expect.objectContaining({ rejectedBy: '' })
      );
    });
  });
});
