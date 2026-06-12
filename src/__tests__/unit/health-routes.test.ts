import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockQuery = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockQuery },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: mockQuery,
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));

const healthRouter = (await import('../../routes/health-routes.js')).default;

describe('Health Routes Unit Tests', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use('/api/health', healthRouter);
  });

  it('should return 200 when database is healthy', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '1': 1 }] });

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.services.database).toBe('ok');
  });

  it('should return 503 when database query throws on /api/health', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(503);
    expect(response.body.services.database).toBe('error');
  });

  it('should return 200 for ready when database is healthy', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '1': 1 }] });

    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
  });

  it('should return 503 for ready when database query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));

    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
  });
});
