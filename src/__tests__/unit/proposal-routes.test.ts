// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockSubmitProposal = jest.fn<any>();
const mockGetProposalById = jest.fn<any>();
const mockGetProposalWithEmployerHistory = jest.fn<any>();
const mockGetProposalsByFreelancer = jest.fn<any>();
const mockAcceptProposal = jest.fn<any>();
const mockRejectProposal = jest.fn<any>();
const mockWithdrawProposal = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/proposal-service.ts'), () => ({
  submitProposal: mockSubmitProposal,
  getProposalById: mockGetProposalById,
  getProposalWithEmployerHistory: mockGetProposalWithEmployerHistory,
  getProposalsByFreelancer: mockGetProposalsByFreelancer,
  acceptProposal: mockAcceptProposal,
  rejectProposal: mockRejectProposal,
  withdrawProposal: mockWithdrawProposal,
}));

const mockGetProjectById = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/services/project-service.ts'), () => ({
  getProjectById: mockGetProjectById,
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'freelancer', email: 'test@test.com' }; next(); },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireVerifiedKyc: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
  withdrawalRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), async () => {
  // Run the real validation middleware; only the UUID helpers are mocked so
  // non-UUID test ids pass.
  const real = await import('../../middleware/validation-core.js');
  return {
    ...real,
    validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
    isValidUUID: jest.fn(() => true),
  };
});

// Multipart form fields for the mocked upload middleware to read. The route
// module captures this mock at import time, so the fields must live at module
// scope (a per-test re-registration never reaches the captured mock).
let formFields: Record<string, string> = {};

jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  // Only the multipart branch runs this middleware. Supertest's .field() calls
  // set a multipart Content-Type but don't populate req.body — the real multer
  // middleware parses the body. Mirror that: copy the test-provided form fields
  // (which arrive as strings) and move the uploaded file into req.files.
  uploadProposalAttachments: [
    (req: any, _res: any, next: any) => {
      req.body = { ...formFields };
      req.files = [{ originalname: 'proposal.pdf' }];
      next();
    },
  ],
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const mockUploadMultipleFiles = jest.fn<any>();
jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadMultipleFiles: mockUploadMultipleFiles,
  cleanupUploadedFiles: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
    DATABASE_ID: 'freelancexchain',
  BUCKETS: { PROPOSAL_ATTACHMENTS: 'proposal-attachments' },
}));

const router = (await import('../../routes/proposal-routes.js')).default;

describe('Proposal Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/proposals', router);
  });

  describe('POST /', () => {
    it('should submit proposal on success (JSON)', async () => {
      mockSubmitProposal.mockResolvedValue({
        success: true,
        data: { proposal: { id: 'prop-1', projectId: 'p-1', status: 'pending' } },
      });
      const res = await request(app)
        .post('/api/proposals')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          attachments: [{ url: 'https://example.com/file.pdf', filename: 'file.pdf', size: 1024, mimeType: 'application/pdf' }],
          proposedRate: 50,
          estimatedDuration: 30,
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('prop-1');
    });

    it('should return 400 on validation error', async () => {
      const res = await request(app)
        .post('/api/proposals')
        .send({
          projectId: '',
          attachments: 'not-array',
          proposedRate: 0,
          estimatedDuration: 0,
        });
      expect(res.status).toBe(400);
    });

    it('should return 409 on duplicate proposal', async () => {
      mockSubmitProposal.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE_PROPOSAL', message: 'Already submitted' },
      });
      const res = await request(app)
        .post('/api/proposals')
        .send({
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          attachments: [{ url: 'https://example.com/file.pdf', filename: 'file.pdf', size: 1024, mimeType: 'application/pdf' }],
          proposedRate: 50,
          estimatedDuration: 30,
        });
      expect(res.status).toBe(409);
    });

    describe('POST / multipart form-data', () => {
      it('submits with string fields coerced to numbers', async () => {
        formFields = {
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          proposedRate: '50',
          estimatedDuration: '30',
        };
        mockUploadMultipleFiles.mockResolvedValue([{ success: true, metadata: { id: 'f1', name: 'proposal.pdf' } }]);
        mockSubmitProposal.mockResolvedValue({ success: true, data: { proposal: { id: 'prop-1', status: 'pending' } } });
        const res = await request(app)
          .post('/api/proposals')
          .field('projectId', formFields.projectId)
          .field('proposedRate', formFields.proposedRate)
          .field('estimatedDuration', formFields.estimatedDuration);
        expect(res.status).toBe(201);
        expect(mockSubmitProposal).toHaveBeenCalledWith('user-1', expect.objectContaining({ proposedRate: 50, estimatedDuration: 30 }));
      });

      it('rejects a non-numeric proposedRate with 400', async () => {
        formFields = {
          projectId: '550e8400-e29b-41d4-a716-446655440000',
          proposedRate: 'abc',
          estimatedDuration: '30',
        };
        const res = await request(app)
          .post('/api/proposals')
          .field('projectId', formFields.projectId)
          .field('proposedRate', formFields.proposedRate)
          .field('estimatedDuration', formFields.estimatedDuration);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(mockSubmitProposal).not.toHaveBeenCalled();
      });
    });
  });

  describe('GET /:id', () => {
    it('should return proposal on success', async () => {
      mockGetProposalById.mockResolvedValue({
        success: true,
        data: { id: 'prop-1', freelancerId: 'user-1', projectId: 'p-1' },
      });
      const res = await request(app).get('/api/proposals/prop-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('prop-1');
    });

    it('should return 404 when not found', async () => {
      mockGetProposalById.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).get('/api/proposals/prop-1');
      expect(res.status).toBe(404);
    });

    it('should return 403 when unauthorized', async () => {
      mockGetProposalById.mockResolvedValue({
        success: true,
        data: { id: 'prop-1', freelancerId: 'other-user', projectId: 'p-1' },
      });
      mockGetProjectById.mockResolvedValue({
        success: true,
        data: { employer_id: 'another-user' },
      });
      const res = await request(app).get('/api/proposals/prop-1');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /freelancer/me', () => {
    it('should return freelancer proposals on success', async () => {
      mockGetProposalsByFreelancer.mockResolvedValue({
        success: true,
        data: [{ id: 'prop-1', status: 'pending' }],
      });
      const res = await request(app).get('/api/proposals/freelancer/me');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 400 on service failure', async () => {
      mockGetProposalsByFreelancer.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed' },
      });
      const res = await request(app).get('/api/proposals/freelancer/me');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /:id/accept', () => {
    it('should accept proposal on success', async () => {
      mockAcceptProposal.mockResolvedValue({
        success: true,
        data: { proposal: { id: 'prop-1', status: 'accepted' }, contract: { id: 'c-1' } },
      });
      const res = await request(app).post('/api/proposals/prop-1/accept');
      expect(res.status).toBe(200);
      expect(res.body.proposal.status).toBe('accepted');
    });

    it('should return 404 when not found', async () => {
      mockAcceptProposal.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).post('/api/proposals/prop-1/accept');
      expect(res.status).toBe(404);
    });

    it('should return 403 when unauthorized', async () => {
      mockAcceptProposal.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authorized' },
      });
      const res = await request(app).post('/api/proposals/prop-1/accept');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /:id/reject', () => {
    it('should reject proposal on success', async () => {
      mockRejectProposal.mockResolvedValue({
        success: true,
        data: { proposal: { id: 'prop-1', status: 'rejected' } },
      });
      const res = await request(app).post('/api/proposals/prop-1/reject');
      expect(res.status).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockRejectProposal.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).post('/api/proposals/prop-1/reject');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:id/withdraw', () => {
    it('should withdraw proposal on success', async () => {
      mockWithdrawProposal.mockResolvedValue({
        success: true,
        data: { id: 'prop-1', status: 'withdrawn' },
      });
      const res = await request(app).post('/api/proposals/prop-1/withdraw');
      expect(res.status).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockWithdrawProposal.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      const res = await request(app).post('/api/proposals/prop-1/withdraw');
      expect(res.status).toBe(404);
    });

    it('should return 403 when unauthorized', async () => {
      mockWithdrawProposal.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not your proposal' },
      });
      const res = await request(app).post('/api/proposals/prop-1/withdraw');
      expect(res.status).toBe(403);
    });
  });
});
