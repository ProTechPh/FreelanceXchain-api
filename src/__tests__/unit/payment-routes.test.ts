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

const router = (await import('../../routes/payment-routes.js')).default;

const paymentRouter = router;
function makeApp(basePath: string, r: any) { const a = express(); a.use(express.json()); a.use(basePath, r); return a; }
const ok = (data: any) => ({ success: true, data });
const fail = (code: string, message: string) => ({ success: false, error: { code, message } });
const mockPaymentService = { requestMilestoneCompletion: mockRequestMilestoneCompletion, approveMilestone: mockApproveMilestone, getContractPaymentStatus: mockGetContractPaymentStatus };
const mockDisputeService = { createDispute: mockCreateDispute };

describe('Payment Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/payments', router);
  });

  describe('POST /milestones/:milestoneId/complete', () => {
    it('should mark milestone as complete on success', async () => {
      mockRequestMilestoneCompletion.mockResolvedValue({
        success: true,
        data: { milestoneId: 'ms-1', status: 'submitted', notificationSent: true },
      });
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/complete?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('submitted');
    });

    it('should return 400 when contractId is missing', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/complete');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when not found', async () => {
      mockRequestMilestoneCompletion.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Milestone not found' },
      });
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/complete?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /milestones/:milestoneId/approve', () => {
    it('should approve milestone on success', async () => {
      mockApproveMilestone.mockResolvedValue({
        success: true,
        data: { milestoneId: 'ms-1', status: 'approved', paymentReleased: true },
      });
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/approve?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
      expect(res.status).toBe(200);
      expect(res.body.paymentReleased).toBe(true);
    });

    it('should return 400 when contractId is missing', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/approve');
      expect(res.status).toBe(400);
    });

    it('should return 403 when unauthorized', async () => {
      mockApproveMilestone.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized' },
      });
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/approve?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /milestones/:milestoneId/dispute', () => {
    it('should create dispute on success', async () => {
      mockCreateDispute.mockResolvedValue({
        success: true,
        data: { id: 'dispute-1' },
      });
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
        .send({ reason: 'Work not satisfactory' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('disputed');
      expect(res.body.disputeId).toBe('dispute-1');
    });

    it('should return 400 when reason is missing', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')
        .send({});
      expect(res.status).toBe(400);
    });

    it('should return 400 when contractId is missing', async () => {
      const res = await request(app)
        .post('/api/payments/milestones/ms-1/dispute')
        .send({ reason: 'Bad work' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /contracts/:contractId/status', () => {
    it('should return contract payment status on success', async () => {
      mockGetContractPaymentStatus.mockResolvedValue({
        success: true,
        data: { contractId: 'c-1', totalAmount: 1000, releasedAmount: 500, pendingAmount: 500 },
      });
      const res = await request(app).get('/api/payments/contracts/c-1/status');
      expect(res.status).toBe(200);
      expect(res.body.totalAmount).toBe(1000);
    });

    it('should return 404 when contract not found', async () => {
      mockGetContractPaymentStatus.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contract not found' },
      });
      const res = await request(app).get('/api/payments/contracts/c-1/status');
      expect(res.status).toBe(404);
    });

    it('should return 403 when unauthorized', async () => {
      mockGetContractPaymentStatus.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized' },
      });
      const res = await request(app).get('/api/payments/contracts/c-1/status');
      expect(res.status).toBe(403);
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('payment-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/payments', paymentRouter);
  });

  it('POST /milestones/:milestoneId/complete missing contractId', async () => {
    const res = await request(app).post('/api/payments/milestones/m1/complete');
    expect(res.status).toBe(400);
  });

  it('POST /milestones/:milestoneId/complete NOT_FOUND returns 404', async () => {
    mockPaymentService.requestMilestoneCompletion.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).post('/api/payments/milestones/m1/complete?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(404);
  });

  it('POST /milestones/:milestoneId/complete UNAUTHORIZED returns 403', async () => {
    mockPaymentService.requestMilestoneCompletion.mockResolvedValue(fail('UNAUTHORIZED', 'No'));
    const res = await request(app).post('/api/payments/milestones/m1/complete?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(403);
  });

  it('POST /milestones/:milestoneId/complete other error returns 400', async () => {
    mockPaymentService.requestMilestoneCompletion.mockResolvedValue(fail('INVALID_STATUS', 'No'));
    const res = await request(app).post('/api/payments/milestones/m1/complete?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(400);
  });

  it('POST /milestones/:milestoneId/approve missing contractId', async () => {
    const res = await request(app).post('/api/payments/milestones/m1/approve');
    expect(res.status).toBe(400);
  });

  it('POST /milestones/:milestoneId/approve NOT_FOUND returns 404', async () => {
    mockPaymentService.approveMilestone.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).post('/api/payments/milestones/m1/approve?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(404);
  });

  it('POST /milestones/:milestoneId/approve UNAUTHORIZED returns 403', async () => {
    mockPaymentService.approveMilestone.mockResolvedValue(fail('UNAUTHORIZED', 'No'));
    const res = await request(app).post('/api/payments/milestones/m1/approve?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(403);
  });

  it('POST /milestones/:milestoneId/dispute missing contractId', async () => {
    const res = await request(app).post('/api/payments/milestones/m1/dispute').send({ reason: 'Bad work' });
    expect(res.status).toBe(400);
  });

  it('POST /milestones/:milestoneId/dispute missing reason', async () => {
    const res = await request(app).post('/api/payments/milestones/m1/dispute?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa').send({});
    expect(res.status).toBe(400);
  });

  it('POST /milestones/:milestoneId/dispute NOT_FOUND returns 404', async () => {
    mockDisputeService.createDispute.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).post('/api/payments/milestones/m1/dispute?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa').send({ reason: 'Bad work' });
    expect(res.status).toBe(404);
  });

  it('POST /milestones/:milestoneId/dispute UNAUTHORIZED returns 403', async () => {
    mockDisputeService.createDispute.mockResolvedValue(fail('UNAUTHORIZED', 'No'));
    const res = await request(app).post('/api/payments/milestones/m1/dispute?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa').send({ reason: 'Bad work' });
    expect(res.status).toBe(403);
  });

  it('GET /contracts/:contractId/status success', async () => {
    mockPaymentService.getContractPaymentStatus.mockResolvedValue(ok({ contractId: 'c1' }));
    const res = await request(app).get('/api/payments/contracts/c1/status');
    expect(res.status).toBe(200);
  });

  it('GET /contracts/:contractId/status NOT_FOUND returns 404', async () => {
    mockPaymentService.getContractPaymentStatus.mockResolvedValue(fail('NOT_FOUND', 'No'));
    const res = await request(app).get('/api/payments/contracts/c1/status');
    expect(res.status).toBe(404);
  });

  it('GET /contracts/:contractId/status UNAUTHORIZED non-admin returns 403', async () => {
    mockPaymentService.getContractPaymentStatus.mockResolvedValue(fail('UNAUTHORIZED', 'No'));
    const res = await request(app).get('/api/payments/contracts/c1/status');
    expect(res.status).toBe(403);
  });
});

describe('payment-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockRequestMilestoneCompletion = jest.fn<any>();
  const mockApproveMilestone = jest.fn<any>();
  const mockCreateDispute = jest.fn<any>();
  const mockGetContractPaymentStatus = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
      requestMilestoneCompletion: mockRequestMilestoneCompletion,
      approveMilestone: mockApproveMilestone,
      getContractPaymentStatus: mockGetContractPaymentStatus,
    }));
    jest.unstable_mockModule(resolveModule('src/services/dispute-service.ts'), () => ({
      createDispute: mockCreateDispute,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/payment-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/payments', router);
    jest.clearAllMocks();
  });

  it('L145: POST complete', async () => {
    mockRequestMilestoneCompletion.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/complete?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(200);
  });

  it('L231: POST approve', async () => {
    mockApproveMilestone.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/approve?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(200);
  });

  it('L323: POST dispute', async () => {
    mockCreateDispute.mockResolvedValueOnce({ success: true, data: { id: 'd1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/dispute?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa').send({ reason: 'Bad' });
    expect(res.status).toBe(200);
  });

  it('L414: GET payment status', async () => {
    mockGetContractPaymentStatus.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/payments/contracts/c1/status');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// UUID validation and catch block tests
// ═══════════════════════════════════════════════════════════════

describe('payment-routes - UUID validation for contractId query param', () => {
  let app: any;
  const mockRequestMilestoneCompletion = jest.fn<any>();
  const mockApproveMilestone = jest.fn<any>();
  const mockCreateDispute = jest.fn<any>();
  const mockGetContractPaymentStatus = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
      requestMilestoneCompletion: mockRequestMilestoneCompletion,
      approveMilestone: mockApproveMilestone,
      getContractPaymentStatus: mockGetContractPaymentStatus,
    }));
    jest.unstable_mockModule(resolveModule('src/services/dispute-service.ts'), () => ({
      createDispute: mockCreateDispute,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/payment-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/payments', router);
    jest.clearAllMocks();
  });

  it('L165-168: POST complete rejects invalid contractId UUID', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/complete?contractId=not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('valid UUID');
  });

  it('L259-262: POST approve rejects invalid contractId UUID', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/approve?contractId=not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('valid UUID');
  });

  it('L360-363: POST dispute rejects invalid contractId UUID', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/dispute?contractId=not-a-uuid').send({ reason: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('valid UUID');
  });

  it('L186: POST complete catch block delegates to next(error)', async () => {
    mockRequestMilestoneCompletion.mockRejectedValueOnce(new Error('Unexpected'));
    const request = (await import('supertest')).default;
    // With default express error handler, unhandled errors return 500
    const res = await request(app).post('/api/payments/milestones/m1/complete?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(500);
  });

  it('L280: POST approve catch block delegates to next(error)', async () => {
    mockApproveMilestone.mockRejectedValueOnce(new Error('Unexpected'));
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/approve?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(500);
  });

  it('L459: GET contract status catch block delegates to next(error)', async () => {
    mockGetContractPaymentStatus.mockRejectedValueOnce(new Error('Unexpected'));
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/payments/contracts/c1/status');
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════
// ?? nullish coalescing fallback branch tests (lines 145, 239, 339, 438)
// ═══════════════════════════════════════════════════════════════

describe('payment-routes - ?? nullish fallback branches', () => {
  let app: any;
  const mockRequestMilestoneCompletion = jest.fn<any>();
  const mockApproveMilestone = jest.fn<any>();
  const mockCreateDispute = jest.fn<any>();
  const mockGetContractPaymentStatus = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { userId: 'user-1', role: 'employer' };
        for (const key of Object.keys(req.params)) delete req.params[key];
        next();
      },
      requireRole: () => (_req: any, _res: any, next: any) => next(),
      requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
      requestMilestoneCompletion: mockRequestMilestoneCompletion,
      approveMilestone: mockApproveMilestone,
      getContractPaymentStatus: mockGetContractPaymentStatus,
    }));
    jest.unstable_mockModule(resolveModule('src/services/dispute-service.ts'), () => ({
      createDispute: mockCreateDispute,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/payment-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/payments', router);
    jest.clearAllMocks();
  });

  it('L145: POST complete with nullish milestoneId', async () => {
    mockRequestMilestoneCompletion.mockResolvedValueOnce({ success: true, data: { milestoneId: 'm1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/complete?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(200);
  });

  it('L239: POST approve with nullish milestoneId', async () => {
    mockApproveMilestone.mockResolvedValueOnce({ success: true, data: { milestoneId: 'm1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/approve?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(200);
  });

  it('L339: POST dispute with nullish milestoneId', async () => {
    mockCreateDispute.mockResolvedValueOnce({ success: true, data: { id: 'd1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/dispute?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa').send({ reason: 'Bad work' });
    expect(res.status).toBe(200);
  });

  it('L438: GET status with nullish contractId', async () => {
    mockGetContractPaymentStatus.mockResolvedValueOnce({ success: true, data: { contractId: 'c1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/payments/contracts/c1/status');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Generic error code -> 400 branch tests (lines 273, 382, 452)
// Ternary: code === 'NOT_FOUND' ? 404 : code === 'UNAUTHORIZED' ? 403 : 400
// These tests exercise the final : 400 branch with non-matching codes
// ═══════════════════════════════════════════════════════════════

describe('payment-routes - generic error code 400 branches', () => {
  let app: any;
  const mockRequestMilestoneCompletion = jest.fn<any>();
  const mockApproveMilestone = jest.fn<any>();
  const mockCreateDispute = jest.fn<any>();
  const mockGetContractPaymentStatus = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'employer' }; next(); },
      requireRole: () => (_req: any, _res: any, next: any) => next(),
      requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
    }));
    jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
      requestMilestoneCompletion: mockRequestMilestoneCompletion,
      approveMilestone: mockApproveMilestone,
      getContractPaymentStatus: mockGetContractPaymentStatus,
    }));
    jest.unstable_mockModule(resolveModule('src/services/dispute-service.ts'), () => ({
      createDispute: mockCreateDispute,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/payment-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/payments', router);
    jest.clearAllMocks();
  });

  it('L273: POST approve with generic error code returns 400', async () => {
    mockApproveMilestone.mockResolvedValueOnce({ success: false, error: { code: 'INVALID_STATUS', message: 'Cannot approve' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/approve?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
    expect(res.status).toBe(400);
  });

  it('L382: POST dispute with generic error code returns 400', async () => {
    mockCreateDispute.mockResolvedValueOnce({ success: false, error: { code: 'INVALID_STATUS', message: 'Cannot dispute' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/payments/milestones/m1/dispute?contractId=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa').send({ reason: 'Bad work' });
    expect(res.status).toBe(400);
  });

  it('L452: GET status with generic error code returns 400', async () => {
    mockGetContractPaymentStatus.mockResolvedValueOnce({ success: false, error: { code: 'INVALID_STATUS', message: 'Cannot get status' } });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/payments/contracts/c1/status');
    expect(res.status).toBe(400);
  });
});
