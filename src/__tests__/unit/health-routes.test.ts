import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockListDocuments = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/config/appwrite.ts'), () => ({
  databases: { listDocuments: mockListDocuments },
  DATABASE_ID: 'freelancexchain',
  Query: { equal: jest.fn() },
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
    mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.services.database).toBe('ok');
  });

  it('should return 503 when database query throws on /api/health', async () => {
    mockListDocuments.mockRejectedValueOnce(new Error('DB down'));

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(503);
    expect(response.body.services.database).toBe('error');
  });

  it('should return 200 for ready when database is healthy', async () => {
    mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
  });

  it('should return 503 for ready when database query throws', async () => {
    mockListDocuments.mockRejectedValueOnce(new Error('DB down'));

    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.ready).toBe(false);
  });
});
