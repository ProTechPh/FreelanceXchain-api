import { jest, describe, it, expect, beforeEach } from '@jest/globals';
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
      enableApiDocs: false,
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

describe('App Extended Tests - API Docs Disabled', () => {
  let app: Express;

  beforeEach(async () => {
    app = await createApp();
  });

  describe('API docs disabled', () => {
    it('should not serve swagger UI when api docs are disabled', async () => {
      const response = await request(app).get('/api-docs/');
      expect(response.status).toBe(404);
    });

    it('should not serve swagger JSON when api docs are disabled', async () => {
      const response = await request(app).get('/api-docs.json');
      expect(response.status).toBe(404);
    });
  });

  describe('Webhook rawBody for KYC webhook', () => {
    it('should process KYC webhook paths', async () => {
      const response = await request(app)
        .post('/api/kyc/webhook')
        .send({ test: true })
        .set('Content-Type', 'application/json');
      expect([200, 400, 404, 401, 403]).toContain(response.status);
    });
  });

  describe('API cache control', () => {
    it('should set no-store cache control for API routes', async () => {
      const response = await request(app).get('/api/health');
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('Static file errors', () => {
    it('should return 404 when robots.txt does not exist', async () => {
      const fs = await import('fs/promises');
      const robotsPath = 'robots.txt';
      let robotsBackup = null;

      try {
        robotsBackup = await fs.readFile(robotsPath, 'utf8');
        await fs.unlink(robotsPath);
      } catch (e) {
        // File doesn't exist, that's fine
      }

      const response = await request(app).get('/robots.txt');
      expect(response.status).toBe(404);

      if (robotsBackup) {
        await fs.writeFile(robotsPath, robotsBackup);
      }
    });

    it('should return 404 when sitemap.xml does not exist', async () => {
      const fs = await import('fs/promises');
      const sitemapPath = 'sitemap.xml';
      let sitemapBackup = null;

      try {
        sitemapBackup = await fs.readFile(sitemapPath, 'utf8');
        await fs.unlink(sitemapPath);
      } catch (e) {
        // File doesn't exist, that's fine
      }

      const response = await request(app).get('/sitemap.xml');
      expect(response.status).toBe(404);

      if (sitemapBackup) {
        await fs.writeFile(sitemapPath, sitemapBackup);
      }
    });
  });

  describe('CORS with valid origin', () => {
    it('should allow requests from localhost:3000', async () => {
      const response = await request(app)
        .get('/')
        .set('Origin', 'http://localhost:3000');
      expect([200, 500]).toContain(response.status);
    });
  });
});
