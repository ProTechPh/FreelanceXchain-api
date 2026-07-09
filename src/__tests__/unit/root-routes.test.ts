// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockReadFile = jest.fn<any>();

jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

const router = (await import('../../routes/root-routes.js')).default;

describe('Root Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', router);
  });

  describe('GET /', () => {
    it('should return health check', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  describe('GET /robots.txt', () => {
    it('should return robots.txt content on success', async () => {
      mockReadFile.mockResolvedValue('User-agent: *\nDisallow:');
      const res = await request(app).get('/robots.txt');
      expect(res.status).toBe(200);
      expect(res.text).toContain('User-agent');
    });

    it('should return 404 when robots.txt cannot be read (catch block)', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const res = await request(app).get('/robots.txt');
      expect(res.status).toBe(404);
      expect(res.text).toBe('Not found');
    });
  });

  describe('GET /sitemap.xml', () => {
    it('should return sitemap.xml content on success', async () => {
      mockReadFile.mockResolvedValue('<urlset></urlset>');
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.text).toContain('urlset');
    });

    it('should return 404 when sitemap.xml cannot be read (catch block)', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(404);
      expect(res.text).toBe('Not found');
    });
  });

  describe('POST /reset-password', () => {
    it('should redirect to /api/auth/reset-password', async () => {
      const res = await request(app).post('/reset-password');
      expect(res.status).toBe(307);
    });
  });

  describe('GET / - version fallback (line 12)', () => {
    it('should return default version 1.0.0 when npm_package_version is not set', async () => {
      const originalVersion = process.env['npm_package_version'];
      delete process.env['npm_package_version'];
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0.0');
      if (originalVersion !== undefined) {
        process.env['npm_package_version'] = originalVersion;
      }
    });

    it('should use npm_package_version when set', async () => {
      const originalVersion = process.env['npm_package_version'];
      process.env['npm_package_version'] = '2.5.0';
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('2.5.0');
      if (originalVersion !== undefined) {
        process.env['npm_package_version'] = originalVersion;
      } else {
        delete process.env['npm_package_version'];
      }
    });
  });
});
