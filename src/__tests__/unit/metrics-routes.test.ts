// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetAllSliSummaries = jest.fn<any>();
const mockGetSliSummary = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/services/sli-metrics-service.ts'), () => ({
  getAllSliSummaries: mockGetAllSliSummaries,
  getSliSummary: mockGetSliSummary,
}));

// Mutable auth behavior: tests can flip `mockSetUser` / `mockRole` to simulate
// unauthenticated or non-admin requests.
let mockSetUser = true;
let mockRole = 'admin';
jest.unstable_mockModule(resolveModule('src/middleware/auth-middleware.ts'), () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (mockSetUser) {
      req.user = { userId: 'admin-user-id', email: 'admin@test.com', role: mockRole };
      next();
      return;
    }
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  },
  requireRole: (role: string) => (req: any, _res: any, next: any) => {
    if (req.user && req.user.role !== role) {
      _res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }
    next();
  },
}));

jest.unstable_mockModule(resolveModule('src/middleware/rate-limiter.ts'), () => ({
  apiRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

const metricsRouter = (await import('../../routes/metrics-routes.js')).default;

const sampleSummary = (routeClass: string) => ({
  routeClass,
  windowDays: 30,
  totalRequests: 100,
  serverErrorRequests: 1,
  availability: 0.99,
  errorBudgetBurn: 2,
  latency: { p50: 80, p95: 250, p99: 500 },
  latencySamples: 100,
});

describe('Metrics Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetUser = true;
    mockRole = 'admin';
    app = express();
    app.use(express.json());
    app.use('/api/metrics', metricsRouter);
  });

  it('should return all SLI summaries for an admin', async () => {
    mockGetAllSliSummaries.mockReturnValueOnce([
      sampleSummary('dashboard'),
      sampleSummary('contracts'),
      sampleSummary('global'),
    ]);

    const res = await request(app).get('/api/metrics/sli');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(mockGetAllSliSummaries).toHaveBeenCalled();
  });

  it('should return a single class summary when ?class= is provided', async () => {
    mockGetSliSummary.mockReturnValueOnce(sampleSummary('dashboard'));

    const res = await request(app).get('/api/metrics/sli?class=dashboard');
    expect(res.status).toBe(200);
    expect(res.body.routeClass).toBe('dashboard');
    expect(mockGetSliSummary).toHaveBeenCalledWith('dashboard');
  });

  it('should return 400 for an invalid class', async () => {
    const res = await request(app).get('/api/metrics/sli?class=users');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CLASS');
    expect(mockGetAllSliSummaries).not.toHaveBeenCalled();
  });

  it('should return 401 when not authenticated', async () => {
    mockSetUser = false;
    const res = await request(app).get('/api/metrics/sli');
    expect(res.status).toBe(401);
  });

  it('should return 403 for non-admin users', async () => {
    mockRole = 'freelancer';
    const res = await request(app).get('/api/metrics/sli');
    expect(res.status).toBe(403);
  });
});
