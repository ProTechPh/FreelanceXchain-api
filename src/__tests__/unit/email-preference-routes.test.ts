// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetEmailPreferences = jest.fn() as any;
const mockUpdateEmailPreferences = jest.fn() as any;
const mockUnsubscribeAll = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/email-preference-service.ts'), () => ({
  getEmailPreferences: mockGetEmailPreferences,
  updateEmailPreferences: mockUpdateEmailPreferences,
  unsubscribeAll: mockUnsubscribeAll,
}));

const mockAuthMiddleware = jest.fn((req: any, _res: any, next: any) => {
  req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
  next();
});

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: mockAuthMiddleware,
  requireRole: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  requireVerifiedKyc: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
  fileUploadRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

const emailPreferenceRouter = (await import('../../routes/email-preference-routes.js')).default;

describe('Email Preference Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/email-preferences', emailPreferenceRouter);
  });

  describe('GET / - Get Email Preferences', () => {
    it('should return email preferences', async () => {
      const preferences = {
        marketing: true,
        projectUpdates: true,
        messages: true,
        newsletter: false,
      };
      mockGetEmailPreferences.mockResolvedValue({ success: true, data: preferences });

      const res = await request(app).get('/api/email-preferences');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(preferences);
      expect(mockGetEmailPreferences).toHaveBeenCalledWith('user-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/email-preferences');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockGetEmailPreferences.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/email-preferences');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('PATCH / - Update Email Preferences', () => {
    it('should update email preferences', async () => {
      const updatedPreferences = {
        marketing: false,
        projectUpdates: true,
        messages: true,
        newsletter: false,
      };
      mockUpdateEmailPreferences.mockResolvedValue({ success: true, data: updatedPreferences });

      const res = await request(app)
        .patch('/api/email-preferences')
        .send({ marketing: false });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updatedPreferences);
      expect(mockUpdateEmailPreferences).toHaveBeenCalledWith('user-1', { marketing: false });
    });

    it('should update multiple preferences at once', async () => {
      const updatedPreferences = {
        marketing: false,
        projectUpdates: false,
        messages: true,
        newsletter: true,
      };
      mockUpdateEmailPreferences.mockResolvedValue({ success: true, data: updatedPreferences });

      const res = await request(app)
        .patch('/api/email-preferences')
        .send({ marketing: false, projectUpdates: false, newsletter: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updatedPreferences);
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .patch('/api/email-preferences')
        .send({ marketing: false });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockUpdateEmailPreferences.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid preference key' },
      });

      const res = await request(app)
        .patch('/api/email-preferences')
        .send({ invalidKey: true });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /unsubscribe-all - Unsubscribe from All Emails', () => {
    it('should unsubscribe from all emails', async () => {
      mockUnsubscribeAll.mockResolvedValue({ success: true });

      const res = await request(app).post('/api/email-preferences/unsubscribe-all');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Unsubscribed from all emails');
      expect(mockUnsubscribeAll).toHaveBeenCalledWith('user-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).post('/api/email-preferences/unsubscribe-all');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockUnsubscribeAll.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).post('/api/email-preferences/unsubscribe-all');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });
});
