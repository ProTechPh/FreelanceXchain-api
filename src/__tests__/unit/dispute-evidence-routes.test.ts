// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

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

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { id: 'user-1', userId: 'user-1', role: 'freelancer' }; next(); },
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  hasAdminPermission: () => true,
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const disputeEvidenceRouter = (await import('../../routes/dispute-evidence-routes.js')).default;

describe('Dispute Evidence Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/disputes', disputeEvidenceRouter);
  });

  describe('POST /:disputeId/evidence', () => {
    it('should submit evidence successfully', async () => {
      mockSubmitEvidence.mockResolvedValue({ success: true, data: { id: 'ev-1', disputeId: 'd-1', evidenceType: 'document' } });
      const res = await request(app).post('/api/disputes/d-1/evidence').send({ evidenceType: 'document', description: 'Contract screenshot' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('ev-1');
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app).post('/api/disputes/d-1/evidence').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('required');
    });

    it('should return 400 on service failure', async () => {
      mockSubmitEvidence.mockResolvedValue({ success: false, error: { message: 'Dispute not found' } });
      const res = await request(app).post('/api/disputes/d-1/evidence').send({ evidenceType: 'document', description: 'Test' });
      expect(res.status).toBe(400);
    });

    it('should return 500 on unexpected error', async () => {
      mockSubmitEvidence.mockRejectedValue(new Error('Unexpected'));
      const res = await request(app).post('/api/disputes/d-1/evidence').send({ evidenceType: 'document', description: 'Test' });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /:disputeId/evidence', () => {
    it('should return evidence list', async () => {
      mockGetDisputeEvidence.mockResolvedValue({ success: true, data: [{ id: 'ev-1' }, { id: 'ev-2' }] });
      const res = await request(app).get('/api/disputes/d-1/evidence');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('should return 400 on service failure', async () => {
      mockGetDisputeEvidence.mockResolvedValue({ success: false, error: { message: 'Access denied' } });
      const res = await request(app).get('/api/disputes/d-1/evidence');
      expect(res.status).toBe(400);
    });

    it('should return 500 on unexpected error', async () => {
      mockGetDisputeEvidence.mockRejectedValue(new Error('Unexpected'));
      const res = await request(app).get('/api/disputes/d-1/evidence');
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /:disputeId/evidence/:evidenceId', () => {
    it('should delete evidence successfully', async () => {
      mockDeleteEvidence.mockResolvedValue({ success: true });
      const res = await request(app).delete('/api/disputes/d-1/evidence/ev-1');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Evidence deleted successfully');
    });

    it('should return 400 on service failure', async () => {
      mockDeleteEvidence.mockResolvedValue({ success: false, error: { message: 'Not found' } });
      const res = await request(app).delete('/api/disputes/d-1/evidence/ev-1');
      expect(res.status).toBe(400);
    });

    it('should return 500 on unexpected error', async () => {
      mockDeleteEvidence.mockRejectedValue(new Error('Unexpected'));
      const res = await request(app).delete('/api/disputes/d-1/evidence/ev-1');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /:disputeId/evidence/:evidenceId/verify', () => {
    it('should verify evidence successfully', async () => {
      mockVerifyEvidence.mockResolvedValue({ success: true, data: { id: 'ev-1', verified: true } });
      const res = await request(app).post('/api/disputes/d-1/evidence/ev-1/verify');
      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
    });

    it('should return 400 on service failure', async () => {
      mockVerifyEvidence.mockResolvedValue({ success: false, error: { message: 'Not authorized' } });
      const res = await request(app).post('/api/disputes/d-1/evidence/ev-1/verify');
      expect(res.status).toBe(400);
    });

    it('should return 500 on unexpected error', async () => {
      mockVerifyEvidence.mockRejectedValue(new Error('Unexpected'));
      const res = await request(app).post('/api/disputes/d-1/evidence/ev-1/verify');
      expect(res.status).toBe(500);
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
const ok = (data: any) => ({ success: true, data });
const mockDisputeEvidenceService = {
  submitEvidence: mockSubmitEvidence,
  getDisputeEvidence: mockGetDisputeEvidence,
  deleteEvidence: mockDeleteEvidence,
  verifyEvidence: mockVerifyEvidence,
};
const mockDisputeRepository = {
  submitEvidence: mockSubmitEvidence,
  getDisputeEvidence: mockGetDisputeEvidence,
  deleteEvidence: mockDeleteEvidence,
  verifyEvidence: mockVerifyEvidence,
};

describe('dispute-evidence-routes branch coverage', () => {
  let app: express.Express;
  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp('/api/disputes', disputeEvidenceRouter);
  });

  // POST — userId ?? '' and error.code ?? 'EVIDENCE_SUBMIT_FAILED'
  it('POST evidence success', async () => {
    mockDisputeEvidenceService.submitEvidence.mockResolvedValue(ok({ id: 'e1' }));
    const res = await request(app).post('/api/disputes/d1/evidence').send({ evidenceType: 'document', description: 'test' });
    expect(res.status).toBe(200);
  });

  it('POST evidence missing fields', async () => {
    const res = await request(app).post('/api/disputes/d1/evidence').send({});
    expect(res.status).toBe(400);
  });

  it('POST evidence service error without code', async () => {
    mockDisputeEvidenceService.submitEvidence.mockResolvedValue({ success: false, error: { message: 'Failed' } });
    const res = await request(app).post('/api/disputes/d1/evidence').send({ evidenceType: 'document', description: 'test' });
    expect(res.status).toBe(400);
  });

  // GET — error.code ?? 'EVIDENCE_FETCH_FAILED'
  it('GET evidence success', async () => {
    mockDisputeEvidenceService.getDisputeEvidence.mockResolvedValue(ok([]));
    const res = await request(app).get('/api/disputes/d1/evidence');
    expect(res.status).toBe(200);
  });

  it('GET evidence service error without code', async () => {
    mockDisputeEvidenceService.getDisputeEvidence.mockResolvedValue({ success: false, error: { message: 'Failed' } });
    const res = await request(app).get('/api/disputes/d1/evidence');
    expect(res.status).toBe(400);
  });

  // DELETE — error.code ?? 'EVIDENCE_DELETE_FAILED'
  it('DELETE evidence success', async () => {
    mockDisputeEvidenceService.deleteEvidence.mockResolvedValue(ok({}));
    const res = await request(app).delete('/api/disputes/d1/evidence/e1');
    expect(res.status).toBe(200);
  });

  it('DELETE evidence service error without code', async () => {
    mockDisputeEvidenceService.deleteEvidence.mockResolvedValue({ success: false, error: { message: 'Failed' } });
    const res = await request(app).delete('/api/disputes/d1/evidence/e1');
    expect(res.status).toBe(400);
  });

  // POST verify — error.code ?? 'EVIDENCE_VERIFY_FAILED'
  it('POST verify evidence success', async () => {
    mockDisputeEvidenceService.verifyEvidence.mockResolvedValue(ok({ verified: true }));
    const res = await request(app).post('/api/disputes/d1/evidence/e1/verify');
    expect(res.status).toBe(200);
  });

  it('POST verify evidence service error without code', async () => {
    mockDisputeEvidenceService.verifyEvidence.mockResolvedValue({ success: false, error: { message: 'Failed' } });
    const res = await request(app).post('/api/disputes/d1/evidence/e1/verify');
    expect(res.status).toBe(400);
  });
});

describe('dispute-evidence-routes.ts - Branch Coverage', () => {
  let app: any;
  const mockSubmitEvidence = jest.fn<any>();
  const mockGetDisputeEvidence = jest.fn<any>();
  const mockDeleteEvidence = jest.fn<any>();
  const mockVerifyEvidence = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/dispute-evidence-service.ts'), () => ({
      submitEvidence: mockSubmitEvidence,
      getDisputeEvidence: mockGetDisputeEvidence,
      deleteEvidence: mockDeleteEvidence,
      verifyEvidence: mockVerifyEvidence,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/dispute-evidence-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/disputes', router);
    jest.clearAllMocks();
  });

  it('L52/53: POST evidence', async () => {
    mockSubmitEvidence.mockResolvedValueOnce({ success: true, data: { id: 'e1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/disputes/d1/evidence').send({ evidenceType: 'doc', description: 'test' });
    expect(res.status).toBe(200);
  });

  it('L111/112: GET evidence', async () => {
    mockGetDisputeEvidence.mockResolvedValueOnce({ success: true, data: [] });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/disputes/d1/evidence');
    expect(res.status).toBe(200);
  });

  it('L160/161: DELETE evidence', async () => {
    mockDeleteEvidence.mockResolvedValueOnce({ success: true });
    const request = (await import('supertest')).default;
    const res = await request(app).delete('/api/disputes/d1/evidence/e1');
    expect(res.status).toBe(200);
  });

  it('L209/210: POST verify evidence', async () => {
    mockVerifyEvidence.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/disputes/d1/evidence/e1/verify');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// SSRF validation tests for isValidFileUrl
// ═══════════════════════════════════════════════════════════════

describe('dispute-evidence-routes - SSRF fileUrl validation', () => {
  let app: any;
  const mockSubmitEvidence = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/services/dispute-evidence-service.ts'), () => ({
      submitEvidence: mockSubmitEvidence,
      getDisputeEvidence: jest.fn(),
      deleteEvidence: jest.fn(),
      verifyEvidence: jest.fn(),
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/dispute-evidence-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/disputes', router);
    jest.clearAllMocks();
  });

  it('should accept valid HTTPS fileUrl', async () => {
    mockSubmitEvidence.mockResolvedValueOnce({ success: true, data: { id: 'e1' } });
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d1/evidence')
      .send({ evidenceType: 'document', description: 'test', fileUrl: 'https://example.com/file.pdf' });
    expect(res.status).toBe(200);
  });

  it('should reject HTTP fileUrl (only HTTPS allowed)', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d1/evidence')
      .send({ evidenceType: 'document', description: 'test', fileUrl: 'http://example.com/file.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('HTTPS');
  });

  it('should reject malformed URL', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d1/evidence')
      .send({ evidenceType: 'document', description: 'test', fileUrl: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Invalid file URL');
  });

  it('should reject URL exceeding max length', async () => {
    const request = (await import('supertest')).default;
    const longUrl = 'https://example.com/' + 'a'.repeat(2100);
    const res = await request(app)
      .post('/api/disputes/d1/evidence')
      .send({ evidenceType: 'document', description: 'test', fileUrl: longUrl });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Invalid file URL');
  });

  it('should accept undefined fileUrl (optional field)', async () => {
    mockSubmitEvidence.mockResolvedValueOnce({ success: true, data: { id: 'e1' } });
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/disputes/d1/evidence')
      .send({ evidenceType: 'document', description: 'test' });
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// ?? nullish coalescing fallback branch tests (lines 68-69, 136-137, 185-186, 234-235)
// ═══════════════════════════════════════════════════════════════

describe('dispute-evidence-routes - ?? nullish fallback branches', () => {
  let app: any;
  const mockSubmitEvidence = jest.fn<any>();
  const mockGetDisputeEvidence = jest.fn<any>();
  const mockDeleteEvidence = jest.fn<any>();
  const mockVerifyEvidence = jest.fn<any>();

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { id: 'user-1', role: 'freelancer' };
        for (const key of Object.keys(req.params)) delete req.params[key];
        next();
      },
      requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
      requireRole: () => (_req: any, _res: any, next: any) => next(),
      requirePermission: () => (_req: any, _res: any, next: any) => next(),
      hasAdminPermission: () => true,
    }));
    jest.unstable_mockModule(resolveModule('src/services/dispute-evidence-service.ts'), () => ({
      submitEvidence: mockSubmitEvidence,
      getDisputeEvidence: mockGetDisputeEvidence,
      deleteEvidence: mockDeleteEvidence,
      verifyEvidence: mockVerifyEvidence,
    }));

    const express = (await import('express')).default;
    const router = (await import('../../routes/dispute-evidence-routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/disputes', router);
    jest.clearAllMocks();
  });

  it('L68-69: POST evidence with nullish disputeId and userId', async () => {
    mockSubmitEvidence.mockResolvedValueOnce({ success: true, data: { id: 'e1' } });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/disputes/d1/evidence').send({ evidenceType: 'doc', description: 'test' });
    expect(res.status).toBe(200);
  });

  it('L136-137: GET evidence with nullish disputeId and userId', async () => {
    mockGetDisputeEvidence.mockResolvedValueOnce({ success: true, data: [] });
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/disputes/d1/evidence');
    expect(res.status).toBe(200);
  });

  it('L185-186: DELETE evidence with nullish disputeId, evidenceId and userId', async () => {
    mockDeleteEvidence.mockResolvedValueOnce({ success: true });
    const request = (await import('supertest')).default;
    const res = await request(app).delete('/api/disputes/d1/evidence/e1');
    expect(res.status).toBe(200);
  });

  it('L234-235: POST verify with nullish disputeId, evidenceId and userId', async () => {
    mockVerifyEvidence.mockResolvedValueOnce({ success: true, data: {} });
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/disputes/d1/evidence/e1/verify');
    expect(res.status).toBe(200);
  });
});
