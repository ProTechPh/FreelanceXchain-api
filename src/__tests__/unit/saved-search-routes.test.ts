// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockCreateSavedSearch = jest.fn() as any;
const mockGetUserSavedSearches = jest.fn() as any;
const mockUpdateSavedSearch = jest.fn() as any;
const mockDeleteSavedSearch = jest.fn() as any;
const mockExecuteSavedSearch = jest.fn() as any;

jest.unstable_mockModule(resolveModule('src/services/saved-search-service.ts'), () => ({
  createSavedSearch: mockCreateSavedSearch,
  getUserSavedSearches: mockGetUserSavedSearches,
  updateSavedSearch: mockUpdateSavedSearch,
  deleteSavedSearch: mockDeleteSavedSearch,
  executeSavedSearch: mockExecuteSavedSearch,
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
    mfaVerifyRateLimiter: (_req: any, _res: any, next: any) => next(),
  }));

jest.unstable_mockModule(resolveModule('src/middleware/validation-middleware.ts'), () => ({
  validateUUID: jest.fn(() => (_req: any, _res: any, next: any) => next()),
  validate: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

const savedSearchRouter = (await import('../../routes/saved-search-routes.js')).default;

describe('Saved Search Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'freelancer' };
      next();
    });
    app = express();
    app.use(express.json());
    app.use('/api/saved-searches', savedSearchRouter);
  });

  describe('POST / - Create Saved Search', () => {
    const validSearch = {
      name: 'React developers',
      searchType: 'freelancer',
      filters: { skills: ['React'], minRate: 50 },
      notifyOnNew: true,
    };

    it('should create a saved search successfully', async () => {
      const savedSearch = { id: 'search-1', userId: 'user-1', ...validSearch };
      mockCreateSavedSearch.mockResolvedValue({ success: true, data: savedSearch });

      const res = await request(app)
        .post('/api/saved-searches')
        .send(validSearch);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('search-1');
      expect(mockCreateSavedSearch).toHaveBeenCalledWith('user-1', validSearch);
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .post('/api/saved-searches')
        .send(validSearch);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/saved-searches')
        .send({ searchType: 'freelancer', filters: { skills: ['React'] } });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when searchType is missing', async () => {
      const res = await request(app)
        .post('/api/saved-searches')
        .send({ name: 'My Search', filters: { skills: ['React'] } });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when filters is missing', async () => {
      const res = await request(app)
        .post('/api/saved-searches')
        .send({ name: 'My Search', searchType: 'freelancer' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when service returns failure', async () => {
      mockCreateSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'LIMIT_REACHED', message: 'Maximum saved searches reached' },
      });

      const res = await request(app)
        .post('/api/saved-searches')
        .send(validSearch);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('LIMIT_REACHED');
    });
  });

  describe('GET / - Get User Saved Searches', () => {
    it('should return user saved searches', async () => {
      const searches = [
        { id: 'search-1', name: 'React devs', searchType: 'freelancer' },
        { id: 'search-2', name: 'Web projects', searchType: 'project' },
      ];
      mockGetUserSavedSearches.mockResolvedValue({ success: true, data: searches });

      const res = await request(app).get('/api/saved-searches');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(mockGetUserSavedSearches).toHaveBeenCalledWith('user-1', undefined);
    });

    it('should filter by searchType', async () => {
      mockGetUserSavedSearches.mockResolvedValue({ success: true, data: [] });

      await request(app).get('/api/saved-searches?searchType=project');

      expect(mockGetUserSavedSearches).toHaveBeenCalledWith('user-1', 'project');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).get('/api/saved-searches');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 400 when service returns failure', async () => {
      mockGetUserSavedSearches.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).get('/api/saved-searches');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('PATCH /:id - Update Saved Search', () => {
    const searchId = '550e8400-e29b-41d4-a716-446655440000';

    it('should update a saved search', async () => {
      const updatedSearch = { id: searchId, name: 'Updated Search', searchType: 'freelancer' };
      mockUpdateSavedSearch.mockResolvedValue({ success: true, data: updatedSearch });

      const res = await request(app)
        .patch(`/api/saved-searches/${searchId}`)
        .send({ name: 'Updated Search' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Search');
      expect(mockUpdateSavedSearch).toHaveBeenCalledWith(searchId, 'user-1', { name: 'Updated Search' });
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app)
        .patch(`/api/saved-searches/${searchId}`)
        .send({ name: 'Updated Search' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 404 when saved search not found', async () => {
      mockUpdateSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Saved search not found' },
      });

      const res = await request(app)
        .patch(`/api/saved-searches/${searchId}`)
        .send({ name: 'Updated Search' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when user is not the owner', async () => {
      mockUpdateSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not the owner' },
      });

      const res = await request(app)
        .patch(`/api/saved-searches/${searchId}`)
        .send({ name: 'Updated Search' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for other service errors', async () => {
      mockUpdateSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid data' },
      });

      const res = await request(app)
        .patch(`/api/saved-searches/${searchId}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /:id - Delete Saved Search', () => {
    const searchId = '550e8400-e29b-41d4-a716-446655440000';

    it('should delete a saved search', async () => {
      mockDeleteSavedSearch.mockResolvedValue({ success: true });

      const res = await request(app).delete(`/api/saved-searches/${searchId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Saved search deleted');
      expect(mockDeleteSavedSearch).toHaveBeenCalledWith(searchId, 'user-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).delete(`/api/saved-searches/${searchId}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 404 when saved search not found', async () => {
      mockDeleteSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Saved search not found' },
      });

      const res = await request(app).delete(`/api/saved-searches/${searchId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when user is not the owner', async () => {
      mockDeleteSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not the owner' },
      });

      const res = await request(app).delete(`/api/saved-searches/${searchId}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for other service errors', async () => {
      mockDeleteSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const res = await request(app).delete(`/api/saved-searches/${searchId}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DB_ERROR');
    });
  });

  describe('POST /:id/execute - Execute Saved Search', () => {
    const searchId = '550e8400-e29b-41d4-a716-446655440000';

    it('should execute a saved search', async () => {
      const results = [{ id: 'result-1', name: 'John Doe' }];
      mockExecuteSavedSearch.mockResolvedValue({ success: true, data: results });

      const res = await request(app).post(`/api/saved-searches/${searchId}/execute`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockExecuteSavedSearch).toHaveBeenCalledWith(searchId, 'user-1');
    });

    it('should return 401 when user is not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req: any, _res: any, next: any) => {
        req.user = undefined;
        next();
      });

      const res = await request(app).post(`/api/saved-searches/${searchId}/execute`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_UNAUTHORIZED');
    });

    it('should return 404 when saved search not found', async () => {
      mockExecuteSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Saved search not found' },
      });

      const res = await request(app).post(`/api/saved-searches/${searchId}/execute`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when user is not the owner', async () => {
      mockExecuteSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not the owner' },
      });

      const res = await request(app).post(`/api/saved-searches/${searchId}/execute`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 400 for other service errors', async () => {
      mockExecuteSavedSearch.mockResolvedValue({
        success: false,
        error: { code: 'INVALID_FILTERS', message: 'Invalid search filters' },
      });

      const res = await request(app).post(`/api/saved-searches/${searchId}/execute`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILTERS');
    });
  });
});
