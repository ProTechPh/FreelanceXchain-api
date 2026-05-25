import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import type { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

describe('Saved Search Routes Integration Tests', () => {
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

    jest.unstable_mockModule(resolveModule('src/services/saved-search-service.ts'), () => ({
      createSavedSearch: jest.fn(async () => ({
        success: true,
        data: { id: 'search-1', user_id: 'test-user-id', name: 'Test Search', search_type: 'project', filters: {}, notify_on_new: false },
      })),
      getUserSavedSearches: jest.fn(async () => ({
        success: true,
        data: [
          { id: 'search-1', user_id: 'test-user-id', name: 'Test Search', search_type: 'project', filters: {}, notify_on_new: false },
        ],
      })),
      updateSavedSearch: jest.fn(async () => ({
        success: true,
        data: { id: 'search-1', user_id: 'test-user-id', name: 'Updated Search', search_type: 'project', filters: {}, notify_on_new: true },
      })),
      deleteSavedSearch: jest.fn(async () => ({
        success: true,
        data: { message: 'Saved search deleted' },
      })),
      executeSavedSearch: jest.fn(async () => ({
        success: true,
        data: { items: [], hasMore: false, total: 0 },
      })),
    }));

    const { createApp } = await import('../../app.js');
    app = await createApp();
  });

  describe('POST /api/saved-searches', () => {
    it('should create a saved search', async () => {
      const response = await request(app)
        .post('/api/saved-searches')
        .set('Authorization', 'Bearer mock-token')
        .send({
          name: 'Test Search',
          searchType: 'project',
          filters: { keyword: 'typescript' },
          notifyOnNew: false,
        });

      expect(response.status).toBe(201);
      expect(response.body).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/saved-searches')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Test' });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/saved-searches')
        .send({ name: 'Test', searchType: 'project', filters: {} });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/saved-searches', () => {
    it('should get saved searches', async () => {
      const response = await request(app)
        .get('/api/saved-searches')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should filter by search type', async () => {
      const response = await request(app)
        .get('/api/saved-searches?searchType=project')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/saved-searches');
      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/saved-searches/:id', () => {
    it('should update a saved search', async () => {
      const response = await request(app)
        .patch('/api/saved-searches/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Updated Search' });

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .patch('/api/saved-searches/invalid-uuid')
        .set('Authorization', 'Bearer mock-token')
        .send({ name: 'Updated' });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/saved-searches/123e4567-e89b-12d3-a456-426614174000')
        .send({ name: 'Updated' });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/saved-searches/:id', () => {
    it('should delete a saved search', async () => {
      const response = await request(app)
        .delete('/api/saved-searches/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .delete('/api/saved-searches/invalid-uuid')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app).delete('/api/saved-searches/123e4567-e89b-12d3-a456-426614174000');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/saved-searches/:id/execute', () => {
    it('should execute a saved search', async () => {
      const response = await request(app)
        .post('/api/saved-searches/123e4567-e89b-12d3-a456-426614174000/execute')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .post('/api/saved-searches/invalid-uuid/execute')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/saved-searches/123e4567-e89b-12d3-a456-426614174000/execute');
      expect(response.status).toBe(401);
    });
  });
});
