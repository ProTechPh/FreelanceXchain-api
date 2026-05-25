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
}));

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { userId: 'user-1', role: 'freelancer' }; next(); },
}));

jest.unstable_mockModule(resolveModule('src/utils/route-helpers.ts'), () => ({
  getRequestId: () => 'test-request-id',
}));

const fileRouter = (await import('../../routes/file-routes.js')).default;

describe('File Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/files', fileRouter);
  });

  describe('GET /', () => {
    it('should return user files', async () => {
      mockGetUserFiles.mockResolvedValue({ success: true, data: [{ id: 'f-1', name: 'file.pdf' }] });
      const res = await request(app).get('/api/files');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should pass bucket query param', async () => {
      mockGetUserFiles.mockResolvedValue({ success: true, data: [] });
      await request(app).get('/api/files?bucket=documents');
      expect(mockGetUserFiles).toHaveBeenCalledWith('user-1', 'documents');
    });

    it('should return 400 on service failure', async () => {
      mockGetUserFiles.mockResolvedValue({ success: false, error: { code: 'FETCH_FAILED', message: 'Failed' } });
      const res = await request(app).get('/api/files');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /:bucket/:path', () => {
    it('should delete a file successfully', async () => {
      mockDeleteFile.mockResolvedValue({ success: true });
      const res = await request(app).delete('/api/files/documents/test-file.pdf');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('File deleted');
    });

    it('should return 404 for not found', async () => {
      mockDeleteFile.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
      const res = await request(app).delete('/api/files/documents/missing.pdf');
      expect(res.status).toBe(404);
    });

    it('should return 403 for unauthorized', async () => {
      mockDeleteFile.mockResolvedValue({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authorized' } });
      const res = await request(app).delete('/api/files/documents/other-file.pdf');
      expect(res.status).toBe(403);
    });

    it('should return 400 for other errors', async () => {
      mockDeleteFile.mockResolvedValue({ success: false, error: { code: 'DELETE_FAILED', message: 'Failed' } });
      const res = await request(app).delete('/api/files/documents/file.pdf');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /quota', () => {
    it('should return file quota', async () => {
      mockGetFileQuota.mockResolvedValue({ success: true, data: { used: 1024, limit: 10240, remaining: 9216 } });
      const res = await request(app).get('/api/files/quota');
      expect(res.status).toBe(200);
      expect(res.body.used).toBe(1024);
    });

    it('should return 400 on failure', async () => {
      mockGetFileQuota.mockResolvedValue({ success: false, error: { code: 'QUOTA_ERROR', message: 'Failed' } });
      const res = await request(app).get('/api/files/quota');
      expect(res.status).toBe(400);
    });
  });
});
