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
    it('should return health check without exposing version details', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('FreelanceXchain API is running');
      expect(res.body.version).toBeUndefined();
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

  describe('GET security.txt aliases', () => {
    it.each(['/security.txt', '/.well-known/security.txt'])(
      'serves the disclosure policy from %s',
      async (route) => {
        mockReadFile.mockResolvedValue('Contact: mailto:security@example.com\n');

        const res = await request(app).get(route);

        expect(res.status).toBe(200);
        expect(res.type).toMatch(/^text\/plain/);
        expect(res.text).toBe('Contact: mailto:security@example.com\n');
        expect(mockReadFile).toHaveBeenCalledWith(
          path.resolve(process.cwd(), 'security.txt'),
          'utf8',
        );
      },
    );

    it('returns 404 when the disclosure policy cannot be read', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const res = await request(app).get('/.well-known/security.txt');

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
});
