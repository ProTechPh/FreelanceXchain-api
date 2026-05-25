// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p) => path.resolve(process.cwd(), p);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req, _res, next) => next(),
  authRateLimiter: (_req, _res, next) => next(),
  fileUploadRateLimiter: (_req, _res, next) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req, _res, next) => { req.user = { userId: 'user-1', role: 'freelancer' }; next(); },
  requireRole: () => (_req, _res, next) => next(),
  requireVerifiedKyc: (_req, _res, next) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req, _res, next) => next()),
  validate: jest.fn(() => (_req, _res, next) => next()),
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

jest.unstable_mockModule(resolveModule('src/utils/index.ts'), () => ({
  clampLimit: (v) => v ?? 20,
  clampOffset: (v) => v ?? 0,
}));

// ===== DISPUTE EVIDENCE ROUTES =====
const mockSubmitEvidence = jest.fn();
const mockGetDisputeEvidence = jest.fn();
const mockDeleteEvidence = jest.fn();
const mockVerifyEvidence = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/dispute-evidence-service.ts'), () => ({
  submitEvidence: mockSubmitEvidence,
  getDisputeEvidence: mockGetDisputeEvidence,
  deleteEvidence: mockDeleteEvidence,
  verifyEvidence: mockVerifyEvidence,
}));

// ===== ESCROW REFUND ROUTES =====
const mockCreateRefundRequest = jest.fn();
const mockApproveRefund = jest.fn();
const mockRejectRefund = jest.fn();
const mockGetContractRefunds = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/escrow-refund-service.ts'), () => ({
  createRefundRequest: mockCreateRefundRequest,
  approveRefund: mockApproveRefund,
  rejectRefund: mockRejectRefund,
  getContractRefunds: mockGetContractRefunds,
}));

// ===== FILE-UPLOAD ROUTES =====
jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  createFileUploadMiddleware: () => [(req, _res, next) => { req.file = { originalname: 'test.png', mimetype: 'image/png', buffer: Buffer.from('test') }; next(); }],
}));

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  getSignedUrl: jest.fn(),
  listUserFiles: jest.fn(),
  BUCKETS: { PROJECT_ATTACHMENTS: 'project-attachments', AVATARS: 'avatars' },
}));

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: { appwrite: { endpoint: 'http://localhost', projectId: 'test' } },
}));

// ===== CONTRACT ROUTES =====
const mockGetContractById = jest.fn();
const mockGetUserContracts = jest.fn();
const mockUpdateContractStatus = jest.fn();
const mockCancelPendingContract = jest.fn();
const mockGetContractWalletAddresses = jest.fn();
const mockInitializeContractEscrow = jest.fn();
const mockGetProjectById = jest.fn();
const mockGetDisputesByContract = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/contract-service.ts'), () => ({
  getContractById: mockGetContractById,
  getUserContracts: mockGetUserContracts,
  updateContractStatus: mockUpdateContractStatus,
  cancelPendingContract: mockCancelPendingContract,
  getContractWalletAddresses: mockGetContractWalletAddresses,
}));

jest.unstable_mockModule(resolveModule('src/services/payment-service.ts'), () => ({
  initializeContractEscrow: mockInitializeContractEscrow,
  requestMilestoneCompletion: jest.fn(),
  approveMilestone: jest.fn(),
  getContractPaymentStatus: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  getProjectById: mockGetProjectById,
}));

jest.unstable_mockModule(resolveModule('src/services/dispute-service.ts'), () => ({
  getDisputesByContract: mockGetDisputesByContract,
}));

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  BUCKETS: { PROJECT_ATTACHMENTS: 'project-attachments' },
}));

// ===== REPUTATION ROUTES =====
const mockGetReputation = jest.fn();
const mockGetWorkHistory = jest.fn();
const mockGetRatingsFromBlockchain = jest.fn();

jest.unstable_mockModule(resolveModule('src/services/reputation-service.ts'), () => ({
  getReputation: mockGetReputation,
  getWorkHistory: mockGetWorkHistory,
  submitRating: jest.fn(),
  canUserRate: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/reputation-aggregation-service.ts'), () => ({
  getAggregatedScore: jest.fn(),
  getReputationBreakdown: jest.fn(),
  getReputationHistory: jest.fn(),
  getReputationLeaderboard: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/reputation-contract.ts'), () => ({
  getRatingsFromBlockchain: mockGetRatingsFromBlockchain,
}));

// ===== IMPORTS =====
const evidenceRouter = await import('../../routes/dispute-evidence-routes.js');
const refundRouter = await import('../../routes/escrow-refund-routes.js');
const fileUploadRouter = await import('../../routes/file-upload.js');
const contractRouter = await import('../../routes/contract-routes.js');
const reputationRouter = await import('../../routes/reputation-routes.js');

function setupApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/test', router);
  return app;
}

function errorRes(code, message) {
  return { success: false, error: { code, message } };
}

// ============================================================
// DISPUTE EVIDENCE ROUTES
// ============================================================
describe('Dispute Evidence Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(evidenceRouter.default);
  });

  it('POST /test/:disputeId/evidence returns 400 on failure', async () => {
    mockSubmitEvidence.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/uuid-1/evidence').send({ content: 'test' });
    expect(res.status).toBe(400);
  });

  it('GET /test/:disputeId/evidence returns 400 on failure', async () => {
    mockGetDisputeEvidence.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/uuid-1/evidence');
    expect(res.status).toBe(400);
  });

  it('DELETE /test/:disputeId/evidence/:evidenceId returns 400 on failure', async () => {
    mockDeleteEvidence.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).delete('/test/uuid-1/evidence/uuid-2');
    expect(res.status).toBe(400);
  });

  it('POST /test/:disputeId/evidence/:evidenceId/verify returns 400 on failure', async () => {
    mockVerifyEvidence.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/uuid-1/evidence/uuid-2/verify');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// ESCROW REFUND ROUTES
// ============================================================
describe('Escrow Refund Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(refundRouter.default);
  });

  it('POST /test/:contractId/refund-request returns 400 on failure', async () => {
    mockCreateRefundRequest.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/uuid-1/refund-request').send({ reason: 'test' });
    expect(res.status).toBe(400);
  });

  it('POST /test/refunds/:refundId/approve returns 400 on failure', async () => {
    mockApproveRefund.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/refunds/uuid-2/approve');
    expect(res.status).toBe(400);
  });

  it('POST /test/refunds/:refundId/reject returns 400 on failure', async () => {
    mockRejectRefund.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).post('/test/refunds/uuid-2/reject').send({ reason: 'test reason' });
    expect(res.status).toBe(400);
  });

  it('GET /test/:contractId/refunds returns 400 on failure', async () => {
    mockGetContractRefunds.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/uuid-1/refunds');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// FILE UPLOAD ROUTES
// ============================================================
describe('File Upload Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(fileUploadRouter.default);
  });

  it('POST /test/upload returns 400 when no file', async () => {
    const app2 = express();
    app2.use(express.json());
    const router = fileUploadRouter.default;
    app2.use('/test', (_req, _res, next) => { _req.file = undefined; next(); }, router);
    const res = await request(app2).post('/test/upload');
    expect(res.status).toBe(400);
  });
});

// ============================================================
// CONTRACT ROUTES
// ============================================================
describe('Contract Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(contractRouter.default);
  });

  it('GET /test returns 400 on failure', async () => {
    mockGetUserContracts.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
  });

  it('GET /test/:id returns 404 on failure', async () => {
    mockGetContractById.mockResolvedValue(errorRes('NOT_FOUND', 'Not found'));
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// REPUTATION ROUTES
// ============================================================
describe('Reputation Routes - branch gaps', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = setupApp(reputationRouter.default);
  });

  it('GET /test/:userId returns 400 on failure', async () => {
    mockGetReputation.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/uuid-1');
    expect(res.status).toBe(400);
  });

  it('GET /test/:userId/work-history returns 400 on failure', async () => {
    mockGetWorkHistory.mockResolvedValue(errorRes('FAIL', 'Failed'));
    const res = await request(app).get('/test/uuid-1/history');
    expect(res.status).toBe(400);
  });
});
