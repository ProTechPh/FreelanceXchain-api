import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app.js';
import type { Express } from 'express';

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
