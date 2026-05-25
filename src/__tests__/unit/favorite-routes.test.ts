// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockAddFavorite = jest.fn() as any;
const mockRemoveFavorite = jest.fn() as any;
const mockGetUserFavorites = jest.fn() as any;
const mockIsFavorited = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/favorite-service.ts'), () => ({
  addFavorite: mockAddFavorite,
  removeFavorite: mockRemoveFavorite,
  getUserFavorites: mockGetUserFavorites,
  isFavorited: mockIsFavorited,
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

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const favoriteRouter = (await import('../../routes/favorite-routes.js')).default;

describe('Favorite Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/favorites', favoriteRouter);
  });

  describe('POST / - Add Favorite', () => {
    it('should add a favorite successfully', async () => {
      mockAddFavorite.mockResolvedValue({
        success: true,
        data: { id: 'fav-1', userId: 'user-1', targetType: 'project', targetId: 'proj-1' },
      });

      const res = await request(app)
        .post('/api/favorites')
        .send({ targetType: 'project', targetId: 'proj-1' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('fav-1');
      expect(mockAddFavorite).toHaveBeenCalledWith('user-1', 'project', 'proj-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/favorites')
        .send({ targetType: 'project', targetId: 'proj-1' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when targetType is missing', async () => {
      const res = await request(app)
        .post('/api/favorites')
        .send({ targetId: 'proj-1' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when targetId is missing', async () => {
      const res = await request(app)
        .post('/api/favorites')
        .send({ targetType: 'project' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when service returns failure', async () => {
      mockAddFavorite.mockResolvedValue({
        success: false,
        error: { code: 'DUPLICATE', message: 'Already favorited' },
      });

      const res = await request(app)
        .post('/api/favorites')
        .send({ targetType: 'project', targetId: 'proj-1' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DUPLICATE');
    });
  });

  describe('GET / - Get User Favorites', () => {
    it('should return user favorites', async () => {
      mockGetUserFavorites.mockResolvedValue({
        success: true,
        data: [{ id: 'fav-1', targetType: 'project', targetId: 'proj-1' }],
      });

      const res = await request(app).get('/api/favorites');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockGetUserFavorites).toHaveBeenCalledWith('user-1', undefined);
    });

    it('should filter by targetType', async () => {
      mockGetUserFavorites.mockResolvedValue({
        success: true,
        data: [{ id: 'fav-1', targetType: 'freelancer', targetId: 'fl-1' }],
      });

      const res = await request(app).get('/api/favorites?targetType=freelancer');

      expect(res.status).toBe(200);
      expect(mockGetUserFavorites).toHaveBeenCalledWith('user-1', 'freelancer');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/favorites');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockGetUserFavorites.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/favorites');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('DELETE /:targetType/:targetId - Remove Favorite', () => {
    it('should remove a favorite successfully', async () => {
      mockRemoveFavorite.mockResolvedValue({ success: true });

      const res = await request(app).delete('/api/favorites/project/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Favorite removed');
      expect(mockRemoveFavorite).toHaveBeenCalledWith('user-1', 'project', '550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).delete('/api/favorites/project/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockRemoveFavorite.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Favorite not found' },
      });

      const res = await request(app).delete('/api/favorites/project/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /check/:targetType/:targetId - Check if Favorited', () => {
    it('should return true when item is favorited', async () => {
      mockIsFavorited.mockResolvedValue({ success: true, data: true });

      const res = await request(app).get('/api/favorites/check/project/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(200);
      expect(res.body.isFavorited).toBe(true);
      expect(mockIsFavorited).toHaveBeenCalledWith('user-1', 'project', '550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return false when item is not favorited', async () => {
      mockIsFavorited.mockResolvedValue({ success: true, data: false });

      const res = await request(app).get('/api/favorites/check/project/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(200);
      expect(res.body.isFavorited).toBe(false);
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/favorites/check/project/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockIsFavorited.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/favorites/check/project/550e8400-e29b-41d4-a716-446655440000');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });
});
