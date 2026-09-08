// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetUserPreferences = jest.fn<any>();
const mockUpdateTourProgress = jest.fn<any>();
const mockSetTourAutoStart = jest.fn<any>();

jest.unstable_mockModule(
  resolveModule('src/services/user-preferences-service.ts'),
  () => ({
    getUserPreferences: mockGetUserPreferences,
    updateTourProgress: mockUpdateTourProgress,
    setTourAutoStart: mockSetTourAutoStart,
  })
);

let currentUserId: string | undefined = 'user-1';

jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    if (currentUserId) {
      req.user = { userId: currentUserId };
    }
    next();
  },
}));

const userPreferencesRouter = (await import('../../routes/user-preferences-routes.js')).default;

describe('User Preferences Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    currentUserId = 'user-1';
    app = express();
    app.use(express.json());
    app.use('/api/user-preferences', userPreferencesRouter);
  });

  describe('GET /api/user-preferences', () => {
    it('should return 401 if user is not authenticated', async () => {
      currentUserId = undefined;
      const res = await request(app).get('/api/user-preferences');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 200 with preferences data on success', async () => {
      mockGetUserPreferences.mockResolvedValueOnce({
        success: true,
        data: {
          id: 'pref-1',
          userId: 'user-1',
          tourProgress: { freelancer: { completedVersion: 1, autoStart: false } },
        },
      });

      const res = await request(app).get('/api/user-preferences');
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('user-1');
      expect(mockGetUserPreferences).toHaveBeenCalledWith('user-1');
    });

    it('should return 404 when preferences not found', async () => {
      mockGetUserPreferences.mockResolvedValueOnce({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });

      const res = await request(app).get('/api/user-preferences');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });

    it('should return 500 when service returns internal error', async () => {
      mockGetUserPreferences.mockResolvedValueOnce({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
      });

      const res = await request(app).get('/api/user-preferences');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Something went wrong');
    });

    it('should return 500 when service throws an unexpected exception', async () => {
      mockGetUserPreferences.mockRejectedValueOnce(new Error('crash'));

      const res = await request(app).get('/api/user-preferences');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  describe('PATCH /api/user-preferences/tour-progress', () => {
    it('should return 401 if user is not authenticated', async () => {
      currentUserId = undefined;
      const res = await request(app)
        .patch('/api/user-preferences/tour-progress')
        .send({ role: 'freelancer' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 400 if role is missing', async () => {
      const res = await request(app)
        .patch('/api/user-preferences/tour-progress')
        .send({ completedVersion: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid role');
    });

    it('should return 400 if role is invalid', async () => {
      const res = await request(app)
        .patch('/api/user-preferences/tour-progress')
        .send({ role: 'admin', completedVersion: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid role');
    });

    describe('autoStart only update', () => {
      it('should update autoStart successfully', async () => {
        mockSetTourAutoStart.mockResolvedValueOnce({
          success: true,
          data: { id: 'pref-1', tourProgress: { employer: { autoStart: true } } },
        });

        const res = await request(app)
          .patch('/api/user-preferences/tour-progress')
          .send({ role: 'employer', autoStart: true });
        expect(res.status).toBe(200);
        expect(res.body.tourProgress.employer.autoStart).toBe(true);
        expect(mockSetTourAutoStart).toHaveBeenCalledWith('user-1', 'employer', true);
      });

      it('should return 404 if setTourAutoStart fails with NOT_FOUND', async () => {
        mockSetTourAutoStart.mockResolvedValueOnce({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User preferences not found' },
        });

        const res = await request(app)
          .patch('/api/user-preferences/tour-progress')
          .send({ role: 'employer', autoStart: true });
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('User preferences not found');
      });

      it('should return 500 if setTourAutoStart fails with error code', async () => {
        mockSetTourAutoStart.mockResolvedValueOnce({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'DB fail' },
        });

        const res = await request(app)
          .patch('/api/user-preferences/tour-progress')
          .send({ role: 'employer', autoStart: true });
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('DB fail');
      });
    });

    describe('full progress update', () => {
      it('should update progress with completedVersion and autoStart', async () => {
        mockUpdateTourProgress.mockResolvedValueOnce({
          success: true,
          data: {
            id: 'pref-1',
            tourProgress: { freelancer: { completedVersion: 2, autoStart: false } },
          },
        });

        const res = await request(app)
          .patch('/api/user-preferences/tour-progress')
          .send({ role: 'freelancer', completedVersion: 2, autoStart: false });
        expect(res.status).toBe(200);
        expect(mockUpdateTourProgress).toHaveBeenCalledWith('user-1', 'freelancer', {
          completedVersion: 2,
          autoStart: false,
        });
      });

      it('should return 404 if updateTourProgress fails with NOT_FOUND', async () => {
        mockUpdateTourProgress.mockResolvedValueOnce({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User preferences not found' },
        });

        const res = await request(app)
          .patch('/api/user-preferences/tour-progress')
          .send({ role: 'freelancer', completedVersion: 1 });
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('User preferences not found');
      });

      it('should return 500 if updateTourProgress fails with error code', async () => {
        mockUpdateTourProgress.mockResolvedValueOnce({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error' },
        });

        const res = await request(app)
          .patch('/api/user-preferences/tour-progress')
          .send({ role: 'freelancer', completedVersion: 1 });
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Error');
      });
    });

    it('should return 500 on unexpected exception during patch', async () => {
      mockUpdateTourProgress.mockRejectedValueOnce(new Error('crash'));

      const res = await request(app)
        .patch('/api/user-preferences/tour-progress')
        .send({ role: 'freelancer', completedVersion: 1 });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});
