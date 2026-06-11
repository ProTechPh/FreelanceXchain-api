// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetUserFiles = jest.fn<any>();
const mockDeleteFile = jest.fn<any>();
const mockGetFileQuota = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/file-service.ts'), () => ({
  getUserFiles: mockGetUserFiles,
  deleteFile: mockDeleteFile,
  getFileQuota: mockGetFileQuota,
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

// Auth middleware that does NOT set req.user (unauthenticated)
const mockAuthMiddleware = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const fileRouter = (await import('../../routes/file-routes.js')).default;

describe('File Routes - Unauthenticated Coverage', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    // Simulate unauthenticated user (no req.user)
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = undefined;
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/files', fileRouter);
  });

  describe('GET / - unauthenticated', () => {
    it('should return 401 when userId is not set', async () => {
      const res = await request(app).get('/api/files');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
      expect(res.body.requestId).toBe('test-request-id');
    });
  });

  describe('DELETE /:bucket/:path - unauthenticated', () => {
    it('should return 401 when userId is not set', async () => {
      const res = await request(app).delete('/api/files/documents/test.pdf');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });

  describe('GET /quota - unauthenticated', () => {
    it('should return 401 when userId is not set', async () => {
      const res = await request(app).get('/api/files/quota');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });
  });
});
