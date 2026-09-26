// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockStorage = {
  getFile: jest.fn<any>(),
  getFileDownload: jest.fn<any>(),
};

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  storage: mockStorage,
  BUCKETS: {
    DISPUTE_EVIDENCE: 'dispute-evidence',
    KYC_DOCUMENTS: 'kyc-documents',
    PORTFOLIO_IMAGES: 'portfolio-images',
    AVATARS: 'avatars',
    ATTACHMENTS: 'attachments',
  },
}));

let mockUser: any = { userId: 'user-1', role: 'user' };

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = mockUser;
    next();
  },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: () => (_req: any, _res: any, next: any) => next(),
}));

const router = (await import('../../routes/file-access-routes.js')).default;
const app = express();
app.use(express.json());
app.use('/api/files/access', router);

describe('File Access Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { userId: 'user-1', role: 'user' };
  });

  describe('GET /api/files/access/:bucket/:fileId', () => {
    it('returns 401 when userId is missing', async () => {
      mockUser = null;
      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid bucket', async () => {
      const res = await request(app).get('/api/files/access/invalid-bucket/file-1');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_BUCKET');
    });

    it('returns 403 when user is not owner and not admin', async () => {
      mockStorage.getFile.mockResolvedValueOnce({
        name: 'otheruser_uuid_test.pdf',
        sizeOriginal: 1024,
        mimeType: 'application/pdf',
      });

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows access when user is owner', async () => {
      mockStorage.getFile.mockResolvedValue({
        name: 'user-1_uuid_test.pdf',
        sizeOriginal: 1024,
        mimeType: 'application/pdf',
      });
      mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('hello'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('application/pdf');
      expect(res.header['content-disposition']).toContain('inline; filename="test.pdf"');
    });

    it('supports download query param', async () => {
      mockStorage.getFile.mockResolvedValue({
        name: 'user-1_uuid_test.pdf',
        sizeOriginal: 1024,
        mimeType: 'application/pdf',
      });
      mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('hello'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1?download=true');
      expect(res.status).toBe(200);
      expect(res.header['content-disposition']).toContain('attachment; filename="test.pdf"');
    });

    it('allows admin access even if not owner', async () => {
      mockUser = { userId: 'admin-1', role: 'admin' };
      mockStorage.getFile.mockResolvedValue({
        name: 'otheruser_uuid_test.pdf',
        sizeOriginal: 1024,
        mimeType: 'application/pdf',
      });
      mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('admin-data'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(200);
    });

    it('allows authenticated users to view portfolio images', async () => {
      mockStorage.getFile.mockResolvedValue({
        name: 'otheruser_uuid_portfolio.png',
        sizeOriginal: 2048,
        mimeType: 'image/png',
      });
      mockStorage.getFileDownload.mockResolvedValueOnce(Buffer.from('image-data'));

      const res = await request(app).get('/api/files/access/portfolio-images/file-1');
      expect(res.status).toBe(200);
    });

    it('returns 404 when file is not found', async () => {
      mockStorage.getFile.mockRejectedValueOnce(new Error('File not found (404)'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('returns 500 when storage throws general error', async () => {
      mockStorage.getFile.mockRejectedValueOnce(new Error('Appwrite network failure'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('FILE_STREAM_ERROR');
    });
  });

  describe('GET /api/files/access/:bucket/:fileId/info', () => {
    it('returns 401 when userId is missing', async () => {
      mockUser = null;
      const res = await request(app).get('/api/files/access/dispute-evidence/file-1/info');
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid bucket', async () => {
      const res = await request(app).get('/api/files/access/unknown-bucket/file-1/info');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_BUCKET');
    });

    it('returns 403 when access is denied', async () => {
      mockStorage.getFile.mockResolvedValue({
        name: 'other_uuid_doc.pdf',
        sizeOriginal: 500,
        mimeType: 'application/pdf',
      });

      const res = await request(app).get('/api/files/access/kyc-documents/file-1/info');
      expect(res.status).toBe(403);
    });

    it('returns file info on success', async () => {
      mockStorage.getFile.mockResolvedValue({
        $id: 'file-1',
        name: 'user-1_uuid_doc.pdf',
        sizeOriginal: 500,
        mimeType: 'application/pdf',
        $createdAt: '2026-01-01',
        $updatedAt: '2026-01-02',
      });

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1/info');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('file-1');
      expect(res.body.name).toBe('doc.pdf');
      expect(res.body.size).toBe(500);
    });

    it('returns 404 when file not found', async () => {
      mockStorage.getFile.mockRejectedValueOnce(new Error('not found'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1/info');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FILE_NOT_FOUND');
    });

    it('returns 500 on unexpected error', async () => {
      mockStorage.getFile.mockRejectedValueOnce(new Error('DB failure'));

      const res = await request(app).get('/api/files/access/dispute-evidence/file-1/info');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /api/files/access/batch', () => {
    it('returns 401 when userId is missing', async () => {
      mockUser = null;
      const res = await request(app).post('/api/files/access/batch').send({ urls: [] });
      expect(res.status).toBe(401);
    });

    it('returns 400 when urls is not an array', async () => {
      const res = await request(app).post('/api/files/access/batch').send({ urls: 'not-array' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('converts Appwrite URLs and preserves other URLs', async () => {
      const urls = [
        'https://appwrite.io/v1/storage/buckets/portfolio-images/files/file-123/view',
        'https://example.com/other-image.jpg',
      ];

      const res = await request(app).post('/api/files/access/batch').send({ urls });
      expect(res.status).toBe(200);
      expect(res.body.urls).toHaveLength(2);
      expect(res.body.urls[0].secure).toBe('/api/files/access/portfolio-images/file-123');
      expect(res.body.urls[0].accessible).toBe(true);
      expect(res.body.urls[1].secure).toBe('https://example.com/other-image.jpg');
      expect(res.body.urls[1].accessible).toBe(true);
    });
  });
});
