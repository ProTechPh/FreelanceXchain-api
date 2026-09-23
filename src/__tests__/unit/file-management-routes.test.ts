import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockListUserFiles = jest.fn<any>();
const mockGetFileQuota = jest.fn<any>();
const mockDeleteFile = jest.fn<any>();

let currentUser: { userId: string; role: string } | null = { userId: 'user-123', role: 'freelancer' };

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = currentUser;
    next();
  },
}));

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  listUserFiles: mockListUserFiles,
  getFileQuota: mockGetFileQuota,
  deleteFile: mockDeleteFile,
}));

const fileManagementRouter = (await import('../../routes/file-management-routes.js')).default;

describe('file-management-routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { userId: 'user-123', role: 'freelancer' };
    app = express();
    app.use(express.json());
    app.use('/api/file-management', fileManagementRouter);
  });

  describe('GET /api/file-management', () => {
    it('returns 401 if user is not authenticated', async () => {
      currentUser = null;
      const res = await request(app).get('/api/file-management');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('returns list of files for authenticated user across buckets', async () => {
      mockListUserFiles.mockImplementation(async (bucketId: string) => {
        if (bucketId === 'portfolio-images') {
          return {
            success: true,
            files: [
              {
                $id: 'file-1',
                name: 'user-123_abc-123_my-image.png',
                sizeOriginal: 1024,
                $createdAt: '2026-09-01T00:00:00Z',
                $updatedAt: '2026-09-01T00:00:00Z',
              },
              {
                $id: 'file-2',
                name: 'user-123_def-456_other-image.png',
                sizeOriginal: 2048,
                $createdAt: '2026-09-02T00:00:00Z',
                $updatedAt: '2026-09-02T00:00:00Z',
              },
            ],
          };
        }
        return { success: true, files: [] };
      });

      const res = await request(app).get('/api/file-management');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0].name).toBe('other-image.png');
      expect(res.body[0].bucket).toBe('portfolio-images');
    });

    it('filters by requested bucket when query param provided', async () => {
      mockListUserFiles.mockResolvedValue({
        success: true,
        files: [],
      });

      const res = await request(app).get('/api/file-management?bucket=portfolio-images');
      expect(res.status).toBe(200);
      expect(mockListUserFiles).toHaveBeenCalledTimes(1);
      expect(mockListUserFiles).toHaveBeenCalledWith('portfolio-images', 'user-123');
    });

    it('returns empty array when listUserFiles returns success false', async () => {
      mockListUserFiles.mockResolvedValue({
        success: false,
        files: [],
      });

      const res = await request(app).get('/api/file-management');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 500 when listUserFiles throws an unexpected error', async () => {
      mockListUserFiles.mockRejectedValue(new Error('Storage failure'));

      const res = await request(app).get('/api/file-management');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('GET /api/file-management/quota', () => {
    it('returns 401 if user is not authenticated', async () => {
      currentUser = null;
      const res = await request(app).get('/api/file-management/quota');
      expect(res.status).toBe(401);
    });

    it('returns quota information when successful', async () => {
      mockGetFileQuota.mockResolvedValue({
        success: true,
        used: 5000,
        limit: 100000,
        percentage: 5,
        files: 2,
      });

      const res = await request(app).get('/api/file-management/quota');
      expect(res.status).toBe(200);
      expect(res.body.used).toBe(5000);
      expect(res.body.limit).toBe(100000);
      expect(res.body.percentage).toBe(5);
      expect(res.body.files).toBe(2);
    });

    it('returns 400 when getFileQuota fails', async () => {
      mockGetFileQuota.mockResolvedValue({
        success: false,
        error: 'Quota calc failed',
      });

      const res = await request(app).get('/api/file-management/quota');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('QUOTA_FAILED');
    });

    it('returns 500 when getFileQuota throws', async () => {
      mockGetFileQuota.mockRejectedValue(new Error('DB failure'));

      const res = await request(app).get('/api/file-management/quota');
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/file-management/:bucket/:path', () => {
    it('returns 401 if user is not authenticated', async () => {
      currentUser = null;
      const res = await request(app).delete('/api/file-management/portfolio-images/file-1');
      expect(res.status).toBe(401);
    });

    it('successfully deletes a file', async () => {
      mockDeleteFile.mockResolvedValue({ success: true });

      const res = await request(app).delete('/api/file-management/portfolio-images/file-1');
      expect(res.status).toBe(200);
      expect(mockDeleteFile).toHaveBeenCalledWith('portfolio-images', 'file-1', 'user-123');
    });

    it('returns 403 when deleteFile fails with FORBIDDEN', async () => {
      mockDeleteFile.mockResolvedValue({ success: false, error: 'FORBIDDEN' });

      const res = await request(app).delete('/api/file-management/portfolio-images/file-1');
      expect(res.status).toBe(403);
    });

    it('returns 404 when deleteFile fails with FILE_NOT_FOUND', async () => {
      mockDeleteFile.mockResolvedValue({ success: false, error: 'FILE_NOT_FOUND' });

      const res = await request(app).delete('/api/file-management/portfolio-images/file-1');
      expect(res.status).toBe(404);
    });

    it('returns 400 when deleteFile fails with generic error', async () => {
      mockDeleteFile.mockResolvedValue({ success: false, error: 'UNKNOWN_ERROR' });

      const res = await request(app).delete('/api/file-management/portfolio-images/file-1');
      expect(res.status).toBe(400);
    });

    it('returns 500 when deleteFile throws', async () => {
      mockDeleteFile.mockRejectedValue(new Error('Disk error'));

      const res = await request(app).delete('/api/file-management/portfolio-images/file-1');
      expect(res.status).toBe(500);
    });
  });
});
