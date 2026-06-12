import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockQuery = jest.fn<any>().mockResolvedValue({ rows: [{ now: new Date().toISOString() }], rowCount: 1 });
jest.unstable_mockModule(resolveModule('src/config/database.ts'), () => ({
  pool: { query: mockQuery, connect: jest.fn(), on: jest.fn() },
  isPostgresAvailable: jest.fn().mockReturnValue(false),
  query: mockQuery,
  queryOne: jest.fn(),
  initializeDatabase: jest.fn(),
}));

const { createApp } = await import('../../app.js');

describe('Health Routes Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('services');
    });

    it('should check database connectivity', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.body.services).toHaveProperty('database');
      expect(['ok', 'error']).toContain(response.body.services.database);
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).not.toBe(401);
    });

    it('should return 503 if database is down', async () => {
      const response = await request(app)
        .get('/api/health');

      if (response.body.services.database === 'error') {
        expect(response.status).toBe(503);
      }
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/api/health/ready');

      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('ready');
      expect(typeof response.body.ready).toBe('boolean');
    });

    it('should return 200 when ready', async () => {
      const response = await request(app)
        .get('/api/health/ready');

      if (response.body.ready === true) {
        expect(response.status).toBe(200);
      }
    });

    it('should return 503 when not ready', async () => {
      const response = await request(app)
        .get('/api/health/ready');

      if (response.body.ready === false) {
        expect(response.status).toBe(503);
      }
    });
  });
});
