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
    expect(typeof response.body.version).toBe('string');
  });

  it('should report build metadata in version when APP_BUILD_SHA is set', async () => {
    const originalVersion = process.env['npm_package_version'];
    const originalBuildSha = process.env['APP_BUILD_SHA'];
    delete process.env['npm_package_version'];
    process.env['APP_BUILD_SHA'] = '0123456789abcdef';
    mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });

    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.version).toBe('1.0.0+build.0123456');
    if (originalVersion !== undefined) {
      process.env['npm_package_version'] = originalVersion;
    }
    if (originalBuildSha !== undefined) {
      process.env['APP_BUILD_SHA'] = originalBuildSha;
    } else {
      delete process.env['APP_BUILD_SHA'];
    }
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

  it('should return cached database status when outside test env and within cache window', async () => {
    mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
    const warmUp = await request(app).get('/api/health');
    expect(warmUp.status).toBe(200);
    expect(mockListDocuments).toHaveBeenCalledTimes(1);

    const { config } = await import('../../config/env.js');
    const originalNodeEnv = config.server.nodeEnv;
    const originalEnv = process.env['NODE_ENV'];
    (config.server as any).nodeEnv = 'production';
    process.env['NODE_ENV'] = 'production';

    try {
      // Second call in production should return cached status without calling mockListDocuments again
      const res2 = await request(app).get('/api/health');
      expect(res2.status).toBe(200);
      expect(mockListDocuments).toHaveBeenCalledTimes(1);
    } finally {
      (config.server as any).nodeEnv = originalNodeEnv;
      process.env['NODE_ENV'] = originalEnv;
    }
  });

  it('falls back to NODE_ENV when config.server.nodeEnv is not set', async () => {
    mockListDocuments.mockResolvedValueOnce({ documents: [], total: 0 });
    const { config } = await import('../../config/env.js');
    const originalNodeEnv = config.server.nodeEnv;
    const originalEnv = process.env['NODE_ENV'];
    (config.server as any).nodeEnv = undefined;
    process.env['NODE_ENV'] = 'test';

    try {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      // NODE_ENV=test means no caching, so the database check runs every time.
      expect(mockListDocuments).toHaveBeenCalled();
    } finally {
      (config.server as any).nodeEnv = originalNodeEnv;
      if (originalEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = originalEnv;
      }
    }
  });
});
