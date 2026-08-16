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

  describe('GET / - version', () => {
    it('should return default version 1.0.0 when npm_package_version is not set', async () => {
      const originalVersion = process.env['npm_package_version'];
      const originalBuildSha = process.env['APP_BUILD_SHA'];
      delete process.env['npm_package_version'];
      delete process.env['APP_BUILD_SHA'];
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0.0');
      if (originalVersion !== undefined) {
        process.env['npm_package_version'] = originalVersion;
      }
      if (originalBuildSha !== undefined) {
        process.env['APP_BUILD_SHA'] = originalBuildSha;
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

    it('should append build metadata when APP_BUILD_SHA is set', async () => {
      const originalVersion = process.env['npm_package_version'];
      const originalBuildSha = process.env['APP_BUILD_SHA'];
      delete process.env['npm_package_version'];
      process.env['APP_BUILD_SHA'] = '0123456789abcdef';
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0.0+build.0123456');
      if (originalVersion !== undefined) {
        process.env['npm_package_version'] = originalVersion;
      }
      if (originalBuildSha !== undefined) {
        process.env['APP_BUILD_SHA'] = originalBuildSha;
      } else {
        delete process.env['APP_BUILD_SHA'];
      }
    });

    it('should fall back to SPACE_REVISION when APP_BUILD_SHA is unset', async () => {
      const originalVersion = process.env['npm_package_version'];
      const originalBuildSha = process.env['APP_BUILD_SHA'];
      const originalSpaceRevision = process.env['SPACE_REVISION'];
      delete process.env['npm_package_version'];
      delete process.env['APP_BUILD_SHA'];
      process.env['SPACE_REVISION'] = 'fedcba9876543210';
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0.0+build.fedcba9');
      if (originalVersion !== undefined) {
        process.env['npm_package_version'] = originalVersion;
      }
      if (originalBuildSha !== undefined) {
        process.env['APP_BUILD_SHA'] = originalBuildSha;
      } else {
        delete process.env['APP_BUILD_SHA'];
      }
      if (originalSpaceRevision !== undefined) {
        process.env['SPACE_REVISION'] = originalSpaceRevision;
      } else {
        delete process.env['SPACE_REVISION'];
      }
    });

    it('should fall back to RENDER_GIT_COMMIT when APP_BUILD_SHA is unset', async () => {
      const originalVersion = process.env['npm_package_version'];
      const originalBuildSha = process.env['APP_BUILD_SHA'];
      const originalRenderCommit = process.env['RENDER_GIT_COMMIT'];
      delete process.env['npm_package_version'];
      delete process.env['APP_BUILD_SHA'];
      process.env['RENDER_GIT_COMMIT'] = 'abc1234def567890';
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0.0+build.abc1234');
      if (originalVersion !== undefined) {
        process.env['npm_package_version'] = originalVersion;
      }
      if (originalBuildSha !== undefined) {
        process.env['APP_BUILD_SHA'] = originalBuildSha;
      } else {
        delete process.env['APP_BUILD_SHA'];
      }
      if (originalRenderCommit !== undefined) {
        process.env['RENDER_GIT_COMMIT'] = originalRenderCommit;
      } else {
        delete process.env['RENDER_GIT_COMMIT'];
      }
    });

    it('should ignore the dev placeholder and use the platform fallback', async () => {
      const originalVersion = process.env['npm_package_version'];
      const originalBuildSha = process.env['APP_BUILD_SHA'];
      const originalRenderCommit = process.env['RENDER_GIT_COMMIT'];
      delete process.env['npm_package_version'];
      process.env['APP_BUILD_SHA'] = 'dev';
      process.env['RENDER_GIT_COMMIT'] = 'fedcba9876543210';
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0.0+build.fedcba9');
      if (originalVersion !== undefined) {
        process.env['npm_package_version'] = originalVersion;
      }
      if (originalBuildSha !== undefined) {
        process.env['APP_BUILD_SHA'] = originalBuildSha;
      } else {
        delete process.env['APP_BUILD_SHA'];
      }
      if (originalRenderCommit !== undefined) {
        process.env['RENDER_GIT_COMMIT'] = originalRenderCommit;
      } else {
        delete process.env['RENDER_GIT_COMMIT'];
      }
    });
  });
});
