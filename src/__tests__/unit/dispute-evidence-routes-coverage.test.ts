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
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const disputeEvidenceRouter = (await import('../../routes/dispute-evidence-routes.js')).default;

describe('Dispute Evidence Routes - error.code fallback coverage', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/disputes', disputeEvidenceRouter);
  });

  describe('POST /:disputeId/evidence - error.code fallback', () => {
    it('should fallback to EVIDENCE_SUBMIT_FAILED when error.code is undefined', async () => {
      mockSubmitEvidence.mockResolvedValue({ success: false, error: { message: 'Submit failed' } });
      const res = await request(app).post('/api/disputes/d-1/evidence').send({ evidenceType: 'document', description: 'Test' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EVIDENCE_SUBMIT_FAILED');
    });

    it('should use error.code when provided', async () => {
      mockSubmitEvidence.mockResolvedValue({ success: false, error: { code: 'CUSTOM_ERROR', message: 'Submit failed' } });
      const res = await request(app).post('/api/disputes/d-1/evidence').send({ evidenceType: 'document', description: 'Test' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CUSTOM_ERROR');
    });
  });

  describe('GET /:disputeId/evidence - error.code fallback', () => {
    it('should fallback to EVIDENCE_FETCH_FAILED when error.code is undefined', async () => {
      mockGetDisputeEvidence.mockResolvedValue({ success: false, error: { message: 'Fetch failed' } });
      const res = await request(app).get('/api/disputes/d-1/evidence');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EVIDENCE_FETCH_FAILED');
    });

    it('should use error.code when provided', async () => {
      mockGetDisputeEvidence.mockResolvedValue({ success: false, error: { code: 'CUSTOM_ERROR', message: 'Fetch failed' } });
      const res = await request(app).get('/api/disputes/d-1/evidence');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CUSTOM_ERROR');
    });
  });

  describe('DELETE /:disputeId/evidence/:evidenceId - error.code fallback', () => {
    it('should fallback to EVIDENCE_DELETE_FAILED when error.code is undefined', async () => {
      mockDeleteEvidence.mockResolvedValue({ success: false, error: { message: 'Delete failed' } });
      const res = await request(app).delete('/api/disputes/d-1/evidence/ev-1');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EVIDENCE_DELETE_FAILED');
    });

    it('should use error.code when provided', async () => {
      mockDeleteEvidence.mockResolvedValue({ success: false, error: { code: 'CUSTOM_ERROR', message: 'Delete failed' } });
      const res = await request(app).delete('/api/disputes/d-1/evidence/ev-1');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CUSTOM_ERROR');
    });
  });

  describe('POST /:disputeId/evidence/:evidenceId/verify - error.code fallback', () => {
    it('should fallback to EVIDENCE_VERIFY_FAILED when error.code is undefined', async () => {
      mockVerifyEvidence.mockResolvedValue({ success: false, error: { message: 'Verify failed' } });
      const res = await request(app).post('/api/disputes/d-1/evidence/ev-1/verify');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EVIDENCE_VERIFY_FAILED');
    });

    it('should use error.code when provided', async () => {
      mockVerifyEvidence.mockResolvedValue({ success: false, error: { code: 'CUSTOM_ERROR', message: 'Verify failed' } });
      const res = await request(app).post('/api/disputes/d-1/evidence/ev-1/verify');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CUSTOM_ERROR');
    });
  });
});
