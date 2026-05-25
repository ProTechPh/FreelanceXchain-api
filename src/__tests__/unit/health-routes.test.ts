import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Import router
const healthRouter = (await import('../../routes/health-routes.js')).default;

describe('Health Routes Unit Tests', () => {
  let app: express.Express;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = (globalThis as any).mockPool;
    app = express();
    app.use('/api/health', healthRouter);
  });

  it('should return 200 when database is healthy', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.services.database).toBe('ok');
  });

  it('should return 503 when database query throws on /api/health', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB down'));

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(503);
    expect(response.body.services.database).toBe('error');
  });

  it('should return 200 for ready when database is healthy', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });

    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
  });

  it('should return 503 for ready when database query throws', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB down'));

    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
  });
});
