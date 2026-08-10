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
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
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
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Refund reason is required');
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
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Rejection reason is required');
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


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

function makeApp(basePath: string, r: any) {
  const a = express();
  a.use(express.json());
  a.use(basePath, r);
  return a;
}
const escrowRefundRouter = router;
const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });
const mockEscrowRefundService = {
  createRefundRequest: mockCreateRefundRequest,
  approveRefund: mockApproveRefund,
  rejectRefund: mockRejectRefund,
  getContractRefunds: mockGetContractRefunds,
};

describe('escrow-refund-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/escrow', escrowRefundRouter);
  });

  it('POST refund-request missing reason', async () => {
    const res = await request(app).post('/api/escrow/c1/refund-request').send({});
    expect(res.status).toBe(400);
  });

  it('POST refund-request service error', async () => {
    mockEscrowRefundService.createRefundRequest.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).post('/api/escrow/c1/refund-request').send({ reason: 'test' });
    expect(res.status).toBe(400);
  });

  it('GET refunds success', async () => {
    mockEscrowRefundService.getContractRefunds.mockResolvedValue(ok([]));
    const res = await request(app).get('/api/escrow/c1/refunds');
    expect(res.status).toBe(200);
  });

  it('GET refunds service error', async () => {
    mockEscrowRefundService.getContractRefunds.mockResolvedValue(fail('DB_ERROR', 'Failed'));
    const res = await request(app).get('/api/escrow/c1/refunds');
    expect(res.status).toBe(400);
  });

  it('POST approve refund success', async () => {
    mockEscrowRefundService.approveRefund.mockResolvedValue(ok({ status: 'approved' }));
    const res = await request(app).post('/api/escrow/refunds/r1/approve');
    expect(res.status).toBe(200);
  });

  it('POST approve refund error', async () => {
    mockEscrowRefundService.approveRefund.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).post('/api/escrow/refunds/r1/approve');
    expect(res.status).toBe(400);
  });

  it('POST reject refund missing reason', async () => {
    const res = await request(app).post('/api/escrow/refunds/r1/reject').send({});
    expect(res.status).toBe(400);
  });

  it('POST reject refund success', async () => {
    mockEscrowRefundService.rejectRefund.mockResolvedValue(ok({ status: 'rejected' }));
    const res = await request(app).post('/api/escrow/refunds/r1/reject').send({ reason: 'test' });
    expect(res.status).toBe(200);
  });

  it('POST reject refund error', async () => {
    mockEscrowRefundService.rejectRefund.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).post('/api/escrow/refunds/r1/reject').send({ reason: 'test' });
    expect(res.status).toBe(400);
  });
});

describe('escrow-refund-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockCreateRefundRequest = jest.fn<any>();
  const mockGetContractRefunds = jest.fn<any>();
  const mockApproveRefund = jest.fn<any>();
  const mockRejectRefund = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/escrow-refund-service.ts'), () => ({
      createRefundRequest: mockCreateRefundRequest,
      getContractRefunds: mockGetContractRefunds,
      approveRefund: mockApproveRefund,
      rejectRefund: mockRejectRefund,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/escrow-refund-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/escrow', router);
    jest.clearAllMocks();
  });

  it('L48: POST refund-request', async () => {
    mockCreateRefundRequest.mockResolvedValueOnce({ success: true, data: { id: 'r1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/c1/refund-request').send({ amount: 100, reason: 'Test' });
    expect(res.status).toBe(200);
  });

  it('L93: GET refunds', async () => {
    mockGetContractRefunds.mockResolvedValueOnce({ success: true, data: [] });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/escrow/c1/refunds');
    expect(res.status).toBe(200);
  });

  it('L128: POST approve refund', async () => {
    mockApproveRefund.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/refunds/r1/approve');
    expect(res.status).toBe(200);
  });

  it('L142: POST approve refund catch', async () => {
    mockApproveRefund.mockRejectedValueOnce(new Error('Boom'));
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/refunds/r1/approve');
    expect(res.status).toBe(500);
  });

  it('L177: POST reject refund', async () => {
    mockRejectRefund.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/refunds/r1/reject').send({ reason: 'No' });
    expect(res.status).toBe(200);
  });

  it('L197: POST reject refund catch', async () => {
    mockRejectRefund.mockRejectedValueOnce(new Error('Boom'));
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/refunds/r1/reject').send({ reason: 'No' });
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════
// Catch block tests for POST refund-request and GET refunds
// ═══════════════════════════════════════════════════════════════

describe('escrow-refund-routes - catch blocks for refund-request and refunds', () => {
  let app: any;
  const mockCreateRefundRequest = jest.fn<any>();
  const mockGetContractRefunds = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/escrow-refund-service.ts'), () => ({
      createRefundRequest: mockCreateRefundRequest,
      getContractRefunds: mockGetContractRefunds,
      approveRefund: jest.fn(),
      rejectRefund: jest.fn(),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/escrow-refund-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/escrow', router);
    jest.clearAllMocks();
  });

  it('L69-70: POST refund-request catch block returns 500', async () => {
    mockCreateRefundRequest.mockRejectedValueOnce(new Error('DB crash'));
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/c1/refund-request').send({ reason: 'Test' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Failed to create refund request');
  });

  it('L104-105: GET refunds catch block returns 500', async () => {
    mockGetContractRefunds.mockRejectedValueOnce(new Error('DB crash'));
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/escrow/c1/refunds');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Failed to get refunds');
  });
});

// ═══════════════════════════════════════════════════════════════
// instanceof Error false branch tests
// ═══════════════════════════════════════════════════════════════

describe('escrow-refund-routes - instanceof Error false branch', () => {
  let app: any;
  const localCreateRefund = jest.fn<any>();
  const localApproveRefund = jest.fn<any>();
  const localRejectRefund = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/escrow-refund-service.ts'), () => ({
      createRefundRequest: localCreateRefund,
      approveRefund: localApproveRefund,
      rejectRefund: localRejectRefund,
      getContractRefunds: jest.fn(),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/escrow-refund-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/escrow', router);
    jest.clearAllMocks();
  });

  it('L69: POST refund-request catch with non-Error uses String(error)', async () => {
    localCreateRefund.mockRejectedValueOnce('string error');
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/c1/refund-request').send({ reason: 'test' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Failed to create refund request');
  });

  it('L142: POST approve catch with non-Error uses String(error)', async () => {
    localApproveRefund.mockRejectedValueOnce(42);
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/refunds/r1/approve');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Failed to approve refund');
  });

  it('L197: POST reject catch with non-Error uses String(error)', async () => {
    localRejectRefund.mockRejectedValueOnce({ custom: 'error' });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/refunds/r1/reject').send({ reason: 'test' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Failed to reject refund');
  });
});

// ═══════════════════════════════════════════════════════════════
// ?? nullish coalescing fallback branch tests
// ═══════════════════════════════════════════════════════════════

describe('escrow-refund-routes - ?? nullish fallback branches', () => {
  let app: any;
  const localCreateRefund = jest.fn<any>();
  const localGetRefunds = jest.fn<any>();
  const localApproveRefund = jest.fn<any>();
  const localRejectRefund = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { id: 'user-1', role: 'employer' };
        for (const key of Object.keys(req.params)) delete req.params[key];
        next();
      },
      requireRole: () => (_req: any, _res: any, next: any) => next(),
      requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/escrow-refund-service.ts'), () => ({
      createRefundRequest: localCreateRefund,
      approveRefund: localApproveRefund,
      rejectRefund: localRejectRefund,
      getContractRefunds: localGetRefunds,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/escrow-refund-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/escrow', router);
    jest.clearAllMocks();
  });

  it('L48-49: POST refund-request with nullish contractId and userId', async () => {
    localCreateRefund.mockResolvedValueOnce({ success: true, data: { id: 'r1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/c1/refund-request').send({ reason: 'test' });
    expect(res.status).toBe(200);
  });

  it('L93-94: GET refunds with nullish contractId and userId', async () => {
    localGetRefunds.mockResolvedValueOnce({ success: true, data: [] });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/escrow/c1/refunds');
    expect(res.status).toBe(200);
  });

  it('L128-129: POST approve with nullish refundId and userId', async () => {
    localApproveRefund.mockResolvedValueOnce({ success: true, data: { id: 'r1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/refunds/r1/approve');
    expect(res.status).toBe(200);
  });

  it('L177-178: POST reject with nullish refundId and userId', async () => {
    localRejectRefund.mockResolvedValueOnce({ success: true, data: { id: 'r1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/escrow/refunds/r1/reject').send({ reason: 'test' });
    expect(res.status).toBe(200);
  });
});
