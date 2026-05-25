import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import type { Express, Request, Response, NextFunction } from 'express';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

describe('Email Preference Routes Integration Tests', () => {
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

    jest.unstable_mockModule(resolveModule('src/services/email-preference-service.ts'), () => ({
      getEmailPreferences: jest.fn(async () => ({
        success: true,
        data: {
          user_id: 'test-user-id',
          proposal_received: true,
          proposal_accepted: true,
          milestone_updates: true,
          payment_notifications: true,
          dispute_notifications: true,
          marketing_emails: false,
          weekly_digest: true,
        },
      })),
      updateEmailPreferences: jest.fn(async () => ({
        success: true,
        data: {
          user_id: 'test-user-id',
          proposal_received: false,
          proposal_accepted: true,
        },
      })),
      unsubscribeAll: jest.fn(async () => ({
        success: true,
        data: { message: 'Unsubscribed from all emails' },
      })),
    }));

    const { createApp } = await import('../../app.js');
    app = await createApp();
  });

  describe('GET /api/email-preferences', () => {
    it('should get email preferences', async () => {
      const response = await request(app)
        .get('/api/email-preferences')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/email-preferences');
      expect(response.status).toBe(401);
    });

    it('should handle missing auth header format', async () => {
      const response = await request(app)
        .get('/api/email-preferences')
        .set('Authorization', 'InvalidFormat');

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/email-preferences', () => {
    it('should update email preferences', async () => {
      const response = await request(app)
        .patch('/api/email-preferences')
        .set('Authorization', 'Bearer mock-token')
        .send({ proposal_received: false });

      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/email-preferences')
        .send({ proposal_received: false });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/email-preferences/unsubscribe-all', () => {
    it('should unsubscribe from all emails', async () => {
      const response = await request(app)
        .post('/api/email-preferences/unsubscribe-all')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/email-preferences/unsubscribe-all');
      expect(response.status).toBe(401);
    });
  });
});
