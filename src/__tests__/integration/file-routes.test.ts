import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import type { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

describe('File Routes Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
      authMiddleware: jest.fn((req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({
            error: { code: 'AUTH_MISSING_TOKEN', message: 'Authorization header is required' },
            timestamp: new Date().toISOString(),
            requestId: 'unknown',
          });
          return;
        }
        (req as any).user = { id: 'test-user-id', userId: 'test-user-id', email: 'test@example.com', role: 'freelancer' };
        next();
      }),
      requireMFA: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
      requireRole: jest.fn(() => jest.fn((_req: Request, _res: Response, next: NextFunction) => next())),
      requireVerifiedKyc: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
    }));

    jest.unstable_mockModule(resolveModule('src/services/file-service.ts'), () => ({
      getUserFiles: jest.fn(async () => ({
        success: true,
        data: [
          { name: 'test.pdf', bucket: 'portfolio-images', path: 'test-user-id/test.pdf', size: 1024, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ],
      })),
      deleteFile: jest.fn(async () => ({
        success: true,
        data: { message: 'File deleted' },
      })),
      getFileQuota: jest.fn(async () => ({
        success: true,
        data: { used: 1024, limit: 104857600, percentage: 0.01, files: 1 },
      })),
    }));

    const { createApp } = await import('../../app.js');
    app = await createApp();
  });

  describe('GET /api/file-management', () => {
    it('should get user files', async () => {
      const response = await request(app)
        .get('/api/file-management')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should filter by bucket', async () => {
      const response = await request(app)
        .get('/api/file-management?bucket=portfolio-images')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/file-management');
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/file-management/:bucket/:path', () => {
    it('should delete a file', async () => {
      const response = await request(app)
        .delete('/api/file-management/portfolio-images/test.pdf')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should require authentication', async () => {
      const response = await request(app).delete('/api/file-management/portfolio-images/test.pdf');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/file-management/quota', () => {
    it('should get file quota', async () => {
      const response = await request(app)
        .get('/api/file-management/quota')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/file-management/quota');
      expect(response.status).toBe(401);
    });
  });
});
