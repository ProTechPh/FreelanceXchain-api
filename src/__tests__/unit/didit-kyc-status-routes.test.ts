// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetKycStatus = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/didit-kyc-service.ts'), () => ({
  initiateKycVerification: jest.fn(),
  getKycStatus: mockGetKycStatus,
  getKycById: jest.fn(),
  refreshVerificationStatus: jest.fn(),
  getAdminVerificationDecision: jest.fn(),
  processWebhook: jest.fn(),
  adminReviewVerification: jest.fn(),
  getPendingAdminReviews: jest.fn(),
  getVerificationsByStatus: jest.fn(),
  getUserVerificationHistory: jest.fn(),
  isUserVerified: jest.fn(),
  getProfileDataFromKyc: jest.fn(),
  manualKycVerification: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/services/didit-client.ts'), () => ({
  verifyWebhookSignature: jest.fn(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', role: 'freelancer' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  webhookRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: () => (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    security: jest.fn(),
  },
}));

const router = (await import('../../routes/didit-kyc-routes.js')).default;

describe('GET /api/kyc/status', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/kyc', router);
  });

  it('returns 500 when the KYC lookup fails', async () => {
    mockGetKycStatus.mockResolvedValue({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Unable to load KYC verification status' },
    });

    const response = await request(app).get('/api/kyc/status');

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'DATABASE_ERROR',
      message: 'Unable to load KYC verification status',
    });
  });

  it('returns 404 only when no KYC record exists', async () => {
    mockGetKycStatus.mockResolvedValue({ success: true, data: null });

    const response = await request(app).get('/api/kyc/status');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
