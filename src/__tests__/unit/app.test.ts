import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/env.ts'), () => ({
  config: {
    server: {
      port: 3000,
      nodeEnv: 'test',
      baseUrl: 'http://localhost:3000',
      enableApiDocs: true,
    },
    appwrite: {
      url: 'http://localhost:54321',
      anonKey: 'test-anon-key',
      serviceRoleKey: 'test-service-role-key',
      apiKey: 'test-api-key',
      projectId: 'test-project-id',
      endpoint: 'http://localhost:54321/v1',
      storage: {
        proposalAttachmentsBucket: 'proposal-attachments',
      },
      buckets: {
        proposalAttachments: 'proposal-attachments',
        projectAttachments: 'project-attachments',
        disputeEvidence: 'dispute-evidence',
        portfolioImages: 'portfolio-images',
        milestoneDeliverables: 'milestone-deliverables',
      },
    },
    jwt: {
      secret: 'test-jwt-secret',
      refreshSecret: 'test-jwt-secret',
      expiresIn: '1h',
      refreshExpiresIn: '7d',
    },
    llm: {
      apiKey: 'test-llm-key',
      apiUrl: 'http://localhost:8000',
      model: 'claude-haiku-4.5',
    },
    blockchain: {
      rpcUrl: 'http://localhost:8545',
      privateKey: '0x' + 'a'.repeat(64),
      mode: 'simulated',
    },
    database: { url: 'postgresql://localhost/test' },
  },
}));

const { createApp } = await import('../../app.js');

describe('App Integration Tests', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Swagger docs', () => {
    it('should serve swagger JSON when api docs are enabled', async () => {
      const response = await request(app).get('/api-docs.json');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('openapi');
      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Static files', () => {
    it('should serve robots.txt', async () => {
      const response = await request(app).get('/robots.txt');
      expect(response.status).toBe(200);
      expect(response.text).toContain('User-agent');
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should serve sitemap.xml', async () => {
      const response = await request(app).get('/sitemap.xml');
      expect(response.status).toBe(200);
      expect(response.text).toContain('<?xml');
      expect(response.headers['content-type']).toContain('application/xml');
    });
  });

  describe('CORS', () => {
    it('should block requests from invalid origins', async () => {
      const response = await request(app)
        .get('/')
        .set('Origin', 'http://invalid-origin.com');
      expect(response.status).toBe(500);
    });

    it('should allow requests without origin header', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
    });
  });

  describe('Webhook rawBody', () => {
    it('should process webhook paths', async () => {
      const response = await request(app)
        .post('/api/webhooks/test')
        .send({ test: true })
        .set('Content-Type', 'application/json');
      // The route may not exist, but the middleware should run
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('Reset password redirect', () => {
    it('should redirect /reset-password to /api/auth/reset-password', async () => {
      const response = await request(app)
        .post('/reset-password')
        .send({ email: 'test@example.com' });
      expect(response.status).toBe(307);
      expect(response.headers.location).toBe('/api/auth/reset-password');
    });
  });

  describe('404 handler', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/api/nonexistent-route-12345');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Health check', () => {
    it('should return success on root path', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });
  });

  describe('Swagger UI middleware', () => {
    it('should set CSP headers for swagger UI', async () => {
      const response = await request(app).get('/api-docs/');
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
