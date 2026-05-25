import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import type { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

describe('Transaction Routes Integration Tests', () => {
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

    jest.unstable_mockModule(resolveModule('src/services/transaction-service.ts'), () => ({
      getUserTransactions: jest.fn(async () => ({
        success: true,
        data: {
          items: [
            { id: 'tx-1', amount: 100, type: 'payment', status: 'completed', created_at: new Date().toISOString() },
          ],
          hasMore: false,
          total: 1,
        },
      })),
      getTransactionById: jest.fn(async () => ({
        success: true,
        data: { id: 'tx-1', amount: 100, type: 'payment', status: 'completed', created_at: new Date().toISOString() },
      })),
      getContractTransactions: jest.fn(async () => ({
        success: true,
        data: {
          items: [
            { id: 'tx-1', amount: 100, type: 'payment', status: 'completed', created_at: new Date().toISOString() },
          ],
          hasMore: false,
          total: 1,
        },
      })),
    }));

    const { createApp } = await import('../../app.js');
    app = await createApp();
  });

  describe('GET /api/transactions', () => {
    it('should get user transactions', async () => {
      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should support pagination and filters', async () => {
      const response = await request(app)
        .get('/api/transactions?limit=10&page=1&type=payment&status=completed')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/transactions');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/transactions/:id', () => {
    it('should get a transaction by id', async () => {
      const response = await request(app)
        .get('/api/transactions/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .get('/api/transactions/invalid-uuid')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/transactions/123e4567-e89b-12d3-a456-426614174000');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/transactions/contract/:contractId', () => {
    it('should get transactions by contract', async () => {
      const response = await request(app)
        .get('/api/transactions/contract/123e4567-e89b-12d3-a456-426614174000')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .get('/api/transactions/contract/invalid-uuid')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/transactions/contract/123e4567-e89b-12d3-a456-426614174000');
      expect(response.status).toBe(401);
    });
  });
});
