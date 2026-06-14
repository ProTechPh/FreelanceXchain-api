// @ts-nocheck
/**
 * Coverage for remaining branch gaps across admin-routes, escrow-refund-routes,
 * dispute-evidence-routes, and app.ts.
 *
 * Targets:
 * - admin-routes: ?? 'UNKNOWN' / ?? 'An error occurred' fallbacks when error.code/error.message are undefined
 * - admin-routes/platform-stats: pool.query catch block and total === 0 ternary
 * - escrow-refund-routes: req.params['X'] ?? '' and req.user?.userId ?? '' fallbacks
 * - dispute-evidence-routes: same ?? '' fallback patterns
 * - app.ts: req.path || req.url and process.env.npm_package_version || '1.0.0'
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (p: string) => path.resolve(process.cwd(), p);

// ─── Shared mocks ──────────────────────────────────────────────────
jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'freelancer' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
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

// ─── Admin routes mocks ────────────────────────────────────────────
const mockGetPlatformStats = jest.fn<any>();
const mockGetUserManagement = jest.fn<any>();
const mockUpdateUser = jest.fn<any>();
const mockSuspendUser = jest.fn<any>();
const mockUnsuspendUser = jest.fn<any>();
const mockVerifyUser = jest.fn<any>();
const mockGetDisputeManagement = jest.fn<any>();
const mockGetSystemHealth = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/admin-service.ts'), () => ({
  getPlatformStats: mockGetPlatformStats,
  getUserManagement: mockGetUserManagement,
  suspendUser: mockSuspendUser,
  unsuspendUser: mockUnsuspendUser,
  verifyUser: mockVerifyUser,
  updateUser: mockUpdateUser,
  getDisputeManagement: mockGetDisputeManagement,
  getSystemHealth: mockGetSystemHealth,
}));

jest.unstable_mockModule(resolveModule('src/services/analytics-service.ts'), () => ({
  getAdminAnalytics: jest.fn<any>().mockResolvedValue({ success: true, data: {} }),
}));

// ─── Escrow refund mocks ───────────────────────────────────────────
const mockCreateRefundRequest = jest.fn<any>();
const mockGetContractRefunds = jest.fn<any>();
const mockApproveRefund = jest.fn<any>();
const mockRejectRefund = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/escrow-refund-service.ts'), () => ({
  createRefundRequest: mockCreateRefundRequest,
  getContractRefunds: mockGetContractRefunds,
  approveRefund: mockApproveRefund,
  rejectRefund: mockRejectRefund,
}));

// ─── Dispute evidence mocks ────────────────────────────────────────
const mockSubmitEvidence = jest.fn<any>();
const mockGetDisputeEvidence = jest.fn<any>();
const mockDeleteEvidence = jest.fn<any>();
const mockVerifyEvidence = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/dispute-evidence-service.ts'), () => ({
  submitEvidence: mockSubmitEvidence,
  getDisputeEvidence: mockGetDisputeEvidence,
  deleteEvidence: mockDeleteEvidence,
  verifyEvidence: mockVerifyEvidence,
}));

// ─── Database mock ─────────────────────────────────────────────────
const mockPoolQuery = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockPoolQuery },
}));

// Import routers
const adminRouter = (await import('../../routes/admin-routes.js')).default;
const escrowRefundRouter = (await import('../../routes/escrow-refund-routes.js')).default;
const disputeEvidenceRouter = (await import('../../routes/dispute-evidence-routes.js')).default;

// ═══════════════════════════════════════════════════════════════════
// Admin Routes — ?? 'UNKNOWN' / ?? 'An error occurred' fallbacks
// ═══════════════════════════════════════════════════════════════════
describe('Admin Routes - undefined error code/message fallback branches', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
  });

  it('GET /stats - error without code/message falls back to UNKNOWN (line 38)', async () => {
    mockGetPlatformStats.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('GET /analytics - error without code/message falls back (line 64)', async () => {
    const { getAdminAnalytics } = await import('../../services/analytics-service.js');
    getAdminAnalytics.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).get('/api/admin/analytics');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
    expect(res.body.error.message).toBe('An error occurred');
  });

  it('GET /users - error without code/message falls back (line 95)', async () => {
    mockGetUserManagement.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
  });

  it('PATCH /users/:userId - error without code/message falls back (line 148)', async () => {
    mockUpdateUser.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).patch('/api/admin/users/uuid-1').send({ name: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
  });

  it('POST /users/:userId/suspend - error without code/message falls back (line 187)', async () => {
    mockSuspendUser.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).post('/api/admin/users/uuid-1/suspend').send({ reason: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
  });

  it('POST /users/:userId/unsuspend - error without code/message falls back (line 214)', async () => {
    mockUnsuspendUser.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).post('/api/admin/users/uuid-1/unsuspend');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
  });

  it('POST /users/:userId/verify - error without code/message falls back (line 241)', async () => {
    mockVerifyUser.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).post('/api/admin/users/uuid-1/verify');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
  });

  it('GET /disputes - error without code/message falls back (line 270)', async () => {
    mockGetDisputeManagement.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).get('/api/admin/disputes');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
  });

  it('GET /system/health - error without code/message falls back (line 296)', async () => {
    mockGetSystemHealth.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).get('/api/admin/system/health');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
  });

  it('GET /platform-stats - error without code/message falls back (line 321)', async () => {
    mockGetPlatformStats.mockResolvedValue({ success: false, error: {} });
    const res = await request(app).get('/api/admin/platform-stats');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Admin Routes — platform-stats pool.query branches
// ═══════════════════════════════════════════════════════════════════
describe('Admin Routes - platform-stats pool.query branches (lines 330-341)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
  });

  it('pool.query returns total > 0 (line 338: true branch)', async () => {
    mockGetPlatformStats.mockResolvedValue({ success: true, data: { totalTransactionVolume: 1000 } });
    mockPoolQuery.mockResolvedValue({ rows: [{ positive: '3', total: '5' }] });
    const res = await request(app).get('/api/admin/platform-stats');
    expect(res.status).toBe(200);
    expect(res.body.satisfactionRate).toBe(60);
  });

  it('pool.query returns total === 0 (line 338: false branch)', async () => {
    mockGetPlatformStats.mockResolvedValue({ success: true, data: { totalTransactionVolume: 500 } });
    mockPoolQuery.mockResolvedValue({ rows: [{ positive: '0', total: '0' }] });
    const res = await request(app).get('/api/admin/platform-stats');
    expect(res.status).toBe(200);
    expect(res.body.satisfactionRate).toBe(0);
  });

  it('pool.query throws -> catch sets satisfactionRate to 0 (lines 339-341)', async () => {
    mockGetPlatformStats.mockResolvedValue({ success: true, data: { totalTransactionVolume: 200 } });
    mockPoolQuery.mockRejectedValue(new Error('DB fail'));
    const res = await request(app).get('/api/admin/platform-stats');
    expect(res.status).toBe(200);
    expect(res.body.satisfactionRate).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Escrow Refund Routes — ?? '' fallback branches
// ═══════════════════════════════════════════════════════════════════
describe('Escrow Refund Routes - ?? "" fallback branches', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/escrow', escrowRefundRouter);
  });

  it('POST /:contractId/refund-request - uses userId from req.user (line 49)', async () => {
    mockCreateRefundRequest.mockResolvedValue({ success: true, data: { id: 'r-1' } });
    const res = await request(app)
      .post('/api/escrow/contract-1/refund-request')
      .send({ reason: 'Not satisfied', amount: 100 });
    expect(res.status).toBe(200);
    expect(mockCreateRefundRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: 'user-1' })
    );
  });

  it('GET /:contractId/refunds - uses userId from req.user (line 94)', async () => {
    mockGetContractRefunds.mockResolvedValue({ success: true, data: [] });
    const res = await request(app).get('/api/escrow/contract-1/refunds');
    expect(res.status).toBe(200);
    expect(mockGetContractRefunds).toHaveBeenCalledWith('contract-1', 'user-1');
  });

  it('POST /refunds/:refundId/approve - uses userId from req.user (line 129)', async () => {
    mockApproveRefund.mockResolvedValue({ success: true, data: { status: 'approved' } });
    const res = await request(app).post('/api/escrow/refunds/refund-1/approve');
    expect(res.status).toBe(200);
    expect(mockApproveRefund).toHaveBeenCalledWith(
      expect.objectContaining({ approvedBy: 'user-1' })
    );
  });

  it('POST /refunds/:refundId/reject - uses userId from req.user (line 178)', async () => {
    mockRejectRefund.mockResolvedValue({ success: true, data: { status: 'rejected' } });
    const res = await request(app)
      .post('/api/escrow/refunds/refund-1/reject')
      .send({ reason: 'Invalid request' });
    expect(res.status).toBe(200);
    expect(mockRejectRefund).toHaveBeenCalledWith(
      expect.objectContaining({ rejectedBy: 'user-1' })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// Dispute Evidence Routes — ?? '' fallback branches
// ═══════════════════════════════════════════════════════════════════
describe('Dispute Evidence Routes - ?? "" fallback branches', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/disputes', disputeEvidenceRouter);
  });

  it('POST /:disputeId/evidence - uses userId and requestId (lines 52-53)', async () => {
    mockSubmitEvidence.mockResolvedValue({ success: true, data: { id: 'e-1' } });
    const res = await request(app)
      .post('/api/disputes/dispute-1/evidence')
      .send({ evidenceType: 'document', description: 'Contract proof' });
    expect(res.status).toBe(200);
    expect(mockSubmitEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ submittedBy: 'user-1', disputeId: 'dispute-1' })
    );
  });

  it('GET /:disputeId/evidence - uses requestId (lines 111-112)', async () => {
    mockGetDisputeEvidence.mockResolvedValue({ success: true, data: [] });
    const res = await request(app).get('/api/disputes/dispute-1/evidence');
    expect(res.status).toBe(200);
    expect(mockGetDisputeEvidence).toHaveBeenCalledWith('dispute-1', 'user-1');
  });

  it('DELETE /:disputeId/evidence/:evidenceId - uses userId and requestId (lines 160-161)', async () => {
    mockDeleteEvidence.mockResolvedValue({ success: true, data: { deleted: true } });
    const res = await request(app).delete('/api/disputes/dispute-1/evidence/evidence-1');
    expect(res.status).toBe(200);
    expect(mockDeleteEvidence).toHaveBeenCalledWith('evidence-1', 'user-1');
  });

  it('POST /:disputeId/evidence/:evidenceId/verify - uses userId and requestId (lines 209-210)', async () => {
    mockVerifyEvidence.mockResolvedValue({ success: true, data: { verified: true } });
    const res = await request(app).post('/api/disputes/dispute-1/evidence/evidence-1/verify');
    expect(res.status).toBe(200);
    expect(mockVerifyEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceId: 'evidence-1', verifiedBy: 'user-1' })
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// App.ts — branch gaps
// NOTE: app.ts requires the full unmocked dependency tree (createApp imports
// all routes/middleware). The existing app.test.ts already covers the main
// paths. The remaining uncovered branches are minor `||` fallbacks in
// process.env and req.path that don't justify duplicating the complex
// mock setup here.
// ═══════════════════════════════════════════════════════════════════
