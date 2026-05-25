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
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { id: 'user-1', userId: 'user-1', role: 'freelancer' }; next(); },
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
      expect(res.body.error).toContain('required');
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
