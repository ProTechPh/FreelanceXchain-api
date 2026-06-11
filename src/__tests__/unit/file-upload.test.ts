import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockUploadFile = jest.fn() as any;
const mockDeleteFile = jest.fn() as any;
const mockGetSignedUrl = jest.fn() as any;
const mockListUserFiles = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/utils/storage-uploader.ts'), () => ({
  uploadFile: mockUploadFile,
  deleteFile: mockDeleteFile,
  getSignedUrl: mockGetSignedUrl,
  listUserFiles: mockListUserFiles,
}));

const mockAuthMiddleware = jest.fn((req: any, _res: any, next: any) => {
  req.user = { id: 'user-123', userId: 'user-123', email: 'test@test.com', role: 'freelancer' };
  next();
});

const mockRequireRole = jest.fn(() => (req: any, _res: any, next: any) => next());

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
  requireRole: mockRequireRole,
}));

const mockFileUploadRateLimiter = jest.fn((req: any, _res: any, next: any) => next());

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  fileUploadRateLimiter: mockFileUploadRateLimiter,
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

let shouldProvideFile = true;

const mockCreateFileUploadMiddleware = jest.fn(() => [
  (req: any, _res: any, next: any) => {
    if (shouldProvideFile) {
      req.files = [{ buffer: Buffer.from('test'), originalname: 'test.png', mimetype: 'image/png', size: 1000 }];
    } else {
      req.files = [];
    }
    next();
  },
  (req: any, _res: any, next: any) => next(),
]);

jest.unstable_mockModule(resolveModule('src/middleware/file-upload-middleware.ts'), () => ({
  createFileUploadMiddleware: mockCreateFileUploadMiddleware,
}));

const fileUploadRouter = (await import('../../routes/file-upload.js')).default;

describe('File Upload Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    shouldProvideFile = true;
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-123', userId: 'user-123', email: 'test@test.com', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/files', fileUploadRouter);
  });

  describe('POST /upload', () => {
    it('should upload a file to allowed bucket', async () => {
      mockUploadFile.mockResolvedValue({ success: true, url: 'https://storage.example.com/file.png', path: 'user-123/test.png' });

      const res = await request(app)
        .post('/api/files/upload')
        .send({ bucket: 'profile-images', folder: 'avatars' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.url).toBe('https://storage.example.com/file.png');
    });

    it('should return 400 when no file is provided', async () => {
      shouldProvideFile = false;

      const res = await request(app)
        .post('/api/files/upload')
        .send({ bucket: 'profile-images' });

      shouldProvideFile = true;
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No file provided');
    });

    it('should return 400 when bucket is missing', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Bucket name is required');
    });

    it('should return 400 for invalid bucket', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .send({ bucket: 'invalid-bucket' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid bucket');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { id: undefined, userId: undefined, email: 'test@test.com', role: 'freelancer' };
        next();
      });

      const res = await request(app)
        .post('/api/files/upload')
        .send({ bucket: 'profile-images' });

      expect(res.status).toBe(401);
    });

    it('should return 400 when uploadFile fails', async () => {
      mockUploadFile.mockResolvedValue({ success: false, error: 'Storage error' });

      const res = await request(app)
        .post('/api/files/upload')
        .send({ bucket: 'profile-images' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Storage error');
    });

    it('should handle unexpected errors', async () => {
      mockUploadFile.mockRejectedValue(new Error('Unexpected error'));

      const res = await request(app)
        .post('/api/files/upload')
        .send({ bucket: 'profile-images' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to upload file');
    });

    it('should accept all allowed buckets', async () => {
      const buckets = ['profile-images', 'contract-documents', 'proposal-attachments', 'dispute-evidence', 'milestone-deliverables'];

      for (const bucket of buckets) {
        mockUploadFile.mockResolvedValue({ success: true, url: 'https://example.com/file', path: 'path' });
        const res = await request(app)
          .post('/api/files/upload')
          .send({ bucket });
        expect(res.status).toBe(200);
      }
    });
  });

  describe('DELETE /:bucket/*', () => {
    it('should delete a file owned by user', async () => {
      mockDeleteFile.mockResolvedValue({ success: true });

      const res = await request(app)
        .delete('/api/files/profile-images/user-123/photo.png');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { id: undefined, userId: undefined, email: 'test@test.com', role: 'freelancer' };
        next();
      });

      const res = await request(app)
        .delete('/api/files/profile-images/user-123/photo.png');

      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid bucket', async () => {
      const res = await request(app)
        .delete('/api/files/invalid-bucket/user-123/file.txt');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid bucket');
    });

    it('should return 403 when deleting another users file', async () => {
      const res = await request(app)
        .delete('/api/files/profile-images/other-user/photo.png');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('should return 400 when deleteFile fails', async () => {
      mockDeleteFile.mockResolvedValue({ success: false, error: 'Delete failed' });

      const res = await request(app)
        .delete('/api/files/profile-images/user-123/photo.png');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Delete failed');
    });

    it('should handle unexpected errors on delete', async () => {
      mockDeleteFile.mockRejectedValue(new Error('Network error'));

      const res = await request(app)
        .delete('/api/files/profile-images/user-123/photo.png');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to delete file');
    });

    it('should allow deleting path equal to userId', async () => {
      mockDeleteFile.mockResolvedValue({ success: true });

      const res = await request(app)
        .delete('/api/files/profile-images/user-123');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /signed-url/:bucket/*', () => {
    it('should return a signed URL for user file', async () => {
      mockGetSignedUrl.mockResolvedValue({ success: true, url: 'https://signed.example.com/file' });

      const res = await request(app)
        .get('/api/files/signed-url/contract-documents/user-123/doc.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.url).toBe('https://signed.example.com/file');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { id: undefined, userId: undefined, email: 'test@test.com', role: 'freelancer' };
        next();
      });

      const res = await request(app)
        .get('/api/files/signed-url/contract-documents/user-123/doc.pdf');

      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid bucket', async () => {
      const res = await request(app)
        .get('/api/files/signed-url/invalid/user-123/doc.pdf');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid bucket');
    });

    it('should return 403 for accessing another users file', async () => {
      const res = await request(app)
        .get('/api/files/signed-url/contract-documents/other-user/doc.pdf');

      expect(res.status).toBe(403);
    });

    it('should clamp expiresIn to valid range', async () => {
      mockGetSignedUrl.mockResolvedValue({ success: true, url: 'https://signed.example.com/file' });

      const res = await request(app)
        .get('/api/files/signed-url/contract-documents/user-123/doc.pdf?expiresIn=999999');

      expect(res.status).toBe(200);
      expect(mockGetSignedUrl).toHaveBeenCalledWith('contract-documents', 'user-123/doc.pdf');
    });

    it('should clamp negative expiresIn to 60', async () => {
      mockGetSignedUrl.mockResolvedValue({ success: true, url: 'https://signed.example.com/file' });

      const res = await request(app)
        .get('/api/files/signed-url/contract-documents/user-123/doc.pdf?expiresIn=-100');

      expect(res.status).toBe(200);
      expect(mockGetSignedUrl).toHaveBeenCalledWith('contract-documents', 'user-123/doc.pdf');
    });

    it('should return 400 when getSignedUrl fails', async () => {
      mockGetSignedUrl.mockResolvedValue({ success: false, error: 'Sign error' });

      const res = await request(app)
        .get('/api/files/signed-url/contract-documents/user-123/doc.pdf');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Sign error');
    });

    it('should handle unexpected errors', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('Unexpected'));

      const res = await request(app)
        .get('/api/files/signed-url/contract-documents/user-123/doc.pdf');

      expect(res.status).toBe(500);
    });

    it('should allow signed-url for path equal to userId', async () => {
      mockGetSignedUrl.mockResolvedValue({ success: true, url: 'https://signed.example.com/file' });

      const res = await request(app)
        .get('/api/files/signed-url/contract-documents/user-123');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /list/:bucket', () => {
    it('should list user files', async () => {
      const files = [{ name: 'file1.png' }, { name: 'file2.pdf' }];
      mockListUserFiles.mockResolvedValue({ success: true, files });

      const res = await request(app)
        .get('/api/files/list/profile-images');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.files).toEqual(files);
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = { id: undefined, userId: undefined, email: 'test@test.com', role: 'freelancer' };
        next();
      });

      const res = await request(app)
        .get('/api/files/list/profile-images');

      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid bucket', async () => {
      const res = await request(app)
        .get('/api/files/list/invalid-bucket');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid bucket');
    });

    it('should pass folder query parameter', async () => {
      mockListUserFiles.mockResolvedValue({ success: true, files: [] });

      await request(app)
        .get('/api/files/list/profile-images?folder=avatars');

      expect(mockListUserFiles).toHaveBeenCalledWith('profile-images', 'user-123', 'avatars');
    });

    it('should return 400 when listUserFiles fails', async () => {
      mockListUserFiles.mockResolvedValue({ success: false, error: 'List failed' });

      const res = await request(app)
        .get('/api/files/list/profile-images');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('List failed');
    });

    it('should handle unexpected errors', async () => {
      mockListUserFiles.mockRejectedValue(new Error('Unexpected'));

      const res = await request(app)
        .get('/api/files/list/profile-images');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to list files');
    });
  });
});